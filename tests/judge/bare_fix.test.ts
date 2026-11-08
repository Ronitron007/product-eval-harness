import { describe, expect, it } from 'vitest'
import { attributeIsProduct } from '../compiler/rules'
import { ans, draftWith, JUDGE, rowsOf, run } from './helpers'

// Hazard `bare_fix`: a judge fail reaches the repair with no fix (judge.fail_fix).

describe('bare_fix', () => {
  it('bare_fix.judge_fail_names_rule: a strict judge fail gives an error whose fix starts with "Change the item so that: " and the statement, and ends with the judge reason', async () => {
    const reason = 'The key names a test, not the product.'
    const o = await run({ items: [ans('no', 'spf', undefined, reason)] })
    expect(o.kind).toBe('repair')
    if (o.kind !== 'repair') return
    const statement = attributeIsProduct.statement as string
    expect(o.errors).toEqual([{ from: `${JUDGE}@1`, target: 'criteria[0].attributes[0]', fix: `Change the item so that: ${statement} ${reason} Quote: "spf"` }])
    expect(o.errors[0]!.fix.startsWith(`Change the item so that: ${statement}`)).toBe(true)
    expect(o.errors[0]!.fix.endsWith(rowsOf(o.rows, JUDGE)[0]!.reason)).toBe(true)
  })

  it('bare_fix.code_fail_unchanged: a strict code fail gives an error whose fix equals the reason of its row', async () => {
    const o = await run({ reply: draftWith({ quote: '600 mg' }) })
    expect(o.kind).toBe('repair')
    if (o.kind !== 'repair') return
    const row = rowsOf(o.rows, 'quotes.from_label')[0]!
    expect(row.verdict).toBe('fail')
    expect(o.errors).toEqual([{ from: 'quotes.from_label@1', target: row.target, fix: row.reason }])
  })
})
