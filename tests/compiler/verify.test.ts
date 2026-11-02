import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineCheck } from '../../src/rules/checks/define'

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
