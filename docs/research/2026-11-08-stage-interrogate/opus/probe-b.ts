// Probe B: concurrent resumes on @mastra/pg 1.32.0 (schema mastra from 0002, as harness_app), one and two Mastra instances.
import { Mastra } from '@mastra/core/mastra'
import { PostgresStore } from '@mastra/pg'
import pg from 'pg'
import { script, stageWorkflow, type StageDeps, type DraftRow } from './sketch-run'
const H1 = 'a'.repeat(64)
const repair = { kind: 'repair' as const, errors: [{ from: 'r.x@1', target: 't', fix: 'f' }], warnings: [] }
const url = process.argv[2]!
const drafts: DraftRow[] = []; const endCalls: any[] = []; let personBodies = 0
const deps: StageDeps = {
  store: {
    recordStageRun: async (i: any) => i, stageRun: async () => undefined,
    pathToRoot: async () => [{ id: 'sunscreen', label: 'Sunscreen' }] as never, siblings: async () => [] as never,
    writeVerdicts: async () => [], verdictsOf: async () => [],
    addDraft: async r => { drafts.push(r) }, draftOf: async (id, n) => (personBodies++, drafts.find(d => d.runId === id && d.round === n)),
    endRun: async e => { endCalls.push(e); await new Promise(r => setTimeout(r, 50)); return { outputId: 'output' in e ? `out-${endCalls.length}` : null } },
  },
  planFor: async () => ({ ruleSetHash: H1, instructions: 'x', decode: (raw: unknown) => (typeof raw === 'object' ? { ok: true, output: raw } : { ok: false, issues: [], raw }) }) as never,
  research: async () => ({ sources: { label: '500 mg' } }),
  drafter: { id: 'mock/drafter', draft: async () => ({ reply: 1 }) },
  judgeModel: { id: 'judge/mock', model: {} as never },
}
const msg = (r: PromiseSettledResult<any>) => r.status === 'fulfilled' ? `fulfilled ${r.value.status}` : `rejected ${(r.reason as any)?.id ?? String(r.reason).slice(0, 80)}`
async function main() {
  const pool = new pg.Pool({ connectionString: url })
  const mk = () => new Mastra({ storage: new PostgresStore({ id: 'harness', pool, schemaName: 'mastra', disableInit: true }), workflows: { create_node: stageWorkflow('create_node', deps) }, logger: false })
  const m1 = mk(), m2 = mk()
  for (const mode of ['one instance', 'two instances']) {
    script.length = 0; script.push(repair, repair, repair); endCalls.length = 0
    const w1 = m1.getWorkflow('create_node')
    const run = await w1.createRun(); const s = await run.start({ inputData: { nodeId: 'sunscreen' } })
    const w2 = (mode === 'one instance' ? m1 : m2).getWorkflow('create_node')
    const runA = await w1.createRun({ runId: run.runId }); const runB = await w2.createRun({ runId: run.runId })
    const res = await Promise.allSettled([runA.resume({ step: 'person', resumeData: { decision: 'accept', reviewer: 'op' } }), runB.resume({ step: 'person', resumeData: { decision: 'accept', reviewer: 'op' } })])
    console.log(mode, '| start', s.status, '|', res.map(msg).join(' | '), '| endRun calls', endCalls.length, '| stored', (await w1.getWorkflowRunById(run.runId))?.status)
  }
  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
