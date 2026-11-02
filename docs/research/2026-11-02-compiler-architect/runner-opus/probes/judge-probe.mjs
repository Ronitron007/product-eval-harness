import { createScorer } from '../../../../../node_modules/@mastra/core/dist/evals/index.js'
import { createMockModel } from '../../../../../node_modules/@mastra/core/dist/test-utils/llm-mock.js'
import { z } from '../../../../../node_modules/zod/index.js'
let calls = 0
globalThis.fetch = () => { throw new Error('network call in probe') }
const model = createMockModel({ version: 'v2', objectGenerationMode: 'json', mockText: { items: [{ target: 'a[0]', answer: 'no', quote: 'trending', reason: 'social signal' }] }, spyGenerate: () => calls++, spyStream: () => calls++ })
const s = createScorer({ id: 'criteria.attribute_is_product@1', description: 'judge', judge: { model, instructions: 'You judge one rule.' } })
  .preprocess(({ run }) => [{ target: 'a[0]', value: run.output.a[0] }])
  .analyze({ description: 'judge each item', outputSchema: z.object({ items: z.array(z.object({ target: z.string(), answer: z.enum(['yes','no','unknown']), quote: z.string(), reason: z.string() })) }), createPrompt: ({ results }) => `STATIC\n${JSON.stringify(results.preprocessStepResult)}` })
  .generateScore(({ results }) => results.analyzeStepResult.items.every(i => i.answer === 'yes') ? 1 : 0)
try {
  const r = await s.run({ input: {}, output: { a: [{ key: 'trending_on_social_media' }] } })
  console.log('score', r.score, JSON.stringify(r.analyzeStepResult), 'prompt', JSON.stringify(r.analyzePrompt), 'calls', calls)
} catch (e) { console.log('ERR', e.message.slice(0, 400), e.cause?.message?.slice(0,300)) }
