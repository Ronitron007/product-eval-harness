import { pathToFileURL } from 'node:url'
import { harnessPool, resolveDatabaseUrl } from '../src/mastra/harness'
import { finishRun, stageDepsFromEnv, type StageDeps, type StageResult } from '../src/stage'
import { createGraphStore } from '../src/store/store'

// The operator path of stage.decision_first (docs/design/stage-workflow.md):
//
//   npx tsx scripts/finish-run.ts <runId>
//
// It ends a run that has a person decision and no run end, for example after the store failed in
// assimilate. It reads the stage run and the decision row, and calls finishRun. A rule change since
// the decision makes it refuse (stage.hash_on_resume). It calls no model.

export async function finishRunById(deps: StageDeps, runId: string): Promise<StageResult> {
  const ended = await deps.store.runEndOf(runId)
  if (ended !== undefined) return ended
  const run = await deps.store.stageRun(runId)
  if (run === undefined) throw new Error(`No stage run ${runId} in harness.stage_runs.`)
  const decision = await deps.store.decisionOf(runId)
  if (decision === undefined) throw new Error(`Run ${runId} has no person decision. This script ends only a run with a decision row.`)
  return finishRun(deps, { runId, stage: run.stage, nodeId: run.nodeId, ruleSetHash: run.ruleSetHash, round: decision.round })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runId = process.argv[2]
  if (!runId) {
    console.error('Usage: npx tsx scripts/finish-run.ts <runId>')
    process.exit(2)
  }
  const pool = harnessPool(resolveDatabaseUrl(process.env.HARNESS_DATABASE_URL))
  try {
    console.log(JSON.stringify(await finishRunById(stageDepsFromEnv(process.env, createGraphStore(pool)), runId)))
  } finally {
    await pool.end()
  }
}
