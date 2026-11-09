import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { REGISTRY } from '../../src/tools'
import { createGraphStore } from '../../src/store/store'
import { freshDatabase, withUser, type TestDatabase } from '../db'
import { seedTree } from '../stage/env'
import { callText, connectServer, envFileWith, snapshotFor } from './helpers'

// tools.plan_checks: the server calls each tool. One call for each entry, over stdio, on the test
// Postgres. A stage wrapper with no model set ends as failed with models_unset, before any model call.

let db: TestDatabase
beforeAll(async () => {
  db = await freshDatabase()
  await seedTree(db.url)
})
afterAll(async () => {
  await db?.drop()
})

describe('registry', () => {
  it('registry.calls_each_tool: the server calls each entry of the registry', async () => {
    const snapshot = snapshotFor('{"allowEffects":["read","paid","db_write"]}')
    const server = await connectServer(snapshot, envFileWith({ HARNESS_DATABASE_URL: withUser(db.url, 'harness_app') }))
    const store = createGraphStore(db.pool(withUser(db.url, 'harness_app')))
    try {
      const context = await callText(server, 'get_node_context', { nodeId: 'mineral_sunscreen' })
      expect(context.isError).toBe(false)
      expect(JSON.parse(context.text)).toEqual({
        path: [
          { id: 'skincare', label: 'Skincare' },
          { id: 'sunscreen', label: 'Sunscreen' },
          { id: 'mineral_sunscreen', label: 'Mineral sunscreen' },
        ],
        siblings: [],
      })
      const unknown = await callText(server, 'get_node_context', { nodeId: 'nope' })
      expect(unknown.isError).toBe(true)
      for (const id of REGISTRY.ids.filter(i => i.startsWith('run_'))) {
        const r = await callText(server, id, { nodeId: 'skincare' })
        expect(r.isError, id).toBe(false)
        const result = (JSON.parse(r.text) as { result: { status: string; runId: string; code: string } }).result
        expect(result, id).toEqual({ status: 'failed', runId: expect.stringMatching(/^[0-9a-f-]{36}$/), code: 'models_unset' })
        // The inner snapshot of the stage is in harness.tool_runs under the stage run id (tools.injection_scope).
        expect(await store.toolRunOf(result.runId), id).toMatchObject({ consumer: 'agent', manifest: [], allowedTools: [] })
      }
    } finally {
      await server.close()
    }
  }, 120_000)
})
