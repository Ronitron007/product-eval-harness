import { createScorer } from '../../../../../node_modules/@mastra/core/dist/evals/index.js'
import { z } from '../../../../../node_modules/zod/index.js'
let called = 0
const origFetch = globalThis.fetch
globalThis.fetch = (...a) => { called++; return origFetch(...a) }
const s = createScorer({ id: 'criteria.attribute_is_product@1', description: 'd', judge: { model: 'fake/never-called', instructions: 'judge one rule' } })
  .analyze({ description: 'x', outputSchema: z.object({ verdict: z.enum(['pass','fail','cannot_verify']), reason: z.string(), quote: z.string() }), createPrompt: ({ run }) => 'p' })
  .generateScore(({ results }) => results.analyzeStepResult.verdict === 'pass' ? 1 : 0)
console.log('built; judge model:', s.judge?.model, 'fetch calls:', called)
