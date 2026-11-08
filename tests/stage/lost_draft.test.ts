import { describe, expect, it } from 'vitest'
import { planOf } from '../compiler/library'
import { BAD_OUTPUT, rawDrafter, start, useDb } from './helpers'

// lost_draft (stage.draft_log, stage.reply_lossless): a draft is lost or overwritten.

const db = useDb()
const NUL = 'abc\u0000def'
const SURROGATE = 'x\ud800y'

async function newRun(env: ReturnType<typeof db.env>, runId: string) {
  await env.graph.recordStageRun({ runId, stage: 'create_node', nodeId: 'sunscreen', ruleSetHash: planOf().ruleSetHash })
}

describe('lost_draft', () => {
  it('lost_draft.each_round_kept: after three rounds, harness.drafts holds rounds 1, 2, and 3, each with its reply', async () => {
    const env = db.env({ replies: [BAD_OUTPUT] })
    const { runId } = await start(env)
    const kept = await Promise.all([1, 2, 3].map(n => env.graph.draftOf(runId, n)))
    expect(kept.map(d => [d?.round, d?.drafter, d?.reply])).toEqual([1, 2, 3].map(n => [n, 'drafter/mock', BAD_OUTPUT]))
  })

  it('lost_draft.verdict_needs_draft: writeVerdicts at a round with no draft fails on the foreign key', async () => {
    const env = db.env()
    const { runId } = await start(env)
    const rows = await env.graph.verdictsOf(runId, 1)
    await expect(env.graph.writeVerdicts(rows, 2)).rejects.toThrow()
    await expect(
      env.pool.query(`insert into harness.verdicts (run_id, round, rule_id, rule_version, rule_hash, binding, target, verdict, decider, reason) values ($1, 2, 'a.b', 1, $2, 'strict', 't', 'pass', '{"by": "code"}', 'r')`, [
        'no-draft',
        'a'.repeat(64),
      ]),
    ).rejects.toThrow()
    const other = 'draft-fk'
    await newRun(env, other)
    await expect(env.pool.query(`insert into harness.verdicts (run_id, round, rule_id, rule_version, rule_hash, binding, target, verdict, decider, reason) values ($1, 2, 'a.b', 1, $2, 'strict', 't', 'pass', '{"by": "code"}', 'r')`, [other, 'a'.repeat(64)])).rejects.toThrow(/verdicts_draft/)
  })

  it('lost_draft.no_overwrite: a second addDraft for one round fails, and the first reply stays', async () => {
    const env = db.env()
    await newRun(env, 'overwrite')
    await env.graph.addDraft({ runId: 'overwrite', round: 1, reply: { first: true }, drafter: 'drafter/mock' })
    await expect(env.graph.addDraft({ runId: 'overwrite', round: 1, reply: { second: true }, drafter: 'drafter/mock' })).rejects.toThrow(/drafts_pkey/)
    await expect(env.pool.query(`update harness.drafts set reply_text = '{}' where run_id = 'overwrite'`)).rejects.toThrow(/permission denied/)
    expect((await env.graph.draftOf('overwrite', 1))?.reply).toEqual({ first: true })
  })

  it('lost_draft.broken_reply_kept: the store keeps a reply that is text, not JSON, as that text', async () => {
    const env = db.env({ drafter: spy => rawDrafter(['The criteria are spf and zinc.'], spy) })
    const { runId, result } = await start(env)
    expect(result.status).toBe('suspended')
    expect((await env.graph.draftOf(runId, 1))?.reply).toBe('The criteria are spf and zinc.')
  })

  it('lost_draft.nul_and_surrogate_kept: a reply with NUL and a reply with a lone surrogate come back unchanged, and their reply column is null', async () => {
    const env = db.env()
    await newRun(env, 'lossless')
    await env.graph.addDraft({ runId: 'lossless', round: 1, reply: NUL, drafter: 'drafter/mock' })
    await env.graph.addDraft({ runId: 'lossless', round: 2, reply: { text: SURROGATE }, drafter: 'drafter/mock' })
    expect((await env.graph.draftOf('lossless', 1))?.reply).toBe(NUL)
    expect((await env.graph.draftOf('lossless', 2))?.reply).toEqual({ text: SURROGATE })
    const { rows } = await env.pool.query(`select round, reply from harness.drafts where run_id = 'lossless' order by round`)
    expect(rows).toEqual([
      { round: 1, reply: null },
      { round: 2, reply: null },
    ])
  })

  it('lost_draft.unparsed_reply_kept: a reply that JSON refuses still gets a draft row, and its round still gets verdict rows', async () => {
    const env = db.env({ drafter: spy => rawDrafter([NUL], spy) })
    const { runId } = await start(env)
    expect((await env.graph.draftOf(runId, 1))?.reply).toBe(NUL)
    expect((await env.graph.verdictsOf(runId, 1)).length).toBeGreaterThan(0)
  })
})
