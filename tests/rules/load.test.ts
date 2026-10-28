import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { ruleHash } from '../../src/rules/hash'
import { LOCK_FILE, loadRuleLibrary, lockNewVersions } from '../../src/rules/load'
import { readLock, writeLock } from '../../src/rules/lock'
import { RuleRecord } from '../../src/rules/schema'

const judgementRule = {
  id: 'criteria.attribute_is_product',
  version: 1,
  statement: 'Each candidate attribute describes a property of the product itself.',
  reason: 'A grade must rest on the product.',
  kind: 'judgement',
  scope: { nodes: { node: 'skincare', descendants: true }, stages: ['define_criteria', 'create_node'], fields: ['criteria[].attributes[]'] },
  binding: 'strict',
  judge: { question: 'Does the attribute describe a property of the product itself?' },
  examples: [
    { output: { key: 'fragrance_present' }, expected: 'pass' },
    { output: { key: 'trending_on_social_media' }, expected: 'fail', note: 'Social signals never become attributes.' },
  ],
  provenance: { decision_row: '2026-10-24 Rohan ruled: attributes mean things that relate to products only.' },
  owner: 'skincare',
  status: 'draft',
}

const codeRule = {
  ...judgementRule,
  id: 'criteria.reason_has_record',
  statement: 'Each criterion cites at least one research record.',
  kind: 'code_check',
  judge: undefined,
  check: 'min_items',
  scope: { ...judgementRule.scope, fields: ['criteria[].recordIds'] },
}

const roots: string[] = []
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

function rulesRoot(files: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'rules-test-'))
  roots.push(root)
  for (const [path, data] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), typeof data === 'string' ? data : stringify(JSON.parse(JSON.stringify(data))))
  }
  return root
}

// Loads, locks the new versions, and loads again: the state after `npm run rules:lock`.
function lockedLibrary(root: string) {
  writeLock(join(root, LOCK_FILE), lockNewVersions(loadRuleLibrary(root)).lock)
  return loadRuleLibrary(root)
}

const messages = (root: string) => loadRuleLibrary(root).problems.map(p => `${p.field}: ${p.message}`)

describe('loadRuleLibrary', () => {
  it('loads a valid judgement rule and a valid code check, once both are locked', () => {
    const root = rulesRoot({
      'skincare/criteria.attribute_is_product.yaml': judgementRule,
      'skincare/criteria.reason_has_record.yaml': codeRule,
    })
    const library = lockedLibrary(root)
    expect(library.problems).toEqual([])
    expect(library.rules.map(r => r.rule.id).sort()).toEqual(['criteria.attribute_is_product', 'criteria.reason_has_record'])
  })

  it('refuses a rule version that is not in the lock', () => {
    const root = rulesRoot({ 'skincare/criteria.attribute_is_product.yaml': judgementRule })
    expect(messages(root)).toEqual([expect.stringMatching(/^version: Version 1 of criteria.attribute_is_product is not in rules.lock.json/)])
  })

  it('refuses changed words under a locked version', () => {
    const root = rulesRoot({ 'skincare/criteria.attribute_is_product.yaml': judgementRule })
    lockedLibrary(root)
    writeFileSync(join(root, 'skincare/criteria.attribute_is_product.yaml'), stringify({ ...judgementRule, statement: 'Each attribute is about the product.' }))
    expect(messages(root)).toEqual([expect.stringMatching(/^version: The words changed under version 1/)])
  })

  it('refuses a changed judge question under a locked version', () => {
    const root = rulesRoot({ 'skincare/criteria.attribute_is_product.yaml': judgementRule })
    lockedLibrary(root)
    writeFileSync(join(root, 'skincare/criteria.attribute_is_product.yaml'), stringify({ ...judgementRule, judge: { question: 'Is it about the product?' } }))
    expect(messages(root)).toEqual([expect.stringMatching(/The words changed under version 1/)])
  })

  it('accepts a new version that supersedes a locked one', () => {
    const root = rulesRoot({ 'skincare/criteria.attribute_is_product.yaml': judgementRule })
    lockedLibrary(root)
    writeFileSync(join(root, 'skincare/criteria.attribute_is_product.yaml'), stringify({ ...judgementRule, version: 2, supersedes: 1, binding: 'watch' }))
    expect(lockedLibrary(root).problems).toEqual([])
    expect(Object.keys(readLock(join(root, LOCK_FILE)).rules['criteria.attribute_is_product']!)).toEqual(['1', '2'])
  })

  it('refuses a judgement rule with no judge field', () => {
    const root = rulesRoot({ 'skincare/criteria.attribute_is_product.yaml': { ...judgementRule, judge: undefined } })
    expect(messages(root)).toEqual(['judge: A judgement rule needs a judge field with its question.'])
  })

  it('refuses a code check with no named check function', () => {
    const root = rulesRoot({ 'skincare/criteria.reason_has_record.yaml': { ...codeRule, check: undefined } })
    expect(messages(root)).toEqual(['check: A code_check rule needs a check field that names its check function.'])
  })

  it('refuses an example verdict outside pass, fail and cannot_verify', () => {
    const root = rulesRoot({ 'skincare/criteria.attribute_is_product.yaml': { ...judgementRule, examples: [{ output: {}, expected: 'maybe' }] } })
    expect(messages(root)).toEqual([expect.stringMatching(/^examples.0.expected:/)])
  })

  it('refuses a stage that does not exist', () => {
    const root = rulesRoot({ 'skincare/criteria.attribute_is_product.yaml': { ...judgementRule, scope: { ...judgementRule.scope, stages: ['define_criterias'] } } })
    expect(messages(root)).toEqual([expect.stringMatching(/^scope.stages.0:/)])
  })

  it('refuses a field path that is not a path', () => {
    const root = rulesRoot({ 'skincare/criteria.attribute_is_product.yaml': { ...judgementRule, scope: { ...judgementRule.scope, fields: ['criteria attributes'] } } })
    expect(messages(root)).toEqual([expect.stringMatching(/^scope.fields.0: Write a path such as criteria\[\]\.attributes\[\]/)])
  })

  it('refuses a rule with no provenance', () => {
    const root = rulesRoot({ 'skincare/criteria.attribute_is_product.yaml': { ...judgementRule, provenance: {} } })
    expect(messages(root)).toEqual(['provenance: Give a record_id or a decision_row, so that the rule says why it exists.'])
  })

  it('refuses a file outside the folder of its owner node, and a file not named after its id', () => {
    const root = rulesRoot({ 'sunscreen/attribute.yaml': judgementRule })
    expect(messages(root)).toEqual([
      'owner: The file must sit in rules/skincare/, the folder of its owner node.',
      'id: Name the file criteria.attribute_is_product.yaml, after the rule id.',
      expect.stringMatching(/^version: Version 1 of criteria.attribute_is_product is not in rules.lock.json/),
    ])
  })

  it('refuses two files with one id', () => {
    const root = rulesRoot({
      'skincare/criteria.attribute_is_product.yaml': judgementRule,
      'skincare/criteria.attribute_is_product.yml': judgementRule,
    })
    expect(lockedLibrary(root).problems.map(p => p.message)).toEqual([expect.stringMatching(/^The id criteria.attribute_is_product is also in/)])
  })

  it('refuses supersedes that names a version the lock does not hold, and does not lock that version', () => {
    const root = rulesRoot({ 'skincare/criteria.attribute_is_product.yaml': { ...judgementRule, version: 3, supersedes: 2 } })
    expect(lockedLibrary(root).problems.map(p => p.field)).toEqual(['version', 'supersedes'])
    expect(readLock(join(root, LOCK_FILE)).rules).toEqual({})
  })

  it('refuses a version that skips a version', () => {
    const root = rulesRoot({ 'skincare/criteria.attribute_is_product.yaml': { ...judgementRule, version: 3, supersedes: 1 } })
    expect(messages(root)).toEqual(['supersedes: Version 3 must supersede version 2. Raise the version by one at a time.'])
  })

  it('refuses an unknown key in the scope', () => {
    const root = rulesRoot({ 'skincare/criteria.attribute_is_product.yaml': { ...judgementRule, scope: { ...judgementRule.scope, feilds: ['x'] } } })
    expect(messages(root)).toEqual([expect.stringMatching(/^scope:/)])
  })

  it('reports a value with no canonical form as a problem, and keeps going', () => {
    const root = rulesRoot({
      'skincare/criteria.attribute_is_product.yaml': stringify({ ...judgementRule, examples: [{ output: Infinity, expected: 'pass' }] }),
      'skincare/criteria.reason_has_record.yaml': codeRule,
    })
    const problems = lockedLibrary(root).problems
    expect(problems).toEqual([expect.objectContaining({ file: 'skincare/criteria.attribute_is_product.yaml', field: '(file)' })])
  })

  it('reports a malformed lock as a problem', () => {
    const root = rulesRoot({ [LOCK_FILE]: '{"lock_version": 1, "rules": {"a.b": {"1": "not-a-hash"}}}' })
    expect(messages(root)).toEqual([expect.stringMatching(/^\(file\): The lock is not valid/)])
  })

  it('reports an entry that is not a regular .yaml or .yml file', () => {
    const root = rulesRoot({ 'skincare/criteria.attribute_is_product.YAML': judgementRule, 'skincare/notes.txt': 'x' })
    symlinkSync(join(root, 'skincare/notes.txt'), join(root, 'skincare/link.yaml'))
    expect(loadRuleLibrary(root).problems.map(p => p.file).sort()).toEqual([
      'skincare/criteria.attribute_is_product.YAML',
      'skincare/link.yaml',
      'skincare/notes.txt',
    ])
  })

  it('refuses a locked rule whose file is gone', () => {
    const root = rulesRoot({ 'skincare/criteria.attribute_is_product.yaml': judgementRule })
    lockedLibrary(root)
    rmSync(join(root, 'skincare/criteria.attribute_is_product.yaml'))
    expect(messages(root)).toEqual([expect.stringMatching(/^criteria.attribute_is_product: The lock holds criteria.attribute_is_product, but no rule file/)])
  })

  it('refuses a lock that lost or changed an entry of the base lock', () => {
    const root = rulesRoot({ 'skincare/criteria.attribute_is_product.yaml': judgementRule })
    lockedLibrary(root)
    const base = readLock(join(root, LOCK_FILE))
    writeFileSync(join(root, 'skincare/criteria.attribute_is_product.yaml'), stringify({ ...judgementRule, statement: 'Changed.' }))
    rmSync(join(root, LOCK_FILE))
    writeLock(join(root, LOCK_FILE), lockNewVersions(loadRuleLibrary(root)).lock)
    expect(loadRuleLibrary(root).problems).toEqual([])
    expect(loadRuleLibrary(root, { baseLock: base }).problems.map(p => p.message)).toEqual([
      expect.stringMatching(/^The base lock holds another hash for this version/),
    ])
  })

  it('reports invalid YAML with the file name, and keeps going', () => {
    const root = rulesRoot({ 'skincare/broken.yaml': 'id: [unclosed', 'skincare/criteria.attribute_is_product.yaml': judgementRule })
    const problems = lockedLibrary(root).problems
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ file: 'skincare/broken.yaml', field: '(file)' })
  })
})

describe('lockNewVersions', () => {
  it('does not lock a rule that has another problem', () => {
    const root = rulesRoot({ 'criteria.attribute_is_product.yaml': judgementRule })
    const { lock, refused } = lockNewVersions(loadRuleLibrary(root))
    expect(lock.rules).toEqual({})
    expect(refused).toEqual([expect.stringMatching(/fix the problems of criteria.attribute_is_product.yaml first/)])
  })

  it('never changes the hash of a locked version', () => {
    const root = rulesRoot({ 'skincare/criteria.attribute_is_product.yaml': judgementRule })
    lockedLibrary(root)
    const before = readLock(join(root, LOCK_FILE))
    writeFileSync(join(root, 'skincare/criteria.attribute_is_product.yaml'), stringify({ ...judgementRule, statement: 'Changed.' }))
    const { lock, refused } = lockNewVersions(loadRuleLibrary(root))
    expect(refused).toEqual(['criteria.attribute_is_product@1: its words changed under a locked version'])
    expect(lock.rules).toEqual(before.rules)
  })
})

describe('ruleHash', () => {
  const rule = RuleRecord.parse(judgementRule)

  it('does not change when the keys of the rule change order', () => {
    const reordered = RuleRecord.parse(Object.fromEntries(Object.entries(judgementRule).reverse()))
    expect(ruleHash(reordered)).toBe(ruleHash(rule))
  })

  it('does not change with the status or the provenance', () => {
    expect(ruleHash({ ...rule, status: 'active', provenance: { record_id: 'r:1' } })).toBe(ruleHash(rule))
  })

  it('changes with each field that changes what the rule asks or how it is checked', () => {
    const base = ruleHash(rule)
    const code = RuleRecord.parse(codeRule)
    expect(ruleHash({ ...code, check: 'max_items' })).not.toBe(ruleHash(code))
    expect(ruleHash({ ...rule, reason: 'Other reason.' })).not.toBe(base)
    expect(ruleHash({ ...rule, kind: 'shape', judge: undefined })).not.toBe(ruleHash({ ...rule, judge: undefined }))
    expect(ruleHash({ ...rule, scope: { ...rule.scope, fields: ['criteria[]'] } })).not.toBe(base)
    expect(ruleHash({ ...rule, scope: { ...rule.scope, stages: ['define_criteria'] } })).not.toBe(base)
    expect(ruleHash({ ...rule, statement: 'Other words.' })).not.toBe(base)
    expect(ruleHash({ ...rule, binding: 'watch' })).not.toBe(base)
    expect(ruleHash({ ...rule, judge: { question: 'Other question?' } })).not.toBe(base)
    expect(ruleHash({ ...rule, examples: [rule.examples[0]!] })).not.toBe(base)
  })
})
