import { describe, expect, it } from 'vitest'
import { start, useDb } from './helpers'

// late_row (stage.round_closed, stage.decision_closed): a verdict row or a decision arrives after the run end.

const db = useDb()

describe('late_row', () => {
  it('late_row.verdict_after_end_refused: a verdict insert for a run with a run end fails on the trigger', async () => {
    const env = db.env()
    const { runId } = await start(env)
    const [row] = await env.graph.verdictsOf(runId, 1)
    await expect(
      env.pool.query(`insert into harness.verdicts (run_id, round, rule_id, rule_version, rule_hash, binding, target, verdict, decider, reason) values ($1, 1, $2, $3, $4, 'strict', 'late.target', 'fail', '{"by": "code"}', 'late')`, [
        runId,
        row!.ruleId,
        row!.ruleVersion,
        row!.ruleHash,
      ]),
    ).rejects.toThrow(/has ended, so it takes no verdict row/)
    await expect(env.graph.writeVerdicts([{ ...row!, target: 'late.target', verdict: 'fail' }], 1)).rejects.toThrow()
  })

  it('late_row.decision_after_end_refused: a decision insert for a run with a run end fails on the trigger', async () => {
    const env = db.env()
    const { runId } = await start(env)
    await expect(env.pool.query(`insert into harness.person_decisions (run_id, round, decision, reviewer, note) values ($1, 1, 'reject', 'operator', 'late')`, [runId])).rejects.toThrow(/has ended, so it takes no decision/)
    await expect(env.graph.addDecision({ runId, round: 1, decision: 'reject', reviewer: 'operator', note: 'late' })).rejects.toThrow(/has ended, so it takes no decision/)
    expect(await env.graph.decisionOf(runId)).toBeUndefined()
  })
})
