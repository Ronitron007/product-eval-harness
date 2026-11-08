import { describe, expect, it } from 'vitest'
import { planOf } from '../compiler/library'
import { GOOD_OUTPUT } from '../compiler/rules'
import { sleep, start, statusOf, useDb } from './helpers'

// busy_loser (stage.judge_wait): a judge step that loses the claim ends as failed.

const db = useDb()

// A round with a stored draft and no judge claim, as after a crash after the draft insert.
async function drafted(env: ReturnType<typeof db.env>, runId: string) {
  await env.graph.recordStageRun({ runId, stage: 'create_node', nodeId: 'sunscreen', ruleSetHash: planOf().ruleSetHash })
  await env.graph.addDraft({ runId, round: 1, reply: GOOD_OUTPUT, drafter: 'drafter/mock' })
}

const statuses: string[] = []

describe('busy_loser', { timeout: 30_000 }, () => {
  it('busy_loser.slow_judge_reused: two starts of one round, with a judge of about 3 seconds, both give success, and the judge gets one call', async () => {
    const env = db.env({ judgeDelayMs: 3_000, timing: { claimLeaseMs: 8_000, judgeDeadlineMs: 6_000, pollMs: 200 } })
    const runId = 'slow-judge'
    await drafted(env, runId)
    const both = await Promise.all([start(env, runId), start(env, runId)])
    statuses.push(...both.map(b => b.result.status))
    expect(both.map(b => b.result.status)).toEqual(['success', 'success'])
    expect(both.map(b => b.result.status === 'success' && b.result.result)).toEqual([expect.objectContaining({ end: 'accepted', round: 1 }), expect.objectContaining({ end: 'accepted', round: 1 })])
    expect(env.spies.judge.calls).toBe(1)
    expect(env.spies.drafter.calls).toBe(0)
    expect([await env.count('run_ends', runId), await env.count('outputs', runId)]).toEqual([1, 1])
  })

  it('busy_loser.live_claim_gives_busy: a claim that stays live for one lease gives StageBusy, with Mastra status success', async () => {
    const lease = 1_500
    const env = db.env({ timing: { claimLeaseMs: lease, judgeDeadlineMs: 1_000, pollMs: 100 } })
    const runId = 'judge-held'
    await drafted(env, runId)
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

  // stage.draft_claim: another process holds the draft claim of round 1 and never writes the draft.
  it('busy_loser.draft_claim_live_gives_busy: a holder that keeps its draft claim live for one lease gives the waiter StageBusy, not failed', async () => {
    const lease = 1_500
    const env = db.env({ timing: { claimLeaseMs: lease, judgeDeadlineMs: 1_000, pollMs: 100 } })
    const runId = 'draft-held'
    await env.graph.recordStageRun({ runId, stage: 'create_node', nodeId: 'sunscreen', ruleSetHash: planOf().ruleSetHash })
    const hold = () => env.pool.query(`insert into harness.draft_claims (run_id, round, attempt) select $1, 1, coalesce(max(attempt), 0) + 1 from harness.draft_claims where run_id = $1 and round = 1`, [runId])
    await hold()
    const timer = setInterval(() => void hold(), lease / 3)
    try {
      const busy = await start(env, runId)
      statuses.push(busy.result.status)
      expect(busy.result.status === 'success' && busy.result.result).toEqual({ runId, busy: true, round: 1, retryAfterMs: lease })
      expect(await statusOf(env, runId)).toBe('success')
      expect([env.spies.drafter.calls, await env.count('drafts', runId)]).toEqual([0, 0])
    } finally {
      clearInterval(timer)
      await sleep(50)
    }
  })

  // A hung holder that stops: its claim expires after one lease, and the waiter takes attempt 2.
  it('busy_loser.draft_claim_expired_takes_over: a holder whose claim ages past the lease loses it, and the waiter drafts and ends the run', async () => {
    const lease = 1_000
    const env = db.env({ timing: { claimLeaseMs: lease, judgeDeadlineMs: 800, pollMs: 100 } })
    const runId = 'draft-hung'
    await env.graph.recordStageRun({ runId, stage: 'create_node', nodeId: 'sunscreen', ruleSetHash: planOf().ruleSetHash })
    expect(await env.graph.claimDraft(runId, 1, lease)).toBe(1)
    const { result } = await start(env, runId)
    statuses.push(result.status)
    expect(result.status === 'success' && result.result).toMatchObject({ end: 'accepted', round: 1 })
    expect([env.spies.drafter.calls, await env.count('draft_claims', runId)]).toEqual([1, 2])
  })

  it('busy_loser.never_failed: in each test above, no run gives failed', () => {
    expect(statuses).toHaveLength(5)
    expect(statuses.filter(s => s === 'failed')).toEqual([])
  })
})
