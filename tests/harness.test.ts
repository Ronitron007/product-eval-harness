import { createStep, createWorkflow } from '@mastra/core/workflows'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createHarness, resolveDatabaseUrl } from '../src/mastra/harness'
import { freshDatabase, type TestDatabase } from './db'

const Count = z.object({ n: z.number() })

const double = createStep({
  id: 'double',
  inputSchema: Count,
  outputSchema: Count,
  execute: async ({ inputData }) => ({ n: inputData.n * 2 }),
})

const smoke = createWorkflow({ id: 'smoke', inputSchema: Count, outputSchema: Count }).then(double).commit()

describe('createHarness on PostgresStore', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await freshDatabase()
  })
  afterAll(async () => {
    await db?.drop()
  })

  it('runs a workflow on the migrated mastra schema, with init disabled and no model call', async () => {
    const harness = createHarness({ pool: db.pool(), workflows: { smoke } })

    const run = await harness.getWorkflow('smoke').createRun()
    const result = await run.start({ inputData: { n: 21 } })

    expect(result.status).toBe('success')
    expect(result.status === 'success' && result.result).toEqual({ n: 42 })
  })

  it('stores the run in Postgres, so a harness on a second pool reads it back', async () => {
    const writer = createHarness({ pool: db.pool(), workflows: { smoke } })
    const run = await writer.getWorkflow('smoke').createRun()
    await run.start({ inputData: { n: 1 } })

    const reader = createHarness({ pool: db.pool(), workflows: { smoke } })
    const stored = await reader.getWorkflow('smoke').getWorkflowRunById(run.runId)

    expect(stored?.runId).toBe(run.runId)
    expect(stored?.status).toBe('success')
  })
})

describe('disableInit', () => {
  let empty: TestDatabase
  beforeAll(async () => {
    empty = await freshDatabase({ migrate: false })
  })
  afterAll(async () => {
    await empty?.drop()
  })

  it('creates no table: init does nothing, and a run fails on the missing tables', async () => {
    const pool = empty.pool()
    const harness = createHarness({ pool, workflows: { smoke }, disableInit: true })
    await harness.getStorage()?.init()
    await expect(harness.getWorkflow('smoke').createRun()).rejects.toThrow(/mastra_workflow_snapshot" does not exist/)

    const { rows } = await pool.query<{ n: number }>(
      "select count(*)::int as n from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')",
    )
    expect(rows[0]!.n).toBe(0)
  })
})

describe('resolveDatabaseUrl', () => {
  it('accepts a Postgres URL', () => {
    expect(resolveDatabaseUrl('postgresql://harness_app@db.example.com:5432/postgres')).toBe('postgresql://harness_app@db.example.com:5432/postgres')
    expect(resolveDatabaseUrl('postgres://localhost/harness')).toBe('postgres://localhost/harness')
  })

  it('refuses a missing URL and a URL of another database', () => {
    expect(() => resolveDatabaseUrl(undefined)).toThrow(/Set HARNESS_DATABASE_URL/)
    expect(() => resolveDatabaseUrl('file:/data/harness.db')).toThrow(/must be a Postgres URL/)
  })
})
