import { describe, expect, it } from 'vitest'
import { finishRunById } from '../../scripts/finish-run'
import { BAD_OUTPUT, errorOf, resume, start, statusOf, useDb } from './helpers'

// lost_accept (stage.decision_first): a decision of a person is lost after a failure.

const db = useDb()

describe('lost_accept', () => {
  let failOnce = true
  const env = () =>
    db.env({
      replies: [BAD_OUTPUT],
      wrap: s => ({
        ...s,
        endRun: async input => {
          if (failOnce) {
            failOnce = false
            throw new Error('The store failed once in endRun.')
          }
          return s.endRun(input)
        },
      }),
    })
  let runId = ''

  it('lost_accept.decision_kept_on_store_error: endRun fails once after a resume with accept, the run fails, and the decision row stays', async () => {
    const e = env()
    runId = (await start(e)).runId
    const ended = await resume(e, runId, { decision: 'accept', reviewer: 'operator' })
    expect(ended.status).toBe('failed')
    expect(errorOf(ended)).toMatch(/The store failed once in endRun/)
    expect(await e.graph.decisionOf(runId)).toEqual({ runId, round: 3, decision: 'accept', reviewer: 'operator' })
    expect(await e.count('run_ends', runId)).toBe(0)
    expect(await statusOf(e, runId)).toBe('failed')
  })

  it('lost_accept.finish_run_ends_it: scripts/finish-run.ts on that run writes person_accepted and one output', async () => {
    const e = env()
    const end = await finishRunById(e.deps, runId)
    expect(end).toEqual({ runId, end: 'person_accepted', round: 3, outputId: expect.any(String) })
    expect([await e.count('run_ends', runId), await e.count('outputs', runId)]).toEqual([1, 1])
  })

  it('lost_accept.finish_run_twice_one_end: a second finishRun gives the same end and writes no row', async () => {
    const e = env()
    const first = await e.graph.runEndOf(runId)
    expect(await finishRunById(e.deps, runId)).toEqual(first)
    expect([await e.count('run_ends', runId), await e.count('outputs', runId)]).toEqual([1, 1])
  })

  it('lost_accept.person_end_needs_decision: a direct insert of person_accepted with no decision row fails on the trigger', async () => {
    const e = db.env({ replies: [BAD_OUTPUT] })
    const other = (await start(e)).runId
    await expect(e.pool.query(`insert into harness.run_ends (run_id, round, "end", reviewer) values ($1, 3, 'person_accepted', 'operator')`, [other])).rejects.toThrow(/a person end needs the equal person decision/)
    await expect(e.graph.endRun({ runId: other, round: 3, end: 'person_accepted', reviewer: 'operator', output: BAD_OUTPUT })).rejects.toThrow(/a person end needs the equal person decision/)
    expect(await e.count('run_ends', other)).toBe(0)
  })
})
