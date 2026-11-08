import { createMockModel } from '@mastra/core/test-utils/llm-mock'
import type { JudgeModel, StagePlan } from '../../src/compiler'
import { judgeDraft } from '../../src/judge'
import type { VerdictInput } from '../../src/store/store'
import { planOf } from '../compiler/library'
import { GOOD_EVIDENCE, GOOD_OUTPUT } from '../compiler/rules'

// Shared parts of the judge step tests (judge.hazards). Each judge uses createMockModel. No test
// calls a model: the setup file fails each test that left a call of fetch (judge.no_network).

export const JUDGE = 'criteria.attribute_is_product'
export const JUDGE_REF = `${JUDGE}@1`
export const T = 'criteria[0].attributes[0]'
export const ATTRIBUTE = GOOD_OUTPUT.criteria[0]!.attributes[0]!

export type Said = 'yes' | 'no' | 'unknown'
export const ans = (answer: Said, quote: string, target = T, reason = `The judge says ${answer}.`) => ({ target, answer, quote, reason })

export interface Spy {
  calls: number
}

// A judge model whose reply is mockText. The spy counts each call of the model.
export function mockModel(mockText: unknown, spy?: Spy, fail?: string): JudgeModel {
  const onCall = () => {
    if (spy) spy.calls++
    if (fail !== undefined) throw new Error(fail)
  }
  return { id: 'mock/judge', model: createMockModel({ version: 'v2', objectGenerationMode: 'json', mockText: mockText as never, spyGenerate: onCall, spyStream: onCall }) as never }
}

export const judgeOf = (items: unknown[], spy?: Spy) => mockModel({ items }, spy)

// A draft with one attribute, changed by patch.
export const draftWith = (patch: Record<string, unknown>) => ({ criteria: [{ name: 'spf', attributes: [{ ...ATTRIBUTE, ...patch }] }] })

export interface RunOptions {
  readonly reply?: unknown
  readonly items?: unknown[]
  readonly evidence?: unknown
  readonly plan?: StagePlan
  readonly model?: JudgeModel
  readonly spy?: Spy
}

export function run(o: RunOptions = {}) {
  return judgeDraft({
    runId: 'run-judge-test',
    plan: o.plan ?? planOf(),
    reply: 'reply' in o ? o.reply : GOOD_OUTPUT,
    evidence: 'evidence' in o ? o.evidence : GOOD_EVIDENCE,
    judgeModel: o.model ?? judgeOf(o.items ?? [], o.spy),
  })
}

// The verify of the fixture judge scorer, with no judge step around it.
export function verifyJudge(items: unknown[], output: unknown = GOOD_OUTPUT, evidence: unknown = GOOD_EVIDENCE, spy?: Spy) {
  return planOf().scorers.judges(judgeOf(items, spy))[0]!.verify(output, evidence as never)
}

export const refOf = (r: { ruleId: string; ruleVersion: number }) => `${r.ruleId}@${r.ruleVersion}`
export const rowRefs = (rows: readonly VerdictInput[]) => [...new Set(rows.map(refOf))].sort()
export const planRefs = (plan: StagePlan) => plan.manifest.rules.map(r => `${r.id}@${r.version}`).sort()
export const rowsOf = (rows: readonly VerdictInput[], ruleId: string) => rows.filter(r => r.ruleId === ruleId)
