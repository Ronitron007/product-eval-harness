import { makeDb, makeEnv, script, judgeCalls } from './env'
import { finishRun } from './sketch-run'
const repair = { kind: 'repair' as const, errors: [{ from: 'r.x@1', target: 't', fix: 'f' }], warnings: [] }
const accept = { kind: 'accept' as const, output: { reply: 1 }, warnings: [] }
const st = (r: any) => r.status + (r.status === 'failed' ? ':' + String(r.error?.message ?? r.error).slice(0, 90) : r.status === 'success' ? ' ' + JSON.stringify(r.result) : '')
const db = await makeDb()
// A1: resume accept, endRun throws once.
{ script.length = 0; script.push(repair, repair, repair); let boom = true
  const e = makeEnv(db.url, { beforeEndRun: () => { if (boom) { boom = false; throw new Error('connection reset (transient)') } } })
  const run = await e.w.createRun(); await run.start({ inputData: { nodeId: 'sunscreen' } })
  const r = await run.resume({ step: 'person', resumeData: { decision: 'accept', reviewer: 'op' } })
  let r2: string; try { r2 = st(await run.resume({ step: 'person', resumeData: { decision: 'accept', reviewer: 'op' } })) } catch (x: any) { r2 = 'threw ' + x.id }
  const f = await finishRun(e.deps, { runId: run.runId, stage: 'create_node', nodeId: 'sunscreen', ruleSetHash: 'a'.repeat(64), round: 3 })
  const f2 = await finishRun(e.deps, { runId: run.runId, stage: 'create_node', nodeId: 'sunscreen', ruleSetHash: 'a'.repeat(64), round: 3 })
  console.log('A1 resume ->', st(r), '| 2nd resume', r2, '| finishRun', f.end, f2.end, '| decisions', await e.count('person_decisions', run.runId), 'ends', await e.count('run_ends', run.runId), 'outputs', await e.count('outputs', run.runId)) }
// A2: start again on an ended run id.
{ script.length = 0; script.push(accept); const e = makeEnv(db.url); const run = await e.w.createRun(); const s1 = await run.start({ inputData: { nodeId: 'sunscreen' } })
  const s2 = await (await e.w.createRun({ runId: run.runId })).start({ inputData: { nodeId: 'sunscreen' } })
  console.log('A2 first', s1.status, '| second start ->', st(s2), '| stored', (await e.w.getWorkflowRunById(run.runId))?.status, '| research', e.counts.research, 'drafter', e.counts.drafter, 'ends', await e.count('run_ends', run.runId), 'outputs', await e.count('outputs', run.runId)) }
// p10_dup: store error after the draft insert, then two concurrent starts of one run id.
{ script.length = 0; script.push(accept); let boom = true; judgeCalls.n = 0
  const e = makeEnv(db.url, { afterAddDraft: () => { if (boom) { boom = false; throw new Error('simulated crash after the draft insert') } } })
  const run = await e.w.createRun(); const r0 = await run.start({ inputData: { nodeId: 'sunscreen' } })
  const res = await Promise.allSettled([1, 2].map(async () => (await e.w.createRun({ runId: run.runId })).start({ inputData: { nodeId: 'sunscreen' } })))
  console.log('P10 first ->', st(r0).slice(0, 60), '| two re-starts ->', res.map(x => x.status === 'fulfilled' ? st(x.value) : 'rej ' + String((x.reason as any)?.message).slice(0, 60)).join(' || '), '| judgeCalls', judgeCalls.n, 'verdict rows r1', (await e.q('select count(*) from harness.verdicts where run_id=$1 and round=1', [run.runId])).rows[0].count, 'drafter', e.counts.drafter, 'ends', await e.count('run_ends', run.runId), 'outputs', await e.count('outputs', run.runId)) }
// N1: a text reply with NUL, and an object with NUL.
for (const reply of ['I think:\u0000 {"criteria": [', { quote: '500 mg\u0000' }]) {
  script.length = 0; script.push(repair, repair, repair); const e = makeEnv(db.url, { reply: (() => reply) as any }); const run = await e.w.createRun(); const r = await run.start({ inputData: { nodeId: 'sunscreen' } })
  const back = await e.deps.store.draftOf(run.runId, 1)
  console.log('N1', typeof reply, '->', st(r), '| drafts', await e.count('drafts', run.runId), 'kept equal', JSON.stringify(back?.reply) === JSON.stringify(reply), 'payload reply equal', JSON.stringify((r as any).steps?.person?.suspendPayload?.reply) === JSON.stringify(reply)) }
// N2: second start on a suspended run id.
{ script.length = 0; script.push(repair, repair, repair); const e = makeEnv(db.url); const run = await e.w.createRun(); const r1: any = await run.start({ inputData: { nodeId: 'sunscreen' } })
  const r2: any = await (await e.w.createRun({ runId: run.runId })).start({ inputData: { nodeId: 'sunscreen' } })
  console.log('N2 suspended, start again ->', st(r2), '| payload equal', JSON.stringify(r1.steps.person.suspendPayload) === JSON.stringify(r2.steps?.person?.suspendPayload), '| drafter', e.counts.drafter, 'research', e.counts.research)
  const a = await run.resume({ step: 'person', resumeData: { decision: 'accept', reviewer: 'op' } }); console.log('   then resume accept ->', st(a), 'outputs', await e.count('outputs', run.runId)) }
// New: a decision row inserted after an accepted end.
{ script.length = 0; script.push(accept); const e = makeEnv(db.url); const run = await e.w.createRun(); await run.start({ inputData: { nodeId: 'sunscreen' } })
  try { await e.deps.store.addDecision({ runId: run.runId, round: 1, decision: 'reject', reviewer: 'op', note: 'late' } as any); console.log('X1 reject decision after accepted end -> ok | ends', (await e.q('select "end" from harness.run_ends where run_id=$1', [run.runId])).rows[0].end, 'outputs', await e.count('outputs', run.runId), 'decision', (await e.deps.store.decisionOf(run.runId))?.decision) } catch (x: any) { console.log('X1 refused', x.message) } }
await db.drop(); process.exit(0)
