import { describe, expect, it } from 'vitest'
import { SKIPPED } from '../../src/judge'
import { GOOD_OUTPUT } from '../compiler/rules'
import { ans, JUDGE, rowsOf, run, verifyJudge, type Spy } from './helpers'

// Hazard `bad_evidence`: bad evidence reaches a paid call, or makes verify throw (judge.evidence_parsed).

const BAD = { sources: { label: 500 }, attribute_keys: ['spf'] }

describe('bad_evidence', () => {
  it('bad_evidence.step_skips_judges: evidence with the source label: 500 gives skipped judge rows with "The run evidence is not valid", and no model call', async () => {
    const spy: Spy = { calls: 0 }
    const o = await run({ evidence: BAD, items: [ans('yes', '5')], spy })
    expect(spy.calls).toBe(0)
    expect(rowsOf(o.rows, JUDGE)).toEqual([expect.objectContaining({ verdict: 'cannot_verify', decider: { by: 'code' }, reason: SKIPPED.evidence })])
    expect(SKIPPED.evidence).toMatch(/^The run evidence is not valid/)
    // The code scorers get {}, so a check that needs evidence gives cannot_verify.
    expect(rowsOf(o.rows, 'attributes.key_known')).toEqual([expect.objectContaining({ verdict: 'cannot_verify' })])
    expect(o.kind).toBe('person')
  })

  // Repro sonnet/p4.repro.ts: a source that was a number reached verify after a paid call, and the quote search threw.
  it('bad_evidence.verify_no_call (repro sonnet/p4.repro.ts): a direct call of verify with the same evidence gives cannot_verify, does not throw, and makes no model call', async () => {
    const spy: Spy = { calls: 0 }
    const rows = await verifyJudge([ans('yes', '5')], GOOD_OUTPUT, BAD, spy)
    expect(spy.calls).toBe(0)
    expect(rows).toEqual([expect.objectContaining({ verdict: 'cannot_verify', decider: { by: 'code' }, reason: expect.stringMatching(/^The run evidence is not valid, so no judge ran: sources\.label/) })])
  })
})
