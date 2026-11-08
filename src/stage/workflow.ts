import { parseModelString } from '@mastra/core/llm'
import { createStep, createWorkflow } from '@mastra/core/workflows'
import { judgeRound, type StagePlan } from '../judge'
import { RunEvidence } from '../rules/checks/define'
import type { NodeId, Stage } from '../rules/schema'
import { DraftOutput, PersonDecision, PersonPayload, REPAIR_BUDGET, Round, RoundOutcome, StageInput, StageResult, StageRunResult, TIMING, type StageDeps } from './types'

// The stage workflow (docs/design/stage-workflow.md, stage.workflow): one Mastra workflow for each
// stage. context, research, the repair loop of draft_and_judge, person, assimilate. Each top-level
// step reads the run end first and returns the stored end (stage.reuse_end). The loop and the
// person step read only the kind of the judge outcome (stage.loop_on_outcome). @mastra/core 1.79.0,
// reference-workflows-workflow-methods-dountil.md, docs-workflows-suspend-and-resume.md.

// Compiles the plan of a run again. planFor throws RulesRefused with all problems when the compile
// refuses. A run with a hash refuses a plan with another hash (stage.hash_on_resume).
export async function planOrThrow(deps: StageDeps, run: { runId: string; stage: Stage; nodeId: NodeId; ruleSetHash?: string }): Promise<StagePlan> {
  const plan = await deps.planFor({ runId: run.runId, stage: run.stage, nodeId: run.nodeId, ruleSetHash: run.ruleSetHash ?? '' })
  if (run.ruleSetHash !== undefined && plan.ruleSetHash !== run.ruleSetHash) throw new Error(`The rules changed during run ${run.runId}. Start a new run.`)
  return plan
}

// stage.models_by_vendor: the vendor behind a model id. A gateway id, such as openrouter/anthropic/x,
// names its vendor first in the model part.
export function vendorOf(id: string): string {
  const { provider, modelId } = parseModelString(id)
  if (!provider || !modelId) throw new Error(`The model id ${JSON.stringify(id)} is not provider/model. Set HARNESS_DRAFTER_MODEL and HARNESS_JUDGE_MODEL.`)
  return modelId.includes('/') ? modelId.split('/')[0]! : provider
}

export function checkModels(drafterId: string, judgeId: string): void {
  if (vendorOf(drafterId) === vendorOf(judgeId)) throw new Error(`The judge ${judgeId} and the drafter ${drafterId} have one vendor. Use a judge from another vendor (mastra.models).`)
}

// stage.decision_first: the body of assimilate, and the operator path of scripts/finish-run.ts.
// It reads the decision row, not its input, so a second call gives the same end. A stored end comes
// back unchanged.
export async function finishRun(deps: StageDeps, run: { runId: string; stage: Stage; nodeId: NodeId; ruleSetHash: string; round: number }): Promise<StageResult> {
  const ended = await deps.store.runEndOf(run.runId)
  if (ended !== undefined) return ended
  const plan = await planOrThrow(deps, run)
  const kept = await deps.store.draftOf(run.runId, run.round)
  const d = await deps.store.decisionOf(run.runId)
  if (d !== undefined && d.round !== run.round) throw new Error(`The decision of run ${run.runId} is for round ${d.round}, not ${run.round}.`)
  if (d?.decision === 'reject') return deps.store.endRun({ runId: run.runId, round: run.round, end: 'person_rejected', reviewer: d.reviewer, note: d.note })
  const decoded = plan.decode(kept?.reply)
  if (!decoded.ok) throw new Error('The draft breaks the output schema. It never reaches acceptOutput.')
  return d === undefined
    ? deps.store.endRun({ runId: run.runId, round: run.round, end: 'accepted', output: decoded.output })
    : deps.store.endRun({ runId: run.runId, round: run.round, end: 'person_accepted', reviewer: d.reviewer, ...(d.note !== undefined ? { note: d.note } : {}), output: decoded.output })
}

// The steps of one stage. stageWorkflow composes them. A test can run one step on its own.
export function stageSteps(stage: Stage, deps: StageDeps) {
  const context = createStep({
    id: 'context',
    description: 'Compiles the rules, records the stage run, and reads the node context.',
    inputSchema: StageInput,
    outputSchema: Round.pick({ runId: true, stage: true, nodeId: true, ruleSetHash: true, context: true }),
    execute: async ({ inputData, runId, bail }) => {
      const ended = await deps.store.runEndOf(runId) // stage.reuse_end: a second start, a restart, or the boot sweep
      if (ended !== undefined) return bail(ended)
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

  // stage.research_port: bad evidence fails the step before any draft.
  const research = createStep({
    id: 'research',
    description: 'Gets the run evidence from the research port.',
    inputSchema: context.outputSchema,
    outputSchema: Round,
    execute: async ({ inputData, bail }) => {
      const ended = await deps.store.runEndOf(inputData.runId)
      if (ended !== undefined) return bail(ended)
      const evidence = RunEvidence.parse(await deps.research(inputData))
      return { ...inputData, evidence, round: 0, last: null }
    },
  })

  // stage.draft_log, stage.rerun_reuses, stage.draft_claim: the reply is in the store before the
  // judge step runs. Only the winner of the draft claim calls the drafter. A loser waits up to one
  // lease for the draft, takes a new attempt when the claim expires, or gives busy. No connection
  // stays open across the model call.
  const draft = createStep({
    id: 'draft',
    description: 'Writes one draft of the round, or reuses the stored draft.',
    inputSchema: Round,
    outputSchema: DraftOutput,
    execute: async ({ inputData }) => {
      const { runId } = inputData
      const round = inputData.round + 1
      if (round > REPAIR_BUDGET) throw new Error('The repair budget is spent. The loop must not start another round.')
      const plan = await planOrThrow(deps, inputData)
      const out = (reply: unknown) => ({ runId, stage: inputData.stage, nodeId: inputData.nodeId, ruleSetHash: inputData.ruleSetHash, round, reply, evidence: inputData.evidence })
      const t = deps.timing ?? TIMING
      const stored = await deps.store.draftOf(runId, round)
      if (stored !== undefined) return out(stored.reply)
      let attempt = await deps.store.claimDraft(runId, round, t.claimLeaseMs)
      for (const until = Date.now() + t.claimLeaseMs; attempt === null && Date.now() < until; ) {
        await sleep(t.pollMs)
        const kept = await deps.store.draftOf(runId, round)
        if (kept !== undefined) return out(kept.reply)
        attempt = await deps.store.claimDraft(runId, round, t.claimLeaseMs)
      }
      if (attempt === null) {
        const kept = await deps.store.draftOf(runId, round) // claimDraft also gives null once the draft exists
        return kept !== undefined ? out(kept.reply) : { busy: { kind: 'busy' as const, retryAfterMs: t.claimLeaseMs }, round }
      }
      const errors = inputData.last?.kind === 'repair' ? inputData.last.errors : []
      const reply = await deps.drafter.draft({ runId, round, plan, evidence: inputData.evidence, context: inputData.context, errors })
      try {
        await deps.store.addDraft({ runId, round, reply, drafter: deps.drafter.id })
      } catch (e) {
        const kept = await deps.store.draftOf(runId, round) // the primary key: a later attempt wrote first
        if (kept === undefined) throw e
        return out(kept.reply)
      }
      return out(reply)
    },
  })

  // The judge step of the loop: busy from the draft step passes through, with no judge call.
  const judge = createStep({
    id: 'judge',
    description: 'Runs the ruleset judge on one draft of one round and returns the judge outcome.',
    inputSchema: DraftOutput,
    outputSchema: RoundOutcome,
    // No retries option. A retry would call each judge again, and a judge call is paid.
    execute: async ({ inputData }) => ('busy' in inputData ? inputData.busy : judgeRound(deps, inputData)),
  })

  const draftAndJudge = createWorkflow({ id: `${stage}.draft_and_judge`, inputSchema: Round, outputSchema: Round })
    .then(draft)
    .then(judge)
    .map(async ({ inputData, getInitData }) => {
      const before = getInitData<Round>()
      return { ...before, round: before.round + 1, last: inputData }
    })
    .commit()

  // stage.person_payload, stage.hash_on_resume, stage.decision_first
  const person = createStep({
    id: 'person',
    description: 'Passes an accepted draft on. Otherwise it waits for a person to accept or reject.',
    inputSchema: Round,
    outputSchema: Round.omit({ context: true, evidence: true, last: true }).extend({ decision: PersonDecision.nullable() }),
    suspendSchema: PersonPayload,
    resumeSchema: PersonDecision,
    execute: async ({ inputData, resumeData, suspend, bail }) => {
      const ended = await deps.store.runEndOf(inputData.runId)
      if (ended !== undefined) return bail(ended)
      const last = inputData.last
      if (last === null) throw new Error('The loop ended with no round.')
      if (last.kind === 'busy') return bail({ runId: inputData.runId, busy: true, round: inputData.round, retryAfterMs: last.retryAfterMs }) // stage.judge_wait
      const { context: _c, evidence: _e, last: _l, ...run } = inputData
      if (last.kind === 'accept') return { ...run, decision: null }
      const plan = await planOrThrow(deps, inputData) // stage.hash_on_resume: also on the first pass
      const kept = await deps.store.draftOf(inputData.runId, inputData.round)
      const payload: PersonPayload = {
        runId: inputData.runId,
        stage: inputData.stage,
        nodeId: inputData.nodeId,
        ruleSetHash: inputData.ruleSetHash,
        round: inputData.round,
        budget: REPAIR_BUDGET,
        why: last.kind === 'repair' ? 'budget_spent' : 'cannot_verify',
        reply: kept?.reply,
        canAccept: kept !== undefined && plan.decode(kept.reply).ok,
        errors: last.kind === 'repair' ? last.errors : [],
        open: last.kind === 'person' ? last.open : [],
        warnings: last.warnings,
      }
      if (resumeData === undefined) return await suspend(payload)
      if (resumeData.decision === 'accept' && !payload.canAccept) {
        return await suspend({ ...payload, refusal: 'The last draft breaks the output schema, so a person cannot accept it. Reject it.' })
      }
      await deps.store.addDecision({ runId: inputData.runId, round: inputData.round, ...resumeData }) // stage.decision_first
      return { ...run, decision: resumeData }
    },
  })

  const assimilate = createStep({
    id: 'assimilate',
    description: 'Writes the run end and, for an accept, the output.',
    inputSchema: person.outputSchema,
    outputSchema: StageResult,
    // It reads the decision row, not its input, so a retry gives the same end (stage.decision_first).
    execute: async ({ inputData }) => finishRun(deps, inputData),
  })

  return { context, research, draft, judge, draftAndJudge, person, assimilate }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export function stageWorkflow(stage: Stage, deps: StageDeps) {
  const { context, research, draftAndJudge, person, assimilate } = stageSteps(stage, deps)
  return createWorkflow({ id: stage, description: `The stage ${stage} at one node (graph.stage).`, inputSchema: StageInput, outputSchema: StageRunResult })
    .then(context)
    .then(research)
    .dountil(draftAndJudge, async ({ inputData, iterationCount }) => inputData.last?.kind !== 'repair' || iterationCount >= REPAIR_BUDGET)
    .then(person)
    .then(assimilate)
    .commit()
}
