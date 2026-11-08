import { describe, expect, it } from 'vitest'
import type { RuleScorer, StagePlan } from '../../src/compiler'
import { RowsIncomplete, SKIPPED } from '../../src/judge'
import { planOf } from '../compiler/library'
import { ans, draftWith, JUDGE, JUDGE_REF, planRefs, rowRefs, rowsOf, run } from './helpers'

// Hazard `missing_row`: a rule in the plan has no row for a draft (judge.outcome_total).

const throwing = (s: RuleScorer): RuleScorer => ({
  ...s,
  verify: async () => {
    throw new Error('a bug in the scorer')
  },
})

describe('missing_row', () => {
  // Repro sonnet/p0.repro.ts: the baseline run of the judge step.
  it('missing_row.applied_ids_judged (repro sonnet/p0.repro.ts): with a mock judge that answers yes with the quote 500 mg, the rule refs of the rows equal the refs of the plan', async () => {
    const plan = planOf()
    const o = await run({ plan, items: [ans('yes', '500 mg')] })
    expect(rowRefs(o.rows)).toEqual(planRefs(plan))
    expect(rowsOf(o.rows, JUDGE).map(r => [r.verdict, r.decider.by])).toEqual([['pass', 'judge']])
    expect(o.rows.every(r => r.runId === 'run-judge-test')).toBe(true)
    expect(o.kind).toBe('accept')
  })

  it('missing_row.applied_ids_skipped: a draft that fails a strict code check gives rows whose refs equal the refs of the plan, and the judgement rule has a skipped row', async () => {
    const plan = planOf()
    const o = await run({ plan, reply: draftWith({ quote: '600 mg' }), items: [ans('yes', '500 mg')] })
    expect(rowRefs(o.rows)).toEqual(planRefs(plan))
    expect(rowsOf(o.rows, JUDGE)).toEqual([expect.objectContaining({ verdict: 'cannot_verify', decider: { by: 'code' }, reason: SKIPPED.strict })])
  })

  it('missing_row.applied_ids_decode_failed: a reply that is not JSON gives rows whose refs equal the refs of the plan', async () => {
    const plan = planOf()
    const o = await run({ plan, reply: 'not json' })
    expect(rowRefs(o.rows)).toEqual(planRefs(plan))
    expect(rowsOf(o.rows, JUDGE)).toEqual([expect.objectContaining({ verdict: 'cannot_verify', reason: SKIPPED.decode })])
  })

  it('missing_row.scorer_dropped_refused: a plan copy with one code scorer removed makes judgeDraft throw RowsIncomplete, with that ref in missing', async () => {
    const plan = planOf()
    const dropped: StagePlan = { ...plan, scorers: { ...plan.scorers, code: plan.scorers.code.filter(s => s.id !== 'units.label_unit@1') } }
    const error = await run({ plan: dropped, items: [ans('yes', '500 mg')] }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RowsIncomplete)
    expect(error).toMatchObject({ missing: ['units.label_unit@1'], extra: [] })
    // A row for a rule that the plan does not apply is refused too.
    const fewer: StagePlan = { ...plan, manifest: { ...plan.manifest, rules: plan.manifest.rules.filter(r => r.id !== JUDGE) } }
    await expect(run({ plan: fewer, items: [ans('yes', '500 mg')] })).rejects.toMatchObject({ missing: [], extra: [JUDGE_REF] })
  })

  it('missing_row.verify_throw_keeps_rows: a plan copy with a scorer whose verify throws gives one cannot_verify row for each field of that scorer', async () => {
    const plan = planOf()
    const code: StagePlan = { ...plan, scorers: { ...plan.scorers, code: plan.scorers.code.map(s => (s.id === 'units.label_unit@1' ? throwing(s) : s)) } }
    const o = await run({ plan: code, items: [ans('yes', '500 mg')] })
    expect(rowsOf(o.rows, 'units.label_unit')).toEqual([
      expect.objectContaining({ target: 'criteria[].attributes[].unit', verdict: 'cannot_verify', decider: { by: 'code' }, reason: 'The scorer threw: a bug in the scorer' }),
    ])
    expect(rowRefs(o.rows)).toEqual(planRefs(plan))
    // A judge scorer that throws keeps the decider of its scorer.
    const judges: StagePlan = { ...plan, scorers: { ...plan.scorers, judges: m => plan.scorers.judges(m).map(throwing) } }
    const j = await run({ plan: judges, items: [ans('yes', '500 mg')] })
    expect(rowsOf(j.rows, JUDGE)).toEqual([expect.objectContaining({ verdict: 'cannot_verify', decider: expect.objectContaining({ by: 'judge', model: 'mock/judge' }) })])
    expect(j.kind).toBe('person')
  })
})
