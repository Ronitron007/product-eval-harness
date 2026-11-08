import { createWorkflow } from '@mastra/core/workflows'
import { describe, expect, it } from 'vitest'
import { JudgeStepInput, Round, stageSteps } from '../../src/stage'
import { planOf } from '../compiler/library'
import { GOOD_EVIDENCE, GOOD_OUTPUT } from '../compiler/rules'
import { BAD_OUTPUT, payloadOf, start, useDb } from './helpers'

// budget_overrun (stage.loop_on_outcome, stage.budget_in_db): a run makes more than 3 rounds, or an
// auto accept skips a strict row.

const db = useDb()
const plan = planOf()

async function judgedRun(env: ReturnType<typeof db.env>, runId: string, rows: { binding: 'strict' | 'soft'; verdict: 'pass' | 'fail' }[]) {
  await env.graph.recordStageRun({ runId, stage: 'create_node', nodeId: 'sunscreen', ruleSetHash: plan.ruleSetHash })
  await env.graph.addDraft({ runId, round: 1, reply: GOOD_OUTPUT, drafter: 'drafter/mock' })
  const rule = plan.manifest.rules[0]!
  await env.graph.writeVerdicts(
    rows.map((r, i) => ({ runId, ruleId: rule.id, ruleVersion: rule.version, ruleHash: rule.hash, binding: r.binding, target: `t${i}`, verdict: r.verdict, decider: { by: 'code' as const }, reason: 'r' })),
    1,
  )
}

describe('budget_overrun', () => {
  it('budget_overrun.three_drafts_max: a drafter that always gives a bad draft gets 3 calls', async () => {
    const env = db.env({ replies: [BAD_OUTPUT] })
    const { result } = await start(env)
    expect(payloadOf(result)).toMatchObject({ round: 3 })
    expect(env.spies.drafter.calls).toBe(3)
  })

  it('budget_overrun.draft_refuses_round_four: the draft step with round 3 in its input throws, and it does not call the drafter', async () => {
    const env = db.env()
    const { draft } = stageSteps('create_node', env.deps)
    const workflow = createWorkflow({ id: 'draft-only', inputSchema: Round, outputSchema: JudgeStepInput }).then(draft).commit()
    const input = { runId: 'round-four', stage: 'create_node' as const, nodeId: 'sunscreen', ruleSetHash: plan.ruleSetHash, context: { path: [], siblings: [], instructions: '' }, evidence: GOOD_EVIDENCE, round: 3, last: null }
    const result = await (await workflow.createRun()).start({ inputData: input })
    expect(result.status).toBe('failed')
    expect(String((result as { error?: Error }).error?.message)).toMatch(/The repair budget is spent/)
    expect(env.spies.drafter.calls).toBe(0)
  })

  it('budget_overrun.db_refuses_round_four: a draft row and a verdict row at round 4 fail on the checks', async () => {
    const env = db.env()
    await env.graph.recordStageRun({ runId: 'db-four', stage: 'create_node', nodeId: 'sunscreen', ruleSetHash: plan.ruleSetHash })
    await expect(env.pool.query(`insert into harness.drafts (run_id, round, reply_text, drafter) values ('db-four', 4, '{}', 'drafter/mock')`)).rejects.toThrow(/drafts_round_check/)
    await expect(env.graph.addDraft({ runId: 'db-four', round: 4, reply: {}, drafter: 'drafter/mock' })).rejects.toThrow(/drafts_round_check/)
    await expect(
      env.pool.query(`insert into harness.verdicts (run_id, round, rule_id, rule_version, rule_hash, binding, target, verdict, decider, reason) values ('db-four', 4, 'a.b', 1, $1, 'strict', 't', 'pass', '{"by": "code"}', 'r')`, ['a'.repeat(64)]),
    ).rejects.toThrow(/verdicts_round_budget/)
  })

  it('budget_overrun.accepted_end_needs_pass: an endRun with accepted for a round with a strict fail row fails on the trigger', async () => {
    const env = db.env()
    await judgedRun(env, 'strict-fail', [
      { binding: 'strict', verdict: 'pass' },
      { binding: 'strict', verdict: 'fail' },
    ])
    await expect(env.graph.endRun({ runId: 'strict-fail', round: 1, end: 'accepted', output: GOOD_OUTPUT })).rejects.toThrow(/accepted needs each strict row to pass/)
    expect([await env.count('run_ends', 'strict-fail'), await env.count('outputs', 'strict-fail')]).toEqual([0, 0])
  })

  it('budget_overrun.accepted_end_needs_strict_row: an endRun with accepted for a round with only soft rows fails on the trigger', async () => {
    const env = db.env()
    await judgedRun(env, 'soft-only', [{ binding: 'soft', verdict: 'pass' }])
    await expect(env.graph.endRun({ runId: 'soft-only', round: 1, end: 'accepted', output: GOOD_OUTPUT })).rejects.toThrow(/accepted needs a strict verdict row/)
  })
})
