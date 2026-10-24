// Type-check probe only. Never executed.
import { createWorkflow, createStep, mapVariable, createWorkflowStateReader } from '@mastra/core/workflows'
import { Mastra } from '@mastra/core/mastra'
import { z } from 'zod'

const ruleOutput = z.object({ draft: z.string(), errors: z.array(z.string()), attempts: z.number() })

// Step with state, suspend, resume, request-context schemas, retries, metadata.
const approve = createStep({
  id: 'human-approval',
  inputSchema: ruleOutput,
  outputSchema: z.object({ accepted: z.boolean(), draft: z.string() }),
  stateSchema: z.object({ ruleVersions: z.record(z.string(), z.string()) }),
  suspendSchema: z.object({ reason: z.string(), failedRules: z.array(z.string()) }),
  resumeSchema: z.object({ approved: z.boolean(), reviewer: z.string() }),
  requestContextSchema: z.object({ nodeId: z.string() }),
  retries: 2,
  metadata: { stage: 'accept' },
  execute: async ({ inputData, resumeData, suspend, bail, state, setState, requestContext, retryCount }) => {
    const nodeId: string = requestContext.get('nodeId')
    await setState({ ruleVersions: { ...state.ruleVersions, [nodeId]: 'v1' } })
    if (resumeData === undefined) {
      return await suspend({ reason: 'needs review', failedRules: [] }, { resumeLabel: 'approve' })
    }
    if (resumeData.approved === false) return bail({ accepted: false, draft: inputData.draft })
    void retryCount
    return { accepted: true, draft: inputData.draft }
  },
})

const repair = createStep({
  id: 'repair',
  inputSchema: ruleOutput,
  outputSchema: ruleOutput,
  execute: async ({ inputData }) => ({ ...inputData, attempts: inputData.attempts + 1 }),
})

const judgeA = createStep({
  id: 'judge-a',
  inputSchema: ruleOutput,
  outputSchema: z.object({ verdict: z.enum(['pass', 'fail', 'cannot_verify']) }),
  execute: async () => ({ verdict: 'pass' as const }),
})
const judgeB = createStep({
  id: 'judge-b',
  inputSchema: ruleOutput,
  outputSchema: z.object({ verdict: z.enum(['pass', 'fail', 'cannot_verify']) }),
  execute: async () => ({ verdict: 'fail' as const }),
})

// Nested workflow used as a step.
const repairLoop = createWorkflow({
  id: 'repair-loop',
  inputSchema: ruleOutput,
  outputSchema: ruleOutput,
  retryConfig: { attempts: 3, delay: 1000 },
})
  .dountil(repair, async ({ inputData, iterationCount }) => inputData.errors.length === 0 || iterationCount >= 3)
  .commit()

export const stage = createWorkflow({
  id: 'stage',
  inputSchema: ruleOutput,
  outputSchema: z.any(),
  stateSchema: z.object({ ruleVersions: z.record(z.string(), z.string()) }),
  options: { validateInputs: true },
})
  .then(repairLoop)
  .parallel([judgeA, judgeB], { id: 'ruleset-judge', metadata: { title: 'Ruleset judge' } })
  .map(async ({ inputData, getInitData }) => ({
    draft: (getInitData() as z.infer<typeof ruleOutput>).draft,
    errors: [inputData['judge-a'].verdict, inputData['judge-b'].verdict].filter(v => v !== 'pass'),
    attempts: 0,
  }))
  .branch([
    [async ({ inputData }) => inputData.errors.length === 0, approve],
    [{ predicate: { op: 'gt', left: { path: 'inputData.attempts' }, right: { literal: 100 } } }, repair],
  ])
  .sleep(10)
  .commit()

const arrayWf = createWorkflow({
  id: 'arr',
  inputSchema: z.array(ruleOutput),
  outputSchema: z.array(ruleOutput),
})
  .foreach(repair, { concurrency: 4 })
  .commit()

const loopWhile = createWorkflow({ id: 'w', inputSchema: ruleOutput, outputSchema: ruleOutput })
  .dowhile(repair, async ({ inputData }) => inputData.errors.length > 0)
  .map({ draft: mapVariable({ step: repair, path: "draft" }) })
  .commit()

export async function run(mastra: Mastra) {
  const wf = mastra.getWorkflow('stage')
  const r = await wf.createRun()
  const res = await r.start({
    inputData: { draft: 'x', errors: [], attempts: 0 },
    initialState: { ruleVersions: {} },
    tracingOptions: { metadata: { ruleId: 'r1', ruleVersion: '3' }, tags: ['rules'] },
    perStep: false,
  })
  if (res.status === 'suspended') {
    await r.resume({ step: 'human-approval', resumeData: { approved: true, reviewer: 'x' } })
  }
  await r.timeTravel({ step: 'repair', inputData: { draft: 'x', errors: [], attempts: 0 } })
  const snap = await wf.getWorkflowRunById('run-1')
  if (snap) createWorkflowStateReader(snap).getSuspendedStep()
  await mastra.addDynamicWorkflow({
    id: 'dyn',
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] },
    outputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    graph: [{ type: 'agent', id: 'research', agentId: 'researcher', options: { retries: 1, metadata: { ruleId: 'r1' } } }],
  })
  void arrayWf
  void loopWhile
}
