import { setup, GOOD_OUTPUT, ans, FIXTURE } from './proto_env'
const att = (o: any) => ({ criteria: [{ name: 'spf', attributes: [{ ...GOOD_OUTPUT.criteria[0].attributes[0], ...o }] }] })
const info = async (e: any) => `drafts=${await e.count('drafts')} verdicts=${await e.count('verdicts')} run_ends=${await e.count('run_ends')} outputs=${await e.count('outputs')} drafterCalls=${e.state.drafterCalls} judgeCalls=${e.state.judgeCalls.calls}`
const s = (r: any) => r.status + (r.status === 'failed' ? ':' + String(r.error?.message ?? r.error).slice(0, 140) : '')
async function main() {
  // N1: a draft text with a NUL char (a model's raw reply that is not JSON)
  { const e = await setup({ drafts: () => 'I think:\u0000 {"criteria": [' }); const w = e.mastra.getWorkflow('create_node'); const run = await w.createRun()
    const r = await run.start({ inputData: { nodeId: 'sunscreen' } }); console.log('N1 NUL in reply text ->', s(r), '|', await info(e)); await e.db.drop() }
  // N1b: object reply with a NUL inside a string value (still a structured reply)
  { const e = await setup({ drafts: () => att({ quote: '500 mg\u0000' }) }); const w = e.mastra.getWorkflow('create_node'); const run = await w.createRun()
    const r = await run.start({ inputData: { nodeId: 'sunscreen' } }); console.log('N1b NUL in object value ->', s(r), '|', await info(e)); await e.db.drop() }
  // N2: start again with the same run id after the run suspended (a step that runs again)
  for (const [label, items, draft] of [['budget_spent(repair)', [ans('yes', '500 mg')], att({ key: 'trending' })], ['cannot_verify(person)', [ans('unknown', '')], GOOD_OUTPUT]] as const) {
    const e = await setup({ drafts: () => draft, judgeItems: [...items] }); const w = e.mastra.getWorkflow('create_node'); const run = await w.createRun()
    const r1 = await run.start({ inputData: { nodeId: 'sunscreen' } }); const before = await info(e)
    const p1 = JSON.stringify((r1 as any).steps?.person?.suspendPayload)
    const again = await w.createRun({ runId: run.runId }); let r2: any
    try { r2 = await again.start({ inputData: { nodeId: 'sunscreen' } }) } catch (er: any) { r2 = { status: 'threw ' + er.id + ' ' + String(er.message).slice(0, 100) } }
    const p2 = JSON.stringify(r2.steps?.person?.suspendPayload)
    console.log(`N2 ${label}: first=${r1.status} [${before}]\n   second start same runId=${s(r2)} [${await info(e)}] payload equal=${p1 === p2}`)
    await e.db.drop() }
  // N3: watch rules never block (watch judgement rule answered no, watch code check failing)
  { const e = await setup({ judgeItems: [ans('no', 'spf')], drafts: () => att({ key: 'trending' }) })
    e.state.rules = e.state.rules.map((r: any) => ['criteria.attribute_is_product', 'attributes.key_known'].includes(r.id) ? { ...r, binding: 'watch' } : r)
    const w = e.mastra.getWorkflow('create_node'); const run = await w.createRun(); const r = await run.start({ inputData: { nodeId: 'sunscreen' } })
    console.log('N3 watch fail ->', s(r), JSON.stringify((r as any).result), '|', await info(e)); await e.db.drop() }
  // N4: reviewer/note blanks
  { let i = 0; const e = await setup({ drafts: () => att({ key: 'trending' }) }); const w = e.mastra.getWorkflow('create_node'); const run = await w.createRun(); await run.start({ inputData: { nodeId: 'sunscreen' } })
    const r = await run.resume({ step: 'person', resumeData: { decision: 'reject', reviewer: ' ', note: ' ' } as never }); console.log('N4 reject with blank reviewer and note ->', s(r), await info(e)); await e.db.drop() }
}
main().catch(e => { console.error('ERR', e); process.exit(1) })
