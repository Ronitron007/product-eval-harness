import { it } from 'vitest'
import { judgeDraft } from '../../src/judge/step'
import { planOf } from '../compiler/library'
import { GOOD_OUTPUT } from '../compiler/rules'
import { out, mock, ans } from './p0.test'
it('F-nonstring source: verify throws after a paid call', async () => {
  let calls = 0
  const plan = planOf()
  const judge = plan.scorers.judges(mock([ans('yes', '5')], () => calls++))[0]!
  const ev: any = { sources: { label: 500 }, attribute_keys: ['spf'] }
  let res: any
  try { res = (await judge.verify(GOOD_OUTPUT, ev)).map(r => `${r.verdict} ${r.reason}`) } catch (e: any) { res = 'verify THREW: ' + e.message }
  out('nonstring source (judge.verify directly)', { modelCalls: calls, result: res })
})
