import { readFileSync } from 'node:fs'
import pg from 'pg'
import { freshDatabase, withUser } from './pgutil'
const W = '../../../../db/migrations/'
const sql = (f: string) => readFileSync(f.startsWith('/') ? f : new URL('./' + f, import.meta.url), 'utf8')
async function main() {
  const db = await freshDatabase()
  const admin = new pg.Client({ connectionString: db.url }); await admin.connect()
  await admin.query(sql('0004_stage_runs.sql'))
  for (const f of ['0001_harness_tables.sql', '0002_mastra_schema.sql', '0003_harness_role.sql']) await admin.query(sql(W + f))
  await admin.query(sql('0004_stage_runs.sql')); await admin.query(sql(W + '0003_harness_role.sql'))
  console.log('S0 apply 1-4, then 1-3 and 4 and 3 again: OK (idempotent, 0003 guard passes with the new tables)')
  const app = new pg.Client({ connectionString: withUser(db.url, 'harness_app') }); await app.connect()
  const H = 'a'.repeat(64)
  const t = async (label: string, q: string, p: unknown[] = []) => { try { const r = await app.query(q, p); console.log(label, '-> ok', r.rowCount) } catch (e: any) { console.log(label, '-> REFUSED:', e.message.slice(0, 90)) } }
  await app.query(`insert into harness.nodes(id, level, path, label) values ('skincare','domain','skincare','S')`)
  await app.query(`insert into harness.stage_runs(run_id, stage, node_id, rule_set_hash) values ('r1','create_node','skincare',$1)`, [H])
  await t('S1 draft round 1', `insert into harness.drafts(run_id, round, reply, drafter) values ('r1',1,'"x"','m/x')`)
  await t('S2 second draft same round', `insert into harness.drafts(run_id, round, reply, drafter) values ('r1',1,'"y"','m/x')`)
  await t('S3 update draft', `update harness.drafts set reply='"z"'`)
  await t('S4 delete draft', `delete from harness.drafts`)
  await t('S5 truncate draft', `truncate harness.drafts`)
  const v = (b: string, vd: string, r = 1) => app.query(`insert into harness.verdicts(run_id, round, rule_id, rule_version, rule_hash, binding, target, verdict, decider, reason) values ('r1',$1,'a.b',1,$2,$3,'t',$4,'{"by":"code"}','why')`, [r, H, b, vd])
  await t('S6 verdict for round 2 (no draft)', `insert into harness.verdicts(run_id, round, rule_id, rule_version, rule_hash, binding, target, verdict, decider, reason) values ('r1',2,'a.b',1,'${H}','strict','t','pass','{"by":"code"}','why')`)
  await t('S7 accepted with no verdict row', `insert into harness.run_ends(run_id, round, "end") values ('r1',1,'accepted')`)
  await v('strict', 'fail')
  await t('S8 accepted after a strict fail', `insert into harness.run_ends(run_id, round, "end") values ('r1',1,'accepted')`)
  await t('S9 output with no run_end', `insert into harness.outputs(run_id, stage, node_id, rule_set_hash, body, round) values ('r1','create_node','skincare','${H}','{}',1)`)
  await t('S10 reject without note', `insert into harness.run_ends(run_id, round, "end", reviewer) values ('r1',1,'person_rejected','op')`)
  await t('S11 reject with note', `insert into harness.run_ends(run_id, round, "end", reviewer, note) values ('r1',1,'person_rejected','op','n')`)
  await t('S12 output after reject', `insert into harness.outputs(run_id, stage, node_id, rule_set_hash, body, round) values ('r1','create_node','skincare','${H}','{}',1)`)
  // a run whose single strict row passed, with 9 rules of the plan having no row at all
  await app.query(`insert into harness.stage_runs(run_id, stage, node_id, rule_set_hash) values ('r2','create_node','skincare',$1)`, [H])
  await app.query(`insert into harness.drafts(run_id, round, reply, drafter) values ('r2',1,'{}','m/x')`)
  await app.query(`insert into harness.verdicts(run_id, round, rule_id, rule_version, rule_hash, binding, target, verdict, decider, reason) values ('r2',1,'a.b',1,'${H}','strict','t','pass','{"by":"code"}','why')`)
  await t('S13 accepted on ONE strict pass row while the plan has other strict rules with no row (db cannot know the plan)', `insert into harness.run_ends(run_id, round, "end") values ('r2',1,'accepted')`)
  await app.end(); await admin.end(); await db.drop()
}
main().catch(e => { console.error('ERR', e); process.exit(1) })
