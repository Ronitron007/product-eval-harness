import { z } from 'zod'
import { Busy, JudgeStepOutput, RoundOutcome, TIMING, type JudgeModel, type PlanFor, type StagePlan, type Timing } from '../judge'
import { RunEvidence } from '../rules/checks/define'
import { NodeId, Stage } from '../rules/schema'
import { VerdictInput, type DecisionRow as StoreDecisionRow, type DraftRow, type GraphStore, type RunEndInput } from '../store/store'

// The schemas and the ports of the stage workflow (stage.types in docs/design/stage-workflow.md).
// Each field of the loop state is JSON, so a workflow snapshot holds it (compile.limits).
// Timing, TIMING, Busy and RoundOutcome live in src/judge/mastra.ts, because the judge step owns
// the claim. This file gives them again for the stage code.

export { Busy, RoundOutcome, TIMING, type Timing }
export type { DraftRow, RunEndInput }

export const REPAIR_BUDGET = 3 // rounds: one draft and two repairs (mastra.stage_workflow)
export const Sha256 = z.string().regex(/^[0-9a-f]{64}$/)

export const StageInput = z.object({ nodeId: NodeId }).strict()

// The context bundle of graph.traversal that exists today. Records come with plan.research_tools.
export const NodeContext = z.object({
  path: z.array(z.object({ id: NodeId, label: z.string() })), // from the root down to the node
  siblings: z.array(z.object({ id: NodeId, label: z.string() })),
  instructions: z.string(), // plan.instructions: the strict and soft rules in scope
})
export type NodeContext = z.infer<typeof NodeContext>

// The loop state.
export const Round = z.object({
  runId: z.string().min(1),
  stage: Stage,
  nodeId: NodeId,
  ruleSetHash: Sha256,
  context: NodeContext,
  evidence: RunEvidence,
  round: z.number().int().min(0).max(REPAIR_BUDGET), // the rounds so far
  last: RoundOutcome.nullable(), // the outcome of the last round
})
export type Round = z.infer<typeof Round>

export const PersonPayload = z
  .object({
    runId: z.string().min(1),
    stage: Stage,
    nodeId: NodeId,
    ruleSetHash: Sha256,
    round: z.number().int().min(1).max(REPAIR_BUDGET),
    budget: z.literal(REPAIR_BUDGET),
    why: z.enum(['budget_spent', 'cannot_verify']),
    reply: z.unknown(), // the last draft, as the drafter gave it
    canAccept: z.boolean(), // false when the last draft broke the output schema
    errors: z.array(z.object({ from: z.string(), target: z.string(), fix: z.string() })),
    open: z.array(VerdictInput),
    warnings: z.array(z.object({ rule: z.string(), target: z.string(), kind: z.enum(['warning', 'note']), text: z.string() })),
    refusal: z.string().optional(), // set when a resume asked for what the payload forbids
  })
  .strict()
export type PersonPayload = z.infer<typeof PersonPayload>

// stage.person_payload: a reviewer or a note that is blank after a trim is refused.
const Filled = z.string().trim().min(1)
export const PersonDecision = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('accept'), reviewer: Filled, note: Filled.optional() }).strict(),
  z.object({ decision: z.literal('reject'), reviewer: Filled, note: Filled }).strict(),
])
export type PersonDecision = z.infer<typeof PersonDecision>

export const RunEnd = z.enum(['accepted', 'person_accepted', 'person_rejected'])
export const StageResult = z.object({ runId: z.string(), end: RunEnd, round: z.number().int().min(1), outputId: z.string().nullable() }).strict()
export type StageResult = z.infer<typeof StageResult>
// A retryable result: start the run id again after retryAfterMs. It is never failed (stage.judge_wait).
export const StageBusy = z.object({ runId: z.string(), busy: z.literal(true), round: z.number().int().min(1), retryAfterMs: z.number().int().min(0) }).strict()
export type StageBusy = z.infer<typeof StageBusy>
export const StageRunResult = z.union([StageResult, StageBusy])

// The input of the judge step (src/judge/mastra.ts): the draft step gives the round.
export { JudgeStepInput } from '../judge'

// ---- ports ----
export interface ResearchInput {
  readonly runId: string
  readonly stage: Stage
  readonly nodeId: NodeId
  readonly context: NodeContext
}
export type ResearchPort = (input: ResearchInput) => Promise<RunEvidence>

export interface DraftInput {
  readonly runId: string
  readonly round: number
  readonly plan: StagePlan
  readonly evidence: RunEvidence
  readonly context: NodeContext
  readonly errors: Extract<JudgeStepOutput, { kind: 'repair' }>['errors'] // the strict errors of the last round, as JSON
}
export interface Drafter {
  readonly id: string // provider/model, kept on each draft row
  draft(input: DraftInput): Promise<unknown> // the raw reply: draft.object, else draft.text
}

// stage.decision_first: one row for each run, written before assimilate runs.
export type DecisionRow = StoreDecisionRow

// The calls of the graph store that the stage workflow uses (stage.store).
export type StageStore = Pick<
  GraphStore,
  | 'recordStageRun'
  | 'pathToRoot'
  | 'siblings'
  | 'stageRun'
  | 'addDraft'
  | 'withDraftLock'
  | 'draftOf'
  | 'writeVerdicts'
  | 'verdictsOf'
  | 'claimJudge'
  | 'addDecision'
  | 'decisionOf'
  | 'runEndOf'
  | 'endRun'
>

export interface StageDeps {
  readonly store: StageStore
  readonly planFor: PlanFor
  readonly research: ResearchPort
  readonly drafter: Drafter
  readonly judgeModel: JudgeModel
  readonly timing?: Timing // tests give short times. Default TIMING.
}
