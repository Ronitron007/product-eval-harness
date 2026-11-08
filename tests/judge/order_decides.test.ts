import { describe, expect, it } from 'vitest'
import { ans, verifyJudge } from './helpers'

// Hazard `order_decides`: the order of two answers for one item decides the row (judge.one_answer).

const TWO = 'The judge gave two answers for this item.'

describe('order_decides', () => {
  it('order_decides.verdict_differs: a yes and a no for one target give cannot_verify', async () => {
    const [row] = await verifyJudge([ans('yes', '500 mg'), ans('no', '500 mg')])
    expect(row).toMatchObject({ verdict: 'cannot_verify', reason: TWO })
  })

  // Repro sonnet/p1.repro.ts (F2): the first of two yes answers chose the evidence.
  it('order_decides.quote_differs (repro sonnet/p1.repro.ts F2): two yes answers with two quotes give cannot_verify, in either order', async () => {
    for (const items of [
      [ans('yes', '500 mg'), ans('yes', 'capsule')],
      [ans('yes', '500 mg'), ans('yes', 'FAKE QUOTE')],
      [ans('yes', 'FAKE QUOTE'), ans('yes', '500 mg')],
    ]) {
      const [row] = await verifyJudge(items)
      expect(row).toMatchObject({ verdict: 'cannot_verify', reason: TWO })
    }
  })

  it('order_decides.reversed_same_rows: each set of answers, in order and in reverse order, gives the same rows', async () => {
    const sets = [
      [ans('yes', '500 mg'), ans('no', '500 mg')],
      [ans('yes', '500 mg'), ans('yes', 'capsule')],
      [ans('yes', '500 mg', undefined, 'First reason.'), ans('yes', '500 mg', undefined, 'Second reason.')],
      [ans('no', 'spf'), ans('no', 'spf'), ans('unknown', '')],
      [ans('yes', '500 mg'), ans('yes', '500 mg', 'criteria[0].attributes[1]')],
    ]
    for (const items of sets) {
      expect(await verifyJudge([...items].reverse())).toEqual(await verifyJudge(items))
    }
  })

  it('order_decides.copy_counts_once: two equal answers give the verdict of one answer', async () => {
    const [one] = await verifyJudge([ans('yes', '500 mg')])
    const [two] = await verifyJudge([ans('yes', '500 mg'), ans('yes', '500 mg')])
    expect(two).toEqual(one)
    expect(two!.verdict).toBe('pass')
    // Copies by answer and normalized quote: a no-break space does not make a second answer.
    const [spaced] = await verifyJudge([ans('yes', '500 mg'), ans('yes', '500 mg')])
    expect(spaced!.verdict).toBe('pass')
  })
})
