import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

// Test databases on a throwaway Postgres (scripts/test-db.sh, or the CI service container).
// Each test file makes its own database, applies db/migrations/ to it, and drops it after.

export const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'db', 'migrations')

export function adminUrl(): string {
  const url = process.env.HARNESS_TEST_DATABASE_URL
  if (!url) {
    throw new Error(
      'Set HARNESS_TEST_DATABASE_URL to a throwaway local Postgres. Run `scripts/test-db.sh start` and export the line that it prints. ' +
        'The tests never skip without it.',
    )
  }
  return url
}

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()
}

// Each file runs on its own connection, as a migration tool runs it.
export async function applyMigrations(url: string, files: string[] = migrationFiles()): Promise<void> {
  for (const file of files) {
    const client = new pg.Client({ connectionString: url })
    await client.connect()
    try {
      await client.query(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
    } catch (e) {
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`)
    } finally {
      await client.end()
    }
  }
}

export function withUser(url: string, user: string): string {
  const u = new URL(url)
  u.username = user
  u.password = ''
  return u.toString()
}

export interface TestDatabase {
  url: string
  pool(url?: string): pg.Pool
  drop(): Promise<void>
}

export async function freshDatabase({ migrate = true }: { migrate?: boolean } = {}): Promise<TestDatabase> {
  const admin = adminUrl()
  const name = `harness_test_${randomBytes(6).toString('hex')}`
  const client = new pg.Client({ connectionString: admin })
  await client.connect()
  await client.query(`create database ${name}`)
  await client.end()

  const u = new URL(admin)
  u.pathname = `/${name}`
  const url = u.toString()
  if (migrate) await applyMigrations(url)

  const pools: pg.Pool[] = []
  return {
    url,
    pool(poolUrl = url) {
      const p = new pg.Pool({ connectionString: poolUrl })
      pools.push(p)
      return p
    },
    async drop() {
      await Promise.all(pools.splice(0).map(p => p.end()))
      const c = new pg.Client({ connectionString: admin })
      await c.connect()
      await c.query(`drop database ${name} with (force)`)
      await c.end()
    },
  }
}

// The roles that Supabase makes in each project: the public-key roles anon and authenticated,
// and service_role. A role belongs to the whole cluster, so this keeps a role that exists.
export async function supabaseRoles(): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl() })
  await client.connect()
  try {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await client.query(`do $$ begin create role ${role} nologin; exception when duplicate_object or unique_violation then null; end $$`)
    }
  } finally {
    await client.end()
  }
}

// The pg_dump of the database at url, with the args, less the lines that change on each run.
// PG_BIN sets the folder of pg_dump, as in scripts/pg-dump-mastra.sh.
export function pgDump(url: string, args: string[]): string {
  const brew = '/opt/homebrew/opt/postgresql@18/bin'
  const bin = process.env.PG_BIN ?? (existsSync(join(brew, 'pg_dump')) ? brew : '')
  const out = execFileSync(bin ? join(bin, 'pg_dump') : 'pg_dump', [...args, url], { encoding: 'utf8' })
  return out
    .split('\n')
    .filter(line => !/^\\(restrict|unrestrict) /.test(line))
    .join('\n')
}
