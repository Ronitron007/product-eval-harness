import { createWorkflow } from '@mastra/core/workflows'
import { describe, expect, it } from 'vitest'
import { judgeDraft, judgeStep, JudgeStepInput, JudgeStepOutput, type JudgeStepDeps } from '../../src/judge'
import type { VerdictInput } from '../../src/store/store'
import { planOf } from '../compiler/library'
import { GOOD_EVIDENCE, GOOD_OUTPUT } from '../compiler/rules'
import { ans, judgeOf, planRefs, rowRefs, type Spy } from './helpers'

// judge.types: the thin Mastra wrapper writes the rows, and returns the outcome as plain JSON.

function harness(items: unknown[], planHash?: string) {
  const written: VerdictInput[][] = []
  const spy: Spy = { calls: 0 }
  const plan = planOf()
  const deps: JudgeStepDeps = {
    store: { writeVerdicts: async rows => (written.push(rows), []) },
    planFor: async () => (planHash === undefined ? plan : { ...plan, ruleSetHash: planHash as never }),
    judgeModel: judgeOf(items, spy),
  }
  const workflow = createWorkflow({ id: 'judge-only', inputSchema: JudgeStepInput, outputSchema: JudgeStepOutput }).then(judgeStep(deps)).commit()
  const input = { runId: 'run-step', stage: 'create_node' as const, nodeId: 'sunscreen', ruleSetHash: plan.ruleSetHash, reply: JSON.stringify(GOOD_OUTPUT), evidence: GOOD_EVIDENCE }
  return { workflow, written, plan, input, spy }
}

describe('judge.types', () => {
  it('judge.types.mastra_step: each kind (accept, repair, person) comes through the step unchanged, and an unknown answer gives person', async () => {
    const cases = [
      ['accept', [ans('yes', '500 mg')]],
      ['repair', [ans('no', 'spf')]],
      ['person', [ans('unknown', '')]],
    ] as const
    for (const [kind, items] of cases) {
      const { workflow, plan, input } = harness([...items])
      const result = await (await workflow.createRun()).start({ inputData: input })
      expect(result.status).toBe('success')
      if (result.status !== 'success') return
      const { rows, ...direct } = await judgeDraft({ runId: input.runId, plan, reply: input.reply, evidence: input.evidence, judgeModel: judgeOf([...items]) })
      expect(rows.length).toBeGreaterThan(0)
      expect({ kind: result.result.kind }).toEqual({ kind })
      expect(result.result).toEqual(direct)
    }
  })

  it('judge.types.mastra_step: the step writes all rows in one call, and returns JSON with no rows', async () => {
    const { workflow, written, plan, input } = harness([ans('no', 'spf')])
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

  it('judge.types.mastra_step: a plan whose hash differs from the run fails the step before any model call, and writes nothing', async () => {
    const { workflow, written, input, spy } = harness([ans('yes', '500 mg')], 'b'.repeat(64))
    const result = await (await workflow.createRun()).start({ inputData: input })
    expect(result.status).toBe('failed')
    expect(spy.calls).toBe(0)
    expect(written).toEqual([])
  })
})
