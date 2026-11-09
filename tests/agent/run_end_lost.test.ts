import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { lockedClaudeAgent } from '../../src/agent'
import { createGraphStore, type GraphStore } from '../../src/store/store'
import { applyMigrations, freshDatabase, MIGRATIONS_DIR, pgDump, withUser, type TestDatabase } from '../db'
import { agentEnv, agentSnapshot, BUDGET, fenceMessages, recordingCli, replayCli, withResult } from './helpers'

// run_end_lost: a run end, its cost, or its denials are lost (tools.run_record). These tests run
// the real Agent SDK against a fake CLI that replays recorded messages. No model, no network.

let db: TestDatabase
let store: GraphStore
beforeAll(async () => {
  db = await freshDatabase()
  store = createGraphStore(db.pool(withUser(db.url, 'harness_app')))
})
afterAll(async () => {
  await db?.drop()
})

async function runWith(cli: string) {
  const snapshot = agentSnapshot()
  const out = await lockedClaudeAgent({ id: 'replay', systemPrompt: 'You are a test agent.', snapshot, budget: BUDGET, store, env: agentEnv(cli) }).run('hi')
  return { out, row: await store.toolRunOf(snapshot.runId), snapshot }
}

describe('run_end_lost', () => {
  it('run_end_lost.end_on_success (repro sonnet/p9.ts): the replay of fence-2.ndjson stores the cost, 3 turns, and 1 denial', async () => {
    const { out, row, snapshot } = await runWith(replayCli(fenceMessages()))
    expect(out.kind).toBe('ok')
    expect(row).toMatchObject({ runId: snapshot.runId, consumer: 'agent', snapshotHash: snapshot.hash, allowedTools: ['mcp__harness__get_node_context'] })
    expect(row!.end).toMatchObject({ subtype: 'success', costUsd: 0.00065623, numTurns: 3, terminalReason: 'completed' })
    expect(row!.end!.denials).toEqual([{ tool_name: 'mcp__harness__save_record', tool_use_id: 'toolu_B', tool_input: { text: 'x' } }])
    expect(out.end).toEqual({ costUsd: 0.00065623, numTurns: 3, terminalReason: 'completed', subtype: 'success', denials: row!.end!.denials })
  })

  it('run_end_lost.end_on_budget_error (repro sonnet/p9.ts): a replay that ends with error_max_budget_usd stores that subtype', async () => {
    const patch = { subtype: 'error_max_budget_usd', is_error: true, errors: ['Reached maximum budget ($0.05)'], total_cost_usd: 0.051, num_turns: 4, terminal_reason: 'max_budget' }
    const { out, row } = await runWith(replayCli(withResult(patch)))
    expect(out).toMatchObject({ kind: 'failed', reason: expect.stringMatching(/Reached maximum budget/) })
    expect(row!.end).toMatchObject({ subtype: 'error_max_budget_usd', costUsd: 0.051, numTurns: 4, terminalReason: 'max_budget' })
    expect(row!.end!.denials).toHaveLength(1)
  })

  it('run_end_lost.end_on_throw: a run whose CLI exits with no result message stores an end with null fields', async () => {
    const { out, row } = await runWith(recordingCli().path)
    expect(out.kind).toBe('failed')
    expect(row!.end).toMatchObject({ subtype: null, costUsd: null, numTurns: null, terminalReason: null, denials: [] })
  })

  it('run_end_lost.migration_twice_same: a second run of 0005_tool_runs.sql changes nothing', async () => {
    const before = pgDump(db.url, ['--schema-only'])
    await applyMigrations(db.url, ['0005_tool_runs.sql'])
    expect(pgDump(db.url, ['--schema-only'])).toBe(before)
  })

  it('run_end_lost.guard_passes: the guard of 0005 passes on a clean database, and stops on a right for PUBLIC on a new table', async () => {
    const clean = await freshDatabase()
    try {
      await expect(applyMigrations(clean.url, ['0005_tool_runs.sql'])).resolves.toBeUndefined()
      const pool = clean.pool()
      await pool.query('create table harness.zz_new (id int); alter table harness.zz_new enable row level security; grant select on harness.zz_new to public')
      await expect(applyMigrations(clean.url, ['0005_tool_runs.sql'])).rejects.toThrow(/harness migration 0005: SELECT on relation harness.zz_new for PUBLIC/)
    } finally {
      await clean.drop()
    }
  })

  it('run_end_lost.guard_passes: 0005 refuses a database without harness_app or harness.refuse_change', async () => {
    const empty = await freshDatabase({ migrate: false })
    try {
      await expect(applyMigrations(empty.url, ['0005_tool_runs.sql'])).rejects.toThrow(/harness migration 0005: (the role harness_app is missing|harness.refuse_change\(\) is missing)/)
      const sql = readFileSync(join(MIGRATIONS_DIR, '0005_tool_runs.sql'), 'utf8')
      expect(sql).toMatch(/^begin;$/m)
      expect(sql).toMatch(/^commit;$/m)
    } finally {
      await empty.drop()
    }
  })
})
