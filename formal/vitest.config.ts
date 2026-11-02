import { defineConfig } from 'vitest/config'

// The real-code checks of the harness-invariants skill. They drop and make the cluster role
// harness_app, so the files run one at a time, on a Postgres that no other test uses.
export default defineConfig({
  test: {
    include: ['formal/sql/**/*.check.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
