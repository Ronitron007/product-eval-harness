import { Mastra } from '@mastra/core/mastra'
import { harnessStorage, resolveDatabaseUrl } from './harness'

// The instance that `mastra dev`, `mastra build` and `mastra start` load.
// The CLI reads the `bundler`, `server` and `deployer` options from this literal,
// so those options must be set here, not in createHarness().
export const mastra = new Mastra({
  storage: harnessStorage(resolveDatabaseUrl(process.env.HARNESS_DATABASE_URL)),
})
