import { Mastra } from '@mastra/core/mastra'
import { InMemoryStore } from '@mastra/core/storage'
import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'

const log: string[] = []
const Round = z.object({ round: z.number(), errors: z.number() })
let draftCalls = 0
const draft = createStep({ id: 'draft', inputSchema: Round, outputSchema: Round, execute: async ({ inputData }) => { draftCalls++; log.push(`draft body round=${inputData.round + 1}`); return { round: inputData.round + 1, errors: inputData.round + 1 < 2 ? 1 : 0 } } })
const body = createWorkflow({ id: 'body', inputSchema: Round, outputSchema: Round }).then(draft).commit()
let personBodies = 0
const person = createStep({
  id: 'person', inputSchema: Round, outputSchema: z.object({ decision: z.string() }),
  suspendSchema: z.object({ why: z.string() }), resumeSchema: z.object({ decision: z.enum(['accept', 'reject', 'bad']) }),
  execute: async ({ inputData, resumeData, suspend, bail, suspendData }) => {
    personBodies++
    log.push(`person body resume=${JSON.stringify(resumeData)} suspendData=${JSON.stringify(suspendData)}`)
    if (!resumeData) return await suspend({ why: `round ${inputData.round}` })
    if (resumeData.decision === 'bad') return await suspend({ why: 'refused, try again' })
    if (resumeData.decision === 'reject') return bail({ decision: 'reject' })
    return { decision: 'accept' }
  },
})
const after = createStep({ id: 'after', inputSchema: z.object({ decision: z.string() }), outputSchema: z.object({ decision: z.string() }), execute: async ({ inputData }) => { log.push('after body'); return inputData } })
const wf = createWorkflow({ id: 'stage', inputSchema: Round, outputSchema: z.object({ decision: z.string() }) })
  .dountil(body, async ({ inputData, iterationCount }) => { log.push(`cond iter=${iterationCount} round=${inputData.round}`); return inputData.errors === 0 || iterationCount >= 3 })
  .then(person).then(after).commit()
const mastra = new Mastra({ storage: new InMemoryStore(), workflows: { stage: wf }, logger: false })
const w = mastra.getWorkflow('stage')

async function main() {
  const run = await w.createRun()
  const r1 = await run.start({ inputData: { round: 0, errors: 1 } })
  console.log('start status', r1.status, r1.status === 'suspended' ? JSON.stringify(r1.suspended) : '', 'draftCalls', draftCalls)
  const st = await w.getWorkflowRunById(run.runId)
  console.log('getWorkflowRunById status', st?.status)
  const rBad = await run.resume({ step: 'person', resumeData: { decision: 'bad' } })
  console.log('resume bad ->', rBad.status)
  // concurrent double resume
  const [a, b] = await Promise.allSettled([run.resume({ step: 'person', resumeData: { decision: 'accept' } }), run.resume({ step: 'person', resumeData: { decision: 'accept' } })])
  console.log('concurrent', a.status, a.status === 'fulfilled' ? a.value.status : (a.reason as any)?.id ?? String(a.reason), '|', b.status, b.status === 'fulfilled' ? b.value.status : (b.reason as any)?.id ?? String(b.reason))
  try { const r3 = await run.resume({ step: 'person', resumeData: { decision: 'accept' } }); console.log('sequential second resume ->', r3.status, JSON.stringify((r3 as any).error?.message ?? '')) } catch (e: any) { console.log('sequential second resume threw', e?.id, e?.message) }
  // fresh run, reject with bail
  const run2 = await w.createRun()
  await run2.start({ inputData: { round: 0, errors: 1 } })
  const rj = await run2.resume({ step: 'person', resumeData: { decision: 'reject' } })
  console.log('reject via bail ->', rj.status, JSON.stringify((rj as any).result))
  const st2 = await w.getWorkflowRunById(run2.runId)
  console.log('bailed stored status', st2?.status)
  // budget: errors never zero
  console.log('personBodies', personBodies)
  console.log(log.join('\n'))
}
main().catch(e => { console.error('ERR', e); process.exit(1) })
