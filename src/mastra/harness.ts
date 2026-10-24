import { isAbsolute } from 'node:path'
import { Mastra } from '@mastra/core/mastra'
import type { AnyWorkflow } from '@mastra/core/workflows'
import { LibSQLStore } from '@mastra/libsql'

// `mastra dev`, `mastra build` and `mastra start` each run in another working
// directory, so a relative file URL opens a different database in each.
export function resolveDatabaseUrl(url: string | undefined): string {
  if (!url) throw new Error('Set HARNESS_DATABASE_URL, for example file:/path/to/repo/harness.db (see .env.example).')
  if (url.startsWith('file:') && !isAbsolute(url.slice('file:'.length))) {
    throw new Error(`HARNESS_DATABASE_URL must be an absolute file URL, such as file:/path/to/repo/harness.db. Got ${url}.`)
  }
  return url
}

// One database holds the Mastra domains now, and our graph tables later (mastra.storage).
export function harnessStorage(databaseUrl: string): LibSQLStore {
  return new LibSQLStore({ id: 'harness', url: databaseUrl })
}

export interface HarnessOptions {
  // ':memory:' in tests, an absolute file URL on disk, or a remote LibSQL URL.
  databaseUrl: string
  workflows?: Record<string, AnyWorkflow>
}

// For tests and scripts. The CLI entry (index.ts) builds its own instance with the same storage.
export function createHarness({ databaseUrl, workflows = {} }: HarnessOptions): Mastra {
  return new Mastra({ storage: harnessStorage(databaseUrl), workflows })
}
