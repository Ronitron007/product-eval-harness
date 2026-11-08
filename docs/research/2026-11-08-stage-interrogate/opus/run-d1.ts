// Runs probe-d1.sql (a late strict fail row after an accepted end) and a round 4 draft on the 0004 prototype, as harness_app.
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { freshDatabase, withUser } from '../../../../tests/db'
const H = 'a'.repeat(64)
const db = await freshDatabase()
const admin = new pg.Client({ connectionString: db.url }); await admin.connect()
await admin.query(readFileSync(new URL('./0004_stage_runs.sql', import.meta.url), 'utf8')); await admin.end()
const app = new pg.Client({ connectionString: withUser(db.url, 'harness_app') }); await app.connect()
await app.query(`insert into harness.nodes(id, level, path, label) values ('skincare','domain','skincare','S')`)
await app.query(`insert into harness.stage_runs(run_id, stage, node_id, rule_set_hash) values ('r1','define_criteria','skincare',$1)`, [H])
const res: any = await app.query(readFileSync(new URL('./probe-d1.sql', import.meta.url), 'utf8'))
console.log('D1 late strict fail after accepted end ->', JSON.stringify(res[res.length - 1].rows))
try { await app.query(`insert into harness.drafts(run_id, round, reply, drafter) values ('r1', 4, '{}', 'mock/drafter')`); console.log('D2 draft round 4 -> stored') } catch (e: any) { console.log('D2 draft round 4 -> REFUSED', e.message) }
await app.end(); await db.drop()
