// Probe C: a process dies inside the judge step of round 2; a new process calls run.restart().
// Mastra storage: @mastra/pg on schema mastra. Harness store: a JSON file that mimics the PK rules.
import { Mastra } from '@mastra/core/mastra'
import { PostgresStore } from '@mastra/pg'
import fs from 'node:fs'
import pg from 'pg'
import { script, stageWorkflow, type StageDeps } from './sketch-run'
const [mode, url, file, runIdArg] = process.argv.slice(2) as [string, string, string, string | undefined]
const H1 = 'a'.repeat(64)
const repair = { kind: 'repair' as const, errors: [{ from: 'r.x@1', target: 't', fix: 'f' }], warnings: [] }
const load = () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { drafts: [], ends: [], runs: {}, drafterCalls: 0, judgeCalls: 0 })
const save = (s: any) => fs.writeFileSync(file, JSON.stringify(s))
script.length = 0; script.push(repair, repair, repair, repair, repair)
if (mode === 'crash') Object.defineProperty(script, 1, { get() { const s = load(); s.judgeCalls++; save(s); console.log('crash: process dies inside judge of round 2'); process.exit(9) } })
const deps: StageDeps = {
  store: {
    recordStageRun: async (i: any) => { const s = load(); if (s.runs[i.runId]) throw new Error('pk stage_runs'); s.runs[i.runId] = i.ruleSetHash; save(s); return i },
    stageRun: async id => { const s = load(); return s.runs[id] ? { runId: id, ruleSetHash: s.runs[id] } : undefined },
    pathToRoot: async () => [{ id: 'sunscreen', label: 'Sunscreen' }] as never, siblings: async () => [] as never,
    writeVerdicts: async () => [], verdictsOf: async () => [],
    addDraft: async r => { const s = load(); if (s.drafts.some((d: any) => d.runId === r.runId && d.round === r.round)) throw new Error(`pk drafts round ${r.round}`); s.drafts.push(r); save(s) },
    draftOf: async (id, n) => load().drafts.find((d: any) => d.runId === id && d.round === n),
    endRun: async e => { const s = load(); s.ends.push(e); save(s); return { outputId: null } },
  },
  planFor: async () => ({ ruleSetHash: H1, instructions: 'x', decode: (raw: unknown) => (typeof raw === 'object' ? { ok: true, output: raw } : { ok: false, issues: [], raw }) }) as never,
  research: async () => ({ sources: { label: '500 mg' } }),
  drafter: { id: 'mock/drafter', draft: async ({ round }) => { const s = load(); s.drafterCalls++; save(s); return { reply: round } } },
  judgeModel: { id: 'judge/mock', model: {} as never },
}
async function main() {
  const pool = new pg.Pool({ connectionString: url })
  const m = new Mastra({ storage: new PostgresStore({ id: 'harness', pool, schemaName: 'mastra', disableInit: true }), workflows: { create_node: stageWorkflow('create_node', deps) }, logger: false })
  const w = m.getWorkflow('create_node')
  if (mode === 'crash') { const run = await w.createRun(); fs.writeFileSync(file + '.runid', run.runId); await run.start({ inputData: { nodeId: 'sunscreen' } }) }
  else {
    const runId = fs.readFileSync(file + '.runid', 'utf8'); await new Promise(r => setTimeout(r, 17000)) // the lease TTL is 15 s
    console.log('stored status before restart', (await w.getWorkflowRunById(runId))?.status)
    const run = await w.createRun({ runId })
    const r: any = await run.restart()
    const pay = r.steps?.person?.suspendPayload
    console.log('restart ->', r.status, r.status === 'failed' ? String(r.error?.message ?? r.error).slice(0, 120) : '', pay ? `payload round ${pay.round} why ${pay.why}` : '')
    const s = load(); console.log('drafts rounds', s.drafts.map((d: any) => d.round).join(','), 'drafterCalls', s.drafterCalls, 'stored status', (await w.getWorkflowRunById(runId))?.status)
  }
  await pool.end()
}
main().catch(e => { console.error('ERR', String(e?.message ?? e).slice(0, 200)); process.exit(1) })
