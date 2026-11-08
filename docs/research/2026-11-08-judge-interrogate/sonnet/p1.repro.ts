import { it } from 'vitest'
import { judgeDraft, decideOutcome } from '../../src/judge/step'
import { planOf } from '../compiler/library'
import { GOOD_EVIDENCE, GOOD_OUTPUT, attributeIsProduct, judgementRule, withRules } from '../compiler/rules'
import { out, mock, ans, show, T } from './p0.test'

const run = (reply: unknown, items: unknown[], evidence: any = GOOD_EVIDENCE, plan = planOf()) => judgeDraft({ runId: 'r', plan, reply, evidence, judgeModel: mock(items) })
const judgeRow = (o: any) => o.rows.filter((r: any) => r.ruleId === 'criteria.attribute_is_product').map((r: any) => ({ verdict: r.verdict, ev: r.evidence, reason: r.reason }))

it('F1 trivially-true quotes', async () => {
  const res: any = {}
  for (const q of ['.', 'e', ' e ', '0', 'a', 'Each']) {
    const o = await run(GOOD_OUTPUT, [ans('yes', q)])
    res[JSON.stringify(q)] = { kind: o.kind, judge: judgeRow(o) }
  }
  const o = await run(GOOD_OUTPUT, [ans('no', '.')])
  res['no "."'] = { kind: o.kind, errors: (o as any).errors, judge: judgeRow(o) }
  out('F1 quote proves nothing', res)
})

it('F2 duplicate answers order dependence', async () => {
  const a = await run(GOOD_OUTPUT, [ans('yes', '500 mg'), ans('yes', 'FAKE QUOTE')])
  const b = await run(GOOD_OUTPUT, [ans('yes', 'FAKE QUOTE'), ans('yes', '500 mg')])
  out('F2', { realFirst: { kind: a.kind, judge: judgeRow(a) }, fakeFirst: { kind: b.kind, judge: judgeRow(b) } })
})

it('F3 trial judgement rule', async () => {
  const trial: any = { ...judgementRule('criteria.other_judge', 'criteria[].attributes[]', 'Is it fine? Answer yes, no, or unknown.', [{ output: { key: 'spf' }, expected: 'pass' }]), status: 'draft', version: 1 }
  try {
    const plan = planOf({ trial } as any)
    out('F3 manifest', plan.manifest.rules.map(r => `${r.id}@${r.version} ${r.binding} ${r.origin}`))
    const o = await run(GOOD_OUTPUT, [ans('yes', '500 mg')], GOOD_EVIDENCE, plan)
    out('F3 outcome', show(o))
  } catch (e: any) { out('F3 threw', String(e.message).slice(0, 400)) }
})

it('F4 odd replies', async () => {
  const res: any = {}
  for (const [k, reply] of Object.entries({ undefined: undefined, null: null, num: 42, empty: '', arr: '[]', nullstr: 'null', text: 'not json', protoKey: '{"__proto__":{"x":1},"criteria":[]}' })) {
    try { const o: any = await run(reply, [ans('yes', '500 mg')]); res[k] = { kind: o.kind, errors: o.errors?.length, first: o.errors?.slice(0, 3), judgeRows: judgeRow(o) } } catch (e: any) { res[k] = 'THREW ' + e.message.slice(0, 200) }
  }
  out('F4', res)
})
