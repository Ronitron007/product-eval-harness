import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getTableConfig } from 'drizzle-orm/pg-core'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { harnessStorage } from '../../src/mastra/harness'
import { graphTables } from '../../src/store/schema'
import { applyMigrations, freshDatabase, migrationFiles, pgDump, supabaseRoles, withUser, type TestDatabase } from '../db'

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

  // The whole schema: tables, columns, defaults, constraints, indexes, functions, triggers,
  // row level security and policies. The other database runs storage.init() in place of
  // 0002_mastra_schema.sql, and the same 0001 and 0003 files around it.
  // Fails after a @mastra/pg upgrade until scripts/dump-mastra-schema.sh runs again.
  it('makes the same mastra schema as storage.init() of the installed @mastra/pg', async () => {
    const pool = initialized.pool()
    await applyMigrations(initialized.url, ['0001_harness_tables.sql'])
    await harnessStorage(pool, { disableInit: false }).init()
    await applyMigrations(initialized.url, ['0003_harness_role.sql'])

    const fromInit = dumpMastra(initialized.url)
    expect(fromInit.match(/^CREATE TABLE /gm)?.length).toBeGreaterThan(30)
    expect(fromInit).toMatch(/^CREATE TRIGGER /m)
    expect(dumpMastra(migrated.url)).toBe(fromInit)
  })
})

// The rules of a RealDose migration (docs/practices/db-migrations.md in RealDose), which these
// files meet so that the tests here cover what goes live.
describe('the RealDose migration rules', () => {
  let pool: pg.Pool
  let app: pg.Pool
  beforeAll(async () => {
    pool = migrated.pool()
    app = migrated.pool(withUser(migrated.url, 'harness_app'))
  })

  it('turns on row level security on each table in harness and mastra', async () => {
    const { rows } = await pool.query(
      `select n.nspname as schema, count(*)::int as tables, count(*) filter (where c.relrowsecurity)::int as rls,
              count(*) filter (where exists (select 1 from pg_policy p where p.polrelid = c.oid and 'harness_app'::regrole = any (p.polroles)))::int as with_policy
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('harness', 'mastra') and c.relkind in ('r', 'p') group by n.nspname order by 1`,
    )
    expect(rows).toEqual([
      { schema: 'harness', tables: 6, rls: 6, with_policy: 6 },
      { schema: 'mastra', tables: 39, rls: 39, with_policy: 39 },
    ])
  })

  it('revokes execute on each function in harness and mastra from PUBLIC and harness_app', async () => {
    const { rows } = await pool.query(
      `select p.oid::regprocedure::text as fn,
              (select count(*)::int from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0) as public_grants,
              has_function_privilege('harness_app', p.oid, 'EXECUTE') as app_executes,
              p.proconfig as config
         from pg_proc p where p.pronamespace in ('harness'::regnamespace, 'mastra'::regnamespace) order by 1`,
    )
    expect(rows).toEqual([
      { fn: 'harness.check_node_path()', public_grants: 0, app_executes: false, config: ['search_path=""'] },
      { fn: 'harness.refuse_change()', public_grants: 0, app_executes: false, config: ['search_path=""'] },
      { fn: 'mastra.trigger_set_timestamps()', public_grants: 0, app_executes: false, config: ['search_path=""'] },
    ])
  })

  it('still fires each trigger after the revoke', async () => {
    // check_node_path, for harness_app.
    await app.query("insert into harness.nodes (id, level, path, label) values ('skincare', 'domain', 'skincare', 'Skincare')")
    await expect(
      app.query("insert into harness.nodes (id, parent_id, level, path, label) values ('serum', 'skincare', 'leaf', 'other.serum', 'Serum')"),
    ).rejects.toThrow(/must have the path skincare.serum, not other.serum/)

    // trigger_set_timestamps, for harness_app.
    await app.query(
      `insert into mastra.mastra_ai_spans ("traceId", "spanId", name, "spanType", "isEvent", "startedAt", "createdAt")
       values ('t', 's', 'n', 'agent_run', false, now(), '2000-01-01')`,
    )
    const { rows } = await app.query(`select "createdAt" > '2001-01-01' as stamped from mastra.mastra_ai_spans where "traceId" = 't'`)
    expect(rows).toEqual([{ stamped: true }])

    // refuse_change, for a role that is not the owner and has the truncate right.
    await pool.query(`do $$ begin create role zz_truncater nologin; exception when duplicate_object then null; end $$;
                      grant usage on schema harness to zz_truncater; grant truncate on harness.verdicts to zz_truncater`)
    const client = await pool.connect()
    try {
      await client.query('set role zz_truncater')
      await expect(client.query('truncate harness.verdicts')).rejects.toThrow(/append-only: truncate is refused/)
    } finally {
      await client.query('reset role')
      client.release()
    }
  })

  it('makes no change on a second apply', async () => {
    const twice = await freshDatabase()
    try {
      const first = pgDump(twice.url, ['--schema-only'])
      await applyMigrations(twice.url)
      expect(pgDump(twice.url, ['--schema-only'])).toBe(first)
    } finally {
      await twice.drop()
    }
  })
})

// Supabase makes the roles anon, authenticated and service_role. A default privilege of the
// database can give them, or PUBLIC, a right on each new object.
describe('on a database with the roles and default privileges of Supabase', () => {
  let db: TestDatabase
  beforeAll(async () => {
    await supabaseRoles()
    db = await freshDatabase({ migrate: false })
    await db.pool().query(`
      alter default privileges for role postgres grant all on tables to public, anon, authenticated, service_role;
      alter default privileges for role postgres grant all on sequences to public, anon, authenticated, service_role;
      alter default privileges for role postgres grant all on functions to anon, authenticated, service_role;
      alter default privileges for role postgres grant all on schemas to public, anon, authenticated, service_role`)
    await applyMigrations(db.url)
  })
  afterAll(async () => {
    await db?.drop()
  })

  it('leaves PUBLIC, anon and authenticated no right in harness and mastra', async () => {
    const { rows } = await db.pool().query(
      `select count(*)::int as n from (
         select a.grantee from pg_class c, aclexplode(c.relacl) a where c.relnamespace in ('harness'::regnamespace, 'mastra'::regnamespace)
         union all
         select a.grantee from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.pronamespace in ('harness'::regnamespace, 'mastra'::regnamespace)
         union all
         select a.grantee from pg_namespace n, aclexplode(n.nspacl) a where n.nspname in ('harness', 'mastra')
       ) g where g.grantee = 0 or g.grantee in ('anon'::regrole, 'authenticated'::regrole)`,
    )
    expect(rows).toEqual([{ n: 0 }])
  })

  it('stops the migration on a table with no row level security', async () => {
    const pool = db.pool()
    await pool.query('create table harness.zz_extra (id int)')
    await expect(applyMigrations(db.url, ['0003_harness_role.sql'])).rejects.toThrow(/table harness.zz_extra has no row level security/)
    const { rows } = await pool.query(`select relrowsecurity from pg_class where oid = 'harness.zz_extra'::regclass`)
    expect(rows).toEqual([{ relrowsecurity: false }])
  })

  // The role belongs to the whole test cluster, so the grant stays in a transaction that rolls back.
  it('stops the migration when harness_app has a system attribute or a membership', async () => {
    const pool = db.pool()
    await pool.query(`do $$ begin create role zz_group nologin; exception when duplicate_object then null; end $$`)
    const role = readFileSync(join(import.meta.dirname, '..', '..', 'db', 'migrations', '0003_harness_role.sql'), 'utf8')
    for (const [change, error] of [
      ['grant zz_group to harness_app', /harness_app is a member of zz_group/],
      ['alter role harness_app createdb', /harness_app has a system attribute/],
    ] as const) {
      const client = await pool.connect()
      try {
        await client.query('begin')
        await client.query(change)
        await expect(client.query(role)).rejects.toThrow(error)
      } finally {
        await client.query('rollback')
        client.release()
      }
    }
  })
})
