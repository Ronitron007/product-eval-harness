import { describe, expect, it } from 'vitest'
import { judgeRound } from '../../src/judge'
import { compilingPlanFor } from '../../src/stage'
import { freshDatabase } from '../db'
import { library, planOf } from '../compiler/library'
import { FIXTURE, GOOD_EVIDENCE, GOOD_OUTPUT } from '../compiler/rules'
import { planRefs } from '../judge/helpers'
import { child, FAST, makeEnv, MASTRA_LEASE_MS, PASS, seedTree, settled, sleep, slowJudge, start, statusOf, useDb } from './helpers'

// stuck_claim (stage.claim_lease): a crash after a judge claim blocks the run.

const db = useDb()
const plan = planOf()

async function draftedRun(env: ReturnType<typeof db.env>, runId: string) {
  await env.graph.recordStageRun({ runId, stage: 'create_node', nodeId: 'sunscreen', ruleSetHash: plan.ruleSetHash })
  await env.graph.addDraft({ runId, round: 1, reply: GOOD_OUTPUT, drafter: 'drafter/mock' })
}

describe('stuck_claim', () => {
  it('stuck_claim.no_claim_while_live: a second claimJudge inside the lease gives null', async () => {
    const env = db.env()
    await draftedRun(env, 'live-claim')
    expect(await env.graph.claimJudge('live-claim', 1, 60_000)).toBe(1)
    expect(await env.graph.claimJudge('live-claim', 1, 60_000)).toBeNull()
    expect(await env.count('judge_claims', 'live-claim')).toBe(1)
  })

  it('stuck_claim.no_claim_with_rows: a claimJudge after the lease, for a round with rows, gives null', async () => {
    const env = db.env()
    const { runId } = await start(env)
    expect(await env.count('judge_claims', runId)).toBe(1)
    await sleep(20)
    expect(await env.graph.claimJudge(runId, 1, 1)).toBeNull()
    expect(await env.count('judge_claims', runId)).toBe(1)
  })

  it('stuck_claim.late_winner_writes_nothing: a judge that takes longer than judgeDeadlineMs makes the step fail with no row written', async () => {
    const env = db.env()
    await draftedRun(env, 'late-winner')
    const spy = { calls: 0 }
    const deps = { store: env.graph, planFor: compilingPlanFor({ library: () => library(FIXTURE), store: env.graph }), judgeModel: slowJudge(PASS, spy, 600), timing: { claimLeaseMs: 5_000, judgeDeadlineMs: 300, draftDeadlineMs: 300, pollMs: 50 } }
    const input = { runId: 'late-winner', stage: 'create_node' as const, nodeId: 'sunscreen', ruleSetHash: plan.ruleSetHash, round: 1, reply: GOOD_OUTPUT, evidence: GOOD_EVIDENCE }
    await expect(judgeRound(deps, input)).rejects.toThrow(/passed its deadline/)
    expect(spy.calls).toBe(1)
    expect(await env.count('verdicts', 'late-winner')).toBe(0)
  })
})

// A child process dies after claimJudge. After the Mastra lease and the claim lease, the boot sweep
// takes attempt 2 and ends the run.
describe('stuck_claim after a crash', { timeout: 90_000 }, () => {
  it('stuck_claim.sweep_finishes_after_lease: the boot sweep ends the run, with two claim rows and one set of verdict rows', async () => {
    const crash = await freshDatabase()
    try {
      await seedTree(crash.url)
      const runId = 'crash-claim'
      const kid = await child({ url: crash.url, hook: 'afterClaim', mode: 'start', runId, plan: 'accept' })
      expect([kid.code, kid.out.includes('child dies at afterClaim')]).toEqual([9, true])
      const env = makeEnv(crash.url)
      expect([await statusOf(env, runId), await env.count('judge_claims', runId), await env.count('verdicts', runId)]).toEqual(['running', 1, 0])
      await sleep(Math.max(MASTRA_LEASE_MS, FAST.claimLeaseMs) + 1_500)
      await env.mastra.restartAllActiveWorkflowRuns()
      expect(await settled(env, runId)).toBe('success')
      expect([await env.count('judge_claims', runId), await env.count('verdicts', runId), await env.count('run_ends', runId)]).toEqual([2, planRefs(plan).length, 1])
      await env.close()
    } finally {
      await crash.drop()
    }
  })
})
