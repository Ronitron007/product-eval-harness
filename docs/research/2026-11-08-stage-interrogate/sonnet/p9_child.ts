// child: runs the stage; kills itself (SIGKILL) at the hook named in argv[3]
import { setup, GOOD_OUTPUT, ans } from './proto_env'
const [, , url, hook, mode, runId] = process.argv
const att = (o: any) => ({ criteria: [{ name: 'spf', attributes: [{ ...GOOD_OUTPUT.criteria[0].attributes[0], ...o }] }] })
const die = () => process.kill(process.pid, 'SIGKILL')
async function main() {
  const e = await setup({ existingUrl: url, drafts: () => att({ key: 'trending' }), hooks: hook === 'afterAddDraft' ? { afterAddDraft: () => { if (process.env.DIE_ROUND === String(++n)) die() } } : hook === 'beforeEndRun' ? { beforeEndRun: die } : hook === 'afterEndRun' ? { afterEndRun: die } : {} })
  const w = e.mastra.getWorkflow('create_node')
  if (mode === 'start') { const run = await w.createRun({ runId }); console.log('child start', (await run.start({ inputData: { nodeId: 'sunscreen' } })).status) }
  else if (mode === 'resume') { const run = await w.createRun({ runId }); console.log('child resume', (await run.resume({ step: 'person', resumeData: { decision: 'accept', reviewer: 'op' } })).status) }
  process.exit(0)
}
let n = 0
main().catch(e => { console.error('child ERR', e.message); process.exit(1) })
