import { describe, expect, it } from 'vitest'
import { library, planOf, withRules } from '../compiler/library'
import { attributeIsProduct } from '../compiler/rules'
import { BAD_OUTPUT, errorOf, resume, start, useDb } from './helpers'

// rule_drift (stage.hash_on_resume): a resume after a rule change writes an end.

const db = useDb()
const changed = () => library(withRules({ ...attributeIsProduct, statement: 'Keep each attribute about the product, as its label states it.' }))

describe('rule_drift', () => {
  it('rule_drift.resume_accept_refused: a rule change while the run waits makes a resume with accept fail, with no run end and no output', async () => {
    const env = db.env({ replies: [BAD_OUTPUT] })
    const { runId, result } = await start(env)
    expect(result.status).toBe('suspended')
    env.lib.current = changed()
    const ended = await resume(env, runId, { decision: 'accept', reviewer: 'operator' })
    expect(ended.status).toBe('failed')
    expect(errorOf(ended)).toMatch(/The rules changed during run/)
    expect([await env.count('run_ends', runId), await env.count('outputs', runId), await env.count('person_decisions', runId)]).toEqual([0, 0, 0])
  })

  it('rule_drift.resume_reject_refused: the same with reject fails, with no run end', async () => {
    const env = db.env({ replies: [BAD_OUTPUT] })
    const { runId } = await start(env)
    env.lib.current = changed()
    const ended = await resume(env, runId, { decision: 'reject', reviewer: 'operator', note: 'Old rules.' })
    expect(ended.status).toBe('failed')
    expect([await env.count('run_ends', runId), await env.count('person_decisions', runId)]).toEqual([0, 0])
  })

  it('rule_drift.context_rerun_refused: a stored stage run with another hash makes the context step fail', async () => {
    const env = db.env()
    await env.graph.recordStageRun({ runId: 'old-hash', stage: 'create_node', nodeId: 'sunscreen', ruleSetHash: 'b'.repeat(64) })
    const { result } = await start(env, 'old-hash')
    expect(result.status).toBe('failed')
    expect(errorOf(result)).toMatch(/The rules changed during run old-hash/)
    expect(env.spies.drafter.calls).toBe(0)
    expect(planOf().ruleSetHash).not.toBe('b'.repeat(64))
  })
})
