import { Mastra } from '@mastra/core/mastra'
import { stageDepsFromEnv } from '../stage/ports'
import { stageWorkflows } from '../stage/registry'
import { createGraphStore } from '../store/store'
import { harnessPool, harnessStorage, resolveDatabaseUrl } from './harness'

// The instance that `mastra dev`, `mastra build` and `mastra start` load.
// The CLI reads the `bundler`, `server` and `deployer` options from this literal,
// so those options must be set here, not in createHarness().
// The stage workflows get their deps from the environment (stage.models_injected). With no model
// set, Studio shows each workflow, and a run fails in the context step before any call.
const pool = harnessPool(resolveDatabaseUrl(process.env.HARNESS_DATABASE_URL))

export const mastra = new Mastra({
  storage: harnessStorage(pool, { disableInit: true }),
  workflows: stageWorkflows(stageDepsFromEnv(process.env, createGraphStore(pool))),
})
