// A Postgres-backed StageStore for the new sketch (stage.store), on the 0004 prototype, as harness_app.
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { Mastra } from '@mastra/core/mastra'
import { PostgresStore } from '@mastra/pg'
import { freshDatabase, withUser } from '../../../../tests/db'
import { stageWorkflow, script, judgeCalls, type StageDeps, type StageStore } from './sketch-run'
export { script, judgeCalls }
const P4 = readFileSync(new URL('./0004_stage_runs.sql', import.meta.url), 'utf8')
export const H1 = 'a'.repeat(64)
export async function makeDb() {
  const db = await freshDatabase(); const admin = new pg.Client({ connectionString: db.url }); await admin.connect(); await admin.query(P4)
  await admin.query("insert into harness.nodes(id, level, path, label) values ('skincare','domain','skincare','S'); insert into harness.nodes(id, parent_id, level, path, label) values ('sunscreen','skincare','inner','skincare.sunscreen','Sun')"); await admin.end()
  return db
}
export function makeEnv(url: string, hooks: Record<string, () => void> = {}) {
  const pool = new pg.Pool({ connectionString: withUser(url, 'harness_app') })
  const q = (s: string, p: unknown[] = []) => pool.query(s, p)
  const counts = { drafter: 0, research: 0 }
  const endOf = async (runId: string) => { const r = (await q('select e.run_id, e."end", e.round, o.id from harness.run_ends e left join harness.outputs o using (run_id) where e.run_id=$1', [runId])).rows[0]; return r ? { runId: r.run_id, end: r.end, round: r.round, outputId: r.id ?? null } : undefined }
  const store: StageStore = {
    recordStageRun: async (i: any) => (await q('insert into harness.stage_runs(run_id, stage, node_id, rule_set_hash) values ($1,$2,$3,$4) returning *', [i.runId, i.stage, i.nodeId, i.ruleSetHash])).rows[0],
    stageRun: async id => { const r = (await q('select run_id, rule_set_hash from harness.stage_runs where run_id=$1', [id])).rows[0]; return r && { runId: r.run_id, ruleSetHash: r.rule_set_hash } },
    pathToRoot: async () => [{ id: 'skincare', label: 'S' }, { id: 'sunscreen', label: 'Sun' }] as never, siblings: async () => [] as never,
    addDraft: async r => { const t = JSON.stringify(r.reply); await q("insert into harness.drafts(run_id, round, reply_text, reply, drafter) values ($1,$2,$3,harness.try_jsonb($3),$4)", [r.runId, r.round, t, r.drafter]); hooks.afterAddDraft?.() },
    draftOf: async (id, n) => { const r = (await q('select * from harness.drafts where run_id=$1 and round=$2', [id, n])).rows[0]; return r && { runId: r.run_id, round: r.round, reply: JSON.parse(r.reply_text), drafter: r.drafter } },
    writeVerdicts: async (rows, round) => { hooks.beforeWriteVerdicts?.(); if ((hooks as any).judgeMs) await new Promise(r => setTimeout(r, (hooks as any).judgeMs)); for (const v of rows as any[]) await q('insert into harness.verdicts(run_id, round, rule_id, rule_version, rule_hash, binding, target, verdict, decider, reason) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [v.runId, round, v.ruleId, v.ruleVersion, v.ruleHash, v.binding, v.target, v.verdict, v.decider, v.reason]) },
    verdictsOf: async (id, n) => (await q('select * from harness.verdicts where run_id=$1 and round=$2', [id, n])).rows,
    claimJudge: async (id, n) => { try { await q('insert into harness.judge_claims(run_id, round) values ($1,$2)', [id, n]); hooks.afterClaim?.(); return true } catch (e: any) { if (e.code === '23505') return false; throw e } },
    addDecision: async d => { try { await q('insert into harness.person_decisions(run_id, round, decision, reviewer, note) values ($1,$2,$3,$4,$5)', [d.runId, d.round, d.decision, d.reviewer, d.note ?? null]) } catch (e: any) { if (e.code !== '23505') throw e; const o = await store.decisionOf(d.runId); if (!o || o.round !== d.round || o.decision !== d.decision || o.reviewer !== d.reviewer || (o.note ?? null) !== (d.note ?? null)) throw new Error('another decision exists for run ' + d.runId) } hooks.afterDecision?.() },
    decisionOf: async id => { const r = (await q('select * from harness.person_decisions where run_id=$1', [id])).rows[0]; return r && { runId: r.run_id, round: r.round, decision: r.decision, reviewer: r.reviewer, ...(r.note !== null ? { note: r.note } : {}) } as any },
    runEndOf: endOf,
    endRun: async (e: any) => {
      hooks.beforeEndRun?.()
      const c = await pool.connect()
      try {
        await c.query('begin')
        await c.query('insert into harness.run_ends(run_id, round, "end", reviewer, note) values ($1,$2,$3,$4,$5)', [e.runId, e.round, e.end, e.reviewer ?? null, e.note ?? null])
        if ('output' in e) await c.query("insert into harness.outputs(run_id, stage, node_id, body, rule_set_hash, round) select run_id, stage, node_id, $2, rule_set_hash, $3 from harness.stage_runs where run_id=$1", [e.runId, JSON.stringify(e.output), e.round])
        await c.query('commit')
      } catch (err: any) { await c.query('rollback'); if (err.code !== '23505') throw err; const s = await endOf(e.runId); if (!s || s.end !== e.end || s.round !== e.round) throw err; return s } finally { c.release() }
      hooks.afterEndRun?.()
      return (await endOf(e.runId))!
    },
  }
  const deps: StageDeps = {
    store,
    planFor: async () => ({ ruleSetHash: H1, instructions: 'x', decode: (raw: unknown) => (raw !== null && typeof raw === 'object' ? { ok: true, output: raw } : { ok: false, issues: [], raw }) }) as never,
    research: async () => (counts.research++, { sources: { label: '500 mg' } }),
    drafter: { id: 'drafter/mock', draft: async ({ round }) => (counts.drafter++, hooks.reply ? (hooks.reply as any)() : { reply: round }) },
    judgeModel: { id: 'judge/mock', model: {} as never },
  }
  const mastra = new Mastra({ storage: new PostgresStore({ id: 'harness', pool, schemaName: 'mastra', disableInit: true }), workflows: { create_node: stageWorkflow('create_node', deps) }, logger: false })
  const count = async (t: string, runId: string) => Number((await q(`select count(*) from harness.${t} where run_id=$1`, [runId])).rows[0].count)
  return { mastra, w: mastra.getWorkflow('create_node'), deps, pool, q, counts, count }
}
