import { createMockModel } from '@mastra/core/test-utils/llm-mock'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { it } from 'vitest'
import { currentCode, lockProblems, packagePins, readCodeLock } from '../../scripts/compiler-lock'
import type { JudgeModel } from '../../src/compiler'
import { planOf } from '../compiler/library'
import { GOOD_EVIDENCE, GOOD_OUTPUT } from '../compiler/rules'

const out = (o: unknown) => process.stderr.write('\n' + JSON.stringify(o) + '\n')
const judge = (mockText: unknown): JudgeModel => ({ id: 'mock/judge', model: createMockModel({ version: 'v2', objectGenerationMode: 'json', mockText: mockText as never }) as never })

it('bad answer shapes', async () => {
  const plan = planOf()
  const t = 'criteria[0].attributes[0]'
  for (const [name, text] of [
    ['not json', 'yes it is'],
    ['no quote key', { items: [{ target: t, answer: 'yes', reason: 'r' }] }],
    ['extra score key', { items: [{ target: t, answer: 'yes', quote: '500 mg', reason: 'r', score: 0.9 }] }],
    ['YES upper', { items: [{ target: t, answer: 'YES', quote: '500 mg', reason: 'r' }] }],
  ] as const) {
    const rows = await plan.scorers.judges(judge(text))[0]!.verify(GOOD_OUTPUT, GOOD_EVIDENCE)
    out({ name, verdicts: rows.map(r => r.verdict), reason: rows[0]!.reason.slice(0, 80) })
  }
})

it('decode issue paths vs row targets', async () => {
  const plan = planOf()
  const a = GOOD_OUTPUT.criteria[0]!.attributes[0]!
  const { unit: _u, ...noUnit } = a
  for (const [name, draft] of [
    ['unit IU', { criteria: [{ name: 'spf', attributes: [{ ...a, unit: 'IU' }] }] }],
    ['unit missing', { criteria: [{ name: 'spf', attributes: [noUnit] }] }],
    ['quote empty', { criteria: [{ name: 'spf', attributes: [{ ...a, quote: '' }] }] }],
  ] as const) {
    const d = plan.decode(draft)
    const rows = (await Promise.all(plan.scorers.code.map(s => s.verify(draft, GOOD_EVIDENCE)))).flat()
    const strictFails = rows.filter(r => r.binding === 'strict' && r.verdict === 'fail').map(r => [`${r.ruleId}`, r.target, r.reason])
    out({ name, issues: d.ok ? [] : d.issues, strictFails })
  }
})

it('hash covers no judge-step code', async () => {
  const root = join(import.meta.dirname, '../..')
  const before = { hash: planOf().ruleSetHash, problems: lockProblems(readCodeLock(), currentCode(root), packagePins(root)) }
  mkdirSync(join(root, 'src/judge'), { recursive: true })
  writeFileSync(join(root, 'src/judge/step.ts'), "export const decideOutcome = (strictFail: boolean, strictCv: boolean) => strictCv ? 'person' : strictFail ? 'repair' : 'accept'\n")
  const v1 = currentCode(root).runtime.fingerprint
  writeFileSync(join(root, 'src/judge/step.ts'), "export const decideOutcome = (strictFail: boolean, strictCv: boolean) => 'accept'\n")
  const after = { hash: planOf().ruleSetHash, problems: lockProblems(readCodeLock(), currentCode(root), packagePins(root)), fingerprintMoved: v1 !== currentCode(root).runtime.fingerprint }
  out({ before, after, sameHash: before.hash === after.hash })
})
