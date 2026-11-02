import { createMockModel } from '@mastra/core/test-utils/llm-mock'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { RuleRecord } from '../../src/rules/schema'
import { codes, compile, derivedRow, planOf, problemsOf, withRules } from './library'
import { attributeIsProduct, FIXTURE, keyKnown, labelUnit, type RuleInput } from './rules'

// Hazard `status`: a draft or retired rule applies, or an active rule drops out with no trace.

const judge = { id: 'mock/judge', model: createMockModel({ version: 'v2', objectGenerationMode: 'json', mockText: { items: [] } }) as never }
const sunJudge = (id: string, extra: Record<string, unknown> = {}): RuleInput => ({ ...attributeIsProduct, id, owner: 'sunscreen', ...extra })
const versions = (id: string, statuses: readonly string[]) =>
  statuses.map((status, i) => derivedRow(sunJudge(id, { version: i + 1, status, ...(i > 0 ? { supersedes: i } : {}) })))
const dispositionOf = (plan: ReturnType<typeof planOf>, rule: string, version: number) => plan.ledger.find(e => e.rule === rule && e.version === version)?.disposition

const OWNERS = ['all', 'skincare', 'sunscreen', 'moisturizer', 'mineral_sunscreen'] as const
const NODES = ['sunscreen', 'moisturizer', 'mineral_sunscreen'] as const

// One generated rule. An active rule must reach some node, so it covers create_node in its subtree.
const generated = (prefix: string) =>
  fc.record({ owner: fc.constantFrom(...OWNERS), status: fc.constantFrom('draft', 'active', 'retired'), pack: fc.boolean(), ownerOnly: fc.boolean() }).map(g => ({ prefix, ...g }))
const toRule = (id: string, g: { owner: string; status: string; pack: boolean; ownerOnly: boolean }, extra: Record<string, unknown> = {}): RuleInput => ({
  ...attributeIsProduct,
  id,
  owner: g.owner,
  status: g.status,
  scope: {
    nodes: g.status !== 'active' && g.ownerOnly && g.owner !== 'all' ? 'owner' : 'subtree',
    stages: g.pack ? ['create_node', 'create_pack'] : ['create_node'],
    fields: ['criteria[].attributes[]'],
  },
  ...extra,
})

describe('status', () => {
  it('status.ledger_partition: over a generated pool, the applied, trial, and excluded entries equal the input, and each version occurs once', () => {
    const pool = fc.record({
      library: fc.array(generated('lib'), { maxLength: 6 }),
      derived: fc.array(fc.array(generated('der').filter(g => g.owner !== 'all'), { minLength: 1, maxLength: 3 }), { maxLength: 4 }),
      trial: fc.boolean(),
      node: fc.constantFrom(...NODES),
    })
    fc.assert(
      fc.property(pool, p => {
        const rules = [...FIXTURE, ...p.library.map((g, i) => toRule(`lib.rule_${i}`, g))]
        const derived = p.derived.flatMap((list, i) => list.map((g, v) => derivedRow(toRule(`der.rule_${i}`, g, { version: v + 1, ...(v > 0 ? { supersedes: v } : {}) }))))
        const trial = p.trial ? RuleRecord.parse({ ...keyKnown, version: 2, supersedes: 1, binding: 'soft' }) : undefined
        const r = compile({ rules, derived, trial, node: p.node })
        if (!r.ok) throw new Error(r.problems.map(x => x.message).join('\n'))
        const input = [...rules.map(x => `${x.id}@${x.version ?? 1}`), ...derived.map(d => `${d.id}@${d.version}`), ...(trial ? [`${trial.id}@${trial.version}`] : [])]
        const ledger = r.plan.ledger.map(e => `${e.rule}@${e.version}`)
        expect([...ledger].sort()).toEqual([...input].sort())
        expect(new Set(ledger).size).toBe(ledger.length)
        const byKind = (k: string) => r.plan.ledger.filter(e => e.disposition.kind === k).length
        expect(byKind('applied') + byKind('trial') + byKind('excluded')).toBe(input.length)
        expect(byKind('trial')).toBe(trial ? 1 : 0)
        for (const e of r.plan.ledger) if (e.disposition.kind === 'applied') expect(e.origin).not.toBe('trial')
      }),
      { seed: 20261102, numRuns: 60 },
    )
  })

  it('status.ids_agree: the applied and trial ids, the scorer ids, and the ids of manifest.rules are equal', () => {
    const plan = planOf({ derived: [derivedRow(sunJudge('derived.attribute_is_product'))], trial: RuleRecord.parse({ ...keyKnown, version: 2, supersedes: 1 }) })
    const ledger = plan.ledger.filter(e => e.disposition.kind !== 'excluded').map(e => `${e.rule}@${e.version}`).sort()
    const scorers = [...plan.scorers.code, ...plan.scorers.judges(judge)].map(s => s.id).sort()
    const manifest = plan.manifest.rules.map(r => `${r.id}@${r.version}`).sort()
    expect(scorers).toEqual(ledger)
    expect(manifest).toEqual(ledger)
    expect(plan.manifest.scorers.map(s => s.id).sort()).toEqual(ledger)
    expect(ledger).toContain('attributes.key_known@2')
  })

  it('status.never_draft_or_retired: a draft or a retired rule never applies', () => {
    const draft = sunJudge('criteria.draft_rule', { status: 'draft' })
    const retired = { ...keyKnown, id: 'attributes.retired_rule', status: 'retired' }
    const plan = planOf({ rules: withRules(draft, retired), derived: versions('derived.draft_only', ['draft']) })
    expect(dispositionOf(plan, 'criteria.draft_rule', 1)).toEqual({ kind: 'excluded', reason: 'draft' })
    expect(dispositionOf(plan, 'attributes.retired_rule', 1)).toEqual({ kind: 'excluded', reason: 'retired' })
    expect(dispositionOf(plan, 'derived.draft_only', 1)).toEqual({ kind: 'excluded', reason: 'draft' })
    const ids = plan.manifest.rules.map(r => r.id)
    for (const id of ['criteria.draft_rule', 'attributes.retired_rule', 'derived.draft_only']) expect(ids).not.toContain(id)
  })

  it('status.derived_superseded: derived version 1 gets superseded when version 2 exists', () => {
    const plan = planOf({ derived: versions('derived.attribute_is_product', ['active', 'active']) })
    expect(dispositionOf(plan, 'derived.attribute_is_product', 1)).toEqual({ kind: 'excluded', reason: 'superseded' })
    expect(dispositionOf(plan, 'derived.attribute_is_product', 2)).toEqual({ kind: 'applied', binding: 'strict' })
  })

  it('status.retired_drops: a retired version 3 drops the rule, with the ledger reason retired', () => {
    const plan = planOf({ derived: versions('derived.attribute_is_product', ['active', 'active', 'retired']) })
    expect([1, 2, 3].map(v => dispositionOf(plan, 'derived.attribute_is_product', v))).toEqual([
      { kind: 'excluded', reason: 'superseded' },
      { kind: 'excluded', reason: 'superseded' },
      { kind: 'excluded', reason: 'retired' },
    ])
    expect(plan.manifest.rules.map(r => r.id)).not.toContain('derived.attribute_is_product')
  })

  it('status.trial_is_watch: the trial candidate gets a watch scorer, no schema part, and no instruction line', () => {
    const live = planOf()
    const codeTrial = planOf({ trial: RuleRecord.parse({ ...keyKnown, version: 2, supersedes: 1, statement: 'Use a key of the attribute registry of the node.' }) })
    expect(codeTrial.scorers.code.find(s => s.id === 'attributes.key_known@2')!.rule.binding).toBe('watch')
    expect(codeTrial.manifest.schema).toEqual(live.manifest.schema)
    expect(codeTrial.instructions).toBe(live.instructions)
    expect(codeTrial.ruleSetHash).not.toBe(live.ruleSetHash)
    expect(dispositionOf(codeTrial, 'attributes.key_known', 2)).toEqual({ kind: 'trial' })

    const judgeTrial = planOf({ trial: RuleRecord.parse(sunJudge('criteria.new_question')) })
    expect(judgeTrial.scorers.judges(judge).find(s => s.id === 'criteria.new_question@1')!.rule.binding).toBe('watch')
    expect(judgeTrial.instructions).toBe(live.instructions)
  })

  it('status.trial_shape_refused: a trial candidate of kind shape gives trial_shape_refused', () => {
    const candidate = RuleRecord.parse({ ...labelUnit, version: 2, supersedes: 1, shape: { type: 'text', values: ['mg'] } })
    expect(codes(problemsOf({ trial: candidate }))).toEqual(['trial_shape_refused'])
  })
})
