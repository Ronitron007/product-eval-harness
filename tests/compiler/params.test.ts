import { describe, expect, it } from 'vitest'
import { RuleRecord } from '../../src/rules/schema'
import { problemsOf, rulesCheck, rulesRoot } from './files'
import { uniqueTitle } from './rules'

// Hazard `params`: an unknown check or bad parameters reach a run.

describe('params', () => {
  it('params.unknown_check: the check name min_itemz gives a loader problem at check.name, so rules:check exits 1', () => {
    const root = rulesRoot([{ ...uniqueTitle, check: { name: 'min_itemz', params: {} } }])
    expect(problemsOf(root)).toEqual(['check.name: Name a check of the registry: key_in_registry, quote_in_source, record_exists, unique_by.'])
    const run = rulesCheck(root)
    expect(run.status).toBe(1)
    expect(run.out).toMatch(/check.name: Name a check of the registry/)
  })

  it('params.bad_key: a bad by gives a loader problem at check.params.by', () => {
    const root = rulesRoot([
      { ...uniqueTitle, check: { name: 'unique_by', params: { by: 'Not ok!' } } },
      { ...uniqueTitle, id: 'criteria.unique_other', check: { name: 'unique_by', params: { by: 'name', extra: 1 } } },
      { ...uniqueTitle, id: 'criteria.unique_none', check: { name: 'unique_by', params: {} } },
    ])
    // In file order: criteria.unique_none, criteria.unique_other, criteria.unique_title.
    expect(problemsOf(root)).toEqual([
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
