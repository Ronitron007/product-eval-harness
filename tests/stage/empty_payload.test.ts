import { createStep, createWorkflow } from '@mastra/core/workflows'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { PersonDecision, PersonPayload } from '../../src/stage'
import { BAD_OUTPUT, payloadOf, resume, start, statusOf, useDb } from './helpers'

// empty_payload (stage.person_payload): a run suspends with no person payload.

const db = useDb()

describe('empty_payload', () => {
  it('empty_payload.schema_refuses: a copy of the person step that suspends with {} gives failed', async () => {
    const person = createStep({
      id: 'person',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      suspendSchema: PersonPayload,
      resumeSchema: PersonDecision,
      execute: async ({ suspend }) => suspend({} as never),
    })
    const workflow = createWorkflow({ id: 'empty-payload', inputSchema: z.object({}), outputSchema: z.object({}) }).then(person).commit()
    const result = await (await workflow.createRun()).start({ inputData: {} })
    expect(result.status).toBe('failed')
  })

  it('empty_payload.payload_holds_draft: the payload of a suspended run parses with PersonPayload, and its reply equals the stored draft of its round', async () => {
    const env = db.env({ replies: [BAD_OUTPUT] })
    const { runId, result } = await start(env)
    const payload = PersonPayload.parse(payloadOf(result))
    expect(payload.reply).toEqual((await env.graph.draftOf(runId, payload.round))?.reply)
    expect(payload.reply).toEqual(BAD_OUTPUT)
    expect(payload.errors).toEqual([expect.objectContaining({ from: 'quotes.from_label@1' })])
  })

  it('empty_payload.blank_reviewer_refused: a resume with the reviewer " " throws WORKFLOW_SCHEMA_VALIDATION_FAILED, and the run stays suspended', async () => {
    const env = db.env({ replies: [BAD_OUTPUT] })
    const { runId } = await start(env)
    await expect(resume(env, runId, { decision: 'accept', reviewer: ' ' })).rejects.toMatchObject({ id: 'WORKFLOW_SCHEMA_VALIDATION_FAILED' })
    expect(await statusOf(env, runId)).toBe('suspended')
    await expect(env.pool.query(`insert into harness.person_decisions (run_id, round, decision, reviewer) values ($1, 3, 'accept', ' ')`, [runId])).rejects.toThrow(/person_decisions_reviewer_check/)
  })
})
