import { createMockModel } from '@mastra/core/test-utils/llm-mock'
import { it } from 'vitest'
import { writeSync } from 'node:fs'
export const out = (label: string, v: unknown) => writeSync(1, `\n## ${label}\n${JSON.stringify(v, null, 1)}\n`)
import type { JudgeModel } from '../../src/compiler'
import { judgeDraft } from '../../src/judge/step'
import { planOf } from '../compiler/library'
import { GOOD_EVIDENCE, GOOD_OUTPUT } from '../compiler/rules'
export const mock = (items: unknown[], onCall?: () => void): JudgeModel => ({ id: 'mock/judge', model: createMockModel({ version: 'v2', objectGenerationMode: 'json', mockText: { items }, spyGenerate: onCall, spyStream: onCall }) as never })
export const T = 'criteria[0].attributes[0]'
export const ans = (answer: 'yes' | 'no' | 'unknown', quote: string, target = T) => ({ target, answer, quote, reason: `says ${answer}` })
export const show = (o: any) => ({ kind: o.kind, errors: o.errors, open: o.open?.map((r: any) => `${r.ruleId}@${r.ruleVersion} ${r.binding} ${r.target} ${r.verdict}`), warnings: o.warnings, rows: o.rows.map((r: any) => `${r.ruleId}@${r.ruleVersion} ${r.binding} ${r.target} ${r.verdict} ev=${JSON.stringify(r.evidence)}`) })
it('baseline', async () => {
  const o = await judgeDraft({ runId: 'r', plan: planOf(), reply: GOOD_OUTPUT, evidence: GOOD_EVIDENCE, judgeModel: mock([ans('yes', '500 mg')]) })
  out('baseline', show(o))
})
