import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { judgeDraft } from '../../src/judge'
import { planOf, withRules } from '../compiler/library'
import { GOOD_EVIDENCE, GOOD_OUTPUT, judgementRule } from '../compiler/rules'
import { fetchGuard, takeFetchCalls } from '../setup/no-network'
import { ans, ATTRIBUTE, JUDGE, rowsOf, run, type Spy } from './helpers'

// Hazard `model_call`: a test calls a real model, or passes after a failed call (judge.no_network).

const REPO = join(import.meta.dirname, '..', '..')

describe('model_call', () => {
  it('model_call.fetch_throws: with no mock, a call of fetch throws "A test called fetch"', () => {
    expect(() => fetch('https://example.com')).toThrow(/^A test called fetch/)
    expect(takeFetchCalls()).toBe(1)
  })

  it('model_call.mock_only: a full judgeDraft run with the mock model ends with no call of fetch', async () => {
    const spy: Spy = { calls: 0 }
    const o = await run({ items: [ans('yes', '500 mg')], spy })
    expect(o.kind).toBe('accept')
    expect(spy.calls).toBe(1)
    expect(takeFetchCalls()).toBe(0)
  })

  it('model_call.one_call_per_rule: three items under one judgement rule make one call, and two judgement rules make two calls', async () => {
    const three = { criteria: [{ name: 'spf', attributes: [ATTRIBUTE, { ...ATTRIBUTE }, { ...ATTRIBUTE }] }] }
    const items = [0, 1, 2].map(k => ans('yes', '500 mg', `criteria[0].attributes[${k}]`))
    const one: Spy = { calls: 0 }
    const o = await run({ reply: three, items, spy: one })
    expect(one.calls).toBe(1)
    expect(rowsOf(o.rows, JUDGE).map(r => r.verdict)).toEqual(['pass', 'pass', 'pass'])
    const second = judgementRule('criteria.attribute_is_measured', 'criteria[].attributes[]', 'Does the attribute name a measured property? Answer yes, no, or unknown.', [{ output: { key: 'spf' }, expected: 'pass' }])
    const two: Spy = { calls: 0 }
    await run({ plan: planOf({ rules: withRules(second) }), items: [ans('yes', '500 mg')], spy: two })
    expect(two.calls).toBe(2)
  })

  it('model_call.zero_fetch_each_test: the setup file runs the guard after each test, and the guard throws on a left call and sets the count to zero', () => {
    const config = readFileSync(join(REPO, 'vitest.config.ts'), 'utf8')
    expect(config).toContain("setupFiles: ['tests/setup/no-network.ts']")
    expect(readFileSync(join(REPO, 'tests', 'setup', 'no-network.ts'), 'utf8')).toContain('afterEach(fetchGuard)')
    expect(() => fetch('https://example.com')).toThrow()
    expect(fetchGuard).toThrow(/^The test left 1 call of fetch/)
    expect(fetchGuard).not.toThrow()
  })

  // Repro sonnet/p7.repro.ts: a real model id gave cannot_verify and a valid person outcome, so the test passed.
  // The setup file gives each provider key a placeholder, so the model reaches the counting stub.
  it('model_call.unmocked_model_fails (repro sonnet/p7.repro.ts): a judgeDraft run with the model id openai/gpt-4o-mini and no mock leaves one call in the count, and the guard of the hook throws', async () => {
    expect(process.env.OPENAI_API_KEY).toBe('placeholder-for-a-test-with-no-network')
    const o = await judgeDraft({ runId: 'run-unmocked', plan: planOf(), reply: GOOD_OUTPUT, evidence: GOOD_EVIDENCE, judgeModel: { id: 'openai/gpt-4o-mini', model: 'openai/gpt-4o-mini' } })
    expect(o.kind).toBe('person') // the outcome alone would pass the test
    expect(rowsOf(o.rows, JUDGE)[0]!.reason).toMatch(/A test called fetch/)
    expect(fetchGuard).toThrow(/^The test left 1 call of fetch/)
  })
})
