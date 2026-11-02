import { z } from 'zod'
import { defineCheck, CheckRef, RuleRecord } from '../sketch'
// 1: an order table missing a param must fail the build
export const bad = defineCheck({
  name: 'x', version: 1, fact: 'membership', target: 'text',
  params: z.object({ min: z.number() }).strict(),
  order: {},
  needs: [], render: () => '', literals: () => [], requires: () => [], check: () => ({ verdict: 'pass', observed: null }),
})
// 2: a check cannot return a grade
export const bad2 = defineCheck({
  name: 'y', version: 1, fact: 'membership', target: 'text',
  params: z.object({}).strict(), order: {},
  needs: [], render: () => '', literals: () => [], requires: () => [], check: () => ({ verdict: 'pass', score: 0.7 }),
})
// 3: a fact kind outside the closed list
export const bad3 = defineCheck({
  name: 'z', version: 1, fact: 'similarity', target: 'text',
  params: z.object({}).strict(), order: {},
  needs: [], render: () => '', literals: () => [], requires: () => [], check: () => ({ verdict: 'cannot_verify', why: 'x' }),
})
type R = z.infer<typeof RuleRecord>
declare const r: R
if (r.kind === 'code_check') { const n: 'quote_in_source' | 'key_in_registry' | 'record_exists' | 'unique_by' = r.check.name; void n }
export type C = z.infer<typeof CheckRef>
