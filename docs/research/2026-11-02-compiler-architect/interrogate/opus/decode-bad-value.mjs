// compile.record: "The decoder enforces a shape". decisions.tsv 2026-10-24 (corrected row): a value that breaks
// its shape rule gives FAIL for that rule, with the raw text kept beside the verdict.
// What does the drafter (structuredOutput: { schema: plan.schema }) hand to the scorers when the model writes IU?
import { Agent } from '../../../../../node_modules/@mastra/core/dist/agent/index.js'
import { createMockModel } from '../../../../../node_modules/@mastra/core/dist/test-utils/llm-mock.js'
import { z } from '../../../../../node_modules/zod/index.js'
globalThis.fetch = () => { throw new Error('network call in probe') }
const schema = z.object({ criteria: z.array(z.object({ attributes: z.array(z.object({ unit: z.enum(['g','mcg','mg']) }).strict()) }).strict()) }).strict()
const bad = { criteria: [{ attributes: [{ unit: 'IU' }] }] }
const model = createMockModel({ version: 'v2', mockText: JSON.stringify(bad) })
const drafter = new Agent({ id: 'drafter', name: 'drafter', instructions: 'x', model })
try {
  const draft = await drafter.generate('draft', { structuredOutput: { schema } })
  console.log('generate returned. draft.object =', JSON.stringify(draft.object), '| error =', draft.error?.message?.slice(0, 200), '| text =', (draft.text ?? '').slice(0, 80))
} catch (e) { console.log('generate THREW:', e.constructor.name, (e.message ?? '').slice(0, 300)) }
