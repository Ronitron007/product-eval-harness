import { setup, GOOD_OUTPUT, ans, FIXTURE } from './proto_env'
const att = (o: any) => ({ criteria: [{ name: 'spf', attributes: [{ ...GOOD_OUTPUT.criteria[0].attributes[0], ...o }] }] })
const strictFail = att({ key: 'trending' }) // decodes, strict code check fails
const broken = att({ amount: -1 })       // breaks the shape
const info = async (e: any) => `drafts=${await e.count('drafts')} verdicts=${await e.count('verdicts')} run_ends=${await e.count('run_ends')} outputs=${await e.count('outputs')} drafterCalls=${e.state.drafterCalls} judgeCalls=${e.state.judgeCalls.calls}`
const s = (r: any) => r.status + (r.status === 'failed' ? ':' + String(r.error?.message ?? r.error).slice(0, 110) : '')
async function suspendedEnv(drafts: unknown[]) {
  let i = 0; const e = await setup({ drafts: () => drafts[Math.min(i++, drafts.length - 1)] })
  const w = e.mastra.getWorkflow('create_node'); const run = await w.createRun()
  const r = await run.start({ inputData: { nodeId: 'sunscreen' } })
  return { e, w, run, r }
}
async function main() {
  // M1 first-round accept, then resume of a success run
  { const e = await setup(); const w = e.mastra.getWorkflow('create_node'); const run = await w.createRun()
    const r = await run.start({ inputData: { nodeId: 'sunscreen' } }); console.log('M1 first round:', s(r), JSON.stringify((r as any).result), await info(e))
    try { const x = await run.resume({ step: 'person', resumeData: { decision: 'reject', reviewer: 'op', note: 'n' } }); console.log('M1 resume after success ->', s(x)) } catch (er: any) { console.log('M1 resume after success threw', er.id) }
    console.log('   after:', await info(e)); await e.db.drop() }
  // M2 budget spent with decodable strict fail; accept twice + concurrent
  { const { e, w, run, r } = await suspendedEnv([strictFail]); console.log('M2 start:', s(r), (r as any).steps?.person?.suspendPayload?.why, 'canAccept', (r as any).steps?.person?.suspendPayload?.canAccept, await info(e))
    const a = await w.createRun({ runId: run.runId }), b = await w.createRun({ runId: run.runId })
    const res = await Promise.allSettled([a.resume({ step: 'person', resumeData: { decision: 'accept', reviewer: 'op' } }), b.resume({ step: 'person', resumeData: { decision: 'reject', reviewer: 'op2', note: 'no' } })])
    console.log('M2 concurrent accept+reject:', res.map(x => x.status === 'fulfilled' ? s(x.value) + JSON.stringify((x.value as any).result) : 'rej ' + ((x.reason as any).id ?? x.reason)))
    console.log('   after:', await info(e), JSON.stringify((await e.q('select "end", round, reviewer from harness.run_ends')).rows)); await e.db.drop() }
  // M3 reject
  { const { e, w, run } = await suspendedEnv([strictFail]); const x = await run.resume({ step: 'person', resumeData: { decision: 'reject', reviewer: 'op', note: 'dup' } }); console.log('M3 reject:', s(x), JSON.stringify((x as any).result), await info(e)); await e.db.drop() }
  // M4 rule change while suspended
  for (const dec of ['accept', 'reject'] as const) {
    const { e, w, run } = await suspendedEnv([strictFail])
    e.state.rules = e.state.rules.filter((r: any) => r.id !== 'attributes.key_known') // rule change
    const x = await run.resume({ step: 'person', resumeData: dec === 'accept' ? { decision: 'accept', reviewer: 'op' } : { decision: 'reject', reviewer: 'op', note: 'n' } })
    console.log('M4 rule change then', dec, '->', s(x), await info(e)); await e.db.drop() }
  // M5 wrong level
  { const e = await setup({ stages: ['create_pack'] }); const w = e.mastra.getWorkflow('create_pack'); const run = await w.createRun()
    const x = await run.start({ inputData: { nodeId: 'sunscreen' } }); console.log('M5 create_pack at inner node:', s(x), 'stage_runs', await e.count('stage_runs'), 'drafterCalls', e.state.drafterCalls); await e.db.drop() }
  // M6 repair then accept
  { let i = 0; const seq = [broken, GOOD_OUTPUT]; const e = await setup({ drafts: () => seq[i++] }); const w = e.mastra.getWorkflow('create_node'); const run = await w.createRun()
    const r = await run.start({ inputData: { nodeId: 'sunscreen' } }); console.log('M6 repair then accept:', s(r), JSON.stringify((r as any).result), await info(e)); await e.db.drop() }
}
main().catch(e => { console.error('ERR', e); process.exit(1) })
