// Probe, runnable copy of sketch.ts: the declared functions get small fakes. The types and the workflow sketch of docs/design/stage-workflow.md, against @mastra/core 1.79.0.
import { Agent } from '@mastra/core/agent'
import { Mastra } from '@mastra/core/mastra'
import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import type { JudgeModel, StagePlan } from '../../../../src/compiler'
import { JudgeStepOutput, type PlanFor } from '../../../../src/judge'
import { RunEvidence } from '../../../../src/rules/checks/define'
import { NodeId, Stage } from '../../../../src/rules/schema'
import { VerdictInput, type GraphStore } from '../../../../src/store/store'

// ---- types (src/stage/types.ts) ----
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

// The loop state. Each field is JSON, so the snapshot holds it (compile.limits).
export const Round = z.object({
  runId: z.string().min(1),
  stage: Stage,
  nodeId: NodeId,
  ruleSetHash: Sha256,
  context: NodeContext,
  evidence: RunEvidence,
  round: z.number().int().min(0).max(REPAIR_BUDGET), // the rounds so far
  last: JudgeStepOutput.nullable(), // the outcome of the last round
})
export type Round = z.infer<typeof Round>

export const PersonPayload = z.object({
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
}).strict()
export type PersonPayload = z.infer<typeof PersonPayload>

export const PersonDecision = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('accept'), reviewer: z.string().min(1), note: z.string().optional() }).strict(),
  z.object({ decision: z.literal('reject'), reviewer: z.string().min(1), note: z.string().min(1) }).strict(),
])
export type PersonDecision = z.infer<typeof PersonDecision>

export const RunEnd = z.enum(['accepted', 'person_accepted', 'person_rejected'])
export const StageResult = z.object({ runId: z.string(), end: RunEnd, round: z.number().int().min(1), outputId: z.string().nullable() }).strict()

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

export type RunEndInput =
  | { readonly runId: string; readonly round: number; readonly end: 'accepted'; readonly output: unknown }
  | { readonly runId: string; readonly round: number; readonly end: 'person_accepted'; readonly reviewer: string; readonly note?: string; readonly output: unknown }
  | { readonly runId: string; readonly round: number; readonly end: 'person_rejected'; readonly reviewer: string; readonly note: string }
export interface DraftRow { runId: string; round: number; reply: unknown; drafter: string }
export interface StageStore extends Pick<GraphStore, 'recordStageRun' | 'pathToRoot' | 'siblings'> {
  stageRun(runId: string): Promise<{ runId: string; ruleSetHash: string } | undefined>
  addDraft(row: DraftRow): Promise<void>
  draftOf(runId: string, round: number): Promise<DraftRow | undefined>
  // The judge step: the rows of one round. writeVerdicts of GraphStore gets the round (stage.round_rows).
  writeVerdicts(rows: readonly VerdictInput[], round: number): Promise<unknown>
  verdictsOf(runId: string, round: number): Promise<readonly VerdictInput[]>
  // One transaction: the run_ends row, then the output for an accepting end (stage.end_once).
  endRun(input: RunEndInput): Promise<{ outputId: string | null }>
}

export interface StageDeps {
  readonly store: StageStore
  readonly planFor: PlanFor
  readonly research: ResearchPort
  readonly drafter: Drafter
  readonly judgeModel: JudgeModel
}

// The agent adapter for a real drafter (plan.stage_workflow). errorStrategy warn keeps a bad reply.
export function agentDrafter(agent: Agent, id: string): Drafter {
  return {
    id,
    async draft({ plan, evidence, context, errors }) {
      const prompt = JSON.stringify({ context, evidence, errors })
      const out = await agent.generate(prompt, { structuredOutput: { schema: plan.schema, errorStrategy: 'warn' } })
      return out.object !== undefined ? out.object : out.text
    },
  }
}

// ---- the workflow (prototype with REAL planOrThrow, checkModels, judge step per stage.rerun_reuses) ----
import { decideOutcome, judgeDraft, toStepOutput } from '../../../../src/judge'
export class RulesRefused extends Error {}
export async function planOrThrow(deps: StageDeps, run: { runId: string; stage: Stage; nodeId: NodeId; ruleSetHash?: string }): Promise<StagePlan> {
  const plan = await deps.planFor({ runId: run.runId, stage: run.stage, nodeId: run.nodeId, ruleSetHash: run.ruleSetHash as never })
  if (run.ruleSetHash !== undefined && plan.ruleSetHash !== run.ruleSetHash) throw new Error(`The rules changed during run ${run.runId}. Start a new run.`)
  return plan
}
export function checkModels(drafterId: string, judgeId: string): void {
  const re = /^[^/]+\/.+$/
  if (!re.test(drafterId) || !re.test(judgeId)) throw new Error('model id must be provider/model')
  if (drafterId.split('/')[0] === judgeId.split('/')[0]) throw new Error('same provider')
}
export const JudgeStepInput = z.object({ runId: z.string().min(1), stage: Stage, nodeId: NodeId, ruleSetHash: Sha256, round: z.number().int().min(1), reply: z.unknown(), evidence: z.unknown() })
function judgeStep(deps: StageDeps) {
  return createStep({
    id: 'judge', inputSchema: JudgeStepInput, outputSchema: JudgeStepOutput,
    execute: async ({ inputData }) => {
      const { runId, stage, nodeId, ruleSetHash, round, reply, evidence } = inputData
      const plan = await deps.planFor({ runId, stage, nodeId, ruleSetHash })
      if (plan.ruleSetHash !== ruleSetHash) throw new Error(`The rules changed during run ${runId}. Start a new run.`)
      const stored = await deps.store.verdictsOf(runId, round)
      if (stored.length > 0) {
        const statements = new Map<any, string>()
        for (const s of [...plan.scorers.code, ...plan.scorers.judges(deps.judgeModel)]) statements.set(s.id, s.rule.statement)
        return toStepOutput(decideOutcome({ decoded: plan.decode(reply), rows: stored, statements }))
      }
      const outcome = await judgeDraft({ runId, plan, reply, evidence, judgeModel: deps.judgeModel })
      await deps.store.writeVerdicts([...outcome.rows], round)
      return toStepOutput(outcome)
    },
  })
}

export function stageWorkflow(stage: Stage, deps: StageDeps) {
  const context = createStep({
    id: 'context',
    inputSchema: StageInput,
    outputSchema: Round.pick({ runId: true, stage: true, nodeId: true, ruleSetHash: true, context: true }),
    execute: async ({ inputData, runId }) => {
      checkModels(deps.drafter.id, deps.judgeModel.id) // before any compile, write, or model call
      const plan = await planOrThrow(deps, { runId, stage, nodeId: inputData.nodeId })
      const known = await deps.store.stageRun(runId)
      if (known === undefined) await deps.store.recordStageRun({ runId, stage, nodeId: inputData.nodeId, ruleSetHash: plan.ruleSetHash })
      else if (known.ruleSetHash !== plan.ruleSetHash) throw new Error(`The rules changed during run ${runId}. Start a new run.`)
      const [path, siblings] = await Promise.all([deps.store.pathToRoot(inputData.nodeId), deps.store.siblings(inputData.nodeId)])
      const pick = (n: { id: string; label: string }) => ({ id: n.id, label: n.label })
      const context = { path: path.map(pick), siblings: siblings.map(pick), instructions: plan.instructions }
      return { runId, stage, nodeId: inputData.nodeId, ruleSetHash: plan.ruleSetHash, context }
    },
  })

  const research = createStep({
    id: 'research',
    inputSchema: context.outputSchema,
    outputSchema: Round,
    execute: async ({ inputData }) => {
      const evidence = RunEvidence.parse(await deps.research(inputData))
      return { ...inputData, evidence, round: 0, last: null }
    },
  })

  const draft = createStep({
    id: 'draft',
    inputSchema: Round,
    outputSchema: JudgeStepInput,
    execute: async ({ inputData }) => {
      const round = inputData.round + 1
      if (round > REPAIR_BUDGET) throw new Error('The repair budget is spent. The loop must not start another round.')
      const plan = await planOrThrow(deps, inputData)
      const kept = await deps.store.draftOf(inputData.runId, round)
      const errors = inputData.last?.kind === 'repair' ? inputData.last.errors : []
      const reply = kept !== undefined ? kept.reply : await deps.drafter.draft({ runId: inputData.runId, round, plan, evidence: inputData.evidence, context: inputData.context, errors })
      if (kept === undefined) await deps.store.addDraft({ runId: inputData.runId, round, reply, drafter: deps.drafter.id })
      return { runId: inputData.runId, stage: inputData.stage, nodeId: inputData.nodeId, ruleSetHash: inputData.ruleSetHash, round, reply, evidence: inputData.evidence }
    },
  })

  const draftAndJudge = createWorkflow({ id: `${stage}.draft_and_judge`, inputSchema: Round, outputSchema: Round })
    .then(draft)
    .then(judgeStep(deps))
    .map(async ({ inputData, getInitData }) => {
      const before = getInitData<Round>()
      return { ...before, round: before.round + 1, last: inputData }
    })
    .commit()

  const person = createStep({
    id: 'person',
    inputSchema: Round,
    outputSchema: Round.omit({ context: true, evidence: true, last: true }).extend({ decision: PersonDecision.nullable() }),
    suspendSchema: PersonPayload,
    resumeSchema: PersonDecision,
    execute: async ({ inputData, resumeData, suspend }) => {
      const last = inputData.last
      if (last === null) throw new Error('The loop ended with no round.')
      const { context: _c, evidence: _e, last: _l, ...run } = inputData
      if (last.kind === 'accept') return { ...run, decision: null }
      const plan = await planOrThrow(deps, inputData) // stage.hash_on_resume: also on the first pass
      const kept = await deps.store.draftOf(inputData.runId, inputData.round)
      const payload: PersonPayload = {
        runId: inputData.runId, stage: inputData.stage, nodeId: inputData.nodeId, ruleSetHash: inputData.ruleSetHash,
        round: inputData.round, budget: REPAIR_BUDGET, why: last.kind === 'repair' ? 'budget_spent' : 'cannot_verify',
        reply: kept?.reply, canAccept: kept !== undefined && plan.decode(kept.reply).ok,
        errors: last.kind === 'repair' ? last.errors : [], open: last.kind === 'person' ? last.open : [], warnings: last.warnings,
      }
      if (resumeData === undefined) return await suspend(payload)
      if (resumeData.decision === 'accept' && !payload.canAccept) {
        return await suspend({ ...payload, refusal: 'The last draft breaks the output schema, so a person cannot accept it. Reject it.' })
      }
      return { ...run, decision: resumeData }
    },
  })

  const assimilate = createStep({
    id: 'assimilate',
    inputSchema: person.outputSchema,
    outputSchema: StageResult,
    execute: async ({ inputData }) => {
      const plan = await planOrThrow(deps, inputData)
      const kept = await deps.store.draftOf(inputData.runId, inputData.round)
      const d = inputData.decision
      if (d?.decision === 'reject') {
        await deps.store.endRun({ runId: inputData.runId, round: inputData.round, end: 'person_rejected', reviewer: d.reviewer, note: d.note })
        return { runId: inputData.runId, end: 'person_rejected' as const, round: inputData.round, outputId: null }
      }
      const decoded = plan.decode(kept?.reply)
      if (!decoded.ok) throw new Error('The draft breaks the output schema. It never reaches acceptOutput.')
      const ended = d === null
        ? await deps.store.endRun({ runId: inputData.runId, round: inputData.round, end: 'accepted', output: decoded.output })
        : await deps.store.endRun({ runId: inputData.runId, round: inputData.round, end: 'person_accepted', reviewer: d.reviewer, note: d.note, output: decoded.output })
      return { runId: inputData.runId, end: d === null ? ('accepted' as const) : ('person_accepted' as const), round: inputData.round, outputId: ended.outputId }
    },
  })

  return createWorkflow({ id: stage, description: `The stage ${stage} at one node (graph.stage).`, inputSchema: StageInput, outputSchema: StageResult })
    .then(context)
    .then(research)
    .dountil(draftAndJudge, async ({ inputData, iterationCount }) => inputData.last?.kind !== 'repair' || iterationCount >= REPAIR_BUDGET)
    .then(person)
    .then(assimilate)
    .commit()
}

