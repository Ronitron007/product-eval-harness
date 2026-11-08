import { it } from 'vitest'
import { judgeDraft } from '../../src/judge/step'
import { planOf } from '../compiler/library'
import { GOOD_EVIDENCE, GOOD_OUTPUT } from '../compiler/rules'
import { out, mock, ans } from './p0.test'
const run = (reply: unknown, items: unknown[]) => judgeDraft({ runId: 'r', plan: planOf(), reply, evidence: GOOD_EVIDENCE, judgeModel: mock(items) })
const j = (o: any) => ({ kind: o.kind, judgeRow: o.rows.filter((r: any) => r.ruleId === 'criteria.attribute_is_product').map((r: any) => ({ verdict: r.verdict, evidence: r.evidence })) })
it('echo draft own quote / whole source', async () => {
  const draft = { criteria: [{ name: 'spf', attributes: [{ amount: 500, key: 'spf', quote: 'capsule', unit: 'mg' }] }] }
  out('judge echoes the DRAFT field quote="capsule" (strict quotes.from_label passes it, so it is always a source substring)', j(await run(draft, [ans('yes', 'capsule')])))
  out('judge quotes the whole source', j(await run(GOOD_OUTPUT, [ans('yes', 'Each capsule has 500 mg.')])))
  out('judge quotes draft canonical item JSON (spec test fake_quote.from_the_draft)', j(await run(GOOD_OUTPUT, [ans('yes', '{"amount":500,"key":"spf","quote":"500 mg","unit":"mg"}')])))
  out('judge quotes draft unit value "mg"', j(await run(GOOD_OUTPUT, [ans('yes', 'mg')])))
})
