// Probe A: what happens after a resume whose assimilate fails once, and after start() on a run id that already ended.
import { Mastra } from '@mastra/core/mastra'
import { InMemoryStore } from '@mastra/core/storage'
import { script, stageWorkflow, type StageDeps, type DraftRow } from './sketch-run'
const H1 = 'a'.repeat(64)
const repair = { kind: 'repair' as const, errors: [{ from: 'r.x@1', target: 't', fix: 'f' }], warnings: [] }
const accept = { kind: 'accept' as const, output: { ok: 1 }, warnings: [] }
function make(opts: { failEndOnce?: boolean } = {}) {
  const drafts: DraftRow[] = []; const ends: any[] = []; const runs = new Map<string, string>(); let drafterCalls = 0; let researchCalls = 0; let failNext = !!opts.failEndOnce
  const deps: StageDeps = {
    store: {
      recordStageRun: async (i: any) => { if (runs.has(i.runId)) throw new Error('pk stage_runs'); runs.set(i.runId, i.ruleSetHash); return i },
      stageRun: async id => (runs.has(id) ? { runId: id, ruleSetHash: runs.get(id)! } : undefined),
      pathToRoot: async () => [{ id: 'sunscreen', label: 'Sunscreen' }] as never, siblings: async () => [] as never,
      writeVerdicts: async () => [], verdictsOf: async () => [],
      addDraft: async r => { if (drafts.some(d => d.runId === r.runId && d.round === r.round)) throw new Error('pk drafts'); drafts.push(r) },
      draftOf: async (id, n) => drafts.find(d => d.runId === id && d.round === n),
      endRun: async e => { if (failNext) { failNext = false; throw new Error('connection reset (transient)') } if (ends.some(x => x.runId === e.runId)) throw new Error('pk run_ends'); ends.push(e); return { outputId: 'output' in e ? 'out-1' : null } },
    },
    planFor: async () => ({ ruleSetHash: H1, instructions: 'x', decode: (raw: unknown) => (typeof raw === 'object' ? { ok: true, output: raw } : { ok: false, issues: [], raw }) }) as never,
    research: async () => (researchCalls++, { sources: { label: '500 mg' } }),
    drafter: { id: 'mock/drafter', draft: async () => (drafterCalls++, { reply: drafterCalls }) },
    judgeModel: { id: 'judge/mock', model: {} as never },
  }
  const m = new Mastra({ storage: new InMemoryStore(), workflows: { create_node: stageWorkflow('create_node', deps) }, logger: false })
  return { w: m.getWorkflow('create_node'), drafts, ends, calls: () => ({ drafterCalls, researchCalls }) }
}
const msg = (e: any) => `${e?.id ?? ''} ${String(e?.message ?? e).slice(0, 90)}`
async function main() {
  // A1: resume accept, assimilate fails once on a transient store error.
  script.length = 0; script.push(repair, repair, repair)
  let h = make({ failEndOnce: true }); let run = await h.w.createRun(); await run.start({ inputData: { nodeId: 'sunscreen' } })
  const r1 = await run.resume({ step: 'person', resumeData: { decision: 'accept', reviewer: 'op' } })
  console.log('A1 resume accept, endRun fails once ->', r1.status, 'ends', h.ends.length)
  try { const r2 = await run.resume({ step: 'person', resumeData: { decision: 'accept', reviewer: 'op' } }); console.log('A1 second resume ->', r2.status) } catch (e) { console.log('A1 second resume threw', msg(e)) }
  try { const r3 = await (run as any).restart(); console.log('A1 restart ->', r3.status, msg((r3 as any).error)) } catch (e) { console.log('A1 restart threw', msg(e)) }
  console.log('A1 stored status', (await h.w.getWorkflowRunById(run.runId))?.status, 'ends', h.ends.length)
  // A2: start() again on a run id that ended with success.
  script.length = 0; script.push(accept)
  h = make(); run = await h.w.createRun(); const s = await run.start({ inputData: { nodeId: 'sunscreen' } })
  console.log('A2 first start ->', s.status, 'ends', h.ends.length, JSON.stringify(h.calls()))
  const again = await h.w.createRun({ runId: run.runId })
  try { const s2 = await again.start({ inputData: { nodeId: 'sunscreen' } }); console.log('A2 start on ended run id ->', s2.status, msg((s2 as any).error)) } catch (e) { console.log('A2 start threw', msg(e)) }
  console.log('A2 stored status now', (await h.w.getWorkflowRunById(run.runId))?.status, 'ends in store', h.ends.length, JSON.stringify(h.calls()))
  // A3: start() again on a suspended run id.
  script.length = 0; script.push(repair, repair, repair)
  h = make(); run = await h.w.createRun(); await run.start({ inputData: { nodeId: 'sunscreen' } })
  console.log('A3 suspended, calls', JSON.stringify(h.calls()))
  const again3 = await h.w.createRun({ runId: run.runId })
  try { const s3 = await again3.start({ inputData: { nodeId: 'sunscreen' } }); console.log('A3 start on suspended run id ->', s3.status) } catch (e) { console.log('A3 start threw', msg(e)) }
  console.log('A3 stored status', (await h.w.getWorkflowRunById(run.runId))?.status, 'calls', JSON.stringify(h.calls()))
}
main().catch(e => { console.error(e); process.exit(1) })
