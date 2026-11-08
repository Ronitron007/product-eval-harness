import { describe, expect, it } from 'vitest'
import { SKIPPED } from '../../src/judge'
import { planOf } from '../compiler/library'
import { GOOD_OUTPUT } from '../compiler/rules'
import { ans, ATTRIBUTE, JUDGE, rowsOf, run, type Spy } from './helpers'

// Hazard `decode_bypass`: a draft that fails the decode gate reaches a judge or an accept (judge.decode_repairs).

const EXTRA_KEY = { criteria: [{ name: 'spf', attributes: [{ ...ATTRIBUTE, grade: 'A' }] }] }

describe('decode_bypass', () => {
  // Repro sonnet/p3.repro.ts: the decode of a reply with an extra key is not ok.
  it('decode_bypass.never_accepts (repro sonnet/p3.repro.ts): a reply with an extra key, whose code rows all pass, gives repair, never accept', async () => {
    expect(planOf().decode({ ...GOOD_OUTPUT, extra: 1 }).ok).toBe(false)
    const o = await run({ reply: EXTRA_KEY, items: [ans('yes', '500 mg')] })
    expect(o.rows.filter(r => r.ruleId !== JUDGE).every(r => r.verdict === 'pass')).toBe(true)
    expect(o.kind).toBe('repair')
  })

  // Repro sonnet/p1.repro.ts (F4): odd replies.
  it('decode_bypass.never_accepts (repro sonnet/p1.repro.ts F4): each odd reply gives repair with no judge call, and never throws', async () => {
    const replies = { undefined, null: null, number: 42, empty: '', list: '[]', 'null text': 'null', text: 'not json', proto: '{"__proto__":{"x":1},"criteria":[]}' }
    for (const [name, reply] of Object.entries(replies)) {
      const spy: Spy = { calls: 0 }
      const o = await run({ reply, items: [ans('yes', '500 mg')], spy })
      expect({ name, kind: o.kind, calls: spy.calls }).toEqual({ name, kind: 'repair', calls: 0 })
    }
  })

  it('decode_bypass.no_judge_call: on a failed decode, the spy of the mock model counts zero calls', async () => {
    const spy: Spy = { calls: 0 }
    const o = await run({ reply: EXTRA_KEY, items: [ans('yes', '500 mg')], spy })
    expect(spy.calls).toBe(0)
    expect(rowsOf(o.rows, JUDGE)).toEqual([expect.objectContaining({ verdict: 'cannot_verify', decider: { by: 'code' }, reason: SKIPPED.decode })])
  })

  it("decode_bypass.issues_in_errors: each decode issue is in errors, with from: 'decode'", async () => {
    const plan = planOf()
    const reply = { criteria: [{ name: 'spf', attributes: [{ ...ATTRIBUTE, grade: 'A', score: 9 }] }], best_match: 'x' }
    const decoded = plan.decode(reply)
    if (decoded.ok) throw new Error('The decode must fail.')
    const o = await run({ plan, reply })
    expect(o.kind).toBe('repair')
    if (o.kind !== 'repair') return
    expect(o.errors).toEqual([...decoded.issues].sort((a, b) => (a.path < b.path ? -1 : 1)).map(i => ({ from: 'decode', target: i.path, fix: i.message })))
    expect(o.errors.map(e => e.target)).toEqual(['best_match', 'criteria[0].attributes[0].grade', 'criteria[0].attributes[0].score'])
    expect(o.errors[0]!.fix).toBe('No rule defines the key best_match. Remove it.')
    // A reply that is not JSON gives one issue at (output).
    const text = await run({ plan, reply: 'not json' })
    expect(text.kind === 'repair' && text.errors[0]).toMatchObject({ from: 'decode', target: '(output)', fix: expect.stringMatching(/^The reply is not JSON/) })
  })
})
