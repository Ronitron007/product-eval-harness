import { afterAll, beforeAll } from 'vitest'
import { freshDatabase, type TestDatabase } from '../db'
import { makeEnv, seedTree, type Env, type EnvOptions } from './env'

// Shared parts of the stage workflow tests (stage.hazards). Each test file makes its own database
// with the fixture tree, and drops it after. Mastra storage runs on the same pool as harness_app.
export * from './env'

export function useDb(): { readonly url: string; env(o?: EnvOptions): Env } {
  let db: TestDatabase
  const envs: Env[] = []
  beforeAll(async () => {
    db = await freshDatabase()
    await seedTree(db.url)
  })
  afterAll(async () => {
    await Promise.all(envs.splice(0).map(e => e.close()))
    await db?.drop()
  })
  return {
    get url() {
      return db.url
    },
    env(o = {}) {
      const e = makeEnv(db.url, o)
      envs.push(e)
      return e
    },
  }
}

export const NODE = { nodeId: 'sunscreen' }

// Starts a run of create_node at sunscreen. A given run id starts that run id again.
export async function start(env: Env, runId?: string, stage: Parameters<Env['workflow']>[0] = 'create_node', nodeId = 'sunscreen') {
  const run = await env.workflow(stage).createRun(runId === undefined ? {} : { runId })
  const result = await run.start({ inputData: { nodeId } })
  return { runId: run.runId, result }
}

export async function resume(env: Env, runId: string, resumeData: unknown) {
  const run = await env.workflow().createRun({ runId })
  return run.resume({ step: 'person', resumeData: resumeData as never })
}

export const statusOf = async (env: Env, runId: string) => (await env.workflow().getWorkflowRunById(runId))?.status

// The suspend payload of the person step of a suspended result.
export function payloadOf(result: { status: string; steps?: Record<string, { suspendPayload?: unknown }> }): Record<string, unknown> {
  if (result.status !== 'suspended') throw new Error(`The run is ${result.status}, not suspended.`)
  return result.steps!.person!.suspendPayload as Record<string, unknown>
}

export const errorOf = (result: { status: string; error?: unknown }) => (result.status === 'failed' ? String((result.error as Error)?.message ?? result.error) : '')
