import { Mastra } from '@mastra/core/mastra'
import type { Workflow } from '@mastra/core/workflows'
import { LibSQLStore } from '@mastra/libsql'

export interface HarnessOptions {
  // A LibSQL URL: 'file:./harness.db' on disk, ':memory:' in tests.
  databaseUrl: string
  workflows?: Record<string, Workflow<any, any, any, any, any, any, any>>
}

// One database holds the Mastra domains now, and our graph tables later (mastra.storage).
export function createHarness({ databaseUrl, workflows = {} }: HarnessOptions) {
  return new Mastra({
    storage: new LibSQLStore({ id: 'harness', url: databaseUrl }),
    workflows,
  })
}
