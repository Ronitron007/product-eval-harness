// Probe 1: spec's stage_workflow sketch (probe sketch-run.ts) with Mastra storage on REAL Postgres (PostgresStore), not InMemoryStore.
import { Mastra } from '@mastra/core/mastra'
import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { freshDatabase } from './pgutil'
import { harnessStorage } from '../../../../src/mastra/harness'

async function main() {
  process.env.HARNESS_TEST_DATABASE_URL ||= ''
  const db = await freshDatabase()
  const pool = db.pool()
  let personBodies = 0, endWrites = 0
  const person = createStep({
    id: 'person', inputSchema: z.object({ n: z.number() }), outputSchema: z.object({ decision: z.string() }),
    suspendSchema: z.object({ why: z.string() }), resumeSchema: z.object({ decision: z.enum(['accept', 'reject']), note: z.string().min(1).optional() }),
    execute: async ({ inputData, resumeData, suspend }) => { personBodies++; if (!resumeData) return await suspend({ why: 'budget' }); return { decision: resumeData.decision } },
  })
  const assimilate = createStep({ id: 'assimilate', inputSchema: z.object({ decision: z.string() }), outputSchema: z.object({ end: z.string() }),
    execute: async ({ inputData }) => { endWrites++; await new Promise(r => setTimeout(r, 200)); return { end: inputData.decision } } })
  const wf = createWorkflow({ id: 'stage', inputSchema: z.object({ n: z.number() }), outputSchema: z.object({ end: z.string() }) }).then(person).then(assimilate).commit()
  const mastra = new Mastra({ storage: harnessStorage(pool), workflows: { stage: wf }, logger: false })
  const w = mastra.getWorkflow('stage')

  // A. concurrent resumes through two separate Run objects (two callers), PG storage
  const run = await w.createRun()
  const s = await run.start({ inputData: { n: 1 } })
  console.log('A start', s.status)
  const r1 = await w.createRun({ runId: run.runId }), r2 = await w.createRun({ runId: run.runId })
  const res = await Promise.allSettled([r1.resume({ step: 'person', resumeData: { decision: 'accept' } }), r2.resume({ step: 'person', resumeData: { decision: 'accept' } })])
  console.log('A concurrent', res.map(x => x.status === 'fulfilled' ? 'ok:' + x.value.status : 'rej:' + ((x.reason as any)?.id ?? x.reason)), 'assimilate writes', endWrites)

  // B. invalid resume data on PG: does the run stay suspended?
  const runB = await w.createRun(); await runB.start({ inputData: { n: 1 } })
  try { await runB.resume({ step: 'person', resumeData: { decision: 'reject', note: '' } as never }); console.log('B resumed?!') } catch (e: any) { console.log('B invalid resume threw', e.id) }
  const stB = await w.getWorkflowRunById(runB.runId)
  console.log('B stored status after invalid resume:', stB?.status)
  try { const ok = await runB.resume({ step: 'person', resumeData: { decision: 'accept' } }); console.log('B valid resume after invalid ->', ok.status) } catch (e: any) { console.log('B valid resume after invalid THREW', e.id, String(e.message).slice(0, 120)) }
  await db.drop()
}
main().catch(e => { console.error('ERR', e); process.exit(1) })
