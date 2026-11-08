import { describe, expect, it } from 'vitest'
import { BAD_OUTPUT, resume, start, statusOf, useDb } from './helpers'

// reject_writes (stage.reject_end): a reject writes an output.

const db = useDb()

describe('reject_writes', () => {
  async function rejected(env: ReturnType<typeof db.env>) {
    const { runId } = await start(env)
    expect((await resume(env, runId, { decision: 'reject', reviewer: 'operator', note: 'The quote is not on the label.' })).status).toBe('success')
    return runId
  }

  it('reject_writes.no_output: after a reject, harness.outputs has no row for the run', async () => {
    const env = db.env({ replies: [BAD_OUTPUT] })
    const runId = await rejected(env)
    expect(await env.count('outputs', runId)).toBe(0)
  })

  it('reject_writes.end_row_with_note: the run end row holds person_rejected, the reviewer, and the note', async () => {
    const env = db.env({ replies: [BAD_OUTPUT] })
    const runId = await rejected(env)
    const { rows } = await env.pool.query(`select "end", round, reviewer, note from harness.run_ends where run_id = $1`, [runId])
    expect(rows).toEqual([{ end: 'person_rejected', round: 3, reviewer: 'operator', note: 'The quote is not on the label.' }])
  })

  it('reject_writes.note_required: a reject with no note throws WORKFLOW_SCHEMA_VALIDATION_FAILED, and the run stays suspended', async () => {
    const env = db.env({ replies: [BAD_OUTPUT] })
    const { runId } = await start(env)
    await expect(resume(env, runId, { decision: 'reject', reviewer: 'operator' })).rejects.toMatchObject({ id: 'WORKFLOW_SCHEMA_VALIDATION_FAILED' })
    expect(await statusOf(env, runId)).toBe('suspended')
  })

  it('reject_writes.blank_note_refused: a reject with the note " " throws, and a direct insert of that note fails on the check', async () => {
    const env = db.env({ replies: [BAD_OUTPUT] })
    const { runId } = await start(env)
    await expect(resume(env, runId, { decision: 'reject', reviewer: 'operator', note: ' ' })).rejects.toMatchObject({ id: 'WORKFLOW_SCHEMA_VALIDATION_FAILED' })
    expect(await statusOf(env, runId)).toBe('suspended')
    await expect(env.pool.query(`insert into harness.person_decisions (run_id, round, decision, reviewer, note) values ($1, 3, 'reject', 'operator', ' ')`, [runId])).rejects.toThrow(/person_decisions_note_check/)
    await expect(env.graph.addDecision({ runId, round: 3, decision: 'reject', reviewer: 'operator', note: ' ' })).rejects.toThrow()
  })

  it('reject_writes.output_trigger_refuses: a direct insert of an output for a run with person_rejected fails', async () => {
    const env = db.env({ replies: [BAD_OUTPUT] })
    const runId = await rejected(env)
    await expect(
      env.pool.query(`insert into harness.outputs (run_id, stage, node_id, body, rule_set_hash, round) select run_id, stage, node_id, '{}', rule_set_hash, 3 from harness.stage_runs where run_id = $1`, [runId]),
    ).rejects.toThrow(/needs an accepting run end/)
    await expect(env.graph.acceptOutput({ runId, round: 3, body: BAD_OUTPUT })).rejects.toThrow()
    expect(await env.count('outputs', runId)).toBe(0)
  })
})
