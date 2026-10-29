import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { getTableConfig } from 'drizzle-orm/pg-core'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { harnessStorage } from '../../src/mastra/harness'
import { graphTables } from '../../src/store/schema'
import { freshDatabase, migrationFiles, type TestDatabase } from '../db'

// The database types that information_schema gives for the Drizzle column types.
const UDT: Record<string, string> = { text: 'text', uuid: 'uuid', jsonb: 'jsonb', integer: 'int4', 'timestamp with time zone': 'timestamptz', ltree: 'ltree' }

async function columns(pool: pg.Pool, schema: string) {
  const { rows } = await pool.query(
    `select table_name, column_name, udt_name, is_nullable, column_default is not null as has_default
       from information_schema.columns where table_schema = $1 order by table_name, column_name`,
    [schema],
  )
  return rows
}

// The normal form of the dump script, so that the test and the committed file agree.
function dumpMastra(url: string): string {
  return execFileSync(join(import.meta.dirname, '..', '..', 'scripts', 'pg-dump-mastra.sh'), [url], { encoding: 'utf8' })
}

let migrated: TestDatabase
let initialized: TestDatabase
beforeAll(async () => {
  migrated = await freshDatabase()
  initialized = await freshDatabase({ migrate: false })
})
afterAll(async () => {
  await migrated?.drop()
  await initialized?.drop()
})

describe('db/migrations', () => {
  it('has the files in their order', () => {
    expect(migrationFiles()).toEqual(['0001_harness_tables.sql', '0002_mastra_schema.sql', '0003_harness_role.sql'])
  })

  it('makes the tables of src/store/schema.ts, column for column', async () => {
    const expected = Object.values(graphTables)
      .flatMap(table => {
        const { name, columns: cols } = getTableConfig(table)
        return cols.map(c => ({
          table_name: name,
          column_name: c.name,
          udt_name: UDT[c.getSQLType()] ?? `unmapped ${c.getSQLType()}`,
          is_nullable: c.notNull ? 'NO' : 'YES',
          has_default: c.hasDefault,
        }))
      })
      .sort((a, b) => a.table_name.localeCompare(b.table_name) || a.column_name.localeCompare(b.column_name))

    expect(await columns(migrated.pool(), 'harness')).toEqual(expected)
  })

  // The whole schema: tables, columns, defaults, constraints, indexes, functions and triggers.
  // Fails after a @mastra/pg upgrade until scripts/dump-mastra-schema.sh runs again.
  it('makes the same mastra schema as storage.init() of the installed @mastra/pg', async () => {
    const pool = initialized.pool()
    await harnessStorage(pool, { disableInit: false }).init()

    const fromInit = dumpMastra(initialized.url)
    expect(fromInit.match(/^CREATE TABLE /gm)?.length).toBeGreaterThan(30)
    expect(fromInit).toMatch(/^CREATE TRIGGER /m)
    expect(dumpMastra(migrated.url)).toBe(fromInit)
  })
})
