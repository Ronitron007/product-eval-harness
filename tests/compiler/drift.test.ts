import { describe, expect, it } from 'vitest'
import { problemsOf, rulesRoot } from './files'
import { labelUnit, quotesFromLabel } from './rules'

// Hazard `drift`: the instruction and the check read two copies of a parameter.

describe('drift', () => {
  it('drift.literal_in_statement: a statement that holds mg, with values [mg], gives a loader problem', () => {
    const root = rulesRoot([{ ...labelUnit, shape: { type: 'text', values: ['mg'] }, statement: 'Write the amount in mg.' }])
    expect(problemsOf(root)).toEqual(['statement: Remove "mg" from the statement. The compiler prints it from shape.values, so the statement must not hold a second copy.'])
  })

  it('drift.literal_in_statement: the lint reads whole words in any letter case, in the reason too, and the literals of a check template', () => {
    const root = rulesRoot([
      { ...labelUnit, statement: 'Write the amount as the label prints it, in MG.', reason: 'Some labels print mcg.' },
      { ...quotesFromLabel, statement: 'Quote the label.' },
      { ...labelUnit, id: 'units.no_word', statement: 'Write the amount; mgx and xmg are not words of the values.' },
    ])
    const lint = problemsOf(root).filter(p => p.includes('Remove'))
    expect(lint).toEqual([
      expect.stringMatching(/^statement: Remove "label" from the statement. The compiler prints it from check.params/),
      expect.stringMatching(/^statement: Remove "mg" from the statement/),
      expect.stringMatching(/^reason: Remove "mcg" from the reason/),
    ])
  })
})
