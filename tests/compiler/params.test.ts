import { describe, expect, it } from 'vitest'
import { RuleRecord } from '../../src/rules/schema'
import { CLI, problemsOf as loaderProblems, rulesCheck, rulesRoot } from './files'
import { derivedRow, problemsOf, withRules } from './library'
import { keyKnown, uniqueTitle } from './rules'

// Hazard `params`: an unknown check or bad parameters reach a run.

describe('params', () => {
  it('params.unknown_check: the check name min_itemz gives a loader problem at check.name, so rules:check exits 1', CLI, () => {
    const root = rulesRoot([{ ...uniqueTitle, check: { name: 'min_itemz', params: {} } }])
    expect(loaderProblems(root)).toEqual(['check.name: Name a check of the registry: key_in_registry, quote_in_source, record_exists, unique_by.'])
    const run = rulesCheck(root)
    expect(run.status).toBe(1)
    expect(run.out).toMatch(/check.name: Name a check of the registry/)
  })

  it('params.bad_key: a bad by gives a loader problem at check.params.by', CLI, () => {
    const root = rulesRoot([
      { ...uniqueTitle, check: { name: 'unique_by', params: { by: 'Not ok!' } } },
      { ...uniqueTitle, id: 'criteria.unique_other', check: { name: 'unique_by', params: { by: 'name', extra: 1 } } },
      { ...uniqueTitle, id: 'criteria.unique_none', check: { name: 'unique_by', params: {} } },
    ])
    // In file order: criteria.unique_none, criteria.unique_other, criteria.unique_title.
    expect(loaderProblems(root)).toEqual([
      'check.params.by: Give by: one key of the list items, such as name.',
      'check.params: Unrecognized key: "extra"',
      'check.params.by: Name one key of the list items, such as name.',
    ])
    expect(rulesCheck(root).status).toBe(1)
  })

  // Repro interrogate/sonnet/p4_loader.mjs: the loader names the field of each fault.
  it('params.loader_paths (repro p4_loader.mjs): an unknown name, a bad parameter, and a soft shape rule each name their field', () => {
    const paths = (v: unknown) => RuleRecord.safeParse(v).error?.issues.map(i => i.path.join('.'))
    expect(paths({ ...uniqueTitle, check: { name: 'min_itemz', params: {} } })).toEqual(['check.name'])
    expect(paths({ ...uniqueTitle, check: { name: 'unique_by', params: { by: 5 } } })).toEqual(['check.params.by'])
    const { check: _check, ...rest } = uniqueTitle
    expect(paths({ ...rest, kind: 'shape', shape: { type: 'text' }, binding: 'soft' })).toEqual(['binding'])
  })
})

describe('params, at compile time', () => {
  it('params.derived_faults: a derived row with an unknown check or a bad key gives derived_invalid', () => {
    const known = derivedRow({ ...keyKnown, id: 'attributes.key_derived', owner: 'sunscreen' })
    const unknownName = { ...known, record: { ...known.record, check: { name: 'min_itemz', params: {} } } as never }
    const unique = derivedRow({ ...uniqueTitle, id: 'criteria.unique_derived', owner: 'sunscreen' })
    const badKey = { ...unique, record: { ...unique.record, check: { name: 'unique_by', params: { by: 'Not ok!' } } } as never }
    const problems = problemsOf({ derived: [unknownName, badKey] })
    expect(problems).toEqual([
      expect.objectContaining({ code: 'derived_invalid', rules: ['attributes.key_derived@1'], message: expect.stringMatching(/check.name: Name a check of the registry/) }),
      expect.objectContaining({ code: 'derived_invalid', rules: ['criteria.unique_derived@1'], message: expect.stringMatching(/check.params.by: Name one key/) }),
    ])
  })

  it('params.check_on_wrong_kind: a unique_by on a text field gives check_on_wrong_kind', () => {
    const onText = { ...uniqueTitle, scope: { nodes: 'subtree', stages: ['create_node'], fields: ['criteria[].name'] } }
    expect(problemsOf({ rules: withRules(onText) })).toEqual([
      expect.objectContaining({ code: 'check_on_wrong_kind', rules: ['criteria.unique_title@1'], field: 'criteria[].name', message: 'unique_by reads list, and criteria[].name is text of at least 1 character. Name a list field, or use another check.' }),
      // and its by path, criteria[].name[].name, cannot resolve under a text field
      expect.objectContaining({ code: 'field_unresolved', field: 'criteria[].name[].name' }),
    ])
  })
})
