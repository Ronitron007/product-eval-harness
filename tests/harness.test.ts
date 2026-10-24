import { createStep, createWorkflow } from '@mastra/core/workflows'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createHarness } from '../src/mastra/harness'

const Count = z.object({ n: z.number() })

const double = createStep({
  id: 'double',
  inputSchema: Count,
  outputSchema: Count,
  execute: async ({ inputData }) => ({ n: inputData.n * 2 }),
})

const smoke = createWorkflow({ id: 'smoke', inputSchema: Count, outputSchema: Count }).then(double).commit()

describe('createHarness', () => {
  it('runs a workflow on in-memory LibSQL storage with no model call', async () => {
    const harness = createHarness({ databaseUrl: ':memory:', workflows: { smoke } })

    const run = await harness.getWorkflow('smoke').createRun()
    const result = await run.start({ inputData: { n: 21 } })

    expect(result.status).toBe('success')
    expect(result.status === 'success' && result.result).toEqual({ n: 42 })
  })

  it('stores the run in the Mastra storage', async () => {
    const harness = createHarness({ databaseUrl: ':memory:', workflows: { smoke } })

    const run = await harness.getWorkflow('smoke').createRun()
    await run.start({ inputData: { n: 1 } })
    const stored = await harness.getWorkflow('smoke').getWorkflowRunById(run.runId)

    expect(stored?.runId).toBe(run.runId)
  })
})
