import { describe, expect, it } from 'vitest'
import type { DecodeResult } from '../../src/compiler'
import { decideOutcome, SKIPPED, type RuleRef } from '../../src/judge'
import type { VerdictInput } from '../../src/store/store'
import { planOf } from '../compiler/library'
import { GOOD_EVIDENCE, GOOD_OUTPUT } from '../compiler/rules'
import { ans, ATTRIBUTE, draftWith, JUDGE, rowsOf, run } from './helpers'

// Hazard `outcome_table`: an outcome breaks the binding table (judge.bindings). First line wins.

const OK: DecodeResult = { ok: true, output: GOOD_OUTPUT }
const HASH = 'a'.repeat(64)
const STATEMENTS = new Map<RuleRef, string>([['rule.judged@1', 'Keep the item about the product.']])

function verdict(binding: VerdictInput['binding'], v: VerdictInput['verdict'], target = 'criteria[0].name', ruleId = 'rule.coded', by: 'code' | 'judge' = 'code'): VerdictInput {
  const decider = by === 'code' ? { by: 'code' as const } : { by: 'judge' as const, model: 'mock/judge', promptHash: HASH }
  return { runId: 'run', ruleId, ruleVersion: 1, ruleHash: HASH, binding, target, verdict: v, decider, reason: `The row says ${v}.` }
}

describe('outcome_table', () => {
  it('outcome_table.each_binding_each_verdict: decideOutcome on one row gives the outcome of judge.bindings, and accept comes only when each strict row is pass', () => {
    const expected = {
      strict: { pass: 'accept', fail: 'repair', cannot_verify: 'person' },
      soft: { pass: 'accept', fail: 'accept', cannot_verify: 'accept' },
      watch: { pass: 'accept', fail: 'accept', cannot_verify: 'accept' },
    } as const
    const warnings = { soft: { pass: [], fail: ['warning'], cannot_verify: ['note'] } } as const
    for (const binding of ['strict', 'soft', 'watch'] as const) {
      for (const v of ['pass', 'fail', 'cannot_verify'] as const) {
        for (const by of ['code', 'judge'] as const) {
          const row = verdict(binding, v, 'criteria[0].name', by === 'code' ? 'rule.coded' : 'rule.judged', by)
          const o = decideOutcome({ decoded: OK, rows: [row], statements: STATEMENTS })
          expect({ binding, v, by, kind: o.kind }).toEqual({ binding, v, by, kind: expected[binding][v] })
          expect(o.rows).toEqual([row])
          expect(o.warnings.map(w => w.kind)).toEqual(binding === 'soft' ? warnings.soft[v] : [])
          if (o.kind === 'accept') expect(o.output).toEqual(GOOD_OUTPUT)
          if (o.kind === 'repair') expect(o.errors).toHaveLength(1)
          if (o.kind === 'person') expect(o.open).toEqual([row])
        }
      }
    }
    // Mocked judges, one for each verdict of the strict judgement rule, through the whole step.
    const kinds = []
    for (const said of ['yes', 'no', 'unknown'] as const) kinds.push(run({ items: [ans(said, '500 mg')] }).then(o => [said, o.kind]))
    return Promise.all(kinds).then(k => expect(k).toEqual([['yes', 'accept'], ['no', 'repair'], ['unknown', 'person']]))
  })

  it('outcome_table.repair_before_person: a strict fail and a strict cannot_verify give repair', () => {
    const rows = [verdict('strict', 'cannot_verify', 'criteria[0].name'), verdict('strict', 'fail', 'criteria')]
    const o = decideOutcome({ decoded: OK, rows, statements: STATEMENTS })
    expect(o.kind).toBe('repair')
    if (o.kind === 'repair') expect(o.errors).toEqual([{ from: 'rule.coded@1', target: 'criteria', fix: 'The row says fail.' }])
  })

  it('outcome_table.skipped_judge_rows_repair: a strict code fail with a strict judgement rule gives repair, not person', async () => {
    const o = await run({ reply: draftWith({ quote: '600 mg' }), items: [ans('yes', '500 mg')] })
    expect(rowsOf(o.rows, JUDGE)).toEqual([expect.objectContaining({ binding: 'strict', verdict: 'cannot_verify', reason: SKIPPED.strict })])
    expect(o.kind).toBe('repair')
  })

  // Repro sonnet/p2.repro.ts (F7): a strict code cannot_verify shuts the gate, and the run goes to a person.
  it('outcome_table.skipped_judge_rows_repair (repro sonnet/p2.repro.ts F7): a strict code cannot_verify with no fail gives person, with the skipped judge row open', async () => {
    const o = await run({ evidence: { sources: GOOD_EVIDENCE.sources }, items: [ans('yes', '500 mg')] })
    expect(o.kind).toBe('person')
    if (o.kind === 'person') expect(o.open.map(r => [r.ruleId, r.verdict])).toEqual([['attributes.key_known', 'cannot_verify'], [JUDGE, 'cannot_verify']])
    expect(rowsOf(o.rows, JUDGE)[0]!.reason).toBe(SKIPPED.strict)
  })

  it('outcome_table.errors_in_one_round: three strict fails on three targets give one repair with three errors', async () => {
    const bad = { ...ATTRIBUTE, quote: '600 mg' }
    const o = await run({ reply: { criteria: [{ name: 'spf', attributes: [bad, bad, bad] }] } })
    expect(o.kind).toBe('repair')
    if (o.kind === 'repair') {
      expect(o.errors.map(e => [e.from, e.target])).toEqual([0, 1, 2].map(k => ['quotes.from_label@1', `criteria[0].attributes[${k}].quote`]))
    }
  })

  // Repros sonnet/p2.repro.ts (F5) and opus/probe2.repro.ts (decode issue paths and row targets).
  it('outcome_table.no_duplicate_error (repro sonnet/p2.repro.ts F5): at one target, a bad unit gives a decode issue and a strict shape fail, and errors holds one entry for that target', async () => {
    const plan = planOf()
    const reply = draftWith({ unit: 'IU' })
    const decoded = plan.decode(reply)
    expect(decoded.ok ? [] : decoded.issues.map(i => i.path)).toEqual(['criteria[0].attributes[0].unit'])
    const o = await run({ plan, reply })
    expect(o.kind).toBe('repair')
    if (o.kind === 'repair') {
      expect(o.errors).toEqual([{ from: 'units.label_unit@1', target: 'criteria[0].attributes[0].unit', fix: expect.stringMatching(/^The value breaks the shape/) }])
    }
  })
})
