import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStep, createWorkflow } from '@mastra/core/workflows'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createHarness, resolveDatabaseUrl } from '../src/mastra/harness'

const Count = z.object({ n: z.number() })

const double = createStep({
  id: 'double',
  inputSchema: Count,
  outputSchema: Count,
  execute: async ({ inputData }) => ({ n: inputData.n * 2 }),
})

const smoke = createWorkflow({ id: 'smoke', inputSchema: Count, outputSchema: Count }).then(double).commit()

const tempDirs: string[] = []
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('createHarness', () => {
  it('runs a workflow on in-memory LibSQL storage with no model call', async () => {
    const harness = createHarness({ databaseUrl: ':memory:', workflows: { smoke } })

    const run = await harness.getWorkflow('smoke').createRun()
    const result = await run.start({ inputData: { n: 21 } })

    expect(result.status).toBe('success')
    expect(result.status === 'success' && result.result).toEqual({ n: 42 })
  })

  it('stores the run in the LibSQL database, so a second harness reads it back', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-test-'))
    tempDirs.push(dir)
    const databaseUrl = `file:${join(dir, 'harness.db')}`

    const writer = createHarness({ databaseUrl, workflows: { smoke } })
    const run = await writer.getWorkflow('smoke').createRun()
    await run.start({ inputData: { n: 1 } })

    const reader = createHarness({ databaseUrl, workflows: { smoke } })
    const stored = await reader.getWorkflow('smoke').getWorkflowRunById(run.runId)

    expect(stored?.runId).toBe(run.runId)
    expect(stored?.status).toBe('success')
  })
})

describe('resolveDatabaseUrl', () => {
  it('accepts an absolute file URL and a remote URL', () => {
    expect(resolveDatabaseUrl('file:/data/harness.db')).toBe('file:/data/harness.db')
    expect(resolveDatabaseUrl('libsql://harness.example.com')).toBe('libsql://harness.example.com')
  })

  it('refuses a missing URL and a relative file URL', () => {
    expect(() => resolveDatabaseUrl(undefined)).toThrow(/Set HARNESS_DATABASE_URL/)
    expect(() => resolveDatabaseUrl('file:./harness.db')).toThrow(/absolute file URL/)
  })
})
