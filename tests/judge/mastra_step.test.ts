import { createWorkflow } from '@mastra/core/workflows'
import { describe, expect, it } from 'vitest'
import { judgeStep, JudgeStepInput, JudgeStepOutput, type JudgeStepDeps } from '../../src/judge'
import type { VerdictInput } from '../../src/store/store'
import { planOf } from '../compiler/library'
import { GOOD_EVIDENCE, GOOD_OUTPUT } from '../compiler/rules'
import { ans, judgeOf, planRefs, rowRefs } from './helpers'

// judge.types: the thin Mastra wrapper writes the rows, and returns the outcome as plain JSON.

function harness(planHash?: string) {
  const written: VerdictInput[][] = []
  const plan = planOf()
  const deps: JudgeStepDeps = {
    store: { writeVerdicts: async rows => (written.push(rows), []) },
    planFor: async () => (planHash === undefined ? plan : { ...plan, ruleSetHash: planHash as never }),
    judgeModel: judgeOf([ans('no', 'spf')]),
  }
  const workflow = createWorkflow({ id: 'judge-only', inputSchema: JudgeStepInput, outputSchema: JudgeStepOutput }).then(judgeStep(deps)).commit()
  const input = { runId: 'run-step', stage: 'create_node' as const, nodeId: 'sunscreen', ruleSetHash: plan.ruleSetHash, reply: JSON.stringify(GOOD_OUTPUT), evidence: GOOD_EVIDENCE }
  return { workflow, written, plan, input }
}

describe('judge.types', () => {
  it('judge.types.mastra_step: the step writes all rows in one call, and returns the outcome as JSON with no rows', async () => {
    const { workflow, written, plan, input } = harness()
    const result = await (await workflow.createRun()).start({ inputData: input })
    expect(result.status).toBe('success')
    if (result.status !== 'success') return
    expect(result.result).toEqual({
      kind: 'repair',
      errors: [expect.objectContaining({ from: 'criteria.attribute_is_product@1', target: 'criteria[0].attributes[0]' })],
      warnings: [],
    })
    expect(JSON.parse(JSON.stringify(result.result))).toEqual(result.result)
    expect(written).toHaveLength(1)
    expect(rowRefs(written[0]!)).toEqual(planRefs(plan))
    expect(written[0]!.every(r => r.runId === 'run-step')).toBe(true)
  })

  it('judge.types.mastra_step: a plan whose hash differs from the run fails the step, and writes nothing', async () => {
    const { workflow, written, input } = harness('b'.repeat(64))
    const result = await (await workflow.createRun()).start({ inputData: input })
    expect(result.status).toBe('failed')
    expect(written).toEqual([])
  })
})
