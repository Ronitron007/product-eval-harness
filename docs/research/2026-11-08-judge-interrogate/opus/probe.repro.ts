import { createMockModel } from '@mastra/core/test-utils/llm-mock'
import { it } from 'vitest'
import type { ItemVerdict, JudgeModel, RunEvidence } from '../../src/compiler'
import { planOf } from '../compiler/library'
import { GOOD_EVIDENCE, GOOD_OUTPUT } from '../compiler/rules'

// Prototype of judge.quote_verified, steps 2-4, as the spec writes them.
function quoteVerified(row: ItemVerdict, quote: string, ev: RunEvidence): ItemVerdict {
  if (row.decider.by !== 'judge' || row.verdict === 'cannot_verify') return row
  const q = quote.trim()
  const src = Object.entries(ev.sources ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)).find(([, t]) => q !== '' && t.includes(q))
  if (!src) return { ...row, verdict: 'cannot_verify', reason: `Quote not found in source. ${row.reason}` }
  return { ...row, evidence: { quote: q, source: `sources.${src[0]}` } }
}
const judge = (items: unknown[]): JudgeModel => ({ id: 'mock/judge', model: createMockModel({ version: 'v2', objectGenerationMode: 'json', mockText: { items } }) as never })
const a = GOOD_OUTPUT.criteria[0]!.attributes[0]!
// A draft whose attribute is plainly not a product property, but which clears every strict code check.
const DRAFT = { criteria: [{ name: 'spf', attributes: [{ ...a, key: 'spf' }] }] }

async function judged(quote: string, ev: RunEvidence, answer = 'yes') {
  const plan = planOf()
  const code = (await Promise.all(plan.scorers.code.map(s => s.verify(DRAFT, ev)))).flat()
  const gate = plan.decode(DRAFT).ok && code.every(r => r.binding !== 'strict' || r.verdict === 'pass')
  const [row] = await plan.scorers.judges(judge([{ target: 'criteria[0].attributes[0]', answer, quote, reason: 'r' }]))[0]!.verify(DRAFT, ev)
  return { gate, row: quoteVerified(row!, quote, ev) }
}

it('probe', async () => {
  for (const [name, quote, ev] of [
    ['dot', '.', GOOD_EVIDENCE],
    ['one letter', 'a', GOOD_EVIDENCE],
    ['draft own quote field', a.quote, GOOD_EVIDENCE],
    ['zero-width space', '\u200b', { ...GOOD_EVIDENCE, sources: { label: 'Each capsule\u200b has 500 mg.' } }],
  ] as const) {
    const { gate, row } = await judged(quote, ev as RunEvidence)
    process.stderr.write("\n" + JSON.stringify({ name, quote, gate, verdict: row.verdict, evidence: row.evidence }) + "\n")
  }
})
