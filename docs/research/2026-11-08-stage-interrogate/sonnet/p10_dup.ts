import { setup, GOOD_OUTPUT, ans } from './proto_env'
const s = (r: any) => r.status + (r.status === 'failed' ? ':' + String(r.error?.message ?? r.error).slice(0, 100) : '')
async function main() {
  let boom = true
  const e = await setup({ hooks: { afterAddDraft: () => { if (boom) { boom = false; throw new Error('simulated crash after the draft insert') } } } })
  const w = e.mastra.getWorkflow('create_node'); const run = await w.createRun()
  const r0 = await run.start({ inputData: { nodeId: 'sunscreen' } })
  console.log('R0 crash after draft insert ->', s(r0), '| drafts', await e.count('drafts'), 'verdicts', await e.count('verdicts'), 'judgeCalls', e.state.judgeCalls.calls)
  // two recoveries of the same run at the same time (two replicas' boot sweeps, or a lapsed lease): both re-run the judge step
  const [a, b] = [await w.createRun({ runId: run.runId }), await w.createRun({ runId: run.runId })]
  const res = await Promise.allSettled([a.start({ inputData: { nodeId: 'sunscreen' } }), b.start({ inputData: { nodeId: 'sunscreen' } })])
  console.log('R1 two concurrent re-runs ->', res.map(x => x.status === 'fulfilled' ? s(x.value) : 'rej ' + (x.reason as any).message?.slice(0, 80)))
  console.log('   verdict rows of round 1:', await e.count('verdicts', `where run_id='${run.runId}' and round=1`), '(rules in plan: 10) | judgeCalls', e.state.judgeCalls.calls, '(intent: 1) | drafterCalls', e.state.drafterCalls, '| run_ends', await e.count('run_ends'), 'outputs', await e.count('outputs'))
  await e.db.drop(); process.exit(0)
}
main().catch(e => { console.error('ERR', e); process.exit(1) })
