import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { NodeId, Stage } from '../rules/schema'
import { VerdictInput, type GraphStore } from '../store/store'
import { decideOutcome, judgeDraft, toStepOutput, type JudgeModel, type StagePlan } from './step'

// The thin Mastra wrapper of the judge step (judge.types). The plan holds a Zod schema and
// functions, so a workflow snapshot cannot hold it (compile.limits). The step compiles again in
// each round through planFor, and its output holds plain JSON only. It writes the rows of each
// round with the round, reuses stored rows, and takes a judge claim before any judge call
// (stage.round_rows, stage.judge_claim). @mastra/core 1.79.0, reference-workflows-step.md.

export const JudgeStepInput = z.object({
  runId: z.string().min(1),
  stage: Stage,
  nodeId: NodeId,
  ruleSetHash: z.string().regex(/^[0-9a-f]{64}$/, 'Give the lowercase sha256 hex rule-set hash of the run.'),
  round: z.number().int().min(1), // stage.round_rows: the draft step gives it
  reply: z.unknown(), // draft.object, else draft.text
  evidence: z.unknown(), // parsed with RunEvidence inside judgeDraft (judge.evidence_parsed)
})
export type JudgeStepInput = z.infer<typeof JudgeStepInput>

const RuleRefText = z.string().regex(/^.+@\d+$/)
const WarningJson = z.object({ rule: RuleRefText, target: z.string(), kind: z.enum(['warning', 'note']), text: z.string() })
const RepairErrorJson = z.object({ from: z.union([RuleRefText, z.literal('decode')]), target: z.string(), fix: z.string() })
// The schema of the output of toStepOutput (src/judge/step.ts, a runtime file: judge.runtime_pinned).
export const JudgeStepOutput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('accept'), output: z.json(), warnings: z.array(WarningJson) }),
  z.object({ kind: z.literal('repair'), errors: z.array(RepairErrorJson), warnings: z.array(WarningJson) }),
  z.object({ kind: z.literal('person'), open: z.array(VerdictInput), warnings: z.array(WarningJson) }),
])
export type JudgeStepOutput = z.infer<typeof JudgeStepOutput>

// Compiles the plan of a run again. It refuses a hash that differs from the run (compile.usage.calls).
export type PlanFor = (run: { readonly runId: string; readonly stage: Stage; readonly nodeId: NodeId; readonly ruleSetHash: string }) => Promise<StagePlan>

// stage.claim_lease, stage.judge_wait: the claim lease is longer than the judge deadline.
export interface Timing {
  readonly claimLeaseMs: number // a new attempt can take a claim older than this. A loser waits at most this long.
  readonly judgeDeadlineMs: number // a winner that judged for longer writes nothing, and its step fails
  readonly pollMs: number // a loser reads the rows at this interval
}
export const TIMING: Timing = { claimLeaseMs: 15 * 60_000, judgeDeadlineMs: 10 * 60_000, pollMs: 2_000 }

// stage.judge_wait: the outcome of a round whose judge runs in another process, after one lease.
export const Busy = z.object({ kind: z.literal('busy'), retryAfterMs: z.number().int().min(0) }).strict()
export const RoundOutcome = z.union([JudgeStepOutput, Busy])
export type RoundOutcome = z.infer<typeof RoundOutcome>

export interface JudgeStepDeps {
  readonly store: Pick<GraphStore, 'writeVerdicts' | 'verdictsOf' | 'claimJudge'>
  readonly planFor: PlanFor
  readonly judgeModel: JudgeModel
  readonly timing?: Timing // tests give short times. Default TIMING.
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function planOf(deps: JudgeStepDeps, input: JudgeStepInput): Promise<StagePlan> {
  const { runId, stage, nodeId, ruleSetHash } = input
  const plan = await deps.planFor({ runId, stage, nodeId, ruleSetHash })
  if (plan.ruleSetHash !== ruleSetHash) throw new Error(`The rules changed during run ${runId}. Start a new run.`)
  return plan
}

// judgeDraft with the judge model, with no write.
async function judgeOnce(deps: JudgeStepDeps, input: JudgeStepInput, plan: StagePlan): Promise<{ rows: readonly VerdictInput[]; output: JudgeStepOutput }> {
  const outcome = await judgeDraft({ runId: input.runId, plan, reply: input.reply, evidence: input.evidence, judgeModel: deps.judgeModel })
  return { rows: outcome.rows, output: toStepOutput(outcome) }
}

// stage.rerun_reuses: decideOutcome on the stored rows of a round and plan.decode of the reply.
// No model: the judge scorers only give the statement of each rule (judge.fail_fix).
function outcomeOf(deps: JudgeStepDeps, plan: StagePlan, input: JudgeStepInput, rows: readonly VerdictInput[]): JudgeStepOutput {
  const statements = new Map([...plan.scorers.code, ...plan.scorers.judges(deps.judgeModel)].map(s => [s.id, s.rule.statement] as const))
  return toStepOutput(decideOutcome({ decoded: plan.decode(input.reply), rows, statements }))
}

// stage.rerun_reuses, stage.judge_claim, stage.claim_lease, stage.judge_wait (docs/design/stage-workflow.md).
export async function judgeRound(deps: JudgeStepDeps, input: JudgeStepInput): Promise<RoundOutcome> {
  const plan = await planOf(deps, input)
  const t = deps.timing ?? TIMING
  const stored = await deps.store.verdictsOf(input.runId, input.round)
  if (stored.length > 0) return outcomeOf(deps, plan, input, stored) // reuse: no call, no write
  let attempt = await deps.store.claimJudge(input.runId, input.round, t.claimLeaseMs)
  if (attempt === null) {
    // Another attempt holds a live claim. Wait up to one lease for its rows, or for its claim to expire.
    for (const until = Date.now() + t.claimLeaseMs; attempt === null && Date.now() < until; ) {
      await sleep(t.pollMs)
      const rows = await deps.store.verdictsOf(input.runId, input.round)
      if (rows.length > 0) return outcomeOf(deps, plan, input, rows)
      attempt = await deps.store.claimJudge(input.runId, input.round, t.claimLeaseMs)
    }
    if (attempt === null) return { kind: 'busy', retryAfterMs: t.claimLeaseMs }
  }
  const started = Date.now()
  const judged = await judgeOnce(deps, input, plan)
  if (Date.now() - started > t.judgeDeadlineMs) {
    throw new Error(`The judge of round ${input.round} passed its deadline, so its claim may have expired. It writes nothing.`)
  }
  try {
    await deps.store.writeVerdicts(judged.rows, input.round) // one statement, all rows or none
  } catch (e) {
    const rows = await deps.store.verdictsOf(input.runId, input.round) // the unique key: another attempt wrote first
    if (rows.length === 0) throw e
    return outcomeOf(deps, plan, input, rows)
  }
  return judged.output
}

export function judgeStep(deps: JudgeStepDeps) {
  return createStep({
    id: 'judge',
    description: 'Runs the ruleset judge on one draft of one round and returns the judge outcome.',
    inputSchema: JudgeStepInput,
    outputSchema: RoundOutcome,
    // No retries option. A retry would call each judge again, and a judge call is paid.
    execute: async ({ inputData }) => judgeRound(deps, inputData),
  })
}
