import { describe, expect, it } from 'vitest'
import { errorOf, start, useDb } from './helpers'

// wrong_level (stage.registered): a stage runs at a level where it must not.

const db = useDb()

describe('wrong_level', () => {
  it('wrong_level.refused_before_any_call: create_pack at the inner node sunscreen gives failed, with no stage run row and no drafter call', async () => {
    const env = db.env()
    const { runId, result } = await start(env, undefined, 'create_pack', 'sunscreen')
    expect(result.status).toBe('failed')
    expect(errorOf(result)).toMatch(/stage_not_at_level/)
    expect(await env.count('stage_runs', runId)).toBe(0)
    expect([env.spies.research.calls, env.spies.drafter.calls, env.spies.judge.calls]).toEqual([0, 0, 0])
  })
})
