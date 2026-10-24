// Type-check probe only. Never executed. No model is called.
import { Agent } from '@mastra/core/agent'
import type { Processor, ProcessOutputStepArgs } from '@mastra/core/processors'
import { TokenCostControl } from '@mastra/core/processors'
import { RequestContext } from '@mastra/core/request-context'
import { createTool, webSearchTool, webFetchTool } from '@mastra/core/tools'
import { createSkill } from '@mastra/core/skills'
import { createScorer, notScorable } from '@mastra/core/evals'
import { z } from 'zod'

type Ctx = { nodeId: string; ruleVersions: Record<string, string>; inheritedCriteria: string[] }

// Output processor that runs a deterministic rule check and asks the model to repair.
class RulesetGuard implements Processor {
  readonly id = 'ruleset-guard'
  async processOutputStep({ text, abort, retryCount, messages, requestContext }: ProcessOutputStepArgs) {
    const nodeId = requestContext?.get('nodeId')
    const errors = text && text.includes('TODO') ? ['rule r1@3: no TODO allowed'] : []
    if (errors.length > 0 && retryCount < 2) {
      abort(`Fix these rule failures: ${errors.join('; ')} (node ${String(nodeId)})`, {
        retry: true,
        metadata: { ruleIds: ['r1'], versions: ['3'] },
      })
    }
    return messages
  }
}

const lookupPastWork = createTool({
  id: 'lookup-past-work',
  description: 'Find accepted outputs for related graph nodes',
  inputSchema: z.object({ nodeId: z.string() }),
  outputSchema: z.object({ records: z.array(z.string()) }),
  requireApproval: false,
  requestContextSchema: z.object({ nodeId: z.string() }),
  execute: async (input, context) => {
    void context?.requestContext
    return { records: [input.nodeId] }
  },
})

const rulebook = createSkill({
  name: 'sunscreen-rules',
  description: 'Use when producing sunscreen criteria.',
  instructions: 'Rule r1 v3: every criterion cites a research record.',
  references: { 'r1.md': 'Golden examples...' },
})

export const researcher = new Agent<'researcher'>({
  id: 'researcher',
  name: 'researcher',
  instructions: async ({ requestContext }) => {
    const rc = requestContext as RequestContext<Ctx>
    return `Node ${rc.get('nodeId')}. Inherited: ${rc.get('inheritedCriteria').join(', ')}`
  },
  model: ({ requestContext }) => (requestContext.get('nodeId') ? 'openai/gpt-5-mini' : 'anthropic/claude-sonnet-4-6'),
  tools: ({ requestContext }) => ({ lookupPastWork, search: webSearchTool, fetch: webFetchTool, ...(requestContext ? {} : {}) }),
  skills: [rulebook],
  outputProcessors: [new RulesetGuard()],
  inputProcessors: [new TokenCostControl({ maxCost: 2, scope: 'run' })],
  maxProcessorRetries: 2,
  goal: { judge: 'openai/gpt-5-mini', maxRuns: 10, scorer: 'ruleset-all-pass' },
})

const allStrictRulesPass = createScorer({ id: 'ruleset-all-pass', description: 'All strict rules pass' })
  .preprocess(({ run }) => (run.output ? { ok: true } : notScorable('no output')))
  .generateScore(() => 1)

export async function call() {
  const rc = new RequestContext<Ctx>()
  rc.set('nodeId', 'sunscreen')
  rc.set('ruleVersions', { r1: '3' })
  rc.set('inheritedCriteria', ['spf'])
  const res = await researcher.generate('Produce criteria', {
    requestContext: rc,
    maxSteps: 8,
    maxProcessorRetries: 2,
    modelSettings: { timeout: { totalMs: 600_000, stepMs: 60_000 } },
    structuredOutput: {
      schema: z.object({ criteria: z.array(z.object({ id: z.string(), ruleIds: z.array(z.string()) })) }),
      errorStrategy: 'strict',
      jsonPromptInjection: 'auto',
    },
    isTaskComplete: { scorers: [allStrictRulesPass], strategy: 'all' },
    onIterationComplete: async ({ iteration }) => (iteration > 5 ? { continue: false } : { continue: true, feedback: 'keep going' }),
  })
  const obj = res.object
  void obj
}

// Negative controls: these options must NOT exist.
export async function negative() {
  // @ts-expect-error no retry-on-schema-failure option (maxRetries) on structuredOutput
  await researcher.generate('x', {
    structuredOutput: {
      schema: z.object({ a: z.string() }),
      maxRetries: 2,
    },
  })
}
