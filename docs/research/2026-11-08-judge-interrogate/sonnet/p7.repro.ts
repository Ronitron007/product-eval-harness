import { it } from 'vitest'
import { judgeDraft } from '../../src/judge/step'
import { planOf } from '../compiler/library'
import { GOOD_EVIDENCE, GOOD_OUTPUT } from '../compiler/rules'
import { out } from './p0.test'
it('unmocked model id is swallowed', async () => {
  const o: any = await judgeDraft({ runId: 'r', plan: planOf(), reply: GOOD_OUTPUT, evidence: GOOD_EVIDENCE, judgeModel: { id: 'openai/gpt-4o-mini', model: 'openai/gpt-4o-mini' as never } })
  out('real model id, no mock', { kind: o.kind, judgeRow: o.rows.filter((r: any) => r.ruleId === 'criteria.attribute_is_product').map((r: any) => `${r.verdict}: ${r.reason.slice(0, 160)}`) })
})
