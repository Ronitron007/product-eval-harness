import type { DecodeResult, ItemVerdict, JudgeModel, RuleScorer, StagePlan } from '../compiler'
import { RunEvidence, type Json } from '../rules/checks/define'
import type { VerdictInput } from '../store/store'

// The judge step (docs/design/judge-step.md): the code of the ruleset judge. It runs the compiled
// scorers of one plan on one draft and returns one judge outcome with the verdict rows. It decides
// the outcome from the bindings, and it never acts on it. In src/judge/, only this file imports
// src/compiler/index.ts (boundary.internals_unreachable). Runtime code: RUNTIME_VERSION covers this
// file (judge.runtime_pinned). Raise it when the order or the binding table changes.

export type { DecodeResult, JudgeModel, StagePlan }

export type RuleRef = `${string}@${number}` // rule.id@version

export interface JudgeInput {
  readonly runId: string
  readonly plan: StagePlan // from planFor: compiled again, same hash as the run
  readonly reply: unknown // draft.object, else draft.text
  readonly evidence: unknown // parsed with RunEvidence at the boundary (judge.evidence_parsed)
  readonly judgeModel: JudgeModel // provider/model id and the model config
}

// One error for the next repair round, with its fix (enforce.repair).
export interface RepairError {
  readonly from: RuleRef | 'decode'
  readonly target: string // an output path, or (output) for a reply that is not JSON
  readonly fix: string
}

// A soft verdict that is not pass. It stays with the output (enforce.binding).
export interface Warning {
  readonly rule: RuleRef
  readonly target: string
  readonly kind: 'warning' | 'note' // warning: a soft fail. note: a soft cannot_verify.
  readonly text: string
}

interface Judged {
  readonly rows: readonly VerdictInput[] // every row of this draft, watch rows too
  readonly warnings: readonly Warning[]
}

export type JudgeOutcome =
  | (Judged & { readonly kind: 'accept'; readonly output: Json })
  | (Judged & { readonly kind: 'repair'; readonly errors: readonly RepairError[] })
  | (Judged & { readonly kind: 'person'; readonly open: readonly VerdictInput[] })

export interface DecideInput {
  readonly decoded: DecodeResult
  readonly rows: readonly VerdictInput[]
  readonly statements: ReadonlyMap<RuleRef, string> // from RuleScorer.rule.statement (judge.fail_fix)
}

// The rows of a draft do not cover the rules of the plan (judge.outcome_total). Only a bug gives it.
export class RowsIncomplete extends Error {
  readonly missing: readonly RuleRef[] // applied, with no row
  readonly extra: readonly RuleRef[] // a row for a rule that the plan does not apply

  constructor(missing: readonly RuleRef[], extra: readonly RuleRef[]) {
    super(
      `The rows of the draft do not match the rules of the plan. Missing: ${missing.join(', ') || 'none'}. Extra: ${extra.join(', ') || 'none'}. ` +
        'A scorer or the judge step has a bug. Fix it: the judge step never fills the gap.',
    )
    this.name = 'RowsIncomplete'
    this.missing = missing
    this.extra = extra
  }
}

// The reason of each skipped judge row names the cause (judge.order).
export const SKIPPED = {
  evidence: 'The run evidence is not valid, so no judge ran.',
  decode: 'The output broke the schema, so no judge ran.',
  strict: 'A strict code check did not pass.',
} as const

const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const refOf = (r: { readonly ruleId: string; readonly ruleVersion: number }): RuleRef => `${r.ruleId}@${r.ruleVersion}`
// Rule order (id, then version), then target order.
const byRuleThenTarget = (a: VerdictInput, b: VerdictInput) => byCodeUnit(a.ruleId, b.ruleId) || a.ruleVersion - b.ruleVersion || byCodeUnit(a.target, b.target)

// verify never throws by its contract. If it throws, each field of the scorer gets a cannot_verify
// row with the decider of the scorer, so a bug in one scorer never removes the rows of a rule.
async function rowsOf(s: RuleScorer, output: unknown, evidence: RunEvidence): Promise<readonly ItemVerdict[]> {
  try {
    return await s.verify(output, evidence)
  } catch (e) {
    const reason = `The scorer threw: ${(e as Error)?.message ?? String(e)}`
    return s.fields.map(target => ({ ruleId: s.rule.id, ruleVersion: s.rule.version, ruleHash: s.rule.hash, binding: s.rule.binding, target, verdict: 'cannot_verify' as const, decider: s.decider, reason }))
  }
}

// judge.outcome_total: the rule refs of the rows equal the refs of plan.manifest.rules (applied and trial).
function checkTotal(plan: StagePlan, rows: readonly VerdictInput[]): void {
  const want = new Set(plan.manifest.rules.map(r => `${r.id}@${r.version}` as RuleRef))
  const have = new Set(rows.map(refOf))
  const missing = [...want].filter(r => !have.has(r)).sort(byCodeUnit)
  const extra = [...have].filter(r => !want.has(r)).sort(byCodeUnit)
  if (missing.length > 0 || extra.length > 0) throw new RowsIncomplete(missing, extra)
}

// Runs the order of judge.order. Never writes. Throws RowsIncomplete only on a bug (judge.outcome_total).
export async function judgeDraft(input: JudgeInput): Promise<JudgeOutcome> {
  const { plan } = input
  // Evidence. Bad evidence becomes {} for the code scorers, and it shuts the gate.
  const parsed = RunEvidence.safeParse(input.evidence)
  const evidence: RunEvidence = parsed.success ? parsed.data : {}
  // Decode. The code scorers get the decoded output, or the raw value when the decode failed.
  const decoded = plan.decode(input.reply)
  const output = decoded.ok ? decoded.output : decoded.raw
  const statements = new Map<RuleRef, string>()
  const rows: ItemVerdict[] = []
  for (const s of plan.scorers.code) {
    statements.set(s.id, s.rule.statement)
    rows.push(...(await rowsOf(s, output, evidence)))
  }
  // The strict-code gate. Judges run one after another, in rule order.
  const shut = !parsed.success ? SKIPPED.evidence : !decoded.ok ? SKIPPED.decode : rows.some(r => r.binding === 'strict' && r.verdict !== 'pass') ? SKIPPED.strict : undefined
  if (shut === undefined) {
    for (const s of plan.scorers.judges(input.judgeModel)) {
      statements.set(s.id, s.rule.statement)
      rows.push(...(await rowsOf(s, output, evidence)))
    }
  } else rows.push(...plan.scorers.skippedJudges(shut)) // no model
  const full: VerdictInput[] = rows.map(r => ({ ...r, runId: input.runId }))
  checkTotal(plan, full)
  return decideOutcome({ decoded, rows: full, statements })
}

// judge.fail_fix: a code fail keeps its own fix, the reason of its row. A judge fail names the rule.
function fixOf(r: VerdictInput, statements: ReadonlyMap<RuleRef, string>): string {
  if (r.decider.by === 'code') return r.reason
  const statement = statements.get(refOf(r))
  if (statement === undefined) throw new Error(`decideOutcome got no statement for ${refOf(r)}. Pass the statement of each judgement rule.`)
  return `Change the item so that: ${statement} ${r.reason}`
}

// The binding table of judge.bindings. Pure and sync. No model, no store. The first line that
// applies decides. Only strict rows reach the outcome, errors and open. Only soft rows reach
// warnings. Watch rows stay in rows only (judge.watch_inert).
export function decideOutcome(input: DecideInput): JudgeOutcome {
  const { decoded, rows } = input
  const strict = rows.filter(r => r.binding === 'strict').sort(byRuleThenTarget)
  const warnings: Warning[] = rows
    .filter(r => r.binding === 'soft' && r.verdict !== 'pass')
    .sort(byRuleThenTarget)
    .map(r => ({ rule: refOf(r), target: r.target, kind: r.verdict === 'fail' ? 'warning' : 'note', text: r.reason }))
  const fails = strict.filter(r => r.verdict === 'fail')
  // judge.decode_repairs and judge.outcome_precedence: a failed decode or a strict fail repairs.
  if (!decoded.ok || fails.length > 0) {
    const failed = new Set(fails.map(r => r.target))
    const issues = decoded.ok ? [] : decoded.issues.filter(i => !failed.has(i.path)).sort((a, b) => byCodeUnit(a.path, b.path))
    const errors: RepairError[] = [
      ...issues.map(i => ({ from: 'decode' as const, target: i.path, fix: i.message })),
      ...fails.map(r => ({ from: refOf(r), target: r.target, fix: fixOf(r, input.statements) })),
    ]
    return { kind: 'repair', rows, warnings, errors }
  }
  const open = strict.filter(r => r.verdict !== 'pass')
  if (open.length > 0) return { kind: 'person', rows, warnings, open }
  return { kind: 'accept', rows, warnings, output: decoded.output }
}
