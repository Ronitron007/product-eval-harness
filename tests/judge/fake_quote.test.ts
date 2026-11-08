import { describe, expect, it } from 'vitest'
import canonicalize from 'canonicalize'
import { GOOD_EVIDENCE, GOOD_OUTPUT } from '../compiler/rules'
import { ans, ATTRIBUTE, draftWith, JUDGE, rowsOf, run, verifyJudge, type Spy } from './helpers'

// Hazard `fake_quote`: a judge backs a verdict with a junk quote, or a quote that no permitted text
// holds (judge.quote_rules, judge.quote_plain_span). The rules live in verify, so most tests call it.

const json = (v: unknown) => canonicalize(v)!
const label = (text: string) => ({ ...GOOD_EVIDENCE, sources: { label: text } })

describe('fake_quote', () => {
  it('fake_quote.not_in_source: a yes with the quote 600 mg gives cannot_verify, and the reason starts with "Quote not found in source"', async () => {
    const [row] = await verifyJudge([ans('yes', '600 mg')])
    expect(row).toMatchObject({ verdict: 'cannot_verify', decider: { by: 'judge' } })
    expect(row!.reason).toBe('Quote not found in source. The judge answered yes: The judge says yes. Quote: "600 mg"')
    expect(row!.evidence).toEqual({ quote: json(ATTRIBUTE), source: 'output' })
  })

  // Repros opus/probe.repro.ts, opus/probe3.repro.ts (the gamed no), and sonnet/p1.repro.ts (F1).
  it('fake_quote.too_short (repros opus/probe.repro.ts, opus/probe3.repro.ts, sonnet/p1.repro.ts F1): a yes or a no with a junk quote gives cannot_verify with "Quote too short."', async () => {
    for (const said of ['yes', 'no'] as const) {
      for (const junk of ['.', 'a', '​', '', ' e ', '0', ' a​.']) {
        const [row] = await verifyJudge([ans(said, junk)])
        expect({ said, junk, verdict: row!.verdict, reason: row!.reason.slice(0, 16) }).toEqual({ said, junk, verdict: 'cannot_verify', reason: 'Quote too short.' })
      }
    }
    // The gamed no of opus/probe3 quoted a dot and gave repair. It now goes to a person.
    const o = await run({ reply: draftWith({ key: 'trending' }), evidence: { ...GOOD_EVIDENCE, attribute_keys: ['spf', 'trending'] }, items: [ans('no', '.')] })
    expect(o.kind).toBe('person')
    // Two letters or digits are enough. Code cannot check that a quote is relevant (judge.limits).
    expect((await verifyJudge([ans('yes', 'Each')]))[0]!.verdict).toBe('pass')
  })

  it('fake_quote.normalized_match: a source with a no-break space and a zero-width space inside "500 mg" matches the quote 500 mg, and so does a full-width quote', async () => {
    const [spaced] = await verifyJudge([ans('yes', '500 mg')], GOOD_OUTPUT, label('Each capsule has 500 ​mg.'))
    expect(spaced).toMatchObject({ verdict: 'pass', evidence: { quote: '500 ​mg', source: 'sources.label' } })
    const [wide] = await verifyJudge([ans('yes', '５００ mg')])
    expect(wide).toMatchObject({ verdict: 'pass', evidence: { quote: '500 mg', source: 'sources.label' } })
    const [runs] = await verifyJudge([ans('yes', '  has\n\t500   mg ')])
    expect(runs).toMatchObject({ verdict: 'pass', evidence: { quote: 'has 500 mg', source: 'sources.label' } })
  })

  // Repro sonnet/p5.repro.ts: a yes that quotes only the draft.
  it('fake_quote.pass_from_the_draft (repro sonnet/p5.repro.ts): a yes that quotes only the draft item gives cannot_verify', async () => {
    for (const fromDraft of ['spf', json(ATTRIBUTE)]) {
      const [row] = await verifyJudge([ans('yes', fromDraft)])
      expect({ fromDraft, verdict: row!.verdict }).toEqual({ fromDraft, verdict: 'cannot_verify' })
      expect(row!.reason).toMatch(/^Quote not found in source/)
    }
    // A quote that the source also holds passes, even when the draft holds it too (judge.limits).
    const echo = draftWith({ quote: 'capsule' })
    expect((await verifyJudge([ans('yes', 'capsule')], echo))[0]).toMatchObject({ verdict: 'pass', evidence: { source: 'sources.label' } })
    expect((await verifyJudge([ans('yes', 'Each capsule has 500 mg.')]))[0]!.verdict).toBe('pass')
  })

  // Repro opus/probe3.repro.ts: the honest no that quoted the draft key went to a person.
  it('fake_quote.fail_from_the_item (repro opus/probe3.repro.ts): a no that quotes the key of the judged item gives fail, with evidence.source item.key, and the outcome repair', async () => {
    const o = await run({ reply: draftWith({ key: 'trending' }), evidence: { ...GOOD_EVIDENCE, attribute_keys: ['spf', 'trending'] }, items: [ans('no', 'trending')] })
    expect(rowsOf(o.rows, JUDGE)).toEqual([expect.objectContaining({ verdict: 'fail', evidence: { quote: 'trending', source: 'item.key' } })])
    expect(o.kind).toBe('repair')
  })

  it('fake_quote.fail_from_a_source: a no with the quote 500 mg gives fail, with evidence.source sources.label', async () => {
    const [row] = await verifyJudge([ans('no', '500 mg')], draftWith({ quote: 'capsule' }))
    expect(row).toMatchObject({ verdict: 'fail', evidence: { quote: '500 mg', source: 'sources.label' } })
  })

  it('fake_quote.fail_quote_plain_text: two honest no answers, one with a quote mark and one across a line break, each give fail', async () => {
    const item = draftWith({ quote: 'Use "daily"\nSPF 50' })
    const [marks] = await verifyJudge([ans('no', 'Use "daily"')], item)
    expect(marks).toMatchObject({ verdict: 'fail', evidence: { quote: 'Use "daily"', source: 'item.quote' } })
    const [lines] = await verifyJudge([ans('no', '"daily" SPF 50')], item)
    expect(lines).toMatchObject({ verdict: 'fail', evidence: { quote: '"daily"\nSPF 50', source: 'item.quote' } })
    // A string item is searched as it is, and a list item by each string leaf.
    const list = { criteria: [{ name: 'spf', attributes: [{ ...ATTRIBUTE, tags: ['water', 'Use "daily"'] }] }] }
    expect((await verifyJudge([ans('no', 'Use "daily"')], list))[0]).toMatchObject({ evidence: { source: 'item.tags[1]' } })
  })

  it('fake_quote.stored_span_raw: a yes with the quote 500 mg gives pass, and evidence.quote is the raw label slice with the no-break space', async () => {
    const [row] = await verifyJudge([ans('yes', '500 mg')], GOOD_OUTPUT, label('Each capsule has 500 mg.'))
    expect(row).toMatchObject({ verdict: 'pass', evidence: { quote: '500 mg', source: 'sources.label' } })
    expect(row!.reason).toBe('The judge says yes. Quote: "500 mg"')
  })

  it('fake_quote.case_differs: a yes with the quote 500 MG gives cannot_verify', async () => {
    const [row] = await verifyJudge([ans('yes', '500 MG')])
    expect(row!.verdict).toBe('cannot_verify')
    expect(row!.reason).toMatch(/^Quote not found in source/)
  })

  // Repro sonnet/p6.repro.ts: the run has no source text, and the judge call still runs.
  it('fake_quote.no_sources (repro sonnet/p6.repro.ts): with no sources, a yes with the quote 500 mg gives cannot_verify, and a no that quotes the item still gives fail', async () => {
    const spy: Spy = { calls: 0 }
    const [yes] = await verifyJudge([ans('yes', '500 mg')], GOOD_OUTPUT, { attribute_keys: ['spf'] }, spy)
    expect(yes).toMatchObject({ verdict: 'cannot_verify', reason: expect.stringMatching(/^Quote not found in source/) })
    expect(spy.calls).toBe(1)
    const [no] = await verifyJudge([ans('no', 'spf')], GOOD_OUTPUT, { attribute_keys: ['spf'] })
    expect(no).toMatchObject({ verdict: 'fail', evidence: { quote: 'spf', source: 'item.key' } })
  })

  it('fake_quote.unknown_needs_none: an unknown with an empty quote gives cannot_verify, and its reason does not say "Quote not found in source"', async () => {
    const [row] = await verifyJudge([ans('unknown', '')])
    expect(row).toMatchObject({ verdict: 'cannot_verify', reason: 'The judge says unknown.', decider: { by: 'judge' } })
    expect(row!.reason).not.toMatch(/Quote not found in source|Quote too short/)
  })
})
