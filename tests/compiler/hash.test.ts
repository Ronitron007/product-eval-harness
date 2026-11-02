import { readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { CODE_DEPS, type Manifest } from '../../src/compiler'
import { CHECKS } from '../../src/rules/checks'
import { ruleHash } from '../../src/rules/hash'
import { RuleRecord } from '../../src/rules/schema'
import { currentCode, lockProblems, packagePins, readCodeLock, updateLock } from '../../scripts/compiler-lock'
import { CLI, lock, problemsOf, REPO, rulesCheck, rulesRoot, writeRule } from './files'
import { importsOf, importsOfFile } from './imports'
import { derivedRow, input, library, planOf, setAt, tree, withRules } from './library'
import { attributeIsProduct, BOUNDARIES, COMPOSED, COMPOSED_OUTPUT, FIXTURE, keyKnown, labelUnit, quotesFromLabel, type RuleInput } from './rules'

// Hazard `hash`: other artifacts with one hash, or one set of artifacts with two hashes.

describe('hash', () => {
  // Repros interrogate/opus/owner-not-in-hash.ts, sonnet/p3_owner.mts, p3b_owner_spec_shape.mts.
  it('hash.rule_hash_covers_owner: a move of the owner of a locked rule, with no new version, makes rules:check exit 1', CLI, () => {
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

const derivedJudge = (version: number, status = 'active') =>
  derivedRow({ ...attributeIsProduct, id: 'derived.attribute_is_product', owner: 'sunscreen', version, status, ...(version > 1 ? { supersedes: version - 1 } : {}) })
const DERIVED = [derivedJudge(1), derivedJudge(2)]
const hashOf = (overrides: Parameters<typeof planOf>[0] = {}) => planOf({ derived: DERIVED, ...overrides }).ruleSetHash
const atStages = (rules: readonly RuleInput[], stages: string[]) => rules.map(r => ({ ...r, scope: { ...(r.scope as object), stages } }))

// The pinned hash of the fixture library at sunscreen and create_node. It moves when any artifact
// moves: a rule, the instruction layout, the printer, a declared code version, or a dependency pin.
const FIXTURE_HASH = '809c1f24843b5abcee2224fe0ee13abf387616b3f16d33cf63b8cfabfa4df078'

describe('hash, of a compiled plan', () => {
  it('hash.same_inputs: two compiles of the same input give one hash', () => {
    expect(hashOf()).toBe(hashOf())
  })

  it('hash.shuffled_inputs: seeded shuffles of the library, the derived rows, and the tree give one hash', () => {
    const base = input({ derived: DERIVED })
    const expected = planOf({ derived: DERIVED }).ruleSetHash
    const all = <T>(xs: readonly T[]) => fc.shuffledSubarray([...xs], { minLength: xs.length, maxLength: xs.length })
    fc.assert(
      fc.property(all(base.library.rules), all(DERIVED), all(tree), (rules, derived, nodes) => {
        const r = planOf({ library: { ...base.library, rules }, derived, tree: nodes })
        expect(r.ruleSetHash).toBe(expected)
      }),
      { seed: 20261102, numRuns: 40 },
    )
  })

  it('hash.changes: a change of the binding, a parameter, the statement, the stage, or the trial changes the hash', () => {
    const base = hashOf()
    const variants = {
      binding: hashOf({ rules: withRules({ ...keyKnown, binding: 'soft' }) }),
      parameter: hashOf({ rules: withRules({ ...quotesFromLabel, check: { name: 'quote_in_source', params: { source: 'label', case_sensitive: false } } }) }),
      statement: hashOf({ rules: withRules({ ...keyKnown, statement: 'Use a key that the node registry holds.' }) }),
      trial: hashOf({ trial: RuleRecord.parse({ ...keyKnown, version: 2, supersedes: 1 }) }),
    }
    for (const [what, h] of Object.entries(variants)) expect({ what, same: h === base }).toEqual({ what, same: false })
    const both = atStages(FIXTURE, ['create_node', 'create_pack'])
    const node = planOf({ rules: both, node: 'mineral_sunscreen', stage: 'create_node' }).ruleSetHash
    const pack = planOf({ rules: both, node: 'mineral_sunscreen', stage: 'create_pack' }).ruleSetHash
    expect(node).not.toBe(pack)
  })

  it('hash.draft_no_change: a new draft rule leaves the hash unchanged', () => {
    const draft = { ...attributeIsProduct, id: 'criteria.new_draft', status: 'draft' }
    expect(hashOf({ rules: withRules(draft) })).toBe(hashOf())
    const draftDerived = derivedRow({ ...attributeIsProduct, id: 'derived.new_draft', owner: 'sunscreen', status: 'draft' })
    expect(hashOf({ derived: [...DERIVED, draftDerived] })).toBe(hashOf())
  })

  it('hash.node_not_in_hash: two nodes with the same applied rules give one hash', () => {
    const sunscreen = planOf({ node: 'sunscreen' })
    const moisturizer = planOf({ node: 'moisturizer' })
    expect(moisturizer.node).toBe('moisturizer')
    expect(moisturizer.ruleSetHash).toBe(sunscreen.ruleSetHash)
  })

  it('hash.fixture_literal: the fixture library gives a pinned hash literal', () => {
    expect(planOf().ruleSetHash).toBe(FIXTURE_HASH)
  })

  // Repro interrogate/sonnet/p6_canon.mjs: canonical JSON drops undefined and turns -0 into 0, so
  // the manifest must be plain JSON, with a total order in each list.
  it('hash.manifest_plain_json (repro p6_canon.mjs): the manifest is plain JSON, and each list has a total order', () => {
    const m: Manifest = planOf({ derived: DERIVED }).manifest
    expect(JSON.parse(JSON.stringify(m))).toStrictEqual(m)
    const ids = (xs: readonly { id: string }[]) => xs.map(x => x.id)
    expect(ids(m.rules)).toEqual([...ids(m.rules)].sort())
    expect(ids(m.scorers)).toEqual([...ids(m.scorers)].sort())
    expect(m.code).toEqual({ runtime: 1, checks: { key_in_registry: 1, quote_in_source: 1, unique_by: 1 }, deps: CODE_DEPS })
  })

  it('hash.code_lock: the lock holds each declared code version with the fingerprint of its code, and the pins of package.json', () => {
    expect(lockProblems(readCodeLock(), currentCode(), packagePins())).toEqual([])
  })

  it('hash.code_lock: a fingerprint that moves under an unchanged version fails the test, and compiler:lock refuses to rewrite it', () => {
    const lockNow = readCodeLock()
    const moved = { ...currentCode(), runtime: { ...currentCode().runtime, fingerprint: '0'.repeat(64) } }
    expect(lockProblems(lockNow, moved, packagePins())).toEqual([expect.stringMatching(/^The runtime code .* changed under RUNTIME_VERSION 1. Raise RUNTIME_VERSION/)])
    const template = currentCode().checks[0]!
    const movedCheck = { ...currentCode(), checks: [{ ...template, fingerprint: '1'.repeat(64) }] }
    expect(lockProblems(lockNow, movedCheck, packagePins())).toEqual([expect.stringMatching(new RegExp(`^The check ${template.name} changed under version 1`))])
    const update = updateLock(lockNow, moved, packagePins())
    expect(update.refused).toEqual(['runtime@1: its code changed under a locked version. Raise the version.'])
    expect(update.lock.runtime).toEqual(lockNow.runtime)
    const bumped = updateLock(lockNow, { ...moved, runtime: { version: 2, fingerprint: '0'.repeat(64) } }, packagePins())
    expect(bumped).toMatchObject({ added: ['runtime@2'], refused: [] })
    expect(bumped.lock.runtime['1']).toBe(lockNow.runtime['1'])
  })

  it('hash.code_lock: a pin of zod or @mastra/core that differs from package.json fails the test', () => {
    expect(lockProblems(readCodeLock(), currentCode(), { ...packagePins(), zod: '4.7.0' })).toEqual([
      expect.stringMatching(/^code.lock.json pins zod 4.6.7, and package.json pins 4.7.0/),
      expect.stringMatching(/^CODE_DEPS in src\/compiler\/index.ts pins zod 4.6.7, and package.json pins 4.7.0/),
    ])
  })

  it('hash.schema_round_trip: on each golden value in a minimal valid full output, and on each boundary value, z.fromJSONSchema(manifest.schema) and plan.schema agree', async () => {
    const plan = planOf({ rules: COMPOSED })
    const back = z.fromJSONSchema(plan.manifest.schema as never)
    const minimal = minimalOutput(plan.manifest.schema as JsonSchema)
    expect(plan.schema.safeParse(minimal).success).toBe(true)
    const outputs: unknown[] = []
    for (const r of library(COMPOSED).rules) {
      if (r.rule.kind === 'judgement') continue
      const field = [...r.rule.scope.fields].sort()[0]!
      for (const e of r.rule.examples) outputs.push(setAt(minimal, field, e.output))
    }
    for (const [field, values] of Object.entries(BOUNDARIES)) for (const v of values) outputs.push(setAt(COMPOSED_OUTPUT, field, v))
    // Repro interrogate/sonnet/p1_zod.mjs: the round trip keeps additionalProperties false.
    outputs.push(setAt(COMPOSED_OUTPUT, 'criteria[].attributes[].grade', 9), { ...COMPOSED_OUTPUT, best_match: 'x' })
    const verdicts = outputs.map(o => [plan.schema.safeParse(o).success, back.safeParse(o).success])
    expect(verdicts.filter(([a, b]) => a !== b)).toEqual([])
    // Both verdicts occur, so the test is not vacuous.
    expect(new Set(verdicts.map(([a]) => a))).toEqual(new Set([true, false]))
  })

  // Repro interrogate/opus/round-trip-vacuous.mjs: a refine that the hash cannot see. A golden value
  // alone fails both schemas for the same reason. Embedded in a full output, the refine shows.
  it('hash.schema_round_trip (repro round-trip-vacuous.mjs): the full output finds a hidden refine that a bare golden value cannot', () => {
    const plan = z.object({ unit: z.enum(['g', 'mcg', 'mg']).refine(v => v !== 'mg'), quote: z.string() }).strict()
    const back = z.fromJSONSchema(z.toJSONSchema(plan))
    expect([plan.safeParse('mg').success, back.safeParse('mg').success]).toEqual([false, false])
    const full = { unit: 'mg', quote: 'x' }
    expect([plan.safeParse(full).success, back.safeParse(full).success]).toEqual([false, true])
  })
})

type JsonSchema = { type?: string; properties?: Record<string, JsonSchema>; required?: string[]; items?: JsonSchema; enum?: unknown[]; minItems?: number; minLength?: number; minimum?: number }

// The smallest output that a JSON Schema of the printer accepts, with one item in each list.
function minimalOutput(s: JsonSchema): unknown {
  if (s.enum) return s.enum[0]
  switch (s.type) {
    case 'object':
      return Object.fromEntries((s.required ?? []).map(k => [k, minimalOutput(s.properties![k]!)]))
    case 'array':
      return Array.from({ length: Math.max(1, s.minItems ?? 0) }, () => minimalOutput(s.items!))
    case 'string':
      return 'x'.repeat(Math.max(1, s.minLength ?? 0))
    case 'integer':
    case 'number':
      return Math.max(1, Math.ceil(s.minimum ?? 0))
    case 'boolean':
      return true
    default:
      throw new Error(`The printer does not make the type ${s.type}.`)
  }
}

describe('hash.template_imports', () => {
  const folder = join(REPO, 'src', 'rules', 'checks')
  const files = readdirSync(folder).filter(f => f.endsWith('.ts') && f !== 'define.ts' && f !== 'index.ts')

  it('lists one template file for each entry of CHECKS', () => {
    expect(files.map(f => f.replace(/\.ts$/, '')).sort()).toEqual(CHECKS.map(t => t.name).sort())
  })

  it.each(files)('the template file %s imports only zod and ./define', file => {
    expect(importsOfFile(join(folder, file)).filter(m => m !== 'zod' && m !== './define')).toEqual([])
  })

  it('a template file that imports another module fails the test', () => {
    const source = "import { z } from 'zod'\nimport { defineCheck } from './define'\nimport { distance } from 'fastest-levenshtein'\n"
    expect(importsOf(source).filter(m => m !== 'zod' && m !== './define')).toEqual(['fastest-levenshtein'])
  })
})
