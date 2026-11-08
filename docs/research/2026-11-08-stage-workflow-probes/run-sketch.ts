import { Mastra } from '@mastra/core/mastra'
import { InMemoryStore } from '@mastra/core/storage'
import { script, stageWorkflow, type StageDeps, type DraftRow } from './sketch-run'
const H1 = 'a'.repeat(64), H2 = 'b'.repeat(64)
const repair = { kind: 'repair' as const, errors: [{ from: 'r.x@1', target: 't', fix: 'f' }], warnings: [] }
const accept = { kind: 'accept' as const, output: { ok: 1 }, warnings: [] }
const person = { kind: 'person' as const, open: [], warnings: [] }
function make(hashes: () => string) {
  const drafts: DraftRow[] = []; const ends: unknown[] = []; let drafterCalls = 0
  const deps: StageDeps = {
    store: {
      recordStageRun: async (i) => i as never, pathToRoot: async () => [{ id: 'skincare', label: 'Skincare' }, { id: 'sunscreen', label: 'Sunscreen' }] as never, siblings: async () => [] as never, stageRun: async () => undefined, writeVerdicts: async () => [], verdictsOf: async () => [],
      addDraft: async r => { drafts.push(r) }, draftOf: async (id, n) => drafts.find(d => d.runId === id && d.round === n),
      endRun: async e => { ends.push(e); return { outputId: 'output' in e ? 'out-1' : null } },
    },
    planFor: async () => ({ ruleSetHash: hashes(), instructions: 'x', decode: (raw: unknown) => (typeof raw === 'object' ? { ok: true, output: raw } : { ok: false, issues: [], raw }) }) as never,
    research: async () => ({ sources: { label: '500 mg' } }),
    drafter: { id: 'mock/drafter', draft: async () => (drafterCalls++, { reply: drafterCalls }) },
    judgeModel: { id: 'mock/judge', model: {} as never },
  }
  const wf = stageWorkflow('create_node', deps)
  const m = new Mastra({ storage: new InMemoryStore(), workflows: { create_node: wf }, logger: false })
  return { w: m.getWorkflow('create_node'), drafts, ends, calls: () => drafterCalls }
}
async function main() {
  for (const [name, outs] of [['first pass', [accept]], ['after repair', [repair, accept]], ['budget spent', [repair, repair, repair]], ['cannot verify', [person]]] as const) {
    script.length = 0; script.push(...outs)
    const h = make(() => H1)
    const run = await h.w.createRun(); const r = await run.start({ inputData: { nodeId: 'sunscreen' } })
    console.log(name, '->', r.status, r.status === 'success' ? JSON.stringify(r.result) : r.status === 'suspended' ? JSON.stringify((r.steps as any).person?.suspendPayload?.why) + ' round ' + (r.steps as any).person?.suspendPayload?.round : String((r as any).error), 'drafts', h.drafts.map(d => d.round).join(','), 'drafterCalls', h.calls())
    if (name === 'budget spent') {
      const a = await run.resume({ step: 'person', resumeData: { decision: 'accept', reviewer: 'op' } })
      console.log('  resume accept ->', a.status, JSON.stringify((a as any).result), JSON.stringify(h.ends))
    }
  }
  // reject
  script.length = 0; script.push(repair, repair, repair)
  let h = make(() => H1); let run = await h.w.createRun(); await run.start({ inputData: { nodeId: 'sunscreen' } })
  const rj = await run.resume({ step: 'person', resumeData: { decision: 'reject', reviewer: 'op', note: 'no' } })
  console.log('reject ->', rj.status, JSON.stringify((rj as any).result), JSON.stringify(h.ends))
  // rule change on resume
  let n = 0; h = make(() => (n++ < 8 ? H1 : H2)); run = await h.w.createRun(); const s = await run.start({ inputData: { nodeId: 'sunscreen' } })
  console.log('planFor calls before suspend', n, s.status)
  const rc = await run.resume({ step: 'person', resumeData: { decision: 'accept', reviewer: 'op' } })
  console.log('resume after rule change ->', rc.status, String((rc as any).error?.message ?? (rc as any).error).slice(0, 100), 'ends', h.ends.length)
  // undecodable last draft: accept refused, re-suspend
  script.length = 0; script.push(repair, repair, repair)
  h = make(() => H1); (h as any)
  run = await h.w.createRun()
}
main().catch(e => { console.error(e); process.exit(1) })
