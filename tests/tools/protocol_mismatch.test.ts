import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { readSnapshot, REGISTRY, toolFor, type StageOutcome } from '../../src/tools'
import { freshDatabase, withUser, type TestDatabase } from '../db'
import { seedTree } from '../stage/env'
import { fixtureHandles, ONLY_NODE } from './fixture'
import { connectServer, envFileWith, REPO, snapshotFor, toolNames } from './helpers'

// protocol_mismatch: a client cannot read the protocol of the server (tools.consumers). The Cursor
// CLI asks for MCP 2025-11-25, and @mastra/mcp 2.x serves only 2026-07-28 (the 2026-10-28 spike).

afterEach(() => vi.restoreAllMocks())

let db: TestDatabase
beforeAll(async () => {
  db = await freshDatabase()
  await seedTree(db.url)
})
afterAll(async () => {
  await db?.drop()
})
const STAGES = REGISTRY.ids.filter(id => id.startsWith('run_'))

describe('protocol_mismatch', () => {
  it('protocol_mismatch.cursor_version_lists: a client of @modelcontextprotocol/sdk that asks for 2025-11-25 lists the tools', async () => {
    expect(LATEST_PROTOCOL_VERSION).toBe('2025-11-25')
    const versions: string[] = []
    const original = Client.prototype.request
    vi.spyOn(Client.prototype, 'request').mockImplementation(async function (this: Client, ...a: Parameters<Client['request']>) {
      const result = await (original as (...x: unknown[]) => Promise<unknown>).apply(this, a)
      const req = a[0] as unknown as { method: string; params?: { protocolVersion?: string } }
      if (req.method === 'initialize') versions.push(`${req.params?.protocolVersion} -> ${(result as { protocolVersion: string }).protocolVersion}`)
      return result as never
    })
    const server = await connectServer(snapshotFor(undefined))
    try {
      expect(versions).toEqual(['2025-11-25 -> 2025-11-25'])
      expect(await toolNames(server)).toEqual(['get_node_context'])
    } finally {
      await server.close()
    }
  }, 60_000)

  it('protocol_mismatch.exact_pin: package.json pins @mastra/mcp 1.18.0 exactly, and the lock file installs it', () => {
    const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> }
    expect(pkg.dependencies['@mastra/mcp']).toBe('1.18.0')
    expect(pkg.dependencies['@mastra/claude']).toBe('0.3.3')
    expect(pkg.dependencies['@anthropic-ai/claude-agent-sdk']).toBe('0.3.319')
    expect(pkg.devDependencies['@modelcontextprotocol/sdk']).toBe('1.32.2')
    const lock = JSON.parse(readFileSync(join(REPO, 'package-lock.json'), 'utf8')) as { packages: Record<string, { version: string }> }
    expect(lock.packages['node_modules/@mastra/mcp']!.version).toBe('1.18.0')
    const installed = JSON.parse(readFileSync(join(REPO, 'node_modules', '@mastra', 'mcp', 'package.json'), 'utf8')) as { version: string }
    expect(installed.version).toBe('1.18.0')
  })

  it('protocol_mismatch.stage_results_pass_output_schema (review of #35): the client of @modelcontextprotocol/sdk validates each stage result against the listed output schema', async () => {
    const server = await connectServer(snapshotFor('{"allowEffects":["read","paid","db_write"]}'), envFileWith({ HARNESS_DATABASE_URL: withUser(db.url, 'harness_app') }))
    try {
      const listed = (await server.client.listTools()).tools // the client keeps a validator for each output schema
      for (const id of STAGES) {
        const schema = listed.find(t => t.name === id)!.outputSchema as Record<string, unknown>
        expect(schema.type, id).toBe('object')
        expect(schema.oneOf ?? schema.anyOf, id).toBeUndefined()
        const r = (await server.client.callTool({ name: id, arguments: { nodeId: 'skincare' } })) as { isError?: boolean; structuredContent?: { result: Record<string, unknown> } }
        expect(r.isError ?? false, id).toBe(false)
        expect(r.structuredContent!.result, id).toEqual({ status: 'failed', runId: expect.any(String), code: 'models_unset' })
      }
      // Each branch of the result, from a wrapper with a fake door, passes the validator of the listed schema.
      const validate = new AjvJsonSchemaValidator().getValidator(listed.find(t => t.name === 'run_create_node')!.outputSchema as never)
      const outcomes: StageOutcome[] = [
        { status: 'success', result: { runId: 'x', end: 'accepted', round: 1, outputId: '6f1c1c4e-1111-4a4a-8a8a-1234567890ab' } },
        { status: 'success', result: { runId: 'x', end: 'person_rejected', round: 3, outputId: null } },
        { status: 'suspended', payload: { why: 'budget_spent', round: 3, open: [] } },
        { status: 'failed', error: new Error('x'), failedStep: 'draft' },
      ]
      for (const outcome of outcomes) {
        const tool = toolFor('run_create_node', readSnapshot({ HARNESS_TOOLS: ONLY_NODE }, { runId: crypto.randomUUID(), consumer: 'step' }), { ...fixtureHandles(), writes: { run_create_node: async () => outcome } })
        const v = validate(await tool.execute!({ nodeId: 'sunscreen' }, {} as never))
        expect(v, JSON.stringify(outcome)).toMatchObject({ valid: true })
      }
      expect(validate({ status: 'failed', runId: crypto.randomUUID(), code: 'unknown' })).toMatchObject({ valid: false }) // the unwrapped shape fails
    } finally {
      await server.close()
    }
  }, 120_000)
})
