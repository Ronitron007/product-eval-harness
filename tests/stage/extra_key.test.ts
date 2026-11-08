import { describe, expect, it } from 'vitest'
import { planOf } from '../compiler/library'
import { EXTRA_KEY_OUTPUT, payloadOf, start, useDb } from './helpers'

// extra_key (stage.loop_on_outcome): a draft with an extra key passes at a spent budget.

const db = useDb()

describe('extra_key', () => {
  it('extra_key.budget_spent_suspends: three drafts with an extra key, whose code rows all pass, give suspended, never accepted', async () => {
    const env = db.env({ replies: [EXTRA_KEY_OUTPUT] })
    const { runId, result } = await start(env)
    expect(result.status).toBe('suspended')
    expect(payloadOf(result)).toMatchObject({ why: 'budget_spent', round: 3, errors: [expect.objectContaining({ from: 'decode' })] })
    // The rows of the shape and code check rules. The skipped judge rows are cannot_verify.
    const codeRules = new Set(planOf().scorers.code.map(s => s.id))
    for (const round of [1, 2, 3]) {
      const code = (await env.graph.verdictsOf(runId, round)).filter(r => codeRules.has(`${r.ruleId}@${r.ruleVersion}`))
      expect(code.length).toBeGreaterThan(0)
      expect(code.filter(r => r.verdict !== 'pass').map(r => [r.ruleId, r.target, r.verdict, r.reason])).toEqual([])
    }
    expect(await env.count('run_ends', runId)).toBe(0)
  })
})
