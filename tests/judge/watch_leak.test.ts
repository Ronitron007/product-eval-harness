import { describe, expect, it } from 'vitest'
import { RuleRecord } from '../../src/rules/schema'
import { planOf, withRules } from '../compiler/library'
import { attributeIsProduct, checkRule, GOOD_EVIDENCE, judgementRule, keyKnown, quotesFromLabel } from '../compiler/rules'
import { ans, draftWith, JUDGE, rowsOf, run } from './helpers'

// Hazard `watch_leak`: a watch verdict changes the outcome, the errors, or the warnings (judge.watch_inert).

const watch = (rule: Record<string, unknown> & { id: string; owner: string }) => ({ ...rule, binding: 'watch' })

describe('watch_leak', () => {
  // Repro sonnet/p2.repro.ts (F6): a watch code fail must not reach the errors.
  it('watch_leak.fail_changes_nothing (repro sonnet/p2.repro.ts F6): a watch code check and a watch judgement rule that both fail give accept, with empty warnings, and their rows are in rows', async () => {
    const plan = planOf({ rules: withRules(watch(quotesFromLabel), watch(attributeIsProduct)) })
    const o = await run({ plan, reply: draftWith({ quote: '600 mg' }), items: [ans('no', 'spf')] })
    expect(o.kind).toBe('accept')
    expect(o.warnings).toEqual([])
    expect(rowsOf(o.rows, 'quotes.from_label')).toEqual([expect.objectContaining({ binding: 'watch', verdict: 'fail' })])
    expect(rowsOf(o.rows, JUDGE)).toEqual([expect.objectContaining({ binding: 'watch', verdict: 'fail', evidence: { quote: 'spf', source: 'item.key' } })])
  })

  it('watch_leak.cannot_verify_changes_nothing: a watch rule with cannot_verify gives accept, not person', async () => {
    const plan = planOf({ rules: withRules(watch(keyKnown), watch(attributeIsProduct)) })
    const o = await run({ plan, evidence: { sources: GOOD_EVIDENCE.sources }, items: [ans('unknown', '')] })
    expect(rowsOf(o.rows, 'attributes.key_known')).toEqual([expect.objectContaining({ verdict: 'cannot_verify' })])
    expect(rowsOf(o.rows, JUDGE)).toEqual([expect.objectContaining({ verdict: 'cannot_verify' })])
    expect(o.kind).toBe('accept')
    expect(o.warnings).toEqual([])
  })

  // Repro sonnet/p1.repro.ts (F3): a trial candidate runs as watch.
  it('watch_leak.trial_changes_nothing (repro sonnet/p1.repro.ts F3): a trial candidate that fails gives the same outcome as the live plan with no trial', async () => {
    const candidate = checkRule('quotes.from_leaflet', 'criteria[].attributes[].quote', { name: 'quote_in_source', params: { source: 'leaflet', case_sensitive: true } }, [
      { input: { sources: { leaflet: 'Keep cool.' } }, output: 'cool', expected: 'pass' },
    ])
    const trial = planOf({ trial: RuleRecord.parse(candidate) })
    expect(trial.manifest.rules.find(r => r.id === 'quotes.from_leaflet')).toMatchObject({ binding: 'watch', origin: 'trial' })
    const evidence = { ...GOOD_EVIDENCE, sources: { ...GOOD_EVIDENCE.sources, leaflet: 'Store in a cool place.' } }
    const live = await run({ evidence, items: [ans('yes', '500 mg')] })
    const tried = await run({ plan: trial, evidence, items: [ans('yes', '500 mg')] })
    expect(rowsOf(tried.rows, 'quotes.from_leaflet')).toEqual([expect.objectContaining({ binding: 'watch', verdict: 'fail' })])
    const { rows: _l, ...liveOutcome } = live
    const { rows: _t, ...trialOutcome } = tried
    expect(trialOutcome).toEqual(liveOutcome)
    expect(live.kind).toBe('accept')
    // A judgement candidate, as in the repro: its row is watch, and the outcome stays the same.
    const judged = judgementRule('criteria.other_judge', 'criteria[].attributes[]', 'Is the attribute fine? Answer yes, no, or unknown.', [{ output: { key: 'spf' }, expected: 'pass' }])
    const other = await run({ plan: planOf({ trial: RuleRecord.parse(judged) }), items: [ans('yes', '500 mg')] })
    expect(rowsOf(other.rows, 'criteria.other_judge')).toEqual([expect.objectContaining({ binding: 'watch', verdict: 'pass' })])
    expect(other.kind).toBe('accept')
  })
})
