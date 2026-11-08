import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STAGE_WORKFLOWS, stageWorkflows } from '../../src/stage/registry'
import type { DraftInput, StageDeps } from '../../src/stage/types'
import { GOOD_OUTPUT } from '../compiler/rules'
import { importsOfFile } from '../compiler/imports'
import { BAD_OUTPUT, errorOf, mockDrafter, payloadOf, resume, start, UNKNOWN, useDb } from './helpers'

// flow (stage.workflow): a run ends in the wrong state.

const db = useDb()
const REPO = join(import.meta.dirname, '..', '..')

describe('flow', () => {
  it('flow.first_round_accepts: a good draft gives success, accepted at round 1, one draft row, one run end, and one output', async () => {
    const env = db.env()
    const { runId, result } = await start(env)
    expect(errorOf(result)).toBe('')
    expect(result.status === 'success' && result.result).toEqual({ runId, end: 'accepted', round: 1, outputId: expect.any(String) })
    expect([await env.count('drafts', runId), await env.count('run_ends', runId), await env.count('outputs', runId)]).toEqual([1, 1, 1])
  })

  it('flow.repair_then_accepts: a bad draft and then a good draft give accepted at round 2, and the drafter gets the errors of round 1', async () => {
    const inputs: DraftInput[] = []
    const env = db.env({
      drafter: spy => {
        const d = mockDrafter([BAD_OUTPUT, GOOD_OUTPUT], spy)
        return { id: d.id, draft: input => (inputs.push(input), d.draft(input)) }
      },
    })
    const { result } = await start(env)
    expect(result.status === 'success' && result.result).toMatchObject({ end: 'accepted', round: 2 })
    expect(inputs.map(i => i.round)).toEqual([1, 2])
    expect(inputs[0]!.errors).toEqual([])
    expect(inputs[1]!.errors).toEqual([expect.objectContaining({ from: 'quotes.from_label@1', target: 'criteria[0].attributes[0].quote' })])
  })

  it('flow.budget_spent_suspends: three bad drafts give suspended, with why budget_spent and round 3', async () => {
    const env = db.env({ replies: [BAD_OUTPUT] })
    const { result } = await start(env)
    expect(result.status).toBe('suspended')
    expect(payloadOf(result)).toMatchObject({ why: 'budget_spent', round: 3, budget: 3 })
  })

  it('flow.cannot_verify_suspends: a judge answer of unknown on a strict rule gives suspended at round 1, with why cannot_verify', async () => {
    const env = db.env({ judgeItems: UNKNOWN })
    const { result } = await start(env)
    expect(payloadOf(result)).toMatchObject({ why: 'cannot_verify', round: 1 })
  })

  it('flow.resume_accept_writes_output: a resume with accept gives person_accepted, one run end with the reviewer, and one output of round 3', async () => {
    const env = db.env({ replies: [BAD_OUTPUT] })
    const { runId } = await start(env)
    const ended = await resume(env, runId, { decision: 'accept', reviewer: 'operator', note: 'The quote is in the label photo.' })
    expect(ended.status === 'success' && ended.result).toEqual({ runId, end: 'person_accepted', round: 3, outputId: expect.any(String) })
    const { rows } = await env.pool.query(`select e."end", e.reviewer, o.round from harness.run_ends e join harness.outputs o using (run_id) where run_id = $1`, [runId])
    expect(rows).toEqual([{ end: 'person_accepted', reviewer: 'operator', round: 3 }])
  })

  it('flow.resume_reject_ends: a resume with reject gives person_rejected and outputId null', async () => {
    const env = db.env({ replies: [BAD_OUTPUT] })
    const { runId } = await start(env)
    const ended = await resume(env, runId, { decision: 'reject', reviewer: 'operator', note: 'The quote is not on the label.' })
    expect(ended.status === 'success' && ended.result).toEqual({ runId, end: 'person_rejected', round: 3, outputId: null })
  })

  it('flow.registered_four_stages: stageWorkflows gives the four stage workflows, and no evaluate_product', () => {
    const workflows = stageWorkflows({} as StageDeps)
    expect(Object.keys(workflows).sort()).toEqual(['create_layout', 'create_node', 'create_pack', 'define_criteria'])
    expect([...STAGE_WORKFLOWS].sort()).toEqual(Object.keys(workflows).sort())
    expect(Object.entries(workflows).map(([key, w]) => [key, w.id])).toEqual(Object.keys(workflows).map(k => [k, k]))
    expect(Object.keys(workflows)).not.toContain('evaluate_product')
  })

  it('flow.registry_needs_no_db: with no HARNESS_DATABASE_URL, an import of src/stage/registry.ts does not throw, and no test imports src/mastra/index.ts', () => {
    const env = { ...process.env }
    delete env.HARNESS_DATABASE_URL
    const out = execFileSync(process.execPath, ['--import', 'tsx', '-e', "const m = await import('./src/stage/registry.ts'); console.log(m.STAGE_WORKFLOWS.join(','))"], { cwd: REPO, env, encoding: 'utf8' })
    expect(out.trim()).toBe('define_criteria,create_node,create_pack,create_layout')
    const index = join(REPO, 'src', 'mastra', 'index')
    const tests = readdirSync(join(REPO, 'tests'), { recursive: true, withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith('.ts')).map(e => join(e.parentPath, e.name))
    const importers = tests.filter(f => importsOfFile(f).some(m => m.startsWith('.') && resolvePath(dirname(f), m).replace(/\.ts$/, '') === index))
    expect(importers).toEqual([])
  })
})
