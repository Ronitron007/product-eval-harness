import { describe, expect, it } from 'vitest'
import { indexTree, refOf, resolve, type AdmittedRule } from '../../src/compiler/scope'
import type { Sha256 } from '../../src/compiler'
import { RuleRecord } from '../../src/rules/schema'
import { codes, derivedRow, input, library, problemsOf, tree, withRules } from './library'
import { attributeIsProduct, FIXTURE, keyKnown, labelUnit } from './rules'

// Hazard `admit`: an unlocked or invalid rule reaches the compile.

const derivedJudge = { ...attributeIsProduct, id: 'derived.attribute_is_product', owner: 'sunscreen' }

describe('admit', () => {
  it('admit.library_problem: a library with a lock problem gives library_invalid', () => {
    const lib = library(FIXTURE)
    lib.problems.push({ file: 'skincare/units.label_unit.yaml', field: 'version', message: 'The words changed under version 1.' })
    const problems = problemsOf({ library: lib })
    expect(problems).toEqual([expect.objectContaining({ code: 'library_invalid', field: 'version', message: expect.stringMatching(/^skincare\/units.label_unit.yaml version: The words changed/) })])
  })

  it('admit.derived_hash_mismatch: a derived record that someone edited gives derived_hash_mismatch', () => {
    const row = derivedRow(derivedJudge)
    const edited = { ...row, record: { ...row.record, statement: 'Keep the attribute about anything.' } as never }
    expect(problemsOf({ derived: [edited] })).toEqual([expect.objectContaining({ code: 'derived_hash_mismatch', rules: ['derived.attribute_is_product@1'] })])
  })

  it('admit.derived_invalid: a derived record with bad parameters gives derived_invalid', () => {
    const row = derivedRow({ ...keyKnown, id: 'derived.key_known', owner: 'sunscreen' })
    const bad = { ...row, record: { ...row.record, check: { name: 'key_in_registry', params: { fuzzy: true } } } as never }
    expect(problemsOf({ derived: [bad] })).toEqual([expect.objectContaining({ code: 'derived_invalid', message: expect.stringMatching(/check.params: Unrecognized key: "fuzzy"/) })])
  })

  it('admit.derived_invalid: a derived record with no canonical form gives derived_invalid, and the compile does not throw', () => {
    const row = derivedRow(derivedJudge)
    const lone = { ...row, record: { ...row.record, statement: 'Keep it \ud800 about the product.' } as never }
    expect(problemsOf({ derived: [lone] })).toEqual([expect.objectContaining({ code: 'derived_invalid', message: expect.stringMatching(/has no canonical form/) })])
  })

  it('admit.derived_columns: a derived row whose owner column differs from its record gives derived_invalid', () => {
    const row = derivedRow(derivedJudge, { owner: 'moisturizer' })
    expect(problemsOf({ derived: [row] })).toEqual([
      expect.objectContaining({ code: 'derived_invalid', message: 'The columns of derived rule derived.attribute_is_product@1 disagree with its record: owner is moisturizer in the row and sunscreen in the record.' }),
    ])
  })

  it('admit.derived_shape: a derived rule of kind shape gives derived_invalid', () => {
    const row = derivedRow({ ...labelUnit, id: 'derived.unit', owner: 'sunscreen' })
    expect(problemsOf({ derived: [row] })).toEqual([expect.objectContaining({ code: 'derived_invalid', message: expect.stringMatching(/is a shape rule. Only Rohan changes an output shape/) })])
  })

  it('admit.id_collision: a derived id equal to a stage rule id gives id_collision', () => {
    const row = derivedRow({ ...keyKnown, owner: 'sunscreen' })
    expect(codes(problemsOf({ derived: [row] }))).toEqual(['id_collision'])
  })

  it('admit.id_collision: a trial candidate with the id and version of a stage rule gives id_collision', () => {
    expect(codes(problemsOf({ trial: RuleRecord.parse({ ...keyKnown, binding: 'soft' }) }))).toEqual(['id_collision'])
  })

  it('admit.draft_shadows_active: a stage rule file with status draft and version 2 gives draft_shadows_active', () => {
    const draft = { ...keyKnown, version: 2, supersedes: 1, status: 'draft' }
    expect(problemsOf({ rules: withRules(draft) })).toEqual([expect.objectContaining({ code: 'draft_shadows_active', rules: ['attributes.key_known@2'] })])
  })

  it('admit.brand: only admit makes the Admitted value, so raw rules cannot reach an internal step', () => {
    // Each rule is well typed: the brand is the only thing that raw lacks.
    const rules: AdmittedRule[] = library(FIXTURE).rules.map(r => ({ rule: r.rule, ref: refOf(r.rule), hash: r.hash as Sha256, origin: 'git', binding: r.rule.binding }))
    const raw = { rules, older: [] as AdmittedRule[] }
    // @ts-expect-error raw rules are not Admitted: the type check fails if this line compiles
    expect(() => resolve(raw, indexTree(tree), 'sunscreen', 'create_node')).not.toThrow()
    expect(input().library.problems).toEqual([])
  })
})
