import { readFileSync } from 'node:fs'
import pg from 'pg'
import { Mastra } from '@mastra/core/mastra'
import { freshDatabase, withUser } from '../../../../tests/db'
import { harnessStorage } from '../../../../src/mastra/harness'
import { createGraphStore } from '../../../../src/store/store'
import { compileStage } from '../../../../src/compiler'
import { library } from '../../../../tests/compiler/library'
import { FIXTURE, GOOD_OUTPUT, GOOD_EVIDENCE, TREE } from '../../../../tests/compiler/rules'
import { judgeOf } from '../../../../tests/judge/helpers'
import { stageWorkflow, type StageDeps } from './proto_workflow'
export { GOOD_OUTPUT, GOOD_EVIDENCE, FIXTURE }

const mig = readFileSync(new URL('./0004_stage_runs.sql', import.meta.url), 'utf8')
export const ans = (answer: string, quote: string) => ({ target: 'criteria[0].attributes[0]', answer, quote, reason: 'because' })

export async function setup(opts: { drafts?: () => unknown; judgeItems?: unknown[]; stages?: string[]; user?: string; existingUrl?: string; hooks?: { afterAddDraft?: () => void; beforeEndRun?: () => void; afterEndRun?: () => void } } = {}) {
  const db = opts.existingUrl ? ({ url: opts.existingUrl, pool: (u?: string) => new pg.Pool({ connectionString: u ?? opts.existingUrl }), drop: async () => {} } as any) : await freshDatabase()
  if (!opts.existingUrl) { const admin = new pg.Client({ connectionString: db.url }); await admin.connect(); await admin.query(mig); await admin.end() }
  const pool = db.pool(withUser(db.url, 'harness_app'))
  const gs = createGraphStore(pool)
  if (!opts.existingUrl) for (const n of TREE) await gs.addNode({ id: n.id, parentId: n.parentId ?? undefined, level: n.level, label: n.id } as never)
  const state = { rules: [...FIXTURE] as any[], drafterCalls: 0, judgeCalls: { calls: 0 }, writes: { drafts: 0, verdictBatches: 0, endRun: 0 } }
  const q = (s: string, p: unknown[] = []) => pool.query(s, p)
  const store = {
    recordStageRun: (i: any) => gs.recordStageRun(i), pathToRoot: (n: string) => gs.pathToRoot(n), siblings: (n: string) => gs.siblings(n),
    async stageRun(runId: string) { const r = await q('select run_id, rule_set_hash from harness.stage_runs where run_id=$1', [runId]); return r.rows[0] ? { runId, ruleSetHash: r.rows[0].rule_set_hash } : undefined },
    async addDraft(d: any) { state.writes.drafts++; await q('insert into harness.drafts(run_id, round, reply, drafter) values ($1,$2,$3::jsonb,$4)', [d.runId, d.round, JSON.stringify(d.reply), d.drafter]); opts.hooks?.afterAddDraft?.() },
    async draftOf(runId: string, round: number) { const r = await q('select reply, drafter from harness.drafts where run_id=$1 and round=$2', [runId, round]); return r.rows[0] ? { runId, round, reply: r.rows[0].reply, drafter: r.rows[0].drafter } : undefined },
    async writeVerdicts(rows: any[], round: number) {
      state.writes.verdictBatches++
      if (rows.length === 0) return []
      const vals: unknown[] = []; const tuples = rows.map((r, i) => { const b = i * 11; vals.push(r.runId, round, r.ruleId, r.ruleVersion, r.ruleHash, r.binding, r.target, r.verdict, JSON.stringify(r.decider), r.reason, r.evidence === undefined ? null : JSON.stringify(r.evidence)); return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9}::jsonb,$${b+10},$${b+11}::jsonb)` })
      return q(`insert into harness.verdicts(run_id, round, rule_id, rule_version, rule_hash, binding, target, verdict, decider, reason, evidence) values ${tuples.join(',')}`, vals)
    },
    async verdictsOf(runId: string, round: number) {
      const r = await q('select * from harness.verdicts where run_id=$1 and round=$2', [runId, round])
      return r.rows.map((x: any) => ({ runId: x.run_id, ruleId: x.rule_id, ruleVersion: x.rule_version, ruleHash: x.rule_hash, binding: x.binding, target: x.target, verdict: x.verdict, decider: x.decider, reason: x.reason, ...(x.evidence ? { evidence: x.evidence } : {}) }))
    },
    async endRun(i: any) {
      state.writes.endRun++; opts.hooks?.beforeEndRun?.()
      const c = await pool.connect()
      try {
        await c.query('begin')
        await c.query('insert into harness.run_ends(run_id, round, "end", reviewer, note) values ($1,$2,$3,$4,$5)', [i.runId, i.round, i.end, i.reviewer ?? null, i.note ?? null])
        let outputId: string | null = null
        if (i.end !== 'person_rejected') {
          const run = (await c.query('select * from harness.stage_runs where run_id=$1', [i.runId])).rows[0]
          const o = await c.query('insert into harness.outputs(run_id, stage, node_id, rule_set_hash, body, round) values ($1,$2,$3,$4,$5::jsonb,$6) returning id', [i.runId, run.stage, run.node_id, run.rule_set_hash, JSON.stringify(i.output), i.round])
          outputId = o.rows[0].id
        }
        await c.query('commit'); opts.hooks?.afterEndRun?.(); return { outputId }
      } catch (e) { await c.query('rollback'); throw e } finally { c.release() }
    },
  }
  const stageList = opts.stages ?? ['create_node']
  const deps: StageDeps = {
    store: store as never,
    planFor: async (run: any) => {
      const [tree, derived] = [await gs.tree(), await gs.derivedRules()]
      const r = compileStage({ stage: run.stage, node: run.nodeId, library: library(state.rules), derived, tree })
      if (!r.ok) throw new Error('RulesRefused ' + r.problems.map(p => p.code).join(','))
      if (run.ruleSetHash && run.ruleSetHash !== r.plan.ruleSetHash) throw new Error(`The rules changed during run ${run.runId}. Start a new run.`)
      return r.plan
    },
    research: async () => GOOD_EVIDENCE as never,
    drafter: { id: 'mock/drafter', draft: async () => { state.drafterCalls++; return (opts.drafts ?? (() => GOOD_OUTPUT))() } },
    judgeModel: { ...judgeOf(opts.judgeItems ?? [ans('yes', '500 mg')], state.judgeCalls), id: 'other/judge' } as never,
  }
  const workflows: Record<string, any> = {}
  for (const s of stageList) workflows[s] = stageWorkflow(s as never, deps)
  const mastra = new Mastra({ storage: harnessStorage(pool), workflows, logger: false })
  const count = async (t: string, where = '') => Number((await q(`select count(*) from harness.${t} ${where}`)).rows[0].count)
  return { db, pool, mastra, state, store, deps, count, q, gs }
}
