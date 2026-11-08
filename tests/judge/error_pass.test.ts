import { describe, expect, it } from 'vitest'
import { planOf } from '../compiler/library'
import { GOOD_EVIDENCE, GOOD_OUTPUT } from '../compiler/rules'
import { ans, JUDGE, mockModel, rowsOf, run, T, type Spy } from './helpers'

// Hazard `error_pass`: a judge error counts as a pass. Each judge failure gives cannot_verify, and a
// strict cannot_verify gives person, never accept. These tests close the plan check "A judge with no
// result gives cannot_verify, never pass" (judge.plan_checks).

describe('error_pass', () => {
  it('error_pass.model_error: a mock model that throws gives cannot_verify for the strict judgement rule, and the outcome person', async () => {
    const spy: Spy = { calls: 0 }
    const o = await run({ model: mockModel({ items: [ans('yes', '500 mg')] }, spy, 'the judge model is down') })
    expect(spy.calls).toBe(1)
    expect(rowsOf(o.rows, JUDGE)).toEqual([expect.objectContaining({ verdict: 'cannot_verify', reason: expect.stringMatching(/^The judge call failed/) })])
    expect(o.kind).toBe('person')
  })

  it('error_pass.no_answer: a mock answer for another target gives cannot_verify, and the outcome person', async () => {
    const o = await run({ items: [ans('yes', '500 mg', 'criteria[9].attributes[0]')] })
    expect(rowsOf(o.rows, JUDGE)).toEqual([expect.objectContaining({ target: T, verdict: 'cannot_verify', reason: 'The judge gave no answer for this item.' })])
    expect(o.kind).toBe('person')
  })

  it('error_pass.two_answers: a yes and a no for one target give cannot_verify, and the outcome person', async () => {
    const o = await run({ items: [ans('yes', '500 mg'), ans('no', '500 mg')] })
    expect(rowsOf(o.rows, JUDGE)).toEqual([expect.objectContaining({ verdict: 'cannot_verify', reason: 'The judge gave two answers for this item.' })])
    expect(o.kind).toBe('person')
  })

  // Repro opus/probe2.repro.ts (bad answer shapes).
  it('error_pass.bad_answer_shape (repro opus/probe2.repro.ts): a mock answer that JudgeAnswer refuses gives cannot_verify', async () => {
    const bad = {
      'not JSON': 'yes it is',
      'no quote key': { items: [{ target: T, answer: 'yes', reason: 'r' }] },
      'an answer in capitals': { items: [{ target: T, answer: 'YES', quote: '500 mg', reason: 'r' }] },
      'no items': { verdict: 'yes' },
    }
    for (const [name, text] of Object.entries(bad)) {
      const rows = await planOf().scorers.judges(mockModel(text))[0]!.verify(GOOD_OUTPUT, GOOD_EVIDENCE)
      expect({ name, rows: rows.map(r => [r.verdict, r.reason.slice(0, 22)]) }).toEqual({ name, rows: [['cannot_verify', 'The judge call failed:']] })
      expect((await run({ model: mockModel(text) })).kind).toBe('person')
    }
  })
})
