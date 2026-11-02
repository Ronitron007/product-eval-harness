import type { MastraScorer } from '@mastra/core/evals'
import type { MastraModelConfig } from '@mastra/core/llm'
import canonicalize from 'canonicalize'
import { z } from 'zod'
import { checkTemplate } from '../rules/checks'
import type { Json, RunEvidence } from '../rules/checks/define'
import type { RuleLibrary } from '../rules/load'
import { STAGE_LEVELS, type Binding, type CodeCheckRule, type NodeId, type RuleRecord, type Shape, type Stage } from '../rules/schema'
import type { DerivedRule, GraphNode, VerdictInput } from '../store/store'
import { embed, parsePath, targets } from './paths'
import { admit, indexTree, reach, resolve, weakenings, type Admitted, type AdmittedRule } from './scope'
import { codeScorer, judgePrompt, judgeScorer, quote, RUNTIME_VERSION, sha256, skippedJudges } from './scorers'
import { composeShapes, describe, lookup, printSchema, type ShapeTrie, type TrieNode } from './shape'

// The rule compiler (docs/design/compiler.md). Code outside src/compiler/ imports this file
// only (boundary.internals_unreachable).

export type { Json, RunEvidence }
export { RUNTIME_VERSION }

export type Sha256 = string & { readonly __brand: 'sha256' }
export type TreeNode = Pick<GraphNode, 'id' | 'parentId' | 'level'>

// The exact pins of the packages whose behavior the plan rests on. The code lock test proves
// that they equal package.json and src/compiler/code.lock.json.
export const CODE_DEPS = { zod: '4.6.7', '@mastra/core': '1.79.0' } as const

export interface CompileInput {
  readonly stage: Stage
  readonly node: NodeId
  readonly library: RuleLibrary // loadRuleLibrary('rules'). It must have zero problems.
  readonly derived: readonly DerivedRule[] // store.derivedRules(): every version
  readonly tree: readonly TreeNode[] // store.tree(): every node
  readonly trial?: RuleRecord // one candidate version. It compiles as watch (compile.ledger).
}

export type CompileResult = { readonly ok: true; readonly plan: StagePlan } | { readonly ok: false; readonly problems: readonly CompileProblem[] }

export interface StagePlan {
  readonly stage: Stage
  readonly node: NodeId
  readonly ruleSetHash: Sha256 // sha256(RFC 8785(manifest)), for store.recordStageRun
  readonly schema: z.ZodType // structuredOutput.schema of the drafter
  readonly instructions: string // strict and soft rules. Watch rules and judge questions never print.
  readonly scorers: {
    readonly code: readonly RuleScorer[] // one for each applied shape or code_check rule
    judges(model: JudgeModel): readonly RuleScorer[] // the only door for a model
    // No model. One cannot_verify row for each field of each judgement rule (scorers.skipped_judges).
    skippedJudges(reason: string): readonly ItemVerdict[]
  }
  // The one decode gate (scorers.closed_output). It parses a string as JSON, then runs plan.schema.safeParse.
  decode(raw: unknown): DecodeResult
  readonly ledger: readonly LedgerEntry[] // one entry for each input rule version
  readonly manifest: Manifest // exactly what the hash covers (compile.hash)
}

export type ItemVerdict = Omit<VerdictInput, 'runId'> // plus runId, a row for store.writeVerdicts

export interface DecodeIssue {
  readonly path: string // such as criteria[0].attributes[0].grade
  readonly message: string // from the Zod issue
}
export type DecodeResult =
  | { readonly ok: true; readonly output: Json }
  | { readonly ok: false; readonly issues: readonly DecodeIssue[]; readonly raw: unknown } // raw: the parsed JSON, or the string

export interface RuleScorer {
  readonly id: `${string}@${number}` // rule.id@version, also the Mastra scorer id
  readonly rule: { readonly id: string; readonly version: number; readonly hash: Sha256; readonly binding: Binding; readonly kind: RuleRecord['kind'] }
  readonly decider: VerdictInput['decider']
  readonly fields: readonly string[]
  readonly scorer: MastraScorer<string, RunEvidence, unknown, any> // for runEvals and experiments
  // Takes the raw output, which may break the schema (scorers.decode_failure_rows). Never throws, never
  // returns []. A throw, a judge error, an unknown answer, or missing evidence gives cannot_verify.
  verify(output: unknown, evidence: RunEvidence): Promise<readonly ItemVerdict[]>
}

export interface JudgeModel {
  readonly id: string // provider/model, written into the decider of each verdict
  readonly model: MastraModelConfig
}

export type RuleOrigin = 'git' | 'store' | 'trial'
export type ExclusionReason =
  | 'draft' | 'retired' | 'superseded' // status
  | 'owner_not_on_path' | 'stage_not_named' | 'selector_misses_node' // scope
export type Disposition =
  | { readonly kind: 'applied'; readonly binding: Binding }
  | { readonly kind: 'trial' } // always watch
  | { readonly kind: 'excluded'; readonly reason: ExclusionReason }
export interface LedgerEntry {
  readonly rule: string
  readonly version: number
  readonly origin: RuleOrigin
  readonly disposition: Disposition
}

export type ProblemCode =
  | 'library_invalid' | 'derived_invalid' | 'derived_hash_mismatch' | 'id_collision' // compile.admit
  | 'draft_shadows_active' | 'trial_shape_refused' // compile.admit
  | 'owner_unknown' | 'rule_inert' | 'trial_not_applied' | 'stage_not_at_level' | 'node_unknown' // compile.scope
  | 'weakens' | 'slot_conflict' // compile.weaken
  | 'no_output_fields' | 'shape_conflict' | 'list_without_items' // compile.shape
  | 'field_unresolved' | 'check_on_wrong_kind' // compile.shape, compile.checks
  | 'golden_mismatch' // auditLibrary only

export interface CompileProblem {
  readonly code: ProblemCode
  readonly rules: readonly string[] // id@version, one or two
  readonly field?: string
  readonly message: string // what is wrong, and the fix
}

export interface AuditInput {
  readonly library: RuleLibrary
  readonly derived: readonly DerivedRule[]
  readonly tree: readonly TreeNode[] | 'unknown' // 'unknown' in CI: the tree lives in the database
}

export interface Manifest {
  readonly format: 1 // the layout of the manifest
  readonly code: {
    readonly runtime: number // RUNTIME_VERSION
    readonly checks: Readonly<Record<string, number>> // the version of each template in use
    readonly deps: { readonly zod: string; readonly '@mastra/core': string } // exact pins
  }
  readonly stage: Stage
  readonly rules: readonly { id: string; version: number; hash: Sha256; binding: Binding; origin: RuleOrigin }[] // applied and trial, by id and version
  readonly schema: Json // z.toJSONSchema(plan.schema)
  readonly instructions: string // the full text
  readonly scorers: readonly {
    id: `${string}@${number}`
    decider: 'code' | 'judge'
    fields: readonly string[]
    shape?: Shape
    check?: CodeCheckRule['check']
    judgePromptHash?: Sha256
  }[] // by id
}

const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const BINDING_ORDER: Readonly<Record<Binding, number>> = { strict: 0, soft: 1, watch: 2 }

// Each applied field must resolve in the trie, with a kind that fits its check (compile.shape, compile.checks).
function fit(applied: readonly AdmittedRule[], trie: ShapeTrie): CompileProblem[] {
  const problems: CompileProblem[] = []
  const kindOf = (n: TrieNode) => (n.kind === 'leaf' ? n.shape.type : n.kind)
  for (const r of applied) {
    if (r.rule.kind === 'shape') continue // a shape rule defines its own field
    for (const field of r.rule.scope.fields) {
      const node = lookup(trie, field)
      if (!node) {
        problems.push({ code: 'field_unresolved', rules: [r.ref], field, message: `${r.ref} names ${field}, and no shape rule of this stage defines it. Fix the path, or add a shape rule for the field.` })
        continue
      }
      if (r.rule.kind !== 'code_check') continue
      const template = checkTemplate(r.rule.check.name)
      if (template.target !== kindOf(node)) {
        problems.push({
          code: 'check_on_wrong_kind',
          rules: [r.ref],
          field,
          message: `${template.name} reads ${template.target}, and ${field} is ${describe(node)}. Name a ${template.target} field, or use another check.`,
        })
      }
      for (const path of template.requires(r.rule.check.params as never, field)) {
        if (!lookup(trie, path)) {
          problems.push({ code: 'field_unresolved', rules: [r.ref], field: path, message: `${r.ref}: ${template.name} with these params reads ${path}, and no shape rule of this stage defines it. Fix the params, or add a shape rule.` })
        }
      }
    }
  }
  return problems
}

// The instruction text (compile.instructions): each field that a printed rule names, in path
// order, with its own composed shape line. Under each field, its strict rules, then its soft
// rules. A rule on more than one field prints in full under its first field, and as a pointer
// under each other field. Watch rules, trial rules and judge questions never print.
function renderInstructions(stage: Stage, trie: ShapeTrie, applied: readonly AdmittedRule[]): string {
  const printed = applied.filter(r => r.origin !== 'trial' && r.binding !== 'watch')
  const byField = new Map<string, AdmittedRule[]>()
  for (const r of printed) for (const f of r.rule.scope.fields) byField.set(f, [...(byField.get(f) ?? []), r])
  const lines = [`Stage ${stage}. Write one output that fits the output schema. These rules apply to its fields.`]
  for (const field of [...byField.keys()].sort(byCodeUnit)) {
    lines.push('', field, `  Shape: ${describe(lookup(trie, field)!)}`)
    const rules = byField.get(field)!.sort((a, b) => BINDING_ORDER[a.binding] - BINDING_ORDER[b.binding] || byCodeUnit(a.ref, b.ref))
    for (const r of rules) {
      const fields = [...r.rule.scope.fields].sort(byCodeUnit)
      if (fields[0] !== field) {
        lines.push(`  ${r.binding} \`${r.ref}\`, as under ${fields[0]}.`)
        continue
      }
      lines.push(`  ${r.binding} \`${r.ref}\`. ${r.rule.statement} Why: ${r.rule.reason}`)
      if (fields.length > 1) lines.push(`    Also on: ${fields.slice(1).join(', ')}`)
      if (r.rule.kind === 'code_check') lines.push(`    Check: ${checkTemplate(r.rule.check.name).render(r.rule.check.params as never)}`)
      for (const example of r.rule.examples) lines.push(`    Example: ${quote(example)}`)
    }
  }
  return lines.join('\n')
}

const issuePath = (path: readonly PropertyKey[]) =>
  path.reduce<string>((acc, seg) => (typeof seg === 'number' ? `${acc}[${seg}]` : acc === '' ? String(seg) : `${acc}.${String(seg)}`), '')

// The one decode gate (scorers.closed_output).
function decoder(schema: z.ZodType): (raw: unknown) => DecodeResult {
  return raw => {
    let value: unknown = raw
    if (typeof raw === 'string') {
      try {
        value = JSON.parse(raw)
      } catch (e) {
        return { ok: false, issues: [{ path: '(output)', message: `The reply is not JSON: ${(e as Error).message}` }], raw }
      }
    }
    const parsed = schema.safeParse(value)
    if (parsed.success) return { ok: true, output: parsed.data as Json }
    const issues = parsed.error.issues.flatMap(i => {
      const at = issuePath(i.path)
      if (i.code === 'unrecognized_keys') return i.keys.map(k => ({ path: at === '' ? k : `${at}.${k}`, message: `No rule defines the key ${k}. Remove it.` }))
      return [{ path: at === '' ? '(output)' : at, message: i.message }]
    })
    return { ok: false, issues, raw: value }
  }
}

function manifestOf(stage: Stage, applied: readonly AdmittedRule[], schema: Json, instructions: string, prompts: ReadonlyMap<string, { hash: Sha256 }>): Manifest {
  const checks: Record<string, number> = {}
  for (const r of applied) if (r.rule.kind === 'code_check') checks[r.rule.check.name] = checkTemplate(r.rule.check.name).version
  const sorted = [...applied].sort((a, b) => byCodeUnit(a.rule.id, b.rule.id) || a.rule.version - b.rule.version)
  return {
    format: 1,
    code: { runtime: RUNTIME_VERSION, checks, deps: { ...CODE_DEPS } },
    stage,
    rules: sorted.map(r => ({ id: r.rule.id, version: r.rule.version, hash: r.hash, binding: r.binding, origin: r.origin })),
    schema,
    instructions,
    scorers: sorted.map(r => {
      const fields = [...r.rule.scope.fields].sort(byCodeUnit)
      if (r.rule.kind === 'shape') return { id: r.ref, decider: 'code' as const, fields, shape: r.rule.shape }
      if (r.rule.kind === 'code_check') return { id: r.ref, decider: 'code' as const, fields, check: r.rule.check }
      return { id: r.ref, decider: 'judge' as const, fields, judgePromptHash: prompts.get(r.ref)!.hash }
    }),
  }
}

function hashManifest(manifest: Manifest): Sha256 {
  const text = canonicalize(manifest)
  if (text === undefined) throw new Error('The manifest has no canonical form.')
  return sha256(text)
}

// Pure and sync. Never throws on rule data: every problem comes back in one round.
export function compileStage(input: CompileInput): CompileResult {
  const { admitted, problems: refused } = admit(input.library, input.derived, input.trial)
  if (refused.length > 0) return { ok: false, problems: refused }
  return compileAdmitted(admitted, input.tree, input.node, input.stage)
}

function compileAdmitted(admitted: Admitted, nodes: readonly TreeNode[], node: NodeId, stage: Stage): CompileResult {
  const tree = indexTree(nodes)
  const scoped = resolve(admitted, tree, node, stage)
  const problems = [...reach(admitted, tree), ...scoped.problems]
  if (problems.some(p => p.code === 'stage_not_at_level' || p.code === 'node_unknown')) return { ok: false, problems }
  problems.push(...weakenings(scoped.applied, tree))

  const entries = scoped.applied.flatMap(r => (r.rule.kind === 'shape' ? r.rule.scope.fields.map(field => ({ ref: r.ref, field, shape: (r.rule as { shape: Shape }).shape })) : []))
  const composed = composeShapes(entries)
  problems.push(...composed.problems)
  if (composed.problems.length === 0) problems.push(...fit(scoped.applied, composed.trie))
  if (problems.length > 0) return { ok: false, problems }

  const schema = printSchema(composed.trie)
  const instructions = renderInstructions(stage, composed.trie, scoped.applied)
  const judgement = scoped.applied.filter(r => r.rule.kind === 'judgement')
  const prompts = new Map(judgement.map(r => [r.ref, judgePrompt(r.rule as Parameters<typeof judgePrompt>[0], r.ref)]))
  const code = scoped.applied.filter(r => r.rule.kind !== 'judgement').sort((a, b) => byCodeUnit(a.ref, b.ref)).map(codeScorer)
  const manifest = manifestOf(stage, scoped.applied, z.toJSONSchema(schema) as Json, instructions, prompts)

  return {
    ok: true,
    plan: {
      stage,
      node,
      ruleSetHash: hashManifest(manifest),
      schema,
      instructions,
      scorers: {
        code,
        judges: model => [...judgement].sort((a, b) => byCodeUnit(a.ref, b.ref)).map(r => judgeScorer(r, model, prompts.get(r.ref)!)),
        skippedJudges: reason => skippedJudges([...judgement].sort((a, b) => byCodeUnit(a.ref, b.ref)), reason),
      },
      decode: decoder(schema),
      ledger: scoped.ledger,
      manifest,
    },
  }
}

// Each path that a field names, with its containers: a[].b gives a, a[], and a[].b.
function prefixes(field: string): string[] {
  const out: string[] = []
  let at = ''
  for (const seg of parsePath(field)) {
    at = at === '' ? seg.key : `${at}.${seg.key}`
    out.push(at)
    if (seg.each) out.push((at = `${at}[]`))
  }
  return out
}

// The audit with no tree (noop.ci_field_guard): each field of each rule must be defined by some
// shape rule of the same stage, of any owner. No false positive: a compile that resolves the
// field needs such a shape rule. An active rule reads active shape rules. A draft reads drafts too.
function fieldGuard(admitted: Admitted): CompileProblem[] {
  const problems: CompileProblem[] = []
  const live = admitted.rules.filter(r => r.origin !== 'trial' && r.rule.status !== 'retired')
  for (const stage of Object.keys(STAGE_LEVELS) as Stage[]) {
    const defined = (statuses: readonly string[]) =>
      new Set(live.filter(r => r.rule.kind === 'shape' && statuses.includes(r.rule.status) && r.rule.scope.stages.includes(stage)).flatMap(r => r.rule.scope.fields.flatMap(prefixes)))
    const active = defined(['active'])
    const any = defined(['active', 'draft'])
    for (const r of live) {
      if (r.rule.kind === 'shape' || !r.rule.scope.stages.includes(stage)) continue
      const known = r.rule.status === 'active' ? active : any
      const which = r.rule.status === 'active' ? 'active shape rule' : 'shape rule'
      for (const field of r.rule.scope.fields) {
        const paths = [field, ...(r.rule.kind === 'code_check' ? checkTemplate(r.rule.check.name).requires(r.rule.check.params as never, field) : [])]
        for (const path of paths) {
          if (!known.has(path)) {
            problems.push({ code: 'field_unresolved', rules: [r.ref], field: path, message: `${r.ref} reads ${path} at ${stage}, and no ${which} of ${stage} defines it. Fix the path, or add a shape rule.` })
          }
        }
      }
    }
  }
  return problems
}

// The golden gate: each example of each shape rule and code check runs through the real scorer path.
// Judgement examples need a model, so they never run here.
async function golden(admitted: Admitted): Promise<CompileProblem[]> {
  const problems: CompileProblem[] = []
  for (const r of admitted.rules) {
    if (r.origin === 'trial' || r.rule.kind === 'judgement' || r.rule.status === 'retired') continue
    const scorer = codeScorer(r)
    const field = scorer.fields[0]!
    for (const [i, example] of r.rule.examples.entries()) {
      const output = embed(field, example.output as Json)
      const at = new Set(targets(output, field).map(t => t.path))
      const rows = (await scorer.verify(output, example.input ?? {})).filter(row => at.has(row.target))
      const got = rows.length === 1 ? rows[0]!.verdict : `${rows.length} rows`
      if (got !== example.expected) {
        problems.push({
          code: 'golden_mismatch',
          rules: [r.ref],
          field,
          message: `Example ${i} of ${r.ref} expects ${example.expected}, and the scorer gives ${got}${rows[0] ? `: ${rows[0].reason}` : ''}. Fix the example or the rule.`,
        })
      }
    }
  }
  return problems
}

// Offline. Async, because the golden examples run through the scorers.
export async function auditLibrary(input: AuditInput): Promise<readonly CompileProblem[]> {
  const { admitted, problems } = admit(input.library, input.derived)
  if (input.tree === 'unknown') problems.push(...fieldGuard(admitted))
  else if (problems.length === 0) {
    for (const n of input.tree) {
      for (const stage of (Object.keys(STAGE_LEVELS) as Stage[]).filter(s => STAGE_LEVELS[s].includes(n.level))) {
        const compiled = compileAdmitted(admitted, input.tree, n.id, stage)
        if (!compiled.ok) problems.push(...compiled.problems)
      }
    }
  }
  problems.push(...(await golden(admitted)))
  const seen = new Set<string>()
  return problems.filter(p => {
    const key = JSON.stringify([p.code, p.rules, p.field ?? null, p.message])
    return !seen.has(key) && (seen.add(key), true)
  })
}
