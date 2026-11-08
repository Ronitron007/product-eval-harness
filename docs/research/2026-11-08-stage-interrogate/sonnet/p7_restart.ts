import { Mastra } from '@mastra/core/mastra'
import { harnessStorage } from '../../../../src/mastra/harness'
import { setup, GOOD_OUTPUT } from './proto_env'
import { stageWorkflow } from './proto_workflow'
const att = (o: any) => ({ criteria: [{ name: 'spf', attributes: [{ ...GOOD_OUTPUT.criteria[0].attributes[0], ...o }] }] })
async function main() {
  const e = await setup({ drafts: () => att({ key: 'trending' }) })
  const w = e.mastra.getWorkflow('create_node'); const run = await w.createRun(); await run.start({ inputData: { nodeId: 'sunscreen' } })
  // a second process: new Mastra, new workflow object, same Postgres
  const m2 = new Mastra({ storage: harnessStorage(e.pool), workflows: { create_node: stageWorkflow('create_node', e.deps) }, logger: false })
  const w2 = m2.getWorkflow('create_node')
  const st: any = await w2.getWorkflowRunById(run.runId)
  console.log('P7 stored status', st?.status, 'keys', Object.keys(st ?? {}).join(','), '| payload via steps.person.suspendPayload:', JSON.stringify(st?.steps?.person?.suspendPayload ?? null).slice(0, 80))
  const r2 = await (await w2.createRun({ runId: run.runId })).resume({ step: 'person', resumeData: { decision: 'accept', reviewer: 'op' } })
  console.log('P7 resume from second instance ->', r2.status, JSON.stringify((r2 as any).result), 'run_ends', await e.count('run_ends'))
  await e.db.drop()
}
main().catch(e => { console.error('ERR', e); process.exit(1) })
