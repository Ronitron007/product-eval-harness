import { readFileSync } from 'node:fs'
import pg from 'pg'
import { freshDatabase } from './pgutil'
const mig = readFileSync(new URL('./0004_stage_runs.sql', import.meta.url), 'utf8')
async function main() {
  const db = await freshDatabase()
  const c = new pg.Client({ connectionString: db.url }); await c.connect()
  await c.query(mig); await c.query(mig); console.log('0004 applied twice OK')
  const q = (s: string, p: unknown[] = []) => c.query(s, p)
  const H = 'a'.repeat(64)
  await q(`insert into harness.nodes(id, level, path, label) values ('skincare','domain','skincare','S')`)
  await q(`insert into harness.stage_runs(run_id, stage, node_id, rule_set_hash) values ('r1','create_node','skincare',$1)`, [H])
  await q(`insert into harness.drafts(run_id, round, reply, drafter) values ('r1',1,'{"a":1}','m/x')`)
  const vrow = (r: number) => q(`insert into harness.verdicts(run_id, round, rule_id, rule_version, rule_hash, binding, target, verdict, decider, reason) values ('r1',$1,'a.b',1,$2,'strict','t','pass','{"by":"code"}','why')`, [r, H])
  await vrow(1); await vrow(1)
  console.log('P2a duplicate verdict row for (run, round, rule, target):', (await q(`select count(*) from harness.verdicts where run_id='r1' and round=1`)).rows[0].count, 'rows')
  // jsonb and NUL
  for (const [label, val] of [['text with NUL', JSON.stringify('abc\u0000def')], ['lone surrogate', JSON.stringify('x\ud800y')]] as const) {
    try { await q(`insert into harness.drafts(run_id, round, reply, drafter) values ('r1',$1,$2::jsonb,'m/x')`, [label === 'text with NUL' ? 2 : 3, val]); console.log('P2b', label, 'stored') } catch (e: any) { console.log('P2b', label, 'REFUSED:', e.message) }
  }
  await c.end(); await db.drop()
}
main().catch(e => { console.error('ERR', e); process.exit(1) })
