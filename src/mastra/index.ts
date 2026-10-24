import { createHarness } from './harness'

// The instance that `mastra dev` and `mastra build` load.
export const mastra = createHarness({
  databaseUrl: process.env.HARNESS_DATABASE_URL ?? 'file:./harness.db',
})
