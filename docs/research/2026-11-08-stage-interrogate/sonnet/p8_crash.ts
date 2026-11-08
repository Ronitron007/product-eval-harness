import { Mastra } from '@mastra/core/mastra'
import { harnessStorage } from '../../../../src/mastra/harness'
import { setup, GOOD_OUTPUT } from './proto_env'
import { stageWorkflow } from './proto_workflow'
const att = (o: any) => ({ criteria: [{ name: 'spf', attributes: [{ ...GOOD_OUTPUT.criteria[0].attributes[0], ...o }] }] })
const s = (r: any) => r.status + (r.status === 'failed' ? ':' + String(r.error?.message ?? r.error).slice(0, 140) : '')
async function main() {
  const e = await setup({ drafts: () => att({ key: 'trending' }) })
  const w = e.mastra.getWorkflow('create_node'); const run = await w.createRun(); await run.start({ inputData: { nodeId: 'sunscreen' } })
  // Process death after the resume claimed the run and before endRun wrote: the first endRun never returns.
  const realEnd = e.store.endRun; let hung = false
  ;(e.deps.store as any).endRun = (i: any) => { if (!hung) { hung = true; return new Promise(() => {}) } return realEnd(i) }
  void run.resume({ step: 'person', resumeData: { decision: 'accept', reviewer: 'op' } }).catch(() => {})
  await new Promise(r => setTimeout(r, 1500))
  // A second process (new Mastra, same Postgres), after the first one is gone.
  const m2 = new Mastra({ storage: harnessStorage(e.pool), workflows: { create_node: stageWorkflow('create_node', e.deps) }, logger: false })
  const w2 = m2.getWorkflow('create_node')
  const st: any = await w2.getWorkflowRunById(run.runId)
  console.log('P8 status after death:', st?.status, '| run_ends', await e.count('run_ends'), 'outputs', await e.count('outputs'))
  try { const r = await (await w2.createRun({ runId: run.runId })).resume({ step: 'person', resumeData: { decision: 'accept', reviewer: 'op' } }); console.log('P8 resume ->', s(r)) } catch (er: any) { console.log('P8 resume threw', er.id) }
  try { const r = await (await w2.createRun({ runId: run.runId })).restart(); console.log('P8 restart ->', s(r), JSON.stringify((r as any).result), '| run_ends', await e.count('run_ends'), 'outputs', await e.count('outputs'), 'drafterCalls', e.state.drafterCalls) } catch (er: any) { console.log('P8 restart threw', er.id ?? '', String(er.message).slice(0, 160)) }
  await e.db.drop(); process.exit(0)
}
main().catch(e => { console.error('ERR', e); process.exit(1) })
