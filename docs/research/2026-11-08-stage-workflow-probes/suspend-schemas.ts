import { Mastra } from '@mastra/core/mastra'
import { InMemoryStore } from '@mastra/core/storage'
import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
const Payload = z.object({ round: z.number().int().min(1), why: z.enum(['budget_spent', 'cannot_verify']) }).strict()
const person = createStep({ id: 'person', inputSchema: z.object({}), outputSchema: z.object({ ok: z.boolean() }), suspendSchema: Payload, resumeSchema: z.object({ d: z.string() }),
  execute: async ({ resumeData, suspend }) => { if (!resumeData) return await suspend({} as never); return { ok: true } } })
const wf = createWorkflow({ id: 'v', inputSchema: z.object({}), outputSchema: z.object({ ok: z.boolean() }) }).then(person).commit()
const resumeBad = createStep({ id: 'p2', inputSchema: z.object({}), outputSchema: z.object({ ok: z.boolean() }), resumeSchema: z.object({ d: z.enum(['accept']) }),
  execute: async ({ resumeData, suspend }) => { if (!resumeData) return await suspend({}); return { ok: true } } })
const wf2 = createWorkflow({ id: 'v2', inputSchema: z.object({}), outputSchema: z.object({ ok: z.boolean() }) }).then(resumeBad).commit()
const mastra = new Mastra({ storage: new InMemoryStore(), workflows: { v: wf, v2: wf2 }, logger: false })
const r = await (await mastra.getWorkflow('v').createRun()).start({ inputData: {} })
console.log('empty suspend payload ->', r.status, r.status === 'failed' ? String(r.error?.message ?? r.error).slice(0, 200) : '')
const run2 = await mastra.getWorkflow('v2').createRun()
await run2.start({ inputData: {} })
try { const r2 = await run2.resume({ step: 'p2', resumeData: { d: 'nope' } as never }); console.log('bad resumeData ->', r2.status, r2.status === 'failed' ? String(r2.error?.message ?? r2.error).slice(0, 200) : '') } catch (e: any) { console.log('bad resumeData threw', e?.id, String(e?.message).slice(0, 200)) }
const st = await mastra.getWorkflow('v2').getWorkflowRunById(run2.runId); console.log('after bad resume stored status', st?.status)
