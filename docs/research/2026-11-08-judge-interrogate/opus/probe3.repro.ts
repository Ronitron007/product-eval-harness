import { createMockModel } from '@mastra/core/test-utils/llm-mock'
import { it } from 'vitest'
import type { ItemVerdict, JudgeModel, RunEvidence } from '../../src/compiler'
import { planOf } from '../compiler/library'
import { GOOD_OUTPUT } from '../compiler/rules'

// Prototypes of judge.quote_verified and the judge.bindings table, as the spec writes them.
function quoteVerified(row: ItemVerdict, quote: string, ev: RunEvidence): ItemVerdict {
  if (row.decider.by !== 'judge' || row.verdict === 'cannot_verify') return row
  const q = quote.trim()
  const src = Object.entries(ev.sources ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)).find(([, t]) => q !== '' && t.includes(q))
  return src ? { ...row, evidence: { quote: q, source: `sources.${src[0]}` } } : { ...row, verdict: 'cannot_verify', reason: `Quote not found in source. ${row.reason}` }
}
function decide(ok: boolean, rows: ItemVerdict[]) {
  const s = rows.filter(r => r.binding === 'strict')
  if (!ok || s.some(r => r.verdict === 'fail')) return 'repair'
  if (s.some(r => r.verdict === 'cannot_verify')) return 'person'
  return 'accept'
}
const judge = (items: unknown[]): JudgeModel => ({ id: 'mock/judge', model: createMockModel({ version: 'v2', objectGenerationMode: 'json', mockText: { items } }) as never })
const a = GOOD_OUTPUT.criteria[0]!.attributes[0]!
const DRAFT = { criteria: [{ name: 'spf', attributes: [{ ...a, key: 'trending' }] }] }
const EV: RunEvidence = { sources: { label: 'Each capsule has 500 mg.' }, attribute_keys: ['spf', 'trending'] }

it('honest no vs gamed no', async () => {
  const plan = planOf()
  for (const [name, quote] of [['honest no, quotes the draft key', 'trending'], ['gamed no, quotes a dot', '.']] as const) {
    const code = (await Promise.all(plan.scorers.code.map(s => s.verify(DRAFT, EV)))).flat()
    const gate = plan.decode(DRAFT).ok && code.every(r => r.binding !== 'strict' || r.verdict === 'pass')
    const [j] = await plan.scorers.judges(judge([{ target: 'criteria[0].attributes[0]', answer: 'no', quote, reason: 'trending is not a property of the product' }]))[0]!.verify(DRAFT, EV)
    const row = quoteVerified(j!, quote, EV)
    process.stderr.write('\n' + JSON.stringify({ name, gate, verdict: row.verdict, outcome: decide(true, [...code, row]) }) + '\n')
  }
})
