import { describe, expect, it } from 'vitest'
import { problemsOf, rulesRoot } from './files'
import { planOf, withRules } from './library'
import { GOOD_EVIDENCE, GOOD_OUTPUT, labelUnit, quotesFromLabel } from './rules'

// Hazard `drift`: the instruction and the check read two copies of a parameter. The plan check
// "a shared parameter change moves both the instruction and the check" (compile.plan_checks).

const withUnit = (unit: string) => ({ ...GOOD_OUTPUT, criteria: [{ ...GOOD_OUTPUT.criteria[0]!, attributes: [{ ...GOOD_OUTPUT.criteria[0]!.attributes[0]!, unit }] }] })
const withQuote = (quote: string) => ({ ...GOOD_OUTPUT, criteria: [{ ...GOOD_OUTPUT.criteria[0]!, attributes: [{ ...GOOD_OUTPUT.criteria[0]!.attributes[0]!, quote }] }] })
const verdictOf = async (plan: ReturnType<typeof planOf>, id: string, output: unknown) =>
  (await plan.scorers.code.find(s => s.rule.id === id)!.verify(output, GOOD_EVIDENCE)).map(r => r.verdict)

describe('drift', () => {
  it('drift.values_move_both: a change of shape.values from [mg, mcg] to [mg] changes plan.instructions and the verdict of verify on mcg', async () => {
    const wide = planOf({ rules: withRules({ ...labelUnit, shape: { type: 'text', values: ['mg', 'mcg'] } }) })
    const narrow = planOf({ rules: withRules({ ...labelUnit, shape: { type: 'text', values: ['mg'] } }) })
    expect(wide.instructions).toContain('Shape: text, one of: mcg, mg')
    expect(narrow.instructions).toContain('Shape: text, one of: mg')
    expect(narrow.instructions).not.toBe(wide.instructions)
    expect(await verdictOf(wide, 'units.label_unit', withUnit('mcg'))).toEqual(['pass'])
    expect(await verdictOf(narrow, 'units.label_unit', withUnit('mcg'))).toEqual(['fail'])
    expect(wide.schema.safeParse(withUnit('mcg')).success).toBe(true)
    expect(narrow.schema.safeParse(withUnit('mcg')).success).toBe(false)
  })

  it('drift.case_sensitive_moves_both: a change of quote_in_source.case_sensitive changes the instruction line and the verdict on a quote with other letter case', async () => {
    const strict = planOf()
    const loose = planOf({ rules: withRules({ ...quotesFromLabel, check: { name: 'quote_in_source', params: { source: 'label', case_sensitive: false } } }) })
    expect(strict.instructions).toContain('Check: Copy each quote word for word from the label text, with the same letter case.')
    expect(loose.instructions).toContain('Check: Copy each quote word for word from the label text. The letter case may differ.')
    expect(await verdictOf(strict, 'quotes.from_label', withQuote('500 MG'))).toEqual(['fail'])
    expect(await verdictOf(loose, 'quotes.from_label', withQuote('500 MG'))).toEqual(['pass'])
  })

  it('drift.literal_in_statement: a statement that holds mg, with values [mg], gives a loader problem', () => {
    const root = rulesRoot([{ ...labelUnit, shape: { type: 'text', values: ['mg'] }, statement: 'Write the amount in mg.' }])
    expect(problemsOf(root)).toEqual(['statement: Remove "mg" from the statement. The compiler prints it from shape.values, so the statement must not hold a second copy.'])
  })

  it('drift.literal_in_statement: the lint reads whole words in any letter case, in the reason too, and the literals of a check template', () => {
    const root = rulesRoot([
      { ...labelUnit, statement: 'Write the amount as the label prints it, in MG.', reason: 'Some labels print mcg.' },
      { ...quotesFromLabel, statement: 'Quote the label.' },
      { ...labelUnit, id: 'units.no_word', statement: 'Write the amount. The words mgx and xmg are not values.' },
    ])
    expect(problemsOf(root).filter(p => p.includes('Remove'))).toEqual([
      expect.stringMatching(/^statement: Remove "label" from the statement. The compiler prints it from check.params/),
      expect.stringMatching(/^statement: Remove "mg" from the statement/),
      expect.stringMatching(/^reason: Remove "mcg" from the reason/),
    ])
  })
})
