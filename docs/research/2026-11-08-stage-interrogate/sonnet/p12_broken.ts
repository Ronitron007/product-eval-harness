import { setup, GOOD_OUTPUT } from './proto_env'
const bad = { criteria: [{ name: 'spf', attributes: [{ ...GOOD_OUTPUT.criteria[0].attributes[0], amount: -1 }] }] }
const s = (r: any) => r.status + (r.status === 'failed' ? ':' + String(r.error?.message ?? r.error).slice(0, 100) : '')
async function main() {
  const e = await setup({ drafts: () => bad }); const w = e.mastra.getWorkflow('create_node'); const run = await w.createRun()
  const r0 = await run.start({ inputData: { nodeId: 'sunscreen' } })
  const p0 = (r0 as any).steps.person.suspendPayload
  console.log('B0', s(r0), 'canAccept', p0.canAccept, 'errors', p0.errors.length, 'open', p0.open.length)
  const r1 = await run.resume({ step: 'person', resumeData: { decision: 'accept', reviewer: 'op' } })
  console.log('B1 accept of undecodable ->', s(r1), 'refusal:', String((r1 as any).steps?.person?.suspendPayload?.refusal).slice(0, 60), '| run_ends', await e.count('run_ends'), 'outputs', await e.count('outputs'))
  const r2 = await run.resume({ step: 'person', resumeData: { decision: 'accept', reviewer: 'op' } })
  console.log('B2 accept again ->', s(r2))
  const r3 = await run.resume({ step: 'person', resumeData: { decision: 'reject', reviewer: 'op', note: 'bad' } })
  console.log('B3 reject ->', s(r3), JSON.stringify((r3 as any).result), '| run_ends', await e.count('run_ends'), 'outputs', await e.count('outputs'))
  await e.db.drop(); process.exit(0)
}
main().catch(e => { console.error('ERR', e); process.exit(1) })
