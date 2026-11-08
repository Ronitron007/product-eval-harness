import { describe, expect, it } from 'vitest'
import { judgeRound } from '../../src/judge'
import { compilingPlanFor } from '../../src/stage'
import { freshDatabase } from '../db'
import { library } from '../compiler/library'
import { FIXTURE, GOOD_EVIDENCE, GOOD_OUTPUT } from '../compiler/rules'
import { planRefs } from '../judge/helpers'
import { planOf } from '../compiler/library'
import { BAD_OUTPUT, child, EXTRA_KEY_OUTPUT, FAST, makeEnv, MASTRA_LEASE_MS, payloadOf, PASS, resume, seedTree, settled, sleep, slowJudge, start, statusOf, UNKNOWN, useDb } from './helpers'

// double_write (stage.end_once, stage.rerun_reuses, stage.reuse_end, stage.judge_claim): a resume, a
// second start, a restart, or a step that runs again writes twice, calls a model twice, or turns an
// end into failed.

const db = useDb()
const ROWS = planRefs(planOf()).length // one row for each rule of the fixture plan: one target each

describe('double_write', () => {
  it('double_write.second_resume_refused: a second resume after success throws WORKFLOW_RUN_NOT_SUSPENDED, and the store holds one run end', async () => {
    const env = db.env({ replies: [BAD_OUTPUT] })
    const { runId } = await start(env)
    expect((await resume(env, runId, { decision: 'accept', reviewer: 'operator' })).status).toBe('success')
    await expect(resume(env, runId, { decision: 'reject', reviewer: 'operator', note: 'Again.' })).rejects.toMatchObject({ id: 'WORKFLOW_RUN_NOT_SUSPENDED' })
    expect(await env.count('run_ends', runId)).toBe(1)
  })

  it('double_write.concurrent_resume_one_end: two resumes at the same time give one success and one WORKFLOW_RESUME_ALREADY_CLAIMED', async () => {
    const a = db.env({ replies: [BAD_OUTPUT] })
    const b = db.env({ replies: [BAD_OUTPUT] })
    const { runId } = await start(a)
    const runs = await Promise.all([a, b].map(e => e.workflow().createRun({ runId })))
    const results = await Promise.allSettled(runs.map(r => r.resume({ step: 'person', resumeData: { decision: 'accept', reviewer: 'operator' } })))
    const fulfilled = results.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<{ status: string }>).value.status)
    const rejected = results.filter(r => r.status === 'rejected').map(r => ((r as PromiseRejectedResult).reason as { id?: string }).id)
    expect(fulfilled).toEqual(['success'])
    expect(rejected).toEqual(['WORKFLOW_RESUME_ALREADY_CLAIMED'])
    expect([await a.count('run_ends', runId), await a.count('outputs', runId)]).toEqual([1, 1])
  })

  it('double_write.end_run_twice_one_end: a second equal endRun gives the stored end, another end fails, and the store holds one end and one output', async () => {
    const env = db.env()
    const { runId, result } = await start(env)
    expect(result.status).toBe('success')
    const stored = result.status === 'success' ? result.result : undefined
    expect(await env.graph.endRun({ runId, round: 1, end: 'accepted', output: GOOD_OUTPUT })).toEqual(stored)
    await expect(env.graph.endRun({ runId, round: 1, end: 'person_rejected', reviewer: 'operator', note: 'No.' })).rejects.toThrow()
    expect([await env.count('run_ends', runId), await env.count('outputs', runId)]).toEqual([1, 1])
  })

  it('double_write.person_body_one_decision: a suspend, a refused accept, and a valid resume write one decision', async () => {
    let writes = 0
    const env = db.env({ replies: [EXTRA_KEY_OUTPUT], wrap: s => ({ ...s, addDecision: async row => (writes++, s.addDecision(row)) }) })
    const { runId, result } = await start(env)
    expect(payloadOf(result)).toMatchObject({ canAccept: false })
    const refused = await resume(env, runId, { decision: 'accept', reviewer: 'operator' })
    expect(payloadOf(refused)).toMatchObject({ refusal: expect.any(String) })
    expect((await resume(env, runId, { decision: 'reject', reviewer: 'operator', note: 'The draft has an extra key.' })).status).toBe('success')
    expect(writes).toBe(1)
  })

  // The context, draft, and judge steps run again on a second start of a suspended run id.
  async function startTwice() {
    const env = db.env({ judgeItems: UNKNOWN })
    const first = await start(env)
    const again = await start(env, first.runId)
    expect(again.result.status).toBe('suspended')
    return { env, runId: first.runId, first: first.result, again: again.result }
  }

  it('double_write.context_rerun_one_run_row: the context step that runs twice for one run id leaves one stage run row', async () => {
    const { env, runId } = await startTwice()
    expect(await env.count('stage_runs', runId)).toBe(1)
  })

  it('double_write.draft_reused_on_rerun: the draft step that runs twice for one round calls the drafter once', async () => {
    const { env, runId } = await startTwice()
    expect(env.spies.drafter.calls).toBe(1)
    expect(await env.count('drafts', runId)).toBe(1)
  })

  it('double_write.judge_reused_on_rerun: the judge step that runs twice for one round makes one judge call, writes the rows once, and gives the same output', async () => {
    const { env, runId, first, again } = await startTwice()
    expect(env.spies.judge.calls).toBe(1)
    expect(await env.count('verdicts', runId)).toBe(ROWS)
    expect(payloadOf(again)).toEqual(payloadOf(first))
  })

  // stage.rerun_reuses, stage.draft_claim: two starts of a new run id at the same time. No start
  // crashes first, so the draft and the stage run row do not exist yet.
  it('double_write.concurrent_start_one_draft: two starts of a new run id at the same time give no failed run and one drafter call', async () => {
    const env = db.env()
    const runs = await Promise.all([1, 2].map(() => env.workflow().createRun({ runId: 'twin-start' })))
    const results = await Promise.all(runs.map(r => r.start({ inputData: { nodeId: 'sunscreen' } })))
    expect(results.map(r => r.status)).toEqual(['success', 'success'])
    expect([env.spies.drafter.calls, env.spies.judge.calls]).toEqual([1, 1])
    expect([await env.count('stage_runs', 'twin-start'), await env.count('drafts', 'twin-start'), await env.count('run_ends', 'twin-start'), await env.count('outputs', 'twin-start')]).toEqual([1, 1, 1, 1])
  })

  it('double_write.concurrent_start_one_draft: two starts of a new run id on two Mastra instances give no failed run and one drafter call', async () => {
    const a = db.env()
    const b = db.env()
    const runs = await Promise.all([a, b].map(e => e.workflow().createRun({ runId: 'twin-instances' })))
    const results = await Promise.all(runs.map(r => r.start({ inputData: { nodeId: 'sunscreen' } })))
    expect(results.map(r => r.status)).toEqual(['success', 'success'])
    expect(a.spies.drafter.calls + b.spies.drafter.calls).toBe(1)
    expect(a.spies.judge.calls + b.spies.judge.calls).toBe(1)
    expect([await a.count('drafts', 'twin-instances'), await a.count('run_ends', 'twin-instances')]).toEqual([1, 1])
  })

  it('double_write.start_on_ended_run: a second start on an ended run id gives the stored end, with no research and no drafter call', async () => {
    const env = db.env()
    const first = await start(env)
    expect(first.result.status).toBe('success')
    const again = await start(env, first.runId)
    expect(again.result.status).toBe('success')
    expect(again.result.status === 'success' && again.result.result).toEqual(first.result.status === 'success' && first.result.result)
    expect([env.spies.research.calls, env.spies.drafter.calls]).toEqual([1, 1])
    expect(await statusOf(env, first.runId)).toBe('success')
  })

  it('double_write.concurrent_judge_one_call: two judge steps of one round at the same time make one judge call and write one set of rows', async () => {
    const env = db.env()
    const runId = 'judge-twice'
    const plan = planOf()
    await env.graph.recordStageRun({ runId, stage: 'create_node', nodeId: 'sunscreen', ruleSetHash: plan.ruleSetHash })
    await env.graph.addDraft({ runId, round: 1, reply: GOOD_OUTPUT, drafter: 'drafter/mock' })
    const spy = { calls: 0 }
    const deps = { store: env.graph, planFor: compilingPlanFor({ library: () => library(FIXTURE), store: env.graph }), judgeModel: slowJudge(PASS, spy, 1_000), timing: FAST }
    const input = { runId, stage: 'create_node' as const, nodeId: 'sunscreen', ruleSetHash: plan.ruleSetHash, round: 1, reply: GOOD_OUTPUT, evidence: GOOD_EVIDENCE }
    const [a, b] = await Promise.all([judgeRound(deps, input), judgeRound(deps, input)])
    expect(spy.calls).toBe(1)
    expect(a).toEqual(b)
    expect(a.kind).toBe('accept')
    expect(await env.count('verdicts', runId)).toBe(ROWS)
  })

  it('double_write.verdict_row_unique: a second row for one rule, target, and round fails on the unique key', async () => {
    const env = db.env()
    const { runId } = await start(env)
    const rows = await env.graph.verdictsOf(runId, 1)
    const fresh = 'unique-row'
    await env.graph.recordStageRun({ runId: fresh, stage: 'create_node', nodeId: 'sunscreen', ruleSetHash: planOf().ruleSetHash })
    await env.graph.addDraft({ runId: fresh, round: 1, reply: GOOD_OUTPUT, drafter: 'drafter/mock' })
    const row = { ...rows[0]!, runId: fresh }
    await env.graph.writeVerdicts([row], 1)
    await expect(env.graph.writeVerdicts([row], 1)).rejects.toThrow()
    await expect(env.pool.query(`insert into harness.verdicts (run_id, round, rule_id, rule_version, rule_hash, binding, target, verdict, decider, reason) values ($1, 1, $2, $3, $4, $5, $6, 'fail', '{"by": "code"}', 'again')`, [fresh, row.ruleId, row.ruleVersion, row.ruleHash, row.binding, row.target])).rejects.toThrow(/verdicts_one_row/)
  })
})

// A child process dies after endRun commits. After the Mastra lease lapses, run.restart() and the
// boot sweep run assimilate again, and get the stored end.
describe('double_write after a crash', { timeout: 90_000 }, () => {
  it('double_write.restart_after_end_commit and double_write.boot_sweep_after_end_commit: success with the stored end', async () => {
    const [one, two] = await Promise.all([freshDatabase(), freshDatabase()])
    try {
      await Promise.all([seedTree(one.url), seedTree(two.url)])
      const envs = [makeEnv(one.url, { replies: [BAD_OUTPUT] }), makeEnv(two.url, { replies: [BAD_OUTPUT] })] as const
      const ids = ['crash-restart', 'crash-sweep']
      for (const [i, env] of envs.entries()) expect((await start(env, ids[i])).result.status).toBe('suspended')
      const kids = await Promise.all(envs.map((_, i) => child({ url: [one, two][i]!.url, hook: 'afterEndRun', mode: 'resume', runId: ids[i]!, plan: 'budget' })))
      expect(kids.map(k => [k.code, k.out.includes('child dies at afterEndRun')])).toEqual([[9, true], [9, true]])
      for (const [i, env] of envs.entries()) expect([await statusOf(env, ids[i]!), await env.count('run_ends', ids[i]!)]).toEqual(['running', 1])
      await sleep(MASTRA_LEASE_MS + 1_500)

      const restarted = await (await envs[0].workflow().createRun({ runId: ids[0]! })).restart()
      expect(restarted.status).toBe('success')
      expect(restarted.status === 'success' && restarted.result).toMatchObject({ runId: ids[0], end: 'person_accepted', round: 3 })
      expect(await statusOf(envs[0], ids[0]!)).toBe('success')

      await envs[1].mastra.restartAllActiveWorkflowRuns()
      expect(await settled(envs[1], ids[1]!)).toBe('success')
      for (const [i, env] of envs.entries()) expect([await env.count('run_ends', ids[i]!), await env.count('outputs', ids[i]!)]).toEqual([1, 1])
      await Promise.all(envs.map(e => e.close()))
    } finally {
      await Promise.all([one.drop(), two.drop()])
    }
  })
})
