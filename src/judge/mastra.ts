import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { NodeId, Stage } from '../rules/schema'
import { VerdictInput, type GraphStore } from '../store/store'
import { judgeDraft, type JudgeModel, type JudgeOutcome, type StagePlan } from './step'

// The thin Mastra wrapper of the judge step (judge.types). The plan holds a Zod schema and
// functions, so a workflow snapshot cannot hold it (compile.limits). The step compiles again in
// each round through planFor, and its output holds plain JSON only. @mastra/core 1.79.0,
// reference-workflows-step.md.

export const JudgeStepInput = z.object({
  runId: z.string().min(1),
  stage: Stage,
  nodeId: NodeId,
  ruleSetHash: z.string().regex(/^[0-9a-f]{64}$/, 'Give the lowercase sha256 hex rule-set hash of the run.'),
  reply: z.unknown(), // draft.object, else draft.text
  evidence: z.unknown(), // parsed with RunEvidence inside judgeDraft (judge.evidence_parsed)
})
export type JudgeStepInput = z.infer<typeof JudgeStepInput>

const RuleRefText = z.string().regex(/^.+@\d+$/)
const WarningJson = z.object({ rule: RuleRefText, target: z.string(), kind: z.enum(['warning', 'note']), text: z.string() })
const RepairErrorJson = z.object({ from: z.union([RuleRefText, z.literal('decode')]), target: z.string(), fix: z.string() })
export const JudgeStepOutput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('accept'), output: z.json(), warnings: z.array(WarningJson) }),
  z.object({ kind: z.literal('repair'), errors: z.array(RepairErrorJson), warnings: z.array(WarningJson) }),
  z.object({ kind: z.literal('person'), open: z.array(VerdictInput), warnings: z.array(WarningJson) }),
])
export type JudgeStepOutput = z.infer<typeof JudgeStepOutput>

// Compiles the plan of a run again. It refuses a hash that differs from the run (compile.usage.calls).
export type PlanFor = (run: { readonly runId: string; readonly stage: Stage; readonly nodeId: NodeId; readonly ruleSetHash: string }) => Promise<StagePlan>

export interface JudgeStepDeps {
  readonly store: Pick<GraphStore, 'writeVerdicts'>
  readonly planFor: PlanFor
  readonly judgeModel: JudgeModel
}

// The outcome as plain JSON. It drops the rows: the store holds them.
export function toStepOutput(outcome: JudgeOutcome): JudgeStepOutput {
  const warnings = [...outcome.warnings]
  switch (outcome.kind) {
    case 'accept':
      return { kind: 'accept', output: outcome.output, warnings }
    case 'repair':
      return { kind: 'repair', errors: [...outcome.errors], warnings }
    case 'person':
      return { kind: 'person', open: [...outcome.open], warnings }
    default: {
      const never: never = outcome
      return never
    }
  }
}

export function judgeStep(deps: JudgeStepDeps) {
  return createStep({
    id: 'judge',
    description: 'Runs the ruleset judge on one draft and returns the judge outcome.',
    inputSchema: JudgeStepInput,
    outputSchema: JudgeStepOutput,
    // No retries option. A retry would call each judge again, and a judge call is paid.
    execute: async ({ inputData }) => {
      const { runId, stage, nodeId, ruleSetHash, reply, evidence } = inputData
      const plan = await deps.planFor({ runId, stage, nodeId, ruleSetHash })
      if (plan.ruleSetHash !== ruleSetHash) throw new Error(`The rules changed during run ${runId}. Start a new run.`)
      const outcome = await judgeDraft({ runId, plan, reply, evidence, judgeModel: deps.judgeModel })
      await deps.store.writeVerdicts([...outcome.rows]) // one statement, all rows or none
      return toStepOutput(outcome)
    },
  })
}
