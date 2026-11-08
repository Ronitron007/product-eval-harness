import { describe, expect, it } from 'vitest'
import { EXTRA_KEY_OUTPUT, payloadOf, resume, start, useDb } from './helpers'

// broken_accept (stage.person_payload): a person accepts a draft that breaks the schema.

const db = useDb()

describe('broken_accept', () => {
  async function refusedAccept() {
    const env = db.env({ replies: [EXTRA_KEY_OUTPUT] })
    const { runId, result } = await start(env)
    expect(payloadOf(result)).toMatchObject({ canAccept: false, why: 'budget_spent' })
    const again = await resume(env, runId, { decision: 'accept', reviewer: 'operator' })
    return { env, runId, again }
  }

  it('broken_accept.resuspends_with_refusal: a last draft that breaks the schema gives canAccept false, and an accept suspends again with a refusal', async () => {
    const { again } = await refusedAccept()
    expect(again.status).toBe('suspended')
    expect(payloadOf(again)).toMatchObject({ canAccept: false, refusal: expect.stringMatching(/cannot accept it/) })
  })

  it('broken_accept.never_reaches_store: after that accept, no run end, no output, and no decision exist', async () => {
    const { env, runId } = await refusedAccept()
    expect([await env.count('run_ends', runId), await env.count('outputs', runId), await env.count('person_decisions', runId)]).toEqual([0, 0, 0])
  })
})
