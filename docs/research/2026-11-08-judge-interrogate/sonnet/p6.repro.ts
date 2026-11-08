import { it } from 'vitest'
import { judgeDraft } from '../../src/judge/step'
import { planOf } from '../compiler/library'
import { GOOD_OUTPUT } from '../compiler/rules'
import { out, mock, ans } from './p0.test'
it('paid call with no sources', async () => {
  let calls = 0
  const o: any = await judgeDraft({ runId: 'r', plan: planOf(), reply: GOOD_OUTPUT, evidence: { attribute_keys: ['spf'] }, judgeModel: mock([ans('yes', '500 mg')], () => calls++) })
  out('no evidence.sources', { modelCalls: calls, kind: o.kind, judgeRow: o.rows.filter((r: any) => r.ruleId === 'criteria.attribute_is_product').map((r: any) => `${r.verdict}: ${r.reason}`) })
})
