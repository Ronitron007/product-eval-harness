// Sketch of one stage of the rule graph harness on Mastra 1.79.0.
// Type-check only. Never executed. No model is called.
import { createWorkflow, createStep } from '@mastra/core/workflows'
import { createScorer } from '@mastra/core/evals'
import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { RequestContext } from '@mastra/core/request-context'
import { z } from 'zod'

// enforce.rule_record (subset)
const Verdict = z.enum(['pass', 'fail', 'cannot_verify'])
const Binding = z.enum(['strict', 'soft', 'watch'])
const RuleRef = z.object({ id: z.string(), version: z.string(), binding: Binding })
const VerdictRow = z.object({
  ruleId: z.string(),
  ruleVersion: z.string(),
  target: z.string(),
  verdict: Verdict,
  reason: z.string(),
})
type VerdictRow = z.infer<typeof VerdictRow>

// The output of define_criteria, as the stage rules of type shape define it.
const CriteriaOutput = z.object({
  criteria: z.array(
    z.object({
      id: z.string(),
      definition: z.string(),
      reason: z.string(),
      recordIds: z.array(z.string()),
      attributes: z.array(
        z.object({
          key: z.string(),
          valueType: z.enum(['number', 'word', 'word_list', 'flag']),
          unit: z.string().nullable(),
          reason: z.string(),
        }),
      ),
    }),
  ),
})
type CriteriaOutput = z.infer<typeof CriteriaOutput>

// A code check: a scorer with function steps only. The scorer gives 1 or 0.
// The three-way verdict goes to our own VerdictRow, not to the score.
export const reasonHasRecord = createScorer<unknown, CriteriaOutput>({
  id: 'criteria.reason_has_record@1',
  description: 'Each criterion cites at least one research record.',
})
  .generateScore(({ run }) => (run.output.criteria.every(c => c.recordIds.length > 0) ? 1 : 0))
  .generateReason(({ score }) => (score === 1 ? 'each criterion cites a record' : 'a criterion cites no record'))

// A judge question: one rule, one call, with an "unknown" answer.
export const attributeIsProduct = createScorer<unknown, CriteriaOutput>({
  id: 'criteria.attribute_is_product@1',
  description: 'Each candidate attribute describes a property of the product itself.',
  judge: {
    model: 'openai/gpt-5-mini',
    instructions: 'You judge one rule. Answer pass, fail, or cannot_verify, and quote the words that decide it.',
  },
})
  .analyze({
    description: 'Judge the rule for each attribute',
    outputSchema: z.object({
      items: z.array(z.object({ key: z.string(), verdict: Verdict, reason: z.string(), quote: z.string() })),
    }),
    createPrompt: ({ run }) => JSON.stringify({ attributes: run.output.criteria.flatMap(c => c.attributes) }),
  })
  .generateScore(({ results }) => (results.analyzeStepResult.items.every(i => i.verdict === 'pass') ? 1 : 0))
  .generateReason(({ results }) => results.analyzeStepResult.items.map(i => `${i.key}: ${i.reason}`).join('\n'))

// Tools for the research step. The graph read is our own code.
export const getNodeContext = createTool({
  id: 'get_node_context',
  description: 'Read the path from the root to a node, its rules in scope, and the records behind them.',
  inputSchema: z.object({ nodeId: z.string() }),
  outputSchema: z.object({ path: z.array(z.string()), rules: z.array(RuleRef) }),
  execute: async ({ nodeId }) => ({ path: [nodeId], rules: [] }),
})

// The drafting agent reads its rules from request context.
type StageContext = { nodeId: string; stage: string; ruleText: string }
export const drafter = new Agent({
  id: 'drafter',
  name: 'Stage drafter',
  model: 'openai/gpt-5-mini',
  instructions: ({ requestContext }) => {
    const ctx = requestContext as RequestContext<StageContext>
    return `You work at node ${ctx.get('nodeId')} in stage ${ctx.get('stage')}.\nFollow each rule:\n${ctx.get('ruleText')}`
  },
  tools: { getNodeContext },
})

// The loop body: draft, then judge. Its input and output share one shape.
const Round = z.object({
  nodeId: z.string(),
  round: z.number(),
  draft: CriteriaOutput.nullable(),
  verdicts: z.array(VerdictRow),
  errors: z.array(z.string()), // exact errors with their fixes, for the next round
})

const draft = createStep({
  id: 'draft',
  inputSchema: Round,
  outputSchema: Round,
  execute: async ({ inputData, mastra, requestContext }) => {
    const agent = mastra.getAgent('drafter')
    const prompt = inputData.errors.length ? `Fix these errors:\n${inputData.errors.join('\n')}` : 'Draft the output.'
    const res = await agent.generate(prompt, { structuredOutput: { schema: CriteriaOutput }, requestContext, maxSteps: 8 })
    return { ...inputData, round: inputData.round + 1, draft: res.object }
  },
})

const judge = createStep({
  id: 'ruleset-judge',
  inputSchema: Round,
  outputSchema: Round,
  execute: async ({ inputData }) => {
    if (!inputData.draft) return { ...inputData, errors: ['No draft. Draft the output.'] }
    const verdicts: VerdictRow[] = []
    // Code checks first. Judges only on output that passes the strict code checks.
    const code = await reasonHasRecord.run({ input: {}, output: inputData.draft })
    verdicts.push({ ruleId: 'criteria.reason_has_record', ruleVersion: '1', target: 'criteria', verdict: code.score === 1 ? 'pass' : 'fail', reason: code.reason ?? '' })
    if (code.score === 1) {
      const j = await attributeIsProduct.run({ input: {}, output: inputData.draft })
      const items = j.analyzeStepResult?.items
      // No judge result is "cannot verify", never a pass and never a fail.
      if (!items) verdicts.push({ ruleId: 'criteria.attribute_is_product', ruleVersion: '1', target: 'attributes', verdict: 'cannot_verify', reason: 'the judge gave no result' })
      for (const item of items ?? []) {
        verdicts.push({ ruleId: 'criteria.attribute_is_product', ruleVersion: '1', target: `attributes.${item.key}`, verdict: item.verdict, reason: item.reason })
      }
    }
    const errors = verdicts.filter(v => v.verdict === 'fail').map(v => `${v.ruleId} at ${v.target}: ${v.reason}`)
    return { ...inputData, verdicts, errors }
  },
})

const draftAndJudge = createWorkflow({ id: 'draft-and-judge', inputSchema: Round, outputSchema: Round })
  .then(draft)
  .then(judge)
  .commit()

// A person decides on a spent budget or a strict "cannot verify".
const person = createStep({
  id: 'person',
  inputSchema: Round,
  outputSchema: Round,
  suspendSchema: z.object({ reason: z.string(), verdicts: z.array(VerdictRow) }),
  resumeSchema: z.object({ accept: z.boolean(), by: z.string(), note: z.string() }),
  execute: async ({ inputData, resumeData, suspend, bail }) => {
    const open = inputData.verdicts.filter(v => v.verdict !== 'pass')
    if (open.length === 0) return inputData
    if (resumeData === undefined) return await suspend({ reason: 'strict rules not all pass', verdicts: open })
    if (!resumeData.accept) return bail({ ...inputData, errors: [`rejected by ${resumeData.by}: ${resumeData.note}`] })
    return inputData
  },
})

const assimilate = createStep({
  id: 'assimilate',
  inputSchema: Round,
  outputSchema: z.object({ outputId: z.string(), verdicts: z.array(VerdictRow) }),
  execute: async ({ inputData }) => ({ outputId: `${inputData.nodeId}:define_criteria`, verdicts: inputData.verdicts }),
})

const REPAIR_BUDGET = 3

export const defineCriteria = createWorkflow({
  id: 'define_criteria',
  inputSchema: Round,
  outputSchema: z.object({ outputId: z.string(), verdicts: z.array(VerdictRow) }),
})
  .dountil(draftAndJudge, async ({ inputData, iterationCount }) => inputData.errors.length === 0 || iterationCount >= REPAIR_BUDGET)
  .then(person)
  .then(assimilate)
  .commit()
