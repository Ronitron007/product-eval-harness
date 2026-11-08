import { describe, expect, it } from 'vitest'
import { sleep, start, statusOf, useDb, type EnvOptions } from './helpers'

// busy_loser (stage.judge_wait): a judge step that loses the claim ends as failed.

const db = useDb()

// The first start fails once after the draft insert, so the round has a draft and no claim.
function crashAfterDraft(): EnvOptions['wrap'] {
  let boom = true
  return s => ({
    ...s,
    addDraft: async row => {
      await s.addDraft(row)
      if (boom) {
        boom = false
        throw new Error('A crash after the draft insert.')
      }
    },
  })
}

const statuses: string[] = []

describe('busy_loser', { timeout: 30_000 }, () => {
  it('busy_loser.slow_judge_reused: two starts of one round, with a judge of about 3 seconds, both give success, and the judge gets one call', async () => {
    const env = db.env({ judgeDelayMs: 3_000, wrap: crashAfterDraft(), timing: { claimLeaseMs: 8_000, judgeDeadlineMs: 6_000, pollMs: 200 } })
    const { runId, result } = await start(env)
    expect(result.status).toBe('failed')
    const both = await Promise.all([start(env, runId), start(env, runId)])
    statuses.push(...both.map(b => b.result.status))
    expect(both.map(b => b.result.status)).toEqual(['success', 'success'])
    expect(both.map(b => b.result.status === 'success' && b.result.result)).toEqual([expect.objectContaining({ end: 'accepted', round: 1 }), expect.objectContaining({ end: 'accepted', round: 1 })])
    expect(env.spies.judge.calls).toBe(1)
    expect(env.spies.drafter.calls).toBe(1)
    expect([await env.count('run_ends', runId), await env.count('outputs', runId)]).toEqual([1, 1])
  })

  it('busy_loser.live_claim_gives_busy: a claim that stays live for one lease gives StageBusy, with Mastra status success', async () => {
    const lease = 1_500
    const env = db.env({ wrap: crashAfterDraft(), timing: { claimLeaseMs: lease, judgeDeadlineMs: 1_000, pollMs: 100 } })
    const { runId, result } = await start(env)
    expect(result.status).toBe('failed')
    // Another process holds the claim, and takes a new attempt before each lease ends.
    const hold = () => env.pool.query(`insert into harness.judge_claims (run_id, round, attempt) select $1, 1, coalesce(max(attempt), 0) + 1 from harness.judge_claims where run_id = $1 and round = 1`, [runId])
    await hold()
    const timer = setInterval(() => void hold(), lease / 3)
    try {
      const busy = await start(env, runId)
      statuses.push(busy.result.status)
      expect(busy.result.status).toBe('success')
      expect(busy.result.status === 'success' && busy.result.result).toEqual({ runId, busy: true, round: 1, retryAfterMs: lease })
      expect(await statusOf(env, runId)).toBe('success')
      expect(env.spies.judge.calls).toBe(0)
      expect(await env.count('run_ends', runId)).toBe(0)
    } finally {
      clearInterval(timer)
      await sleep(50)
    }
  })

  it('busy_loser.never_failed: in both tests above, no run gives failed', () => {
    expect(statuses).toHaveLength(3)
    expect(statuses.filter(s => s === 'failed')).toEqual([])
  })
})
