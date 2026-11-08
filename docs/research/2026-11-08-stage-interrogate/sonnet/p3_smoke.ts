import { setup, GOOD_OUTPUT, ans } from './proto_env'
async function main() {
  const bad = { criteria: [{ name: 'spf', attributes: [{ amount: -1, key: 'spf', quote: '500 mg', unit: 'mg' }] }] }
  const seq = [bad, bad, bad]; let i = 0
  const e = await setup({ drafts: () => seq[i++] })
  const w = e.mastra.getWorkflow('create_node')
  const run = await w.createRun(); const r = await run.start({ inputData: { nodeId: 'sunscreen' } })
  console.log('status', r.status, 'drafter calls', e.state.drafterCalls, 'drafts', await e.count('drafts'), 'verdict rows', await e.count('verdicts'))
  if (r.status === 'suspended') console.log(JSON.stringify((r.steps as any).person.suspendPayload).slice(0, 400))
  else console.log(JSON.stringify(r).slice(0, 600))
  await e.db.drop()
}
main().catch(e => { console.error('ERR', e); process.exit(1) })
