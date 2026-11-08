import { describe, expect, it } from 'vitest'
import type pg from 'pg'
import { sleep, start, UNKNOWN, useDb } from './helpers'

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

  // stage.round_closed, stage.decision_closed: the triggers take the lock of the run, so three open
  // transactions cannot pass each other's checks.
  it('late_row.open_transactions_serialized: a run end, a late verdict, and a late decision in three open transactions give one end and no late row', async () => {
    const env = db.env({ judgeItems: UNKNOWN })
    const { runId } = await start(env) // suspended at round 1: the strict judgement row is cannot_verify
    const [row] = (await env.graph.verdictsOf(runId, 1)).filter(r => r.verdict === 'pass')
    const clients = await Promise.all([1, 2, 3].map(() => env.pool.connect()))
    const [ending, verdict, decision] = clients as [pg.PoolClient, pg.PoolClient, pg.PoolClient]
    try {
      for (const c of clients) await c.query('begin')
      await ending.query(`insert into harness.person_decisions (run_id, round, decision, reviewer, note) values ($1, 1, 'reject', 'operator', 'first')`, [runId])
      await ending.query(`insert into harness.run_ends (run_id, round, "end", reviewer, note) values ($1, 1, 'person_rejected', 'operator', 'first')`, [runId])
      const late = [
        verdict.query(`insert into harness.verdicts (run_id, round, rule_id, rule_version, rule_hash, binding, target, verdict, decider, reason) values ($1, 1, $2, $3, $4, 'strict', 'late.target', 'fail', '{"by": "code"}', 'late')`, [runId, row!.ruleId, row!.ruleVersion, row!.ruleHash]),
        decision.query(`insert into harness.person_decisions (run_id, round, decision, reviewer, note) values ($1, 1, 'accept', 'operator', 'second')`, [runId]),
      ].map(p => p.then(() => 'inserted', (e: Error) => e.message))
      const early = await Promise.race([Promise.all(late), sleep(300).then(() => 'waiting')])
      expect(early).toBe('waiting') // both wait for the lock of the run
      await ending.query('commit')
      const [v, d] = await Promise.all(late)
      expect(v).toMatch(/has ended, so it takes no verdict row/)
      expect(d).toMatch(/has ended, so it takes no decision/)
    } finally {
      for (const c of [verdict, decision]) await c.query('rollback').catch(() => undefined)
      for (const c of clients) c.release()
    }
    expect([await env.count('run_ends', runId), await env.count('person_decisions', runId)]).toEqual([1, 1])
    expect((await env.graph.verdictsOf(runId, 1)).some(r => r.target === 'late.target')).toBe(false)
  })
})
