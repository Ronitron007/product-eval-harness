import { renameSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ruleHash } from '../../src/rules/hash'
import { RuleRecord } from '../../src/rules/schema'
import { lock, problemsOf, rulesCheck, rulesRoot, writeRule } from './files'
import { attributeIsProduct, labelUnit } from './rules'

// Hazard `hash`: other artifacts with one hash, or one set of artifacts with two hashes.

describe('hash', () => {
  // Repros interrogate/opus/owner-not-in-hash.ts, sonnet/p3_owner.mts, p3b_owner_spec_shape.mts.
  it('hash.rule_hash_covers_owner: a move of the owner of a locked rule, with no new version, makes rules:check exit 1', () => {
    const root = rulesRoot([{ ...labelUnit, owner: 'skincare' }])
    lock(root)
    expect(rulesCheck(root).status).toBe(0)
    renameSync(join(root, 'skincare'), join(root, 'sunscreen'))
    writeRule(root, { ...labelUnit, owner: 'sunscreen' })
    expect(problemsOf(root)).toEqual([
      'version: The words changed under version 1. Raise the version, set supersedes to 1, and run npm run rules:lock.',
    ])
    const run = rulesCheck(root)
    expect(run.status).toBe(1)
    expect(run.out).toMatch(/The words changed under version 1/)
  })

  it('hash.rule_hash_covers_owner (repro p3_owner): a move to the owner all changes the rule hash, and so does the shape', () => {
    const at = (owner: string) => ruleHash(RuleRecord.parse({ ...attributeIsProduct, owner }))
    expect(at('all')).not.toBe(at('sunscreen'))
    const unit = RuleRecord.parse(labelUnit)
    expect(ruleHash({ ...unit, shape: { type: 'text', values: ['IU'] } } as RuleRecord)).not.toBe(ruleHash(unit))
  })
})
