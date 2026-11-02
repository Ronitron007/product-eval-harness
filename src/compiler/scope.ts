import { checkTemplate } from '../rules/checks'
import { ruleHash } from '../rules/hash'
import type { RuleLibrary } from '../rules/load'
import { OWNER_ALL, RuleRecord, SHAPE_ORDERS, STAGE_LEVELS, type Binding, type Shape, type Stage } from '../rules/schema'
import { BINDING_STRENGTH, looserDimensions, sameIdentity, type DimensionOrder, type OrderTable } from '../rules/strictness'
import type { DerivedRule } from '../store/store'
import type { CompileProblem, ExclusionReason, LedgerEntry, RuleOrigin, Sha256, TreeNode } from './index'

// Admission, anchored scope, the ledger, and the weaken test (compile.admit, compile.scope,
// compile.ledger, compile.weaken).

export type RuleRef = `${string}@${number}`

export interface AdmittedRule {
  readonly rule: RuleRecord
  readonly ref: RuleRef
  readonly hash: Sha256 // from ruleHash, never from storage
  readonly origin: RuleOrigin
  readonly binding: Binding // the binding that applies: a trial is always watch
}

declare const admittedBrand: unique symbol
// Only admit() makes this value, so no internal step gets a rule that nobody checked.
export interface Admitted {
  readonly [admittedBrand]: true
  readonly rules: readonly AdmittedRule[] // the library, the newest version of each derived id, and the trial
  readonly older: readonly AdmittedRule[] // older derived versions: ledger reason superseded
}

export const refOf = (r: { readonly id: string; readonly version: number }): RuleRef => `${r.id}@${r.version}`
const byRef = (a: { ref: string }, b: { ref: string }) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0)
// ruleHash throws on a value with no canonical form, such as a lone surrogate. The compile never
// throws on rule data, so that throw becomes a problem.
const hashOrUndefined = (rule: RuleRecord): Sha256 | undefined => {
  try {
    return ruleHash(rule) as Sha256
  } catch {
    return undefined
  }
}
const issuesOf = (error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }) =>
  error.issues.map(i => `${i.path.map(String).join('.') || '(record)'}: ${i.message}`).join(' ')

// Refuses each input that a compile must not read (compile.admit). It returns every problem in
// one round, and the rules that passed, so the audit can still run their golden examples.
export function admit(library: RuleLibrary, derived: readonly DerivedRule[], trial?: RuleRecord): { admitted: Admitted; problems: CompileProblem[] } {
  const problems: CompileProblem[] = []
  for (const p of library.problems) {
    problems.push({ code: 'library_invalid', rules: [], field: p.field, message: `${p.file} ${p.field}: ${p.message} Run npm run rules:check, and fix each problem.` })
  }

  const rules: AdmittedRule[] = []
  const stageIds = new Set(library.rules.map(r => r.rule.id))
  for (const { rule } of library.rules) {
    const ref = refOf(rule)
    if (rule.status === 'draft' && rule.version > 1) {
      problems.push({
        code: 'draft_shadows_active',
        rules: [ref],
        message: `${ref} is a draft above version 1, so it hides version ${rule.version - 1} in silence. Keep the active version in rules/, and give the candidate to a trial from the PR branch.`,
      })
    }
    const hash = hashOrUndefined(rule)
    if (hash === undefined) problems.push({ code: 'library_invalid', rules: [ref], message: `${ref} has no canonical form. Run npm run rules:check, and fix each problem.` })
    else rules.push({ rule, ref, hash, origin: 'git', binding: rule.binding })
  }

  const versions = new Map<string, AdmittedRule[]>()
  for (const row of derived) {
    const ref = refOf(row)
    const parsed = RuleRecord.safeParse(row.record)
    if (!parsed.success) {
      problems.push({ code: 'derived_invalid', rules: [ref], message: `The record of derived rule ${ref} is not a valid rule: ${issuesOf(parsed.error)}` })
      continue
    }
    const rule = parsed.data
    const columns = [
      ['id', row.id, rule.id],
      ['version', row.version, rule.version],
      ['owner', row.owner, rule.owner],
    ].filter(([, column, field]) => column !== field)
    if (columns.length > 0) {
      const which = columns.map(([name, column, field]) => `${name} is ${column} in the row and ${field} in the record`).join(', ')
      problems.push({ code: 'derived_invalid', rules: [ref], message: `The columns of derived rule ${ref} disagree with its record: ${which}.` })
      continue
    }
    if ((versions.get(rule.id) ?? []).some(r => r.rule.version === rule.version)) {
      problems.push({ code: 'derived_invalid', rules: [ref], message: `Two derived rows hold ${ref}. One version has one row.` })
      continue
    }
    const hash = hashOrUndefined(rule)
    if (hash === undefined) {
      problems.push({ code: 'derived_invalid', rules: [ref], message: `The record of derived rule ${ref} has no canonical form. Use only finite numbers, strings, lists and maps.` })
      continue
    }
    if (hash !== row.hash) {
      problems.push({ code: 'derived_hash_mismatch', rules: [ref], message: `The record of derived rule ${ref} does not give its stored hash. Someone changed the record. Add a new version instead.` })
      continue
    }
    if (rule.kind === 'shape') {
      problems.push({ code: 'derived_invalid', rules: [ref], message: `Derived rule ${ref} is a shape rule. Only Rohan changes an output shape, through a PR with a stage rule in rules/.` })
      continue
    }
    if (stageIds.has(rule.id)) {
      problems.push({ code: 'id_collision', rules: [ref], message: `Derived rule ${ref} has the id of a stage rule in rules/. Give the derived rule its own id.` })
      continue
    }
    versions.set(rule.id, [...(versions.get(rule.id) ?? []), { rule, ref, hash, origin: 'store', binding: rule.binding }])
  }
  const older: AdmittedRule[] = []
  for (const list of versions.values()) {
    const sorted = [...list].sort((a, b) => a.rule.version - b.rule.version)
    rules.push(sorted.pop()!)
    older.push(...sorted)
  }

  if (trial !== undefined) {
    const parsed = RuleRecord.safeParse(trial)
    const ref = refOf(trial)
    const taken = [...rules, ...older].some(r => r.ref === ref)
    if (!parsed.success) {
      problems.push({ code: 'library_invalid', rules: [ref], message: `The trial candidate ${ref} is not a valid rule: ${issuesOf(parsed.error)}` })
    } else if (parsed.data.kind === 'shape') {
      problems.push({ code: 'trial_shape_refused', rules: [ref], message: `${ref} is a shape rule. A trial runs as watch, and a shape rule is always strict. Change a shape through a PR and Rohan's yes.` })
    } else if (taken) {
      problems.push({ code: 'id_collision', rules: [ref], message: `The trial candidate ${ref} has the id and version of an existing rule. Raise the version of the candidate.` })
    } else {
      const hash = hashOrUndefined(parsed.data)
      if (hash === undefined) problems.push({ code: 'library_invalid', rules: [ref], message: `The trial candidate ${ref} has no canonical form. Use only finite numbers, strings, lists and maps.` })
      else rules.push({ rule: parsed.data, ref, hash, origin: 'trial', binding: 'watch' })
    }
  }

  return { admitted: { rules: rules.sort(byRef), older: older.sort(byRef) } as unknown as Admitted, problems }
}

export interface Tree {
  readonly nodes: readonly TreeNode[]
  node(id: string): TreeNode | undefined
  pathToRoot(id: string): readonly string[] // the root first, the node last
  isStrictAncestor(ancestor: string, of: string): boolean // the owner all is a strict ancestor of each real node
}

export function indexTree(nodes: readonly TreeNode[]): Tree {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const paths = new Map<string, string[]>()
  const pathToRoot = (id: string): string[] => {
    const cached = paths.get(id)
    if (cached) return cached
    const path: string[] = []
    for (let n = byId.get(id); n && !path.includes(n.id); n = n.parentId === null ? undefined : byId.get(n.parentId)) path.unshift(n.id)
    paths.set(id, path)
    return path
  }
  return {
    nodes,
    node: id => byId.get(id),
    pathToRoot,
    isStrictAncestor(ancestor, of) {
      if (ancestor === of || of === OWNER_ALL) return false
      return ancestor === OWNER_ALL || pathToRoot(of).includes(ancestor)
    },
  }
}

// Why a rule does not apply at node and stage, or undefined when it applies (compile.scope).
export function scopeMiss(rule: RuleRecord, tree: Tree, node: string, stage: Stage): ExclusionReason | undefined {
  if (rule.owner !== OWNER_ALL && !tree.pathToRoot(node).includes(rule.owner)) return 'owner_not_on_path'
  if (!rule.scope.stages.includes(stage)) return 'stage_not_named'
  const selector = rule.scope.nodes
  const hit = selector === 'owner' ? node === rule.owner : selector === 'subtree' ? true : tree.node(node)?.level === selector.level
  return hit ? undefined : 'selector_misses_node'
}

// The pairs of node and stage where a stage runs.
const runs = (tree: Tree) => tree.nodes.flatMap(n => (Object.keys(STAGE_LEVELS) as Stage[]).filter(s => STAGE_LEVELS[s].includes(n.level)).map(s => [n.id, s] as const))

// The reach of the whole pool (scope.inert_rule): an active rule must apply somewhere.
export function reach(admitted: Admitted, tree: Tree): CompileProblem[] {
  const problems: CompileProblem[] = []
  for (const r of admitted.rules) {
    if (r.origin === 'trial' || r.rule.status !== 'active') continue
    if (r.rule.owner !== OWNER_ALL && !tree.node(r.rule.owner)) {
      problems.push({ code: 'owner_unknown', rules: [r.ref], message: `The owner ${r.rule.owner} of ${r.ref} is not a node of the tree. Keep the rule at status draft until the node exists.` })
    } else if (!runs(tree).some(([n, s]) => scopeMiss(r.rule, tree, n, s) === undefined)) {
      problems.push({ code: 'rule_inert', rules: [r.ref], message: `${r.ref} applies at no node and stage of the tree. Keep it at status draft until such a node exists, or change its scope.` })
    }
  }
  return problems
}

// One ledger entry for each input rule version, and the rules that apply (compile.ledger).
export function resolve(admitted: Admitted, tree: Tree, node: string, stage: Stage): { applied: AdmittedRule[]; ledger: LedgerEntry[]; problems: CompileProblem[] } {
  const here = tree.node(node)
  if (!here) throw new Error(`No node ${node} in the tree. Compile at a node that store.tree() gives.`)
  const problems: CompileProblem[] = []
  if (!STAGE_LEVELS[stage].includes(here.level)) {
    problems.push({ code: 'stage_not_at_level', rules: [], message: `The stage ${stage} runs at ${STAGE_LEVELS[stage].join(', ')} nodes, and ${node} is a ${here.level} node. Compile ${stage} at another node.` })
  }
  const applied: AdmittedRule[] = []
  const ledger: LedgerEntry[] = []
  const entry = (r: AdmittedRule, disposition: LedgerEntry['disposition']) =>
    ledger.push({ rule: r.rule.id, version: r.rule.version, origin: r.origin, disposition })

  for (const r of admitted.older) entry(r, { kind: 'excluded', reason: 'superseded' })
  for (const r of admitted.rules) {
    const miss = scopeMiss(r.rule, tree, node, stage)
    if (r.origin === 'trial') {
      if (miss === undefined) {
        applied.push(r)
        entry(r, { kind: 'trial' })
      } else {
        problems.push({ code: 'trial_not_applied', rules: [r.ref], message: `The trial candidate ${r.ref} does not apply at ${node} and ${stage} (${miss}), so the trial would compile to the live hash. Compile the trial where its scope applies.` })
        entry(r, { kind: 'excluded', reason: miss })
      }
    } else if (r.rule.status !== 'active') entry(r, { kind: 'excluded', reason: r.rule.status })
    else if (miss !== undefined) entry(r, { kind: 'excluded', reason: miss })
    else {
      applied.push(r)
      entry(r, { kind: 'applied', binding: r.binding })
    }
  }
  ledger.sort((a, b) => (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : a.version - b.version))
  return { applied, ledger, problems }
}

const paramsOf = (shape: Shape): Record<string, unknown> => {
  const { type: _type, ...params } = shape
  return params
}
const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : [String(v)])

// What one looser dimension does, in words, and how the author fixes it.
function looser(dim: string, order: DimensionOrder, child: unknown, parent: unknown, parentName: string): { what: string; fix: string } {
  switch (order) {
    case 'subset_is_stricter': {
      const extra = list(child).filter(v => !list(parent).includes(v))
      return { what: `allows ${extra.join(', ')}, which ${parentName} forbids`, fix: extra.length > 1 ? 'drop the values' : 'drop the value' }
    }
    case 'superset_is_stricter': {
      const missing = list(parent).filter(v => !list(child).includes(v))
      return { what: `drops ${missing.join(', ')}, which ${parentName} requires`, fix: 'add the value back' }
    }
    case 'higher_is_stricter':
      return { what: `sets ${dim} to ${String(child)}, below the ${dim} ${String(parent)} of ${parentName}`, fix: 'raise the value' }
    case 'lower_is_stricter':
      return { what: `sets ${dim} to ${String(child)}, above the ${dim} ${String(parent)} of ${parentName}`, fix: 'lower the value' }
    case 'true_is_stricter':
      return { what: `sets ${dim} to false, where ${parentName} sets true`, fix: `set ${dim} to true` }
    case 'identity':
      return { what: `changes ${dim}`, fix: 'keep the value' }
  }
}

// A child rule that restates an inherited slot more loosely (compile.weaken). The binding test
// reads the binding that the author wrote, so the forced watch of a trial is never a weakening.
export function weakenings(applied: readonly AdmittedRule[], tree: Tree): CompileProblem[] {
  const problems: CompileProblem[] = []
  for (const parent of applied) {
    for (const child of applied) {
      if (!tree.isStrictAncestor(parent.rule.owner, child.rule.owner)) continue
      const A = parent.rule
      const B = child.rule
      let parts: { what: string; fix: string }[] = []
      if (A.kind === 'shape' && B.kind === 'shape' && A.shape.type === B.shape.type) {
        const order = SHAPE_ORDERS[A.shape.type] as OrderTable<Record<string, unknown>>
        const a = paramsOf(A.shape)
        const b = paramsOf(B.shape)
        parts = looserDimensions(b, a, order).map(d => looser(d, order[d]!, b[d], a[d], `${A.owner} ${parent.ref}`))
      } else if (A.kind === 'code_check' && B.kind === 'code_check' && A.check.name === B.check.name) {
        const order = checkTemplate(A.check.name).order as OrderTable<Record<string, unknown>>
        const a = A.check.params as Record<string, unknown>
        const b = B.check.params as Record<string, unknown>
        if (!sameIdentity(a, b, order)) continue
        parts = looserDimensions(b, a, order).map(d => looser(d, order[d]!, b[d], a[d], `${A.owner} ${parent.ref}`))
        if (BINDING_STRENGTH[B.binding] < BINDING_STRENGTH[A.binding]) {
          parts.push({ what: `has the binding ${B.binding}, below the binding ${A.binding} of ${A.owner} ${parent.ref}`, fix: 'raise the binding' })
        }
      } else continue
      if (parts.length === 0) continue
      for (const field of B.scope.fields.filter(f => A.scope.fields.includes(f))) {
        problems.push({
          code: 'weakens',
          rules: [child.ref, parent.ref],
          field,
          message: `${B.owner} ${child.ref} ${parts.map(p => p.what).join('; ')}. Change the ${A.owner} rule, or ${[...new Set(parts.map(p => p.fix))].join(' and ')}.`,
        })
      }
    }
  }
  return problems
}
