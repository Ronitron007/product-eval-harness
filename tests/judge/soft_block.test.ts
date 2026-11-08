import { describe, expect, it } from 'vitest'
import { planOf, withRules } from '../compiler/library'
import { attributeIsProduct, GOOD_EVIDENCE, keyKnown } from '../compiler/rules'
import { ans, draftWith, JUDGE, run, type Spy } from './helpers'

// Hazard `soft_block`: a soft fail blocks the output or enters the repair errors. These tests and
// outcome_table.each_binding_each_verdict close the plan check "Tests with mocked judges, one for
// each binding and each verdict" (judge.plan_checks).

const soft = (rule: Record<string, unknown> & { id: string; owner: string }) => ({ ...rule, binding: 'soft' })

describe('soft_block', () => {
  it('soft_block.fail_accepts_with_warning: a soft judgement rule that fails, with each strict row pass, gives accept and one warning', async () => {
    const o = await run({ plan: planOf({ rules: withRules(soft(attributeIsProduct)) }), items: [ans('no', 'spf', undefined, 'The key names a test, not the product.')] })
    expect(o.kind).toBe('accept')
    expect(o.warnings).toEqual([{ rule: `${JUDGE}@1`, target: 'criteria[0].attributes[0]', kind: 'warning', text: 'The key names a test, not the product. Quote: "spf"' }])
  })

  it('soft_block.cannot_verify_accepts_with_note: a soft rule with cannot_verify gives accept and one note', async () => {
    const o = await run({ plan: planOf({ rules: withRules(soft(attributeIsProduct)) }), items: [ans('unknown', '')] })
    expect(o.kind).toBe('accept')
    expect(o.warnings).toEqual([expect.objectContaining({ rule: `${JUDGE}@1`, kind: 'note' })])
  })

  // Repro sonnet/p2.repro.ts (F6, F8): soft rows beside a strict fail.
  it('soft_block.fail_not_in_errors (repro sonnet/p2.repro.ts F6, F8): a soft fail beside a strict fail gives repair, and the soft fail is in warnings and not in errors', async () => {
    const plan = planOf({ rules: withRules(soft(keyKnown), soft(attributeIsProduct)) })
    const o = await run({ plan, reply: draftWith({ key: 'trending', quote: '600 mg' }), evidence: GOOD_EVIDENCE })
    expect(o.kind).toBe('repair')
    if (o.kind !== 'repair') return
    expect(o.errors.map(e => e.from)).toEqual(['quotes.from_label@1'])
    expect(o.warnings.map(w => [w.rule, w.kind])).toEqual([
      ['attributes.key_known@1', 'warning'],
      [`${JUDGE}@1`, 'note'], // the skipped soft judge
    ])
  })

  it('soft_block.code_fail_keeps_gate_open: a soft code fail does not shut the gate, so a strict judge yes gives accept with exactly one judge call', async () => {
    const spy: Spy = { calls: 0 }
    const plan = planOf({ rules: withRules(soft(keyKnown)) })
    const o = await run({ plan, reply: draftWith({ key: 'trending' }), items: [ans('yes', '500 mg')], spy })
    expect(spy.calls).toBe(1)
    expect(o.rows.find(r => r.ruleId === JUDGE)).toMatchObject({ binding: 'strict', verdict: 'pass' })
    expect(o.kind).toBe('accept')
    expect(o.warnings).toEqual([expect.objectContaining({ rule: 'attributes.key_known@1', kind: 'warning' })])
  })
})
