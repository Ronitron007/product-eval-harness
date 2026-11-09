import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createStep, createWorkflow } from '@mastra/core/workflows'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { lockedClaudeAgent } from '../../src/agent'
import {
  defineRegistry,
  harnessServerCommand,
  readSnapshot,
  REGISTRY,
  resolveTools,
  resumeSnapshot,
  snapshotFromServerEnv,
  Toggles,
  toolFor,
  ToolOff,
} from '../../src/tools'
import { createGraphStore, type GraphStore } from '../../src/store/store'
import { freshDatabase, withUser, type TestDatabase } from '../db'
import { agentEnv, BUDGET, fenceMessages, markerCli } from '../agent/helpers'
import { resetSdk, sdkState } from '../agent/sdk-mock'
import { BASE_ENTRIES, FIXTURE, fixtureHandles, readEntry, slowPaidEntry } from './fixture'
import { connect, REPO, snapshotFor } from './helpers'

vi.mock('@anthropic-ai/claude-agent-sdk', async () => (await import('../agent/sdk-mock')).sdkModule())

// toggle_flip: a toggle flips during a run, or a resume runs another tool set (tools.toggles).

let db: TestDatabase
let store: GraphStore
beforeAll(async () => {
  db = await freshDatabase()
  store = createGraphStore(db.pool(withUser(db.url, 'harness_app')))
})
afterAll(async () => {
  await db?.drop()
})

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap(f => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []
  })

describe('toggle_flip', () => {
  it('toggle_flip.env_change_after_start_ignored (repro spike/workflow.ts): a step after a change of HARNESS_TOOLS sees the list of the snapshot of its run', async () => {
    const env: Record<string, string> = { HARNESS_TOOLS: '{"toolsets":{"research":false}}' }
    const snapshot = readSnapshot(env, { runId: 'run-a', consumer: 'step' }, FIXTURE)
    const handles = fixtureHandles()
    const step = createStep({
      id: 'lookup',
      inputSchema: z.object({ nodeId: z.string() }),
      outputSchema: z.object({ depth: z.number(), tools: z.array(z.string()) }),
      execute: async ({ inputData }) => {
        const out = (await toolFor('read_thing', snapshot, handles, FIXTURE).execute!({ nodeId: inputData.nodeId }, {} as never)) as { path: string[] }
        return { depth: out.path.length, tools: Object.keys(resolveTools(snapshot, handles, FIXTURE)).sort() }
      },
    })
    const wf = createWorkflow({ id: 'flip', inputSchema: z.object({ nodeId: z.string() }), outputSchema: step.outputSchema }).then(step).commit()
    env.HARNESS_TOOLS = '{"toolsets":{"graph":false,"research":true},"allowEffects":["read","paid","db_write"]}'
    const result = await (await wf.createRun()).start({ inputData: { nodeId: 'sunscreen' } })
    expect(result.status).toBe('success')
    expect((result as { result: unknown }).result).toEqual({ depth: 2, tools: ['read_thing'] })
    expect(snapshot.manifest.map(m => m.id)).toEqual(['read_thing'])
  })

  it('toggle_flip.server_refuses_hash_mismatch: the server does not start when the hash does not match HARNESS_TOOL_SNAPSHOT_HASH', async () => {
    const snapshot = snapshotFor(undefined)
    const env = { ...harnessServerCommand(snapshot, { path: process.env.PATH! }).env }
    expect(() => snapshotFromServerEnv({ ...env, HARNESS_TOOL_SNAPSHOT_HASH: 'f'.repeat(64) })).toThrow(/does not match the hash/)
    const forged = JSON.stringify({ ...JSON.parse(env.HARNESS_TOOL_SNAPSHOT), hash: 'e'.repeat(64) })
    expect(() => snapshotFromServerEnv({ ...env, HARNESS_TOOL_SNAPSHOT: forged, HARNESS_TOOL_SNAPSHOT_HASH: 'e'.repeat(64) })).toThrow(/does not match its content/)
    await expect(connect({ ...env, HARNESS_ENV_FILE: '', HARNESS_TOOL_SNAPSHOT_HASH: '0'.repeat(64) })).rejects.toThrow()
  }, 30_000)

  it('toggle_flip.server_refuses_manifest_mismatch: the server refuses a snapshot whose manifest differs from its own, such as after a version change', () => {
    const snapshot = readSnapshot({}, { runId: 'r', consumer: 'agent' }, FIXTURE)
    const env = harnessServerCommand(snapshot, { path: '/usr/bin' }).env
    expect(snapshotFromServerEnv(env, FIXTURE).hash).toBe(snapshot.hash)
    const bumped = defineRegistry([readEntry('read_thing', { version: 2 }), ...BASE_ENTRIES.slice(1)])
    expect(() => snapshotFromServerEnv(env, bumped)).toThrow(/manifest of run r differs/)
    const forged = { ...snapshot, manifest: [] }
    expect(() => snapshotFromServerEnv({ ...env, HARNESS_TOOL_SNAPSHOT: JSON.stringify(forged) }, FIXTURE)).toThrow(/manifest of run r differs/)
  })

  it('toggle_flip.resume_other_manifest_refused: a resume refuses when the stored toggles give another manifest with the current registry', async () => {
    const snapshot = readSnapshot({}, { runId: crypto.randomUUID(), consumer: 'step' }, FIXTURE)
    await store.recordToolRun({ runId: snapshot.runId, snapshot })
    const stored = (await store.toolRunOf(snapshot.runId))!
    expect(resumeSnapshot(stored, FIXTURE).hash).toBe(snapshot.hash)
    const bumped = defineRegistry([readEntry('read_thing', { version: 2 }), ...BASE_ENTRIES.slice(1)])
    expect(() => resumeSnapshot(stored, bumped)).toThrow(/differs from the manifest/)
  })

  it('toggle_flip.hash_covers_consumer (repro sonnet/p6.mjs): two snapshots that differ only in the consumer have two hashes', () => {
    const [a, b, c] = (['step', 'agent', 'mcp_client'] as const).map(consumer => readSnapshot({}, { runId: 'same', consumer }))
    expect(new Set([a!.hash, b!.hash, c!.hash]).size).toBe(3)
    expect(readSnapshot({}, { runId: 'other', consumer: 'step' }).hash).toBe(a!.hash) // the run id is not in it
  })

  it('toggle_flip.off_entry_keeps_hash (repro sonnet/p6.mjs): a new registry entry that is off leaves the hash', () => {
    const before = readSnapshot({}, { runId: 'r', consumer: 'agent' }, FIXTURE)
    const grown = defineRegistry([...BASE_ENTRIES, slowPaidEntry('other_paid')]) // paid: off by default
    expect(readSnapshot({}, { runId: 'r', consumer: 'agent' }, grown).hash).toBe(before.hash)
    const on = defineRegistry([...BASE_ENTRIES, readEntry('other_read')])
    expect(readSnapshot({}, { runId: 'r', consumer: 'agent' }, on).hash).not.toBe(before.hash)
  })

  it('toggle_flip.no_tool_actions: no file in src/ calls toolActions', () => {
    const hits = files(join(REPO, 'src')).filter(f => readFileSync(f, 'utf8').includes('toolActions'))
    expect(hits).toEqual([])
  })

  it('toggle_flip.partial_toggles_parse (repro sonnet/p5.ts): partial toggles parse, and an unknown tool id does not', () => {
    expect(Toggles.safeParse({ toolsets: { research: false } }).success).toBe(true)
    expect(Toggles.safeParse({ tools: { run_create_node: true } }).success).toBe(true)
    expect(Toggles.safeParse({ tools: { run_create_node: true }, allowEffects: ['read', 'paid', 'db_write'] }).success).toBe(true)
    expect(Toggles.safeParse({ tools: { nope: true } }).success).toBe(false)
    expect(Toggles.safeParse({ toolsets: { nope: true } }).success).toBe(false)
    expect(Toggles.safeParse({ extra: 1 }).success).toBe(false)
    expect(() => readSnapshot({ HARNESS_TOOLS: '{"tools":{"nope":true}}' }, { runId: 'r', consumer: 'step' })).toThrow()
    expect(() => readSnapshot({ HARNESS_TOOLS: 'not json' }, { runId: 'r', consumer: 'step' })).toThrow(/not JSON/)
  })

  it('toggle_flip.run_row_before_first_call: the tool_runs row of an agent run exists before the CLI starts', async () => {
    resetSdk(fenceMessages())
    const snapshot = readSnapshot({}, { runId: crypto.randomUUID(), consumer: 'agent' })
    let rowAtCall: unknown
    sdkState.onCall = async () => {
      rowAtCall = await store.toolRunOf(snapshot.runId)
    }
    const out = await lockedClaudeAgent({ id: 'row', systemPrompt: 'x', snapshot, budget: BUDGET, store, env: agentEnv(markerCli().path) }).run('hi')
    expect(out.kind).toBe('ok')
    expect(rowAtCall).toMatchObject({ runId: snapshot.runId, snapshotHash: snapshot.hash, end: null })
    expect((await store.toolRunOf(snapshot.runId))!.end).not.toBeNull()
  })

  it('toggle_flip.run_row_no_update: harness_app cannot update or delete a tool_runs or tool_run_ends row, and the owner cannot either', async () => {
    const snapshot = readSnapshot({}, { runId: crypto.randomUUID(), consumer: 'step' })
    await store.recordToolRun({ runId: snapshot.runId, snapshot })
    await store.endToolRun({ runId: snapshot.runId, subtype: 'success', costUsd: 0, numTurns: 1, terminalReason: null, denials: [] })
    const app = db.pool(withUser(db.url, 'harness_app'))
    const owner = db.pool()
    for (const table of ['tool_runs', 'tool_run_ends']) {
      await expect(app.query(`update harness.${table} set run_id = run_id where run_id = $1`, [snapshot.runId])).rejects.toThrow(/permission denied/)
      await expect(app.query(`delete from harness.${table} where run_id = $1`, [snapshot.runId])).rejects.toThrow(/permission denied/)
      await expect(owner.query(`update harness.${table} set run_id = run_id where run_id = $1`, [snapshot.runId])).rejects.toThrow(/append-only/)
      await expect(owner.query(`delete from harness.${table} where run_id = $1`, [snapshot.runId])).rejects.toThrow(/append-only/)
      await expect(owner.query(`truncate harness.${table} cascade`)).rejects.toThrow(/append-only/)
    }
    // An equal row again is a no-op. Another row for the run throws.
    await expect(store.recordToolRun({ runId: snapshot.runId, snapshot })).resolves.toBeUndefined()
    const other = readSnapshot({}, { runId: snapshot.runId, consumer: 'agent' })
    await expect(store.recordToolRun({ runId: snapshot.runId, snapshot: other })).rejects.toThrow(/exists with another consumer/)
    await expect(store.endToolRun({ runId: snapshot.runId, subtype: 'error', costUsd: 0, numTurns: 1, terminalReason: null, denials: [] })).rejects.toThrow(/has another end/)
  })

  it('toggle_flip: toolFor refuses a tool that the snapshot turns off', () => {
    const snapshot = readSnapshot({ HARNESS_TOOLS: '{"toolsets":{"graph":false}}' }, { runId: 'r', consumer: 'step' }, FIXTURE)
    expect(() => toolFor('read_thing', snapshot, fixtureHandles(), FIXTURE)).toThrow(ToolOff)
    expect(REGISTRY.ids).toContain('get_node_context')
  })
})
