import { createMockModel } from '@mastra/core/test-utils/llm-mock'
import { describe, expect, it } from 'vitest'
import type { JudgeModel } from '../../src/compiler'
import { takeFetchCalls } from '../setup/no-network'
import { planOf } from './library'
import { GOOD_EVIDENCE, GOOD_OUTPUT } from './rules'

// Hazard `judge`: a test calls a model, or a skipped judgement rule leaves no row.

const attribute = GOOD_OUTPUT.criteria[0]!.attributes[0]!
const THREE = { criteria: [{ name: 'spf', attributes: [attribute, { ...attribute, key: 'trending' }, { ...attribute, key: 'texture' }] }] }
// Each answer quotes 500 mg, which GOOD_EVIDENCE holds (judge.quote_rules).
const answer = (target: string, a: 'yes' | 'no' | 'unknown') => ({ target, answer: a, quote: '500 mg', reason: `The judge says ${a}.` })

function mockJudge(items: unknown[], onCall?: () => void): JudgeModel {
  return { id: 'mock/judge', model: createMockModel({ version: 'v2', objectGenerationMode: 'json', mockText: { items }, spyGenerate: onCall, spyStream: onCall }) as never }
}

describe('judge', () => {
  it('judge.no_network: with fetch stubbed to throw, the compile and the code scorers pass', async () => {
    expect(() => fetch('https://example.com')).toThrow(/A test called fetch/)
    expect(takeFetchCalls()).toBe(1)
    const plan = planOf()
    for (const s of plan.scorers.code) expect((await s.verify(GOOD_OUTPUT, GOOD_EVIDENCE)).map(r => r.verdict)).toEqual(['pass'])
  })

  it('judge.mock_model_verdicts: the answers yes, no, and unknown give pass, fail, and cannot_verify', async () => {
    let calls = 0
    const model = mockJudge(
      [answer('criteria[0].attributes[0]', 'yes'), answer('criteria[0].attributes[1]', 'no'), answer('criteria[0].attributes[2]', 'unknown')],
      () => calls++,
    )
    const plan = planOf()
    const [judge] = plan.scorers.judges(model)
    const rows = await judge!.verify(THREE, GOOD_EVIDENCE)
    expect(rows.map(r => [r.target, r.verdict])).toEqual([
      ['criteria[0].attributes[0]', 'pass'],
      ['criteria[0].attributes[1]', 'fail'],
      ['criteria[0].attributes[2]', 'cannot_verify'],
    ])
    expect(calls).toBe(1)
    const promptHash = plan.manifest.scorers.find(s => s.id === 'criteria.attribute_is_product@1')!.judgePromptHash
    expect(rows[0]!.decider).toEqual({ by: 'judge', model: 'mock/judge', promptHash })
    expect(rows[1]!.reason).toBe('The judge says no. Quote: "500 mg"')
  })

  it('judge.mock_model_verdicts: an absent target and a model error give cannot_verify', async () => {
    let calls = 0
    const plan = planOf()
    const absent = await plan.scorers.judges(mockJudge([], () => calls++))[0]!.verify({ criteria: [{ name: 'spf' }] }, GOOD_EVIDENCE)
    expect(absent).toEqual([expect.objectContaining({ verdict: 'cannot_verify', decider: { by: 'code' }, target: 'criteria[0].attributes[]' })])
    expect(calls).toBe(0)

    const failing = mockJudge([], () => {
      throw new Error('the judge model is down')
    })
    const rows = await plan.scorers.judges(failing)[0]!.verify(GOOD_OUTPUT, GOOD_EVIDENCE)
    expect(rows).toEqual([expect.objectContaining({ verdict: 'cannot_verify', reason: expect.stringMatching(/^The judge call failed/) })])

    const silent = await plan.scorers.judges(mockJudge([answer('criteria[9].attributes[0]', 'yes')]))[0]!.verify(GOOD_OUTPUT, GOOD_EVIDENCE)
    expect(silent).toEqual([expect.objectContaining({ verdict: 'cannot_verify', reason: 'The judge gave no answer for this item.' })])
  })

  it('judge.full_source: the judge prompt holds the full source texts and never the judge question in the instructions', async () => {
    let prompt = ''
    const model = mockJudge([answer('criteria[0].attributes[0]', 'yes')], () => undefined)
    const plan = planOf()
    const judge = plan.scorers.judges(model)[0]!
    const label = 'Each capsule has 500 mg. '.repeat(40)
    const result = await judge.scorer.run({ input: { sources: { label } }, output: GOOD_OUTPUT })
    prompt = result.analyzePrompt ?? ''
    expect(prompt).toContain(label)
    expect(prompt).toContain('Question: Does the attribute describe a property of the product itself?')
    expect(plan.instructions).not.toContain('Does the attribute describe')
  })

  it('judge.skipped_rows: with fetch stubbed to throw, skippedJudges gives one cannot_verify row for each field of each judgement rule', () => {
    const plan = planOf()
    expect(plan.scorers.skippedJudges('A strict code check failed, so no judge ran.')).toEqual([
      expect.objectContaining({ ruleId: 'criteria.attribute_is_product', target: 'criteria[].attributes[]', verdict: 'cannot_verify', decider: { by: 'code' }, reason: 'A strict code check failed, so no judge ran.' }),
    ])
  })

  // Repro interrogate/sonnet/p2_mastra.mjs: Mastra takes the dot and the at sign in a scorer id.
  it('judge.scorer_ids (repro p2_mastra.mjs): each Mastra scorer id is rule.id@version', () => {
    const plan = planOf()
    for (const s of [...plan.scorers.code, ...plan.scorers.judges(mockJudge([]))]) expect(s.scorer.id).toBe(s.id)
    expect(plan.scorers.code.map(s => s.id)).toContain('units.label_unit@1')
  })
})
