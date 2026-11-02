import { createHash } from 'node:crypto'
import { createScorer } from '@mastra/core/evals'
import canonicalize from 'canonicalize'
import { z } from 'zod'
import { checkTemplate } from '../rules/checks'
import type { EvidenceKey, RunEvidence } from '../rules/checks/define'
import type { JudgementRule, Verdict } from '../rules/schema'
import type { ItemVerdict, JudgeModel, RuleScorer, Sha256 } from './index'
import { targets, type Target } from './paths'
import type { AdmittedRule } from './scope'
import { describe, printShape } from './shape'

// The scorers of a plan (compile.scorers): one for each applied rule, and the outcome policy
// that no template can bypass. Runtime code: RUNTIME_VERSION covers paths.ts, shape.ts, this
// file and checks/define.ts. Raise it when one of them changes, and run npm run compiler:lock.
export const RUNTIME_VERSION = 1

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex') as Sha256

// The observed value at a target, as canonical JSON. The runtime writes it, never the check.
export function quote(value: unknown): string {
  try {
    const text = canonicalize(value)
    if (text !== undefined) return text
  } catch {
    // a value with no canonical form, such as a cycle: fall back to its text
  }
  return String(value)
}

// One item of the analyze step: the three-way verdict of one target.
interface ItemOutcome {
  readonly target: string
  readonly verdict: Verdict
  readonly reason: string
  readonly observed?: string // canonical JSON of the value at the target
  readonly by: 'code' | 'judge'
}

// A check returns a verdict and text only. The runtime parses each outcome strictly, so an
// extra field, such as a score or a best match, gives cannot_verify (checks.outcome_type).
const CheckOutcomeSchema = z.discriminatedUnion('verdict', [
  z.object({ verdict: z.literal('pass') }).strict(),
  z.object({ verdict: z.literal('fail'), fix: z.string().min(1) }).strict(),
  z.object({ verdict: z.literal('cannot_verify'), why: z.string().min(1) }).strict(),
])

const isObject = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v)
const FITS = { text: (v: unknown) => typeof v === 'string', list: Array.isArray, object: isObject } as const
const typeName = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'a list' : typeof v === 'object' ? 'an object' : `a ${typeof v}`)

const scorerId = (r: AdmittedRule) => r.ref

function row(r: AdmittedRule, o: ItemOutcome, decider: ItemVerdict['decider']): ItemVerdict {
  const base = { ruleId: r.rule.id, ruleVersion: r.rule.version, ruleHash: r.hash, binding: r.binding, target: o.target, verdict: o.verdict, decider, reason: o.reason }
  return o.observed === undefined ? base : { ...base, evidence: { quote: o.observed, source: 'output' } }
}

// The policy of a shape rule at one target.
function shapeItem(schema: z.ZodType, line: string, t: Target): ItemOutcome {
  if (t.state === 'absent') {
    return { target: t.path, verdict: 'fail', reason: `${t.why}. Add the field ${t.path}: ${line}.`, ...(t.found === undefined ? {} : { observed: quote(t.found) }), by: 'code' }
  }
  if (t.state === 'empty_list') return { target: t.path, verdict: 'pass', reason: 'The list is empty, so no item breaks the shape.', observed: '[]', by: 'code' }
  const parsed = schema.safeParse(t.value)
  if (parsed.success) return { target: t.path, verdict: 'pass', reason: `The value fits the shape: ${line}.`, observed: quote(t.value), by: 'code' }
  const issue = parsed.error.issues[0]?.message ?? 'it does not fit'
  return { target: t.path, verdict: 'fail', reason: `The value breaks the shape (${issue}). Write ${line}.`, observed: quote(t.value), by: 'code' }
}

// The policy of a code check at one target.
function checkItem(r: AdmittedRule & { rule: { kind: 'code_check' } }, t: Target, evidence: RunEvidence): ItemOutcome {
  const template = checkTemplate(r.rule.check.name)
  if (t.state === 'absent') return { target: t.path, verdict: 'cannot_verify', reason: `${t.why}. The shape rule of the field reports the absence.`, by: 'code' }
  if (t.state === 'empty_list') return { target: t.path, verdict: 'pass', reason: 'The list is empty, so no item breaks the check.', observed: '[]', by: 'code' }
  const observed = quote(t.value)
  const missing = template.needs.filter((k: EvidenceKey) => evidence[k] === undefined)
  if (missing.length > 0) {
    return { target: t.path, verdict: 'cannot_verify', reason: `The run gave no ${missing.join(', ')}, so ${template.name} did not run.`, observed, by: 'code' }
  }
  if (!FITS[template.target](t.value)) {
    return { target: t.path, verdict: 'cannot_verify', reason: `${template.name} reads ${template.target}, and the value is ${typeName(t.value)}. The shape rule of the field reports it.`, observed, by: 'code' }
  }
  let outcome: unknown
  try {
    outcome = template.check(r.rule.check.params as never, t.value, evidence as never)
  } catch (e) {
    return { target: t.path, verdict: 'cannot_verify', reason: `${template.name} threw: ${(e as Error).message}`, observed, by: 'code' }
  }
  const parsed = CheckOutcomeSchema.safeParse(outcome)
  if (!parsed.success) {
    return { target: t.path, verdict: 'cannot_verify', reason: `${template.name} returned an outcome that is not valid: ${parsed.error.issues.map(i => i.message).join(' ')}`, observed, by: 'code' }
  }
  const o = parsed.data
  const reason = o.verdict === 'pass' ? `${template.name} passed.` : o.verdict === 'fail' ? o.fix : o.why
  return { target: t.path, verdict: o.verdict, reason, observed, by: 'code' }
}

// Each field of a rule, walked to its targets. A field never gives an empty list.
const allTargets = (output: unknown, fields: readonly string[]) => fields.flatMap(f => targets(output, f))

// A code scorer serves a shape rule or a code_check rule. It has function steps only, so it never
// calls a model. It takes the raw output, which may break the schema (scorers.decode_failure_rows).
export function codeScorer(r: AdmittedRule): RuleScorer {
  const rule = r.rule
  if (rule.kind === 'judgement') throw new Error(`${r.ref} is a judgement rule. Use judgeScorer.`)
  const fields = [...rule.scope.fields].sort()
  const item: (t: Target, evidence: RunEvidence) => ItemOutcome =
    rule.kind === 'shape'
      ? (() => {
          const schema = printShape(rule.shape)
          const line = describe(rule.shape)
          return (t: Target) => shapeItem(schema, line, t)
        })()
      : (t, evidence) => checkItem(r as AdmittedRule & { rule: typeof rule }, t, evidence)

  const scorer = createScorer<RunEvidence, unknown>({ id: scorerId(r), description: rule.statement })
    .preprocess(({ run }) => allTargets(run.output, fields))
    .analyze(({ run, results }) => results.preprocessStepResult.map(t => item(t, run.input ?? {})))
    .generateScore(({ results }) => (results.analyzeStepResult.every(o => o.verdict === 'pass') ? 1 : 0))

  return {
    id: scorerId(r),
    rule: { id: rule.id, version: rule.version, hash: r.hash, binding: r.binding, kind: rule.kind },
    decider: { by: 'code' },
    fields,
    scorer,
    async verify(output, evidence) {
      try {
        const result = await scorer.run({ input: evidence, output })
        const items = result.analyzeStepResult
        if (!items || items.length === 0) throw new Error('The scorer gave no item.')
        return items.map(o => row(r, o, { by: 'code' }))
      } catch (e) {
        return fields.map(f => row(r, { target: f, verdict: 'cannot_verify', reason: `The scorer failed: ${(e as Error).message}`, by: 'code' }, { by: 'code' }))
      }
    },
  }
}

const JUDGE_SYSTEM = [
  'You judge one rule of a product evaluation harness, item by item.',
  'Answer from the item and the full source texts only. Never guess.',
  'Answer unknown when the item and the sources do not settle the question.',
].join('\n')

// The static part of the judge prompt, made at compile time. Its hash enters the manifest. The
// judge question lives here and never in the instruction text.
export function judgePrompt(rule: JudgementRule, ref: string): { readonly text: string; readonly hash: Sha256 } {
  const lines = [
    JUDGE_SYSTEM,
    '',
    `Rule ${ref}: ${rule.statement}`,
    `Why the rule exists: ${rule.reason}`,
    `Question: ${rule.judge.question}`,
    ...(rule.judge.policy ? [`Policy: ${rule.judge.policy}`] : []),
    'Boundary examples:',
    ...rule.examples.map(e => `- output ${quote(e.output)} gives ${e.expected}${e.note ? ` (${e.note})` : ''}`),
    '',
    'Answer format: for each item, give its target exactly as written, an answer of yes, no, or unknown,',
    'a quote from the item or the sources that the answer rests on, and a short reason.',
  ]
  const text = lines.join('\n')
  return { text, hash: sha256(text) }
}

const JudgeAnswer = z.object({
  items: z.array(z.object({ target: z.string(), answer: z.enum(['yes', 'no', 'unknown']), quote: z.string(), reason: z.string() })),
})
type JudgeAnswer = z.infer<typeof JudgeAnswer>
const ANSWER: Record<JudgeAnswer['items'][number]['answer'], Verdict> = { yes: 'pass', no: 'fail', unknown: 'cannot_verify' }

// The run part of the judge prompt: the items and the full source texts, never a summary.
function runPart(items: readonly Target[], evidence: RunEvidence): string {
  const lines = ['Items:']
  for (const t of items) if (t.state === 'present') lines.push(`- target ${t.path}: ${quote(t.value)}`)
  const sources = Object.entries(evidence.sources ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))
  if (sources.length > 0) {
    lines.push('', 'Sources, in full:')
    for (const [name, text] of sources) lines.push(`### ${name}`, text)
  }
  return lines.join('\n')
}

// A judge scorer serves a judgement rule. Mastra binds the judge model when it makes the scorer,
// so only plan.scorers.judges(model) calls this.
export function judgeScorer(r: AdmittedRule, model: JudgeModel, prompt: { readonly text: string; readonly hash: Sha256 }): RuleScorer {
  const rule = r.rule
  if (rule.kind !== 'judgement') throw new Error(`${r.ref} is not a judgement rule. Use codeScorer.`)
  const fields = [...rule.scope.fields].sort()
  const decider = { by: 'judge' as const, model: model.id, promptHash: prompt.hash }

  const scorer = createScorer<RunEvidence, unknown>({ id: scorerId(r), description: rule.statement, judge: { model: model.model, instructions: JUDGE_SYSTEM } })
    .preprocess(({ run }) => allTargets(run.output, fields).filter(t => t.state === 'present'))
    .analyze({
      description: `Answer the question of ${r.ref} for each item.`,
      outputSchema: JudgeAnswer,
      createPrompt: ({ run, results }) => `${prompt.text}\n\n${runPart(results.preprocessStepResult, run.input ?? {})}`,
    })
    .generateScore(({ results }) => (results.analyzeStepResult.items.every(i => i.answer === 'yes') ? 1 : 0))

  return {
    id: scorerId(r),
    rule: { id: rule.id, version: rule.version, hash: r.hash, binding: r.binding, kind: rule.kind },
    decider,
    fields,
    scorer,
    async verify(output, evidence) {
      const all = allTargets(output, fields)
      const rows: ItemVerdict[] = []
      // Code decides only what needs no judgement: an absent target, and an empty list.
      for (const t of all) {
        if (t.state === 'absent') rows.push(row(r, { target: t.path, verdict: 'cannot_verify', reason: `${t.why}, so the judge had no item. The shape rule of the field reports it.`, by: 'code' }, { by: 'code' }))
        if (t.state === 'empty_list') rows.push(row(r, { target: t.path, verdict: 'pass', reason: 'The list is empty, so no item breaks the rule.', observed: '[]', by: 'code' }, { by: 'code' }))
      }
      const present = all.filter((t): t is Extract<Target, { state: 'present' }> => t.state === 'present')
      if (present.length === 0) return rows
      let answers: JudgeAnswer['items'] | undefined
      let failure = ''
      try {
        const result = await scorer.run({ input: evidence, output })
        answers = JudgeAnswer.parse(result.analyzeStepResult).items
      } catch (e) {
        failure = (e as Error).message
      }
      for (const t of present) {
        const observed = quote(t.value)
        const mine = answers?.filter(a => a.target === t.path) ?? []
        const verdicts = new Set(mine.map(a => ANSWER[a.answer]))
        if (answers === undefined) {
          rows.push(row(r, { target: t.path, verdict: 'cannot_verify', reason: `The judge call failed: ${failure}`, observed, by: 'judge' }, decider))
        } else if (mine.length === 0 || verdicts.size > 1) {
          const why = mine.length === 0 ? 'The judge gave no answer for this item.' : 'The judge gave two answers for this item.'
          rows.push(row(r, { target: t.path, verdict: 'cannot_verify', reason: why, observed, by: 'judge' }, decider))
        } else {
          const a = mine[0]!
          const reason = `${a.reason.trim() || `The judge answered ${a.answer}.`}${a.quote.trim() ? ` Quote: "${a.quote.trim()}"` : ''}`
          rows.push(row(r, { target: t.path, verdict: ANSWER[a.answer], reason, observed, by: 'judge' }, decider))
        }
      }
      return rows
    },
  }
}

// One cannot_verify row for each field of each judgement rule, with no model (scorers.skipped_judges).
export function skippedJudges(rules: readonly AdmittedRule[], reason: string): ItemVerdict[] {
  const why = reason.trim() === '' ? 'No judge ran.' : reason
  return rules
    .filter(r => r.rule.kind === 'judgement')
    .flatMap(r => [...r.rule.scope.fields].sort().map(f => row(r, { target: f, verdict: 'cannot_verify', reason: why, by: 'code' }, { by: 'code' })))
}
