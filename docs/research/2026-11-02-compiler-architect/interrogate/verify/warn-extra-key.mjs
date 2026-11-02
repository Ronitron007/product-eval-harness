// New call site (compile.usage.calls): errorStrategy 'warn', output = draft.object ?? parseJsonOrRaw(draft.text).
// Each code scorer checks only its own rule's shape at its own field (compile.scorers table).
import { Agent } from '../../../../../node_modules/@mastra/core/dist/agent/index.js'
import { createMockModel } from '../../../../../node_modules/@mastra/core/dist/test-utils/llm-mock.js'
import { z } from '../../../../../node_modules/zod/index.js'
globalThis.fetch = () => { throw new Error('network call in probe') }
const plan = z.object({ criteria: z.array(z.object({ attributes: z.array(z.object({ unit: z.enum(['g','mcg','mg']) }).strict()) }).strict()) }).strict()
const ruleOwn = z.enum(['g','mcg','mg']) // units.label_unit@1, the only shape rule; its field: criteria[].attributes[].unit
async function run(reply) {
  const drafter = new Agent({ id: 'd', name: 'd', instructions: 'x', model: createMockModel({ version: 'v2', mockText: JSON.stringify(reply) }) })
  const draft = await drafter.generate('draft', { structuredOutput: { schema: plan, errorStrategy: 'warn' } })
  const output = draft.object !== undefined ? draft.object : (() => { try { return JSON.parse(draft.text) } catch { return draft.text } })()
  const units = (output?.criteria ?? []).flatMap(c => c.attributes ?? []).map(a => a.unit)
  const rows = units.map(u => ruleOwn.safeParse(u).success ? 'pass' : 'fail')
  console.log(JSON.stringify(reply), '| object', draft.object === undefined ? 'undefined' : 'set', '| error', draft.error === undefined ? 'undefined' : 'set', '| plan.schema accepts output:', plan.safeParse(output).success, '| rows of units.label_unit@1:', JSON.stringify(rows))
}
await run({ criteria: [{ attributes: [{ unit: 'IU' }] }] })
await run({ criteria: [{ attributes: [{ unit: 'mg', grade: 9 }] }], best_match: 'magnesium glycinate' })
