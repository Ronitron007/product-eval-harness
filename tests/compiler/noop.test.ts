import { Agent } from '@mastra/core/agent'
import { createMockModel } from '@mastra/core/test-utils/llm-mock'
import { describe, expect, it } from 'vitest'
import type { ItemVerdict } from '../../src/compiler'
import { CLI, lock, problemsOf as loaderProblems, rulesCheck, rulesRoot } from './files'
import { codes, compile, planOf, problemsOf, withRules } from './library'
import { attributeIsProduct, FIXTURE, GOOD_EVIDENCE, GOOD_OUTPUT, judgementRule, keyKnown, uniqueTitle } from './rules'

// Hazard `noop`: a rule or the schema applies nowhere, in silence.

// One compile at each node of the fixture tree, at a stage that runs there.
const COMPILES = { skincare: 'define_criteria', sunscreen: 'create_node', moisturizer: 'create_node', mineral_sunscreen: 'create_pack' } as const

describe('noop', () => {
  it('noop.field_typo: a code check on criteria[].atributes[] gives field_unresolved', () => {
    const typo = { ...keyKnown, scope: { nodes: 'subtree', stages: ['create_node'], fields: ['criteria[].atributes[].key'] } }
    const problems = problemsOf({ rules: withRules(typo) })
    expect(problems).toEqual([expect.objectContaining({ code: 'field_unresolved', rules: ['attributes.key_known@1'], field: 'criteria[].atributes[].key' })])
    expect(problems[0]!.message).toMatch(/no shape rule of this stage defines it. Fix the path, or add a shape rule/)
  })

  it('noop.requires_typo: a unique_by with by: nmae gives field_unresolved', () => {
    const typo = { ...uniqueTitle, check: { name: 'unique_by', params: { by: 'nmae' } } }
    expect(problemsOf({ rules: withRules(typo) })).toEqual([expect.objectContaining({ code: 'field_unresolved', rules: ['criteria.unique_title@1'], field: 'criteria[].nmae' })])
  })

  it('noop.no_shape_rule: a stage with no shape rule gives no_output_fields', () => {
    expect(codes(problemsOf({ rules: [attributeIsProduct, keyKnown] }))).toEqual(['no_output_fields'])
  })

  it('noop.owner_unknown: an active rule owned by an absent node gives owner_unknown at each compile, and the same rule as a draft gives none', () => {
    const haircare = { ...attributeIsProduct, id: 'hair.attribute_is_product', owner: 'haircare' }
    for (const [node, stage] of Object.entries(COMPILES)) {
      const r = compile({ rules: withRules(haircare), node, stage })
      expect(r.ok ? [] : r.problems).toContainEqual(expect.objectContaining({ code: 'owner_unknown', rules: ['hair.attribute_is_product@1'] }))
    }
    expect(compile({ rules: withRules({ ...haircare, status: 'draft' }) }).ok).toBe(true)
  })

  it('noop.rule_inert: an active rule at skincare with the selector owner and the stage create_node gives rule_inert at each compile', () => {
    const inert = { ...attributeIsProduct, id: 'criteria.domain_owner', scope: { nodes: 'owner', stages: ['create_node'], fields: ['criteria[].attributes[]'] } }
    for (const [node, stage] of Object.entries(COMPILES)) {
      const r = compile({ rules: withRules(inert), node, stage })
      expect(r.ok ? [] : r.problems).toContainEqual(expect.objectContaining({ code: 'rule_inert', rules: ['criteria.domain_owner@1'] }))
    }
  })

  // Repros interrogate/opus/dormant.mjs and sonnet/p8_scope.mjs: rules that no lint catches.
  it('noop.rule_inert (repros dormant.mjs, p8_scope.mjs): a rule that the loader accepts and that applies nowhere gives rule_inert', () => {
    const atLeaf = { ...attributeIsProduct, id: 'criteria.leaf_inner', owner: 'mineral_sunscreen', scope: { nodes: { level: 'inner' }, stages: ['create_node'], fields: ['criteria[].attributes[]'] } }
    const packAtInner = { ...attributeIsProduct, id: 'pack.cite_records', owner: 'sunscreen', scope: { nodes: 'owner', stages: ['create_pack'], fields: ['criteria[].attributes[]'] } }
    expect(loaderProblems(rulesRoot([atLeaf, packAtInner])).filter(p => !p.startsWith('version'))).toEqual([])
    const problems = problemsOf({ rules: withRules(atLeaf, packAtInner) })
    expect(problems.filter(p => p.code === 'rule_inert').map(p => p.rules[0])).toEqual(['criteria.leaf_inner@1', 'pack.cite_records@1'])
  })

  // Repro interrogate/sonnet/p8_scope.mjs, case 2.
  it('noop.trial_not_applied: a trial candidate whose scope does not name the compiled stage gives trial_not_applied, not a trial with the live hash', () => {
    const candidate = { ...keyKnown, version: 2, supersedes: 1, scope: { nodes: 'subtree', stages: ['create_pack'], fields: ['criteria[].attributes[].key'] } }
    expect(problemsOf({ trial: candidate as never })).toEqual([expect.objectContaining({ code: 'trial_not_applied', rules: ['attributes.key_known@2'] })])
  })

  it('noop.ci_field_guard: with no tree, rules:check refuses a field that no shape rule of that stage defines', CLI, () => {
    const root = rulesRoot([...FIXTURE, { ...keyKnown, id: 'attributes.typo_known', scope: { nodes: 'subtree', stages: ['create_node'], fields: ['criteria[].atributes[].key'] } }])
    lock(root)
    const run = rulesCheck(root)
    expect(run.status).toBe(1)
    expect(run.out).toContain(
      'field_unresolved attributes.typo_known@1 criteria[].atributes[].key\n  attributes.typo_known@1 reads criteria[].atributes[].key at create_node, and no active shape rule of create_node defines it.',
    )
  })

  it('noop.ci_field_guard: no false positive, a field that a shape rule of another owner defines passes', CLI, () => {
    const root = rulesRoot([...FIXTURE, { ...keyKnown, id: 'attributes.key_known_here', owner: 'sunscreen' }])
    lock(root)
    expect(rulesCheck(root)).toMatchObject({ status: 0 })
  })

  // Repro interrogate/verify/warn-extra-key.mjs, through the call site of compile.usage.calls.
  it('noop.closed_output_refused: a mock reply with the extra keys grade and best_match gives decode.ok false under warn, the judge step does not run, and the stage run keeps the issues', async () => {
    const plan = planOf()
    const attribute = { ...GOOD_OUTPUT.criteria[0]!.attributes[0]!, grade: 9 }
    const reply = { criteria: [{ ...GOOD_OUTPUT.criteria[0]!, attributes: [attribute] }], best_match: 'magnesium glycinate' }
    const drafter = new Agent({ id: 'drafter', name: 'drafter', instructions: plan.instructions, model: createMockModel({ version: 'v2', mockText: JSON.stringify(reply) }) as never })
    const draft = await drafter.generate('Draft the node.', { structuredOutput: { schema: plan.schema, errorStrategy: 'warn' } })
    expect(draft.object).toBeUndefined()
    expect(draft.error).toBeUndefined()

    const decoded = plan.decode(draft.object !== undefined ? draft.object : draft.text)
    const output: unknown = decoded.ok ? decoded.output : decoded.raw
    const rows: ItemVerdict[] = []
    for (const s of plan.scorers.code) rows.push(...(await s.verify(output, GOOD_EVIDENCE)))
    // Each rule row passes, because no rule owns the extra keys. Only the decode gate sees them.
    expect(rows.every(r => r.verdict === 'pass')).toBe(true)
    let judged = false
    if (decoded.ok && rows.every(r => r.binding !== 'strict' || r.verdict === 'pass')) judged = true
    else rows.push(...plan.scorers.skippedJudges('The output broke the schema or a strict code check, so no judge ran.'))
    const stageRunProblems = decoded.ok ? [] : [...decoded.issues]

    expect(decoded.ok).toBe(false)
    expect(judged).toBe(false)
    expect(stageRunProblems.map(i => i.path).sort()).toEqual(['best_match', 'criteria[0].attributes[0].grade'])
    expect(rows.filter(r => r.ruleId === 'criteria.attribute_is_product')).toEqual([expect.objectContaining({ verdict: 'cannot_verify', decider: { by: 'code' } })])
  })

  it('noop.closed_output_refused: a reply that is not JSON gives one issue at (output)', () => {
    expect(planOf().decode('I could not find the label.')).toMatchObject({ ok: false, raw: 'I could not find the label.', issues: [{ path: '(output)' }] })
  })

  it('noop.walk_never_empty: each rule gives at least one row on an empty output', async () => {
    const plan = planOf()
    for (const s of plan.scorers.code) expect((await s.verify({}, GOOD_EVIDENCE)).length).toBeGreaterThan(0)
    expect(plan.scorers.skippedJudges('No judge ran.').length).toBeGreaterThan(0)
  })

  it('noop.level_stage_lint: with no tree, a selector { level: domain } with the stage create_pack gives a loader problem', CLI, () => {
    const rule = judgementRule('pack.domain_only', 'criteria[]', 'Is it a product property?', [{ output: {}, expected: 'pass' }], {
      scope: { nodes: { level: 'domain' }, stages: ['create_pack'], fields: ['criteria[]'] },
    })
    const root = rulesRoot([rule])
    expect(loaderProblems(root)).toEqual(['scope.stages.0: The stage create_pack never runs at level domain. It runs at leaf. Change the stage or the level.'])
    expect(rulesCheck(root).status).toBe(1)
  })
})
