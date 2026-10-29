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

async function indexes(pool: pg.Pool, schema: string) {
  const { rows } = await pool.query('select tablename, indexname, indexdef from pg_indexes where schemaname = $1 order by indexname', [schema])
  return rows
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

  // Fails after a @mastra/pg upgrade until scripts/dump-mastra-schema.sh runs again.
  it('makes the same mastra tables and indexes as storage.init() of the installed @mastra/pg', async () => {
    const pool = initialized.pool()
    await harnessStorage(pool, { disableInit: false }).init()

    const fromInit = await columns(pool, 'mastra')
    expect(new Set(fromInit.map(c => c.table_name)).size).toBeGreaterThan(30)
    expect(await columns(migrated.pool(), 'mastra')).toEqual(fromInit)
    expect(await indexes(migrated.pool(), 'mastra')).toEqual(await indexes(pool, 'mastra'))
  })
})
