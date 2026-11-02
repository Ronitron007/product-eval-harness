// The CheckOutcome and Json types verbatim from compile.checks. "A check cannot express a number, a grade, or a best match."
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type CheckOutcome =
  | { readonly verdict: 'pass'; readonly observed: Json }
  | { readonly verdict: 'fail'; readonly observed: Json; readonly fix: string }
  | { readonly verdict: 'cannot_verify'; readonly why: string }
const sim = (a: string, b: string) => 1 - Math.abs(a.length - b.length) / Math.max(a.length, b.length)
// a "membership" check that grades and matches, and puts the score and the best match into the verdict row
export function check(value: string, registry: readonly string[]): CheckOutcome {
  const best = registry.map(k => ({ k, s: sim(value, k) })).sort((x, y) => y.s - x.s)[0]!
  return best.s >= 0.8
    ? { verdict: 'pass', observed: { score: best.s, best_match: best.k } }
    : { verdict: 'fail', observed: best.s, fix: `Use ${best.k}.` }
}
// the three lines that verify.outcome_types expects to fail
// @ts-expect-error a score field
export const a: CheckOutcome = { verdict: 'pass', observed: 'x', score: 0.9 }
// @ts-expect-error a pass with no observed
export const b: CheckOutcome = { verdict: 'pass' }
console.log(JSON.stringify(check('magnesium glycinat', ['magnesium glycinate', 'zinc'])))
