// Runs sketch-run.ts with an in-memory store that keeps the keys of stage.store. No model, no network.
import { Mastra } from '@mastra/core/mastra'
import { InMemoryStore } from '@mastra/core/storage'
import { checkModels, finishRun, judgeCalls, judgeRound, script, stageWorkflow, type DecisionRow, type DraftRow, type StageDeps, type StageResult, type Timing } from './sketch-run'
import type { VerdictInput } from '../../../src/store/store'
const H1 = 'a'.repeat(64), H2 = 'b'.repeat(64)
const repair = { kind: 'repair' as const, errors: [{ from: 'r.x@1', target: 't', fix: 'f' }], warnings: [] }
const accept = { kind: 'accept' as const, output: { ok: 1 }, warnings: [] }
const person = { kind: 'person' as const, open: [], warnings: [] }
function make(hashes: () => string, o: { failEndOnce?: boolean; timing?: Timing } = {}) {
  const drafts: DraftRow[] = []; const ends: StageResult[] = []; const decisions: DecisionRow[] = []; const claims = new Map<string, { attempt: number; at: number }>(); const rows = new Map<string, VerdictInput[]>()
  const runs = new Map<string, string>(); const calls = { drafter: 0, research: 0 }; let failNext = !!o.failEndOnce
  const deps: StageDeps = {
    store: {
      recordStageRun: async (i: any) => { if (runs.has(i.runId)) throw new Error('pk stage_runs'); runs.set(i.runId, i.ruleSetHash); return i },
      stageRun: async id => (runs.has(id) ? { runId: id, ruleSetHash: runs.get(id)! } : undefined),
      pathToRoot: async () => [{ id: 'skincare', label: 'Skincare' }, { id: 'sunscreen', label: 'Sunscreen' }] as never, siblings: async () => [] as never,
      addDraft: async r => { if (drafts.some(d => d.runId === r.runId && d.round === r.round)) throw new Error('pk drafts'); drafts.push(r) },
      draftOf: async (id, n) => drafts.find(d => d.runId === id && d.round === n),
      writeVerdicts: async (r, n) => { const k = `${r[0]!.runId}:${n}`; if (rows.has(k)) throw new Error('unique verdicts'); rows.set(k, [...r]) },
      verdictsOf: async (id, n) => rows.get(`${id}:${n}`) ?? [],
      // The claim of stage.claim_lease: attempt max + 1 when the latest claim is older than the lease and no row exists.
      claimJudge: async (id, n, leaseMs) => { const k = `${id}:${n}`; const c = claims.get(k); if (rows.has(k) || (c && Date.now() - c.at < leaseMs)) return null; const attempt = (c?.attempt ?? 0) + 1; claims.set(k, { attempt, at: Date.now() }); return attempt },
      addDecision: async d => { if (ends.some(e => e.runId === d.runId)) throw new Error('check_decision_open'); const old = decisions.find(x => x.runId === d.runId); if (old && JSON.stringify(old) !== JSON.stringify(d)) throw new Error('pk person_decisions'); if (!old) decisions.push(d) },
      decisionOf: async id => decisions.find(d => d.runId === id),
      runEndOf: async id => ends.find(e => e.runId === id),
      endRun: async e => {
        if (failNext) { failNext = false; throw new Error('connection reset (transient)') }
        const old = ends.find(x => x.runId === e.runId); if (old) { if (old.end !== e.end) throw new Error('pk run_ends'); return old }
        const r: StageResult = { runId: e.runId, end: e.end, round: e.round, outputId: 'output' in e ? 'out-1' : null }; ends.push(r); return r
      },
    },
    planFor: async () => ({ ruleSetHash: hashes(), instructions: 'x', decode: (raw: unknown) => (typeof raw === 'object' ? { ok: true, output: raw } : { ok: false, issues: [], raw }) }) as never,
    research: async () => (calls.research++, { sources: { label: '500 mg' } }),
    drafter: { id: 'mock/drafter', draft: async () => (calls.drafter++, { reply: calls.drafter }) },
    judgeModel: { id: 'other/judge', model: {} as never },
    timing: o.timing,
  }
  const m = new Mastra({ storage: new InMemoryStore(), workflows: { create_node: stageWorkflow('create_node', deps) }, logger: false })
  return { w: m.getWorkflow('create_node'), deps, drafts, ends, decisions, calls, rows }
}
const show = (r: any) => r.status === 'success' ? `success ${r.result.end} round ${r.result.round}` : r.status === 'suspended' ? `suspended ${r.steps.person.suspendPayload.why} round ${r.steps.person.suspendPayload.round}` : `${r.status} ${String(r.error?.message ?? r.error).slice(0, 80)}`
async function main() {
  for (const [name, outs] of [['first pass', [accept]], ['after repair', [repair, accept]], ['budget spent', [repair, repair, repair]], ['cannot verify', [person]]] as const) {
    script.length = 0; script.push(...outs)
    const h = make(() => H1); const run = await h.w.createRun(); const r = await run.start({ inputData: { nodeId: 'sunscreen' } })
    console.log(name, '->', show(r), '| drafts', h.drafts.map(d => d.round).join(','), '| drafter calls', h.calls.drafter)
    if (name === 'budget spent') console.log('  resume accept ->', show(await run.resume({ step: 'person', resumeData: { decision: 'accept', reviewer: 'op' } })), '| decisions', h.decisions.length, '| ends', h.ends.length)
  }
  script.length = 0; script.push(repair, repair, repair)
  let h = make(() => H1); let run = await h.w.createRun(); await run.start({ inputData: { nodeId: 'sunscreen' } })
  console.log('reject ->', show(await run.resume({ step: 'person', resumeData: { decision: 'reject', reviewer: 'op', note: 'no' } })), '| outputId', h.ends[0]?.outputId)
  h = make(() => H1); run = await h.w.createRun(); await run.start({ inputData: { nodeId: 'sunscreen' } })
  try { await run.resume({ step: 'person', resumeData: { decision: 'reject', reviewer: ' ', note: ' ' } }) } catch (e: any) { console.log('blank reviewer and note ->', e.id) }
  let n = 0; h = make(() => (n++ < 8 ? H1 : H2)); run = await h.w.createRun(); await run.start({ inputData: { nodeId: 'sunscreen' } })
  console.log('resume after rule change ->', show(await run.resume({ step: 'person', resumeData: { decision: 'accept', reviewer: 'op' } })), '| ends', h.ends.length, '| decisions', h.decisions.length)
  // stage.decision_first: assimilate fails once; the decision row stays; the operator path ends the run.
  h = make(() => H1, { failEndOnce: true }); run = await h.w.createRun(); await run.start({ inputData: { nodeId: 'sunscreen' } })
  console.log('endRun fails once ->', show(await run.resume({ step: 'person', resumeData: { decision: 'accept', reviewer: 'op' } })), '| decisions', h.decisions.length, '| ends', h.ends.length)
  const fin = await finishRun(h.deps, { runId: run.runId, stage: 'create_node', nodeId: 'sunscreen', ruleSetHash: H1, round: 3 })
  console.log('  finishRun ->', fin.end, '| ends', h.ends.length, '| again ->', (await finishRun(h.deps, { runId: run.runId, stage: 'create_node', nodeId: 'sunscreen', ruleSetHash: H1, round: 3 })).end, '| ends', h.ends.length)
  // stage.reuse_end: a second start on an ended run id.
  script.length = 0; script.push(accept)
  h = make(() => H1); run = await h.w.createRun(); await run.start({ inputData: { nodeId: 'sunscreen' } })
  const again = await (await h.w.createRun({ runId: run.runId })).start({ inputData: { nodeId: 'sunscreen' } })
  console.log('start on an ended run ->', show(again), '| research calls', h.calls.research, '| drafter calls', h.calls.drafter)
  // stage.judge_claim: two judge steps for one round at the same time.
  judgeCalls.n = 0; script.length = 0; script.push(accept)
  h = make(() => H1)
  const input = { runId: 'claim-run', stage: 'create_node' as const, nodeId: 'sunscreen', ruleSetHash: H1, round: 1, reply: { a: 1 }, evidence: {} }
  const fast: Timing = { claimLeaseMs: 4000, judgeDeadlineMs: 3500, pollMs: 100 }
  judgeCalls.delayMs = 3000 // stage.judge_wait: a slow judge, about 3 s
  h = make(() => H1, { timing: fast })
  const both = await Promise.all([judgeRound(h.deps, input), judgeRound(h.deps, input)])
  console.log('two judge steps, slow judge ->', both.map(o => o.kind).join(','), '| judge calls', judgeCalls.n, '| row batches', h.rows.size)
  judgeCalls.delayMs = 0; judgeCalls.n = 0
  // stage.claim_lease: a claim whose winner died. The next attempt waits for the lease, then claims attempt 2.
  h = make(() => H1, { timing: { claimLeaseMs: 500, judgeDeadlineMs: 400, pollMs: 50 } })
  await h.deps.store.claimJudge('claim-run', 1, 500) // attempt 1, then the process dies
  const t0 = Date.now(); const after = await judgeRound(h.deps, input)
  console.log('claim of a dead winner ->', after.kind, '| waited ms >= 450', Date.now() - t0 >= 450, '| judge calls', judgeCalls.n)
  // stage.judge_wait: a claim that stays live for the whole wait gives busy, never failed.
  h = make(() => H1, { timing: { claimLeaseMs: 300, judgeDeadlineMs: 200, pollMs: 50 } })
  const live = { ...h.deps, store: { ...h.deps.store, claimJudge: async () => null } }
  const busy = await judgeRound(live, input)
  console.log('a live claim for one lease ->', JSON.stringify(busy))
  // stage.decision_closed: no decision after the end.
  script.length = 0; script.push(accept); h = make(() => H1); run = await h.w.createRun(); await run.start({ inputData: { nodeId: 'sunscreen' } })
  try { await h.deps.store.addDecision({ runId: run.runId, round: 1, decision: 'reject', reviewer: 'op', note: 'late' }); console.log('decision after end -> stored') } catch (e: any) { console.log('decision after end -> refused') }
  for (const [d, j] of [['anthropic/a', 'anthropic/b'], ['anthropic/a', 'openrouter/anthropic/b'], ['anthropic/a', 'openai/b'], ['', 'openai/b']]) {
    try { checkModels(d!, j!); console.log('models', d, j, '-> accepted') } catch (e: any) { console.log('models', JSON.stringify(d), j, '-> refused') }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
