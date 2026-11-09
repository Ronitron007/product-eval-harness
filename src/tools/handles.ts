import type { Mastra } from '@mastra/core/mastra'
import type pg from 'pg'
import { createHarness, harnessPool, resolveDatabaseUrl } from '../mastra/harness'
import { stageDepsFromEnv } from '../stage/ports'
import { stageWorkflows } from '../stage/registry'
import { createGraphStore, type GraphStore } from '../store/store'
import { readOnly } from './resolve'
import { STAGE_TOOLS, type HandleSet, type RawStageWrite, type ReadStore, type StageOutcome, type StageToolId } from './types'

// The handles of the tool registry (tools.one_path in docs/design/tool-registry.md). This is the
// one file in src/tools/ that imports the store. resolveTools() gives each tool only the handles
// that its effects name: a read tool gets the read calls, and each db_write tool gets its own
// write function.

export function readStoreOf(store: Pick<GraphStore, 'pathToRoot' | 'siblings' | 'subtree'>): ReadStore {
  return readOnly(store)
}

// The plain outcome of one Mastra workflow run. The status, the result or the suspend payload of
// the person step, and the failed step with its error.
export function toStageOutcome(result: { status: string; result?: unknown; error?: unknown; steps?: Record<string, { status?: string; suspendPayload?: unknown; error?: unknown }> }): StageOutcome {
  if (result.status === 'success') return { status: 'success', result: result.result }
  if (result.status === 'suspended') return { status: 'suspended', payload: result.steps?.person?.suspendPayload }
  const failed = Object.entries(result.steps ?? {}).find(([, s]) => s.status === 'failed')
  return { status: 'failed', error: result.error ?? failed?.[1].error, ...(failed ? { failedStep: failed[0] } : {}) }
}

// One write function for each stage wrapper. Each one writes the inner snapshot of the stage to
// harness.tool_runs under the stage run id, then starts one run of its stage workflow with that run
// id (tools.injection_scope, status_only.ids_from_code). The stage writes its own rows in code.
export function stageWriteDoors(source: { mastra: Mastra; store: Pick<GraphStore, 'recordToolRun'> }): Record<StageToolId, RawStageWrite> {
  const door =
    (stage: (typeof STAGE_TOOLS)[StageToolId]): RawStageWrite =>
    async ({ runId, inner }, input) => {
      await source.store.recordToolRun({ runId, snapshot: inner })
      const run = await source.mastra.getWorkflow(stage).createRun({ runId })
      return toStageOutcome((await run.start({ inputData: input })) as never)
    }
  return {
    run_define_criteria: door(STAGE_TOOLS.run_define_criteria),
    run_create_node: door(STAGE_TOOLS.run_create_node),
    run_create_pack: door(STAGE_TOOLS.run_create_pack),
    run_create_layout: door(STAGE_TOOLS.run_create_layout),
  }
}

// The handles of the tool server process, from its environment after loadEnvFile. The pool and
// the Mastra instance start on the first call, so a server that only lists tools needs no database.
export function handlesFromEnvFile(env: Readonly<Record<string, string | undefined>>): HandleSet & { close(): Promise<void> } {
  let pool: pg.Pool | undefined
  let store: GraphStore | undefined
  let mastra: Mastra | undefined
  const graph = () => (store ??= createGraphStore((pool ??= harnessPool(resolveDatabaseUrl(env.HARNESS_DATABASE_URL)))))
  const harness = () => (mastra ??= createHarness({ pool: (graph(), pool!), workflows: stageWorkflows(stageDepsFromEnv(env, graph())) }))
  const lazyStore: ReadStore = {
    pathToRoot: id => graph().pathToRoot(id),
    siblings: id => graph().siblings(id),
    subtree: id => graph().subtree(id),
  }
  const lazyDoors = (): Record<StageToolId, RawStageWrite> => stageWriteDoors({ mastra: harness(), store: graph() })
  let doors: Record<StageToolId, RawStageWrite> | undefined
  const writes = Object.fromEntries(
    (Object.keys(STAGE_TOOLS) as StageToolId[]).map(id => [id, ((run, input) => (doors ??= lazyDoors())[id](run, input)) satisfies RawStageWrite]),
  )
  return {
    store: lazyStore,
    writes,
    close: async () => {
      await pool?.end()
    },
  }
}
