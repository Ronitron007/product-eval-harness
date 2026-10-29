import { Mastra } from '@mastra/core/mastra'
import type { AnyWorkflow } from '@mastra/core/workflows'
import { PostgresStore } from '@mastra/pg'
import pg from 'pg'

export function resolveDatabaseUrl(url: string | undefined): string {
  if (!url) throw new Error('Set HARNESS_DATABASE_URL to a Postgres URL, such as postgresql://user@host:5432/db (see .env.example).')
  if (!/^postgres(ql)?:\/\//.test(url)) throw new Error('HARNESS_DATABASE_URL must be a Postgres URL that starts with postgresql:// or postgres://.')
  return url
}

export function harnessPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl })
}

// Mastra storage in schema mastra, on the pool that the graph store uses too (store.place).
// disableInit defaults to true: Mastra never creates tables at run time. Its tables come
// from db/migrations/0002_mastra_schema.sql (store.safety).
export function harnessStorage(pool: pg.Pool, { disableInit = true }: { disableInit?: boolean } = {}): PostgresStore {
  return new PostgresStore({ id: 'harness', pool, schemaName: 'mastra', disableInit })
}

export interface HarnessOptions {
  pool: pg.Pool
  workflows?: Record<string, AnyWorkflow>
  disableInit?: boolean
}

// For tests and scripts. The CLI entry (index.ts) builds its own instance with the same storage.
export function createHarness({ pool, workflows = {}, disableInit }: HarnessOptions): Mastra {
  return new Mastra({ storage: harnessStorage(pool, { disableInit }), workflows })
}
