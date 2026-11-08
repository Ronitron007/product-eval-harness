import { Agent } from '@mastra/core/agent'
import { createMockModel } from '@mastra/core/test-utils/llm-mock'
import { agentDrafter } from './proto_workflow'
import { planOf } from '../../../../tests/compiler/library'
import { GOOD_OUTPUT, GOOD_EVIDENCE } from '../../../../tests/compiler/rules'
let fetches = 0
globalThis.fetch = (() => { fetches++; throw new Error('fetch called') }) as typeof fetch
const plan = planOf()
async function go(label: string, reply: unknown) {
  const agent = new Agent({ id: 'd', name: 'd', instructions: 'x', model: createMockModel({ version: 'v2', objectGenerationMode: 'json', mockText: reply as never }) as never })
  const d = agentDrafter(agent, 'drafter/mock')
  const out = await d.draft({ runId: 'r', round: 1, plan, evidence: GOOD_EVIDENCE as never, context: { path: [], siblings: [], instructions: '' }, errors: [] })
  const dec = plan.decode(out)
  console.log(label, '-> drafter returned', typeof out, JSON.stringify(out).slice(0, 150), '| decode ok:', dec.ok, dec.ok ? '' : JSON.stringify(dec.issues).slice(0, 120))
}
async function main() {
  const ex = structuredClone(GOOD_OUTPUT) as any; ex.criteria[0].attributes[0].bonus = 'extra'
  await go('good', GOOD_OUTPUT)
  await go('extra key', ex)
  await go('broken', { criteria: 'x' })
  console.log('fetch calls', fetches)
}
main().catch(e => { console.error('ERR', e.message); process.exit(1) })
