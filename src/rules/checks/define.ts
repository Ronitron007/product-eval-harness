import { z } from 'zod'
import type { DimensionOrder } from '../strictness'

// What a check template is (compile.checks). A template is code with a strict parameter schema.
// A code_check rule names a template and gives the values of its parameters.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

// The evidence that a stage run gives to its checks and judges. Golden examples carry it in `input`.
export const RunEvidence = z
  .object({
    sources: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/, 'Name each source in snake_case, such as label.'), z.string()).optional(), // full texts by name
    attribute_keys: z.array(z.string()).optional(), // the attribute registry of the node
    record_ids: z.array(z.string()).optional(), // the research records that exist
  })
  .strict()
export type RunEvidence = z.infer<typeof RunEvidence>
export type EvidenceKey = keyof RunEvidence

// The closed list of facts that code may decide (enforce.deciders). No grade, score, match,
// or similarity. A new member is a code change under rules.harness, so it needs Rohan's yes.
export const FactKind = z.enum(['substring', 'membership', 'reference', 'uniqueness'])
export type FactKind = z.infer<typeof FactKind>

// A check returns a verdict and text only (checks.outcome_type). The scorer runtime, not the
// check, attaches the observed value from the output, and parses each outcome strictly.
export type CheckOutcome =
  | { readonly verdict: 'pass' }
  | { readonly verdict: 'fail'; readonly fix: string } // a fail gives the fix
  | { readonly verdict: 'cannot_verify'; readonly why: string }

// TypeScript checks no extra field in an object that an arrow function returns, so the type of
// the check's own return value is checked here: an extra field, such as score or observed, fails
// the build with the property name below.
type OutcomeKey = 'verdict' | 'fix' | 'why'
type ExtraOutcomeKeys<R> = R extends unknown ? Exclude<keyof R, OutcomeKey> : never
export type NoExtraOutcomeField<R> = [ExtraOutcomeKeys<R>] extends [never]
  ? unknown
  : { readonly 'Remove this field from the outcome. A check returns a verdict and text only': ExtraOutcomeKeys<R> }

// A test vector. Vectors are tests, not hash inputs.
export interface CheckVector<P> {
  readonly params: P
  readonly value: Json
  readonly evidence: RunEvidence
  readonly expected: 'pass' | 'fail' | 'cannot_verify'
}

export interface CheckTemplate<
  N extends string = string,
  P extends z.ZodObject = z.ZodObject,
  E extends EvidenceKey = EvidenceKey,
  R extends CheckOutcome = CheckOutcome,
> {
  readonly name: N
  readonly version: number // raise it when check() or render() changes. code.lock.json proves it.
  readonly fact: FactKind
  readonly target: 'text' | 'object' | 'list' // the trie node kind that the check reads (fits)
  readonly params: P // a strict object with no defaults
  readonly order: { readonly [K in keyof z.infer<P>]-?: DimensionOrder } // one order for each parameter
  readonly needs: readonly E[]
  render(params: z.infer<P>): string // the instruction line, from the same params as check()
  literals(params: z.infer<P>): readonly string[] // words that the statement and the reason must not hold
  requires(params: z.infer<P>, field: string): readonly string[] // extra paths that must resolve
  // Called only with a present value of the target kind, and with each key of `needs` present.
  check(params: z.infer<P>, value: Json, evidence: { readonly [K in E]-?: NonNullable<RunEvidence[K]> }): R
  readonly vectors: readonly CheckVector<z.infer<P>>[]
}

export function defineCheck<N extends string, P extends z.ZodObject, E extends EvidenceKey, R extends CheckOutcome>(
  t: CheckTemplate<N, P, E, R> & NoExtraOutcomeField<R>,
): CheckTemplate<N, P, E, R> {
  return t
}
