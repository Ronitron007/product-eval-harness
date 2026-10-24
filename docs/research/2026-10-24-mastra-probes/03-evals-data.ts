// Type-check probe only. Never executed. No model is called.
import { Mastra } from '@mastra/core/mastra'
import { Classifier, type ClassifierModel } from '@mastra/core/classifier'
import { createScorer, createClassifierScorer, runEvals, notScorable } from '@mastra/core/evals'
import { checks } from '@mastra/evals/checks'
import { createRubricScorer } from '@mastra/evals/scorers/prebuilt'
import { createStep } from '@mastra/core/workflows'
import { createVectorQueryTool, createGraphRAGTool, GraphRAG } from '@mastra/rag'
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'
import { LibSQLStore, LibSQLVector, type SqliteClient } from '@mastra/libsql'
import { MastraCompositeStore } from '@mastra/core/storage'
import { createPredicateEvaluator, predicateSchema, walk, MISSING, type Predicate } from '@mastra/core/predicate'
import { z } from 'zod'

declare const decisionModel: ClassifierModel

// One rule question as a classifier with a three-way choice.
const r1Judge = new Classifier({
  id: 'rule-r1-v3',
  model: decisionModel,
  questions: {
    verdict: {
      type: 'choice',
      instructions: 'Rule r1 v3: every criterion cites a research record.',
      criteria: {
        pass: 'The output satisfies the rule',
        fail: 'The output violates the rule',
        cannot_verify: 'The evidence in state is not enough to decide',
      },
    },
  },
})

export const classifyStep = createStep(r1Judge, { maxRetries: 2, retries: 1 })

export const r1Scorer = createClassifierScorer({
  id: 'rule-r1-v3-scorer',
  classifier: r1Judge,
  question: 'verdict',
  type: { input: z.any(), output: z.any() },
  scores: { pass: 1, fail: 0, cannot_verify: 0 },
  state: ({ run }) => ({ output: JSON.stringify(run.output ?? null) }),
})

// Code rule check (deterministic) with a not-applicable outcome.
export const r2Code = createScorer<{ fields: string[] }, { criteria: { id: string }[] }>({
  id: 'rule-r2-v1',
  description: 'Each criterion has an id',
})
  .preprocess(({ run }) => (run.output.criteria.length === 0 ? notScorable('no criteria in scope') : { n: run.output.criteria.length }))
  .generateScore(({ run }) => (run.output.criteria.every(c => c.id.length > 0) ? 1 : 0))
  .generateReason(({ score }) => (score === 1 ? 'all ids present' : 'missing id'))

// LLM judge rule check.
export const r3Llm = createScorer({
  id: 'rule-r3-v2',
  description: 'Criteria fit the node',
  judge: { model: 'openai/gpt-5-mini', instructions: 'You judge one rule.' },
})
  .analyze({
    description: 'Judge the rule',
    outputSchema: z.object({ verdict: z.enum(['pass', 'fail', 'cannot_verify']), reason: z.string() }),
    createPrompt: ({ run }) => `Rule r3 v2. Output: ${JSON.stringify(run.output)}`,
  })
  .generateScore(({ results }) => (results.analyzeStepResult.verdict === 'pass' ? 1 : 0))
  .generateReason(({ results }) => results.analyzeStepResult.reason)

export const rubric = createRubricScorer({
  model: 'openai/gpt-5-mini',
  criteria: [{ description: 'Cites a research record', required: true }],
})

export async function evals(mastra: Mastra) {
  const scored = await r2Code.run({ input: { fields: [] }, output: { criteria: [{ id: 'a' }] } })
  if (scored.notScorable) void scored.notScorable.reason
  const wf = mastra.getWorkflow('stage')
  const result = await runEvals({
    target: wf,
    data: [{ input: { draft: 'x', errors: [], attempts: 0 }, groundTruth: { must: ['x'] } }],
    gates: [r2Code, checks.includes('criteria')],
    scorers: [{ scorer: r3Llm, threshold: 0.9 }, rubric],
    concurrency: 2,
  })
  void result.verdict
  void result.gateResults

  const ds = await mastra.datasets.create({
    name: 'golden-r1',
    inputSchema: z.object({ output: z.string() }),
    groundTruthSchema: z.object({ verdict: z.enum(['pass', 'fail', 'cannot_verify']) }),
  })
  await ds.addItems({ items: [{ input: { output: 'a' }, groundTruth: { verdict: 'pass' } }] })
  const base = await ds.startExperiment({
    name: 'r1-v3',
    targetType: 'scorer',
    targetId: 'rule-r1-v3-scorer',
    version: 1,
    grouping: { experimentSetId: 'r1', comparisonId: 'v3-vs-v4', variantId: 'v3', trialIndex: 0 },
    provenance: { source: 'ci', sourceVersion: 'abc123' },
    requestContext: { nodeId: 'sunscreen' },
    metadata: { ruleId: 'r1', ruleVersion: '3' },
  })
  const cand = await ds.startExperiment({ name: 'r1-v4', targetType: 'scorer', targetId: 'rule-r1-v4-scorer' })
  const cmp = await mastra.datasets.compareExperiments({ experimentIds: [base.experimentId, cand.experimentId], baselineId: base.experimentId })
  void cmp.items
}

// RAG over past accepted outputs.
const vector = new LibSQLVector({ id: 'v', url: 'file:./past.db' })
export const pastWork = createVectorQueryTool({
  vectorStore: vector,
  indexName: 'accepted_outputs',
  model: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
  enableFilter: true,
})
export const pastGraph = createGraphRAGTool({
  vectorStore: vector,
  indexName: 'accepted_outputs',
  model: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
  graphOptions: { dimension: 1536, threshold: 0.7 },
})
void GraphRAG

// Storage: one libSQL client shared by Mastra and our own tables.
declare const sharedClient: SqliteClient
export const store = new MastraCompositeStore({
  id: 'composite',
  default: new LibSQLStore({ id: 'app', client: sharedClient }),
})

// Predicate DSL for rule scope.
const scope: Predicate = predicateSchema.parse({
  op: 'and',
  args: [
    { op: 'eq', left: { path: 'node.level' }, right: { literal: 'leaf' } },
    { op: 'in', value: { path: 'stage' }, set: ['generate', 'validate'] },
  ],
})
const evaluate = createPredicateEvaluator<Record<string, unknown>>((p, ctx) => walk(ctx, p))
export const inScope: boolean = evaluate(scope, { node: { level: 'leaf' }, stage: 'generate' })
void MISSING
