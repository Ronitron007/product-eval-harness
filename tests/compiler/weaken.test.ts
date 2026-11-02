import { describe, expect, it } from 'vitest'
import { compile, planOf, problemsOf } from './library'
import { RuleRecord } from '../../src/rules/schema'
import { attributeAmount, FIXTURE, keyKnown, labelUnit, quotesFromLabel, type RuleInput } from './rules'

// Hazard `weaken`: a child rule restates an inherited rule more loosely. The plan check
// "a weakening child is refused" (compile.plan_checks).

// The fixture rules run at define_criteria too, so that the library also compiles at skincare.
const both = (r: RuleInput): RuleInput => ({ ...r, scope: { ...(r.scope as object), stages: ['define_criteria', 'create_node'] } })
const PARENT = FIXTURE.map(both)
const child = (r: RuleInput, extra: Record<string, unknown>): RuleInput => both({ ...r, owner: 'sunscreen', ...extra })

const allowIu = child(labelUnit, { id: 'units.allow_iu', shape: { type: 'text', values: ['mg', 'mcg', 'g', 'IU'] } })
const lowerMin = child(attributeAmount, { id: 'attributes.amount_any', shape: { type: 'number', min: -1 } })
const watchKey = child(keyKnown, { id: 'attributes.key_watch', binding: 'watch' })
const addMax = child(attributeAmount, { id: 'attributes.amount_cap', shape: { type: 'number', max: 5000 } })

describe('weaken', () => {
  it('weaken.bigger_values: at sunscreen, a child rule with values [mg, mcg, g, IU] gives weakens', () => {
    expect(problemsOf({ rules: [...PARENT, allowIu] })).toEqual([
      {
        code: 'weakens',
        rules: ['units.allow_iu@1', 'units.label_unit@1'],
        field: 'criteria[].attributes[].unit',
        message: 'sunscreen units.allow_iu@1 allows IU, which skincare units.label_unit@1 forbids. Change the skincare rule, or drop the value.',
      },
    ])
  })

  it('weaken.lower_min: at sunscreen, a child number.min below the inherited min gives weakens', () => {
    expect(problemsOf({ rules: [...PARENT, lowerMin] })).toEqual([
      expect.objectContaining({
        code: 'weakens',
        rules: ['attributes.amount_any@1', 'attributes.amount@1'],
        message: 'sunscreen attributes.amount_any@1 sets min to -1, below the min 0 of skincare attributes.amount@1. Change the skincare rule, or raise the value.',
      }),
    ])
  })

  it('weaken.lower_binding: at sunscreen, a child code check with binding watch in the slot of an inherited strict code check gives weakens', () => {
    expect(problemsOf({ rules: [...PARENT, watchKey] })).toEqual([
      expect.objectContaining({
        code: 'weakens',
        rules: ['attributes.key_watch@1', 'attributes.key_known@1'],
        message: 'sunscreen attributes.key_watch@1 has the binding watch, below the binding strict of skincare attributes.key_known@1. Change the skincare rule, or raise the binding.',
      }),
    ])
  })

  it('weaken.addition_accepted: at sunscreen, a child rule that adds max to an inherited number rule with min compiles', () => {
    const plan = planOf({ rules: [...PARENT, addMax] })
    expect(plan.instructions).toContain('criteria[].attributes[].amount\n  Shape: number, at least 0, at most 5000')
    expect(plan.schema.safeParse({ criteria: [{ name: 'spf', attributes: [{ amount: 5001, key: 'spf', quote: 'q', unit: 'mg' }] }] }).success).toBe(false)
  })

  it('weaken.parent_compiles: at skincare, the same library compiles, because the child rules do not apply there', () => {
    const plan = planOf({ rules: [...PARENT, allowIu, lowerMin, watchKey], node: 'skincare', stage: 'define_criteria' })
    const children = plan.ledger.filter(e => ['units.allow_iu', 'attributes.amount_any', 'attributes.key_watch'].includes(e.rule))
    expect(children.map(e => e.disposition)).toEqual([0, 1, 2].map(() => ({ kind: 'excluded', reason: 'owner_not_on_path' })))
  })

  it('weaken.foreign_owner: a rule owned by sunscreen gets owner_not_on_path at skincare and at moisturizer', () => {
    for (const [node, stage] of [['skincare', 'define_criteria'], ['moisturizer', 'create_node']] as const) {
      const plan = planOf({ rules: [...PARENT, addMax], node, stage })
      expect(plan.ledger.find(e => e.rule === 'attributes.amount_cap')!.disposition).toEqual({ kind: 'excluded', reason: 'owner_not_on_path' })
    }
  })

  it('weaken.trial_not_weaker: a strict child candidate in a trial compiles as watch and gives no weakens', () => {
    const candidate = child(keyKnown, { id: 'attributes.key_known_here', binding: 'strict' })
    const r = compile({ rules: PARENT, trial: candidate as never })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.plan.manifest.rules.find(x => x.id === 'attributes.key_known_here')).toMatchObject({ binding: 'watch', origin: 'trial' })
  })

  it('weaken.owner_all: the owner all is an ancestor of each domain, so a skincare rule cannot loosen a rule of all', () => {
    const ofAll = both({ ...labelUnit, id: 'units.mass_unit', owner: 'all', shape: { type: 'text', values: ['mg', 'g'] } })
    expect(problemsOf({ rules: [...PARENT, ofAll] })).toEqual([
      expect.objectContaining({ code: 'weakens', rules: ['units.label_unit@1', 'units.mass_unit@1'], message: expect.stringMatching(/^skincare units.label_unit@1 allows mcg, which all units.mass_unit@1 forbids/) }),
    ])
  })

  // Review of #19, repro probe2.test.ts L1: a peer restates a slot more loosely, and both lines print.
  it('weaken.peer_restatement: two applied rules on one slot with other values or another binding give slot_conflict, at any owner relation', () => {
    const anyCase = both({ ...quotesFromLabel, id: 'quotes.any_case', binding: 'soft', check: { name: 'quote_in_source', params: { source: 'label', case_sensitive: false } } })
    expect(problemsOf({ rules: [...PARENT, anyCase] })).toEqual([
      expect.objectContaining({
        code: 'slot_conflict',
        rules: ['quotes.any_case@1', 'quotes.from_label@1'],
        field: 'criteria[].attributes[].quote',
        message: 'skincare quotes.any_case@1 and skincare quotes.from_label@1 restate one slot on criteria[].attributes[].quote with other values: case_sensitive is false in quotes.any_case@1 and true in quotes.from_label@1; the binding is soft in quotes.any_case@1 and strict in quotes.from_label@1. Keep one rule, or make the values agree.',
      }),
    ])
    // A looser child keeps the code weakens.
    expect(problemsOf({ rules: [...PARENT, { ...anyCase, owner: 'sunscreen' }] }).map(p => p.code)).toEqual(['weakens'])
    // A stricter child that restates a dimension also gives slot_conflict.
    const narrow = child(labelUnit, { id: 'units.mass_only', shape: { type: 'text', values: ['mg'] } })
    expect(problemsOf({ rules: [...PARENT, narrow] }).map(p => p.code)).toEqual(['slot_conflict'])
    // Equal values on one slot, and a trial version of the same id, are no restatement.
    expect(compile({ rules: [...PARENT, both({ ...keyKnown, id: 'attributes.key_again' })] }).ok).toBe(true)
    expect(compile({ rules: PARENT, trial: RuleRecord.parse({ ...keyKnown, version: 2, supersedes: 1, binding: 'soft' }) }).ok).toBe(true)
  })
})
