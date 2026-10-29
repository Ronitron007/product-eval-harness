import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
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
export async function applyMigrations(url: string): Promise<void> {
  for (const file of migrationFiles()) {
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
