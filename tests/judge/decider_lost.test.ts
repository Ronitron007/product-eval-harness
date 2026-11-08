import { describe, expect, it } from 'vitest'
import { planOf } from '../compiler/library'
import { ans, ATTRIBUTE, draftWith, JUDGE, JUDGE_REF, judgeOf, rowsOf, run } from './helpers'

// Hazard `decider_lost`: a row hides who decided it (judge.decider_recorded).

describe('decider_lost', () => {
  it('decider_lost.judge_rows_name_model: each row that the model answered, and each row that the quote check turned into cannot_verify, names the judge model and the prompt hash', async () => {
    const plan = planOf()
    const promptHash = plan.manifest.scorers.find(s => s.id === JUDGE_REF)!.judgePromptHash
    expect(promptHash).toMatch(/^[0-9a-f]{64}$/)
    const decider = { by: 'judge', model: 'mock/judge', promptHash }
    const three = { criteria: [{ name: 'spf', attributes: [0, 1, 2].map(() => ({ ...ATTRIBUTE })) }] }
    const items = [ans('yes', '500 mg'), ans('yes', '600 mg', 'criteria[0].attributes[1]'), ans('no', '.', 'criteria[0].attributes[2]')]
    const o = await run({ plan, reply: three, items })
    const rows = rowsOf(o.rows, JUDGE)
    expect(rows.map(r => r.verdict)).toEqual(['pass', 'cannot_verify', 'cannot_verify'])
    for (const r of rows) expect(r.decider).toEqual(decider)
  })

  it('decider_lost.code_rows_say_code: each code row, each skipped row, and each row for an absent target has { by: code }', async () => {
    const o = await run({ items: [ans('yes', '500 mg')] })
    for (const r of o.rows.filter(r => r.ruleId !== JUDGE)) expect(r.decider).toEqual({ by: 'code' })
    const skipped = await run({ reply: draftWith({ quote: '600 mg' }) })
    expect(rowsOf(skipped.rows, JUDGE).map(r => r.decider)).toEqual([{ by: 'code' }])
    // An absent target breaks the decode, so only a direct verify reaches it.
    const absent = await planOf().scorers.judges(judgeOf([]))[0]!.verify({ criteria: [{ name: 'spf' }] }, {})
    expect(absent).toEqual([expect.objectContaining({ target: 'criteria[0].attributes[]', verdict: 'cannot_verify', decider: { by: 'code' } })])
  })
})
