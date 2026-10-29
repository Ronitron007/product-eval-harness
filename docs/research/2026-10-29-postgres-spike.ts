// Spike: Mastra storage and our graph tables on ONE Postgres pool. No model call.
import { Mastra } from '@mastra/core/mastra'
import { createStep, createWorkflow } from '@mastra/core/workflows'
import { PostgresStore } from '@mastra/pg'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { customType, pgSchema, text, uuid } from 'drizzle-orm/pg-core'
import pg from 'pg'
import { z } from 'zod'

const url = 'postgresql://spike@127.0.0.1:55432/harness'
const ok = (name: string, pass: boolean, detail = '') => console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`)

// Our tables, in their own schema next to Mastra's.
const ltree = customType<{ data: string }>({ dataType: () => 'ltree' })
const harness = pgSchema('harness')
const nodes = harness.table('nodes', { id: text('id').primaryKey(), parentId: text('parent_id'), path: ltree('path').notNull() })
const verdicts = harness.table('verdicts', { id: uuid('id').primaryKey().defaultRandom(), runId: text('run_id').notNull(), ruleId: text('rule_id').notNull(), verdict: text('verdict').notNull() })

const Count = z.object({ n: z.number() })
const double = createStep({ id: 'double', inputSchema: Count, outputSchema: Count, execute: async ({ inputData }) => ({ n: inputData.n * 2 }) })
const smoke = createWorkflow({ id: 'smoke', inputSchema: Count, outputSchema: Count }).then(double).commit()

const pool = new pg.Pool({ connectionString: url })
const db = drizzle(pool)

await db.execute(sql`create extension if not exists ltree`)
await db.execute(sql`create schema if not exists harness`)
await db.execute(sql`create table if not exists harness.nodes (id text primary key, parent_id text, path ltree not null)`)
await db.execute(sql`create table if not exists harness.verdicts (id uuid primary key default gen_random_uuid(), run_id text not null, rule_id text not null, verdict text not null)`)
// Append-only: a trigger refuses each update and delete of a verdict row.
await db.execute(sql`create or replace function harness.refuse_change() returns trigger language plpgsql as $$ begin raise exception 'verdicts are append-only'; end $$`)
await db.execute(sql`drop trigger if exists verdicts_append_only on harness.verdicts`)
await db.execute(sql`create trigger verdicts_append_only before update or delete on harness.verdicts for each row execute function harness.refuse_change()`)

// 1. Mastra storage on the same pool, in schema mastra.
const mastra = new Mastra({ storage: new PostgresStore({ id: 'harness', pool, schemaName: 'mastra' }), workflows: { smoke } })
const run = await mastra.getWorkflow('smoke').createRun()
const result = await run.start({ inputData: { n: 21 } })
ok('a workflow runs with PostgresStore on the shared pool', result.status === 'success' && result.result.n === 42)

// 2. A second instance on a new pool reads the run back: the run is really in Postgres.
const pool2 = new pg.Pool({ connectionString: url })
const mastra2 = new Mastra({ storage: new PostgresStore({ id: 'harness2', pool: pool2, schemaName: 'mastra' }), workflows: { smoke } })
const stored = await mastra2.getWorkflow('smoke').getWorkflowRunById(run.runId)
ok('a second instance reads the stored run', stored?.runId === run.runId && stored?.status === 'success', String(stored?.status))

// 3. Our rows through Drizzle on the same pool, and an ltree query.
await db.delete(nodes)
await db.insert(nodes).values([
  { id: 'skincare', parentId: null, path: 'skincare' },
  { id: 'sunscreen', parentId: 'skincare', path: 'skincare.sunscreen' },
  { id: 'mineral_sunscreen', parentId: 'sunscreen', path: 'skincare.sunscreen.mineral_sunscreen' },
  { id: 'moisturizer', parentId: 'skincare', path: 'skincare.moisturizer' },
])
const under = await db.execute(sql`select id from harness.nodes where path <@ 'skincare.sunscreen' order by path`)
ok('ltree finds a node and its descendants', JSON.stringify(under.rows.map(r => r.id)) === '["sunscreen","mineral_sunscreen"]', JSON.stringify(under.rows.map(r => r.id)))
const above = await db.execute(sql`select id from harness.nodes where path @> 'skincare.sunscreen.mineral_sunscreen' order by path`)
ok('ltree finds the path to the root', JSON.stringify(above.rows.map(r => r.id)) === '["skincare","sunscreen","mineral_sunscreen"]')

// 4. A join between our verdict rows and Mastra's run snapshots.
await db.insert(verdicts).values({ runId: run.runId, ruleId: 'criteria.reason_has_record', verdict: 'pass' })
const tables = await db.execute(sql`select table_name from information_schema.tables where table_schema = 'mastra' order by 1`)
console.log('mastra tables:', tables.rows.map(r => r.table_name).join(', '))
const joined = await db.execute(sql`select v.rule_id, s.workflow_name from harness.verdicts v join mastra.mastra_workflow_snapshot s on s.run_id = v.run_id where v.run_id = ${run.runId}`)
ok('a verdict joins with its Mastra run', joined.rows.length === 1 && joined.rows[0]!.workflow_name === 'smoke', JSON.stringify(joined.rows))

// 5. One transaction for our writes: all or nothing.
try {
  await db.transaction(async tx => {
    await tx.insert(verdicts).values({ runId: run.runId, ruleId: 'r.tx', verdict: 'pass' })
    throw new Error('rollback on purpose')
  })
} catch {}
const afterRollback = await db.execute(sql`select count(*)::int as n from harness.verdicts where rule_id = 'r.tx'`)
ok('a failed transaction leaves no row', afterRollback.rows[0]!.n === 0)

// 6. Append-only is enforced by the database.
let refused = false
try { await db.execute(sql`update harness.verdicts set verdict = 'fail' where run_id = ${run.runId}`) } catch (e) { refused = /append-only/.test(String((e as Error).cause ?? e)) || /append-only/.test(String(e)) }
ok('an update of a verdict row is refused', refused)

await pool.end(); await pool2.end()
