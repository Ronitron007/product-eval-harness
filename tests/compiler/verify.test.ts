import canonicalize from 'canonicalize'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { CHECKS } from '../../src/rules/checks'
import { defineCheck } from '../../src/rules/checks/define'
import { planOf, setAt } from './library'
import { GOOD_EVIDENCE, GOOD_OUTPUT } from './rules'

// Hazard `verify`: code gives a grade or a match, or a pass with no evidence.

const base = { version: 1, target: 'text', params: z.object({}).strict(), order: {}, needs: [], render: () => 'r', literals: () => [], requires: () => [], vectors: [] } as const

// Repro interrogate/opus/outcome/outcome.ts: a membership check that grades and picks a best
// match. The three templates below must fail the type check (npm run typecheck).
export const returnsNumber = defineCheck({
  ...base,
  name: 'returns_number',
  fact: 'membership',
  // @ts-expect-error a check returns an outcome, never a number
  check: () => 0.9,
})
// @ts-expect-error a check returns no extra field, such as observed or score
export const extraField = defineCheck({
  ...base,
  name: 'extra_field',
  fact: 'membership',
  check: (_p: Record<string, never>, value: unknown) =>
    value === 'magnesium glycinate' ? { verdict: 'pass', observed: { score: 0.94, best_match: 'magnesium glycinate' } } : { verdict: 'fail', fix: 'Use the best match.' },
})
export const similarity = defineCheck({
  ...base,
  name: 'similarity',
  // @ts-expect-error FactKind is closed: no similarity
  fact: 'similarity',
  check: () => ({ verdict: 'pass' }),
})

describe('verify', () => {
  it('verify.outcome_types: the three bad templates above fail the type check', () => {
    // The assertions are the @ts-expect-error lines: npm run typecheck fails if one of them compiles.
    expect([returnsNumber.name, extraField.name, similarity.name]).toEqual(['returns_number', 'extra_field', 'similarity'])
  })
})

const keyTemplate = CHECKS.find(t => t.name === 'key_in_registry')!
const keyRows = (output: unknown, evidence = GOOD_EVIDENCE) => planOf().scorers.code.find(s => s.rule.id === 'attributes.key_known')!.verify(output, evidence)
afterEach(() => vi.restoreAllMocks())

describe('verify, through the scorer runtime', () => {
  it('verify.outcome_strict_parse: a check that adds an extra field to an outcome object that it built earlier gives cannot_verify', async () => {
    vi.spyOn(keyTemplate, 'check').mockImplementation(() => {
      const outcome = { verdict: 'pass' as const }
      return Object.assign(outcome, { score: 0.94, best_match: 'spf' })
    })
    expect(await keyRows(GOOD_OUTPUT)).toEqual([expect.objectContaining({ verdict: 'cannot_verify', reason: expect.stringMatching(/returned an outcome that is not valid/) })])
  })

  it('verify.observed_from_runtime: for each row, evidence.quote holds the value at the target of the output, as canonical JSON', async () => {
    const two = { criteria: [{ name: 'spf', attributes: [GOOD_OUTPUT.criteria[0]!.attributes[0]!, { amount: 2.5, key: 'zinc', quote: '2.5 g', unit: 'g' }] }] }
    const plan = planOf()
    for (const s of plan.scorers.code) {
      for (const row of await s.verify(two, GOOD_EVIDENCE)) {
        const path = row.target.replace(/\[(\d+)\]/g, '.$1').split('.')
        const value = path.reduce<unknown>((at, k) => (at as Record<string, unknown>)[k], two)
        expect({ target: row.target, evidence: row.evidence }).toEqual({ target: row.target, evidence: { quote: canonicalize(value), source: 'output' } })
      }
    }
  })

  it('verify.wrong_type: a number given to a text check gives cannot_verify', async () => {
    expect(await keyRows(setAt(GOOD_OUTPUT, 'criteria[].attributes[].key', 500))).toEqual([
      expect.objectContaining({ verdict: 'cannot_verify', reason: 'key_in_registry reads text, and the value is a number. The shape rule of the field reports it.', evidence: { quote: '500', source: 'output' } }),
    ])
  })

  it('verify.throw: a check that throws gives cannot_verify', async () => {
    vi.spyOn(keyTemplate, 'check').mockImplementation(() => {
      throw new Error('registry offline')
    })
    expect(await keyRows(GOOD_OUTPUT)).toEqual([expect.objectContaining({ verdict: 'cannot_verify', reason: 'key_in_registry threw: registry offline' })])
  })

  it('verify.empty_list: an existing empty list gives pass, with [] as the observed value', async () => {
    const empty = { criteria: [{ name: 'spf', attributes: [] }] }
    expect(await keyRows(empty)).toEqual([expect.objectContaining({ verdict: 'pass', target: 'criteria[0].attributes', evidence: { quote: '[]', source: 'output' } })])
    const unit = await planOf().scorers.code.find(s => s.rule.id === 'units.label_unit')!.verify(empty, GOOD_EVIDENCE)
    expect(unit).toEqual([expect.objectContaining({ verdict: 'pass', evidence: { quote: '[]', source: 'output' } })])
  })

  it('verify.absent_field: an absent field gives fail for its shape rule and cannot_verify for a code check', async () => {
    const noKey = structuredClone(GOOD_OUTPUT) as { criteria: { attributes: Record<string, unknown>[] }[] }
    delete noKey.criteria[0]!.attributes[0]!.key
    const plan = planOf()
    const rows = async (id: string) => plan.scorers.code.find(s => s.rule.id === id)!.verify(noKey, GOOD_EVIDENCE)
    expect(await rows('attributes.key')).toEqual([expect.objectContaining({ verdict: 'fail', target: 'criteria[0].attributes[0].key', reason: 'criteria[0].attributes[0].key is missing. Add the field criteria[0].attributes[0].key: text of at least 1 character.' })])
    const check = await rows('attributes.key_known')
    expect(check).toEqual([expect.objectContaining({ verdict: 'cannot_verify', reason: 'criteria[0].attributes[0].key is missing. The shape rule of the field reports the absence.' })])
    expect(check[0]).not.toHaveProperty('evidence')
  })
})
