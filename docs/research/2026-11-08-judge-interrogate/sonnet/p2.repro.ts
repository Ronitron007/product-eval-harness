import { it } from 'vitest'
import { judgeDraft } from '../../src/judge/step'
import { planOf, withRules } from '../compiler/library'
import { GOOD_EVIDENCE, GOOD_OUTPUT, checkRule, judgementRule, quotesFromLabel, attributeIsProduct, keyKnown, uniqueTitle } from '../compiler/rules'
import { out, mock, ans, show, T } from './p0.test'

const run = (reply: unknown, items: unknown[], evidence: any = GOOD_EVIDENCE, plan = planOf()) => judgeDraft({ runId: 'r', plan, reply, evidence, judgeModel: mock(items) })
const brief = (o: any) => ({ kind: o.kind, errors: o.errors?.map((e: any) => `${e.from} @ ${e.target}: ${String(e.fix).slice(0, 70)}`), open: o.open?.map((r: any) => `${r.ruleId} ${r.verdict}: ${r.reason.slice(0, 60)}`), warnings: o.warnings?.map((w: any) => `${w.rule} ${w.kind} @ ${w.target}`) })
const bad = (patch: any) => ({ criteria: [{ name: 'spf', attributes: [{ ...GOOD_OUTPUT.criteria[0]!.attributes[0], ...patch }] }] })

it('F5 dedupe', async () => {
  out('F5 unit IU (decode issue + shape fail at one target)', brief(await run(bad({ unit: 'IU' }), [])))
})
it('F6 watch/soft code leak into errors', async () => {
  const watchQuote = { ...quotesFromLabel, binding: 'watch' }
  const softKey = { ...keyKnown, binding: 'soft' }
  const plan = planOf({ rules: withRules(watchQuote as any, softKey as any) })
  const o: any = await run(bad({ quote: '600 mg', key: 'trending', grade: 'A' }), [ans('yes', '500 mg')], GOOD_EVIDENCE, plan)
  out('F6 decode fail (extra key grade) + watch quote fail + soft key fail', brief(o))
  const o2: any = await run(bad({ quote: '600 mg', key: 'trending' }), [ans('yes', '500 mg')], GOOD_EVIDENCE, plan)
  out('F6b same, decode ok', brief(o2))
})
it('F7 strict code cannot_verify gate', async () => {
  const o: any = await run(GOOD_OUTPUT, [ans('yes', '500 mg')], { sources: GOOD_EVIDENCE.sources })
  out('F7 no attribute_keys evidence -> strict key_known cannot_verify', brief(o))
  out('F7 judge rows', o.rows.filter((r: any) => r.ruleId.startsWith('criteria.attribute')).map((r: any) => `${r.verdict} ${r.reason}`))
})
it('F8 strict code fail + strict judge skip -> repair; then soft judge note', async () => {
  const softJudge = { ...attributeIsProduct, binding: 'soft' }
  const plan = planOf({ rules: withRules(softJudge as any) })
  const o: any = await run(bad({ quote: '600 mg' }), [], GOOD_EVIDENCE, plan)
  out('F8 strict fail, soft judge skipped', brief(o))
})
it('F9 empty/unknown no quote and fail without quote', async () => {
  const a: any = await run(GOOD_OUTPUT, [ans('no', '')])
  out('F9 honest "no" with no quotable text -> ', brief(a))
})
