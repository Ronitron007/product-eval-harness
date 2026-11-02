import { isDeepStrictEqual } from 'node:util'
import { describe, expect, it } from 'vitest'
import type { CheckVector, EvidenceKey, Json, RunEvidence } from '../../src/rules/checks/define'
import { CHECKS, type AnyCheckTemplate } from '../../src/rules/checks'
import { paramsAtLeastAsStrict } from '../../src/rules/strictness'
import { planOf } from './library'
import { checkRule, shapeRule } from './rules'

// checks.conformance: the verify, params and weaken.order_is_sound tests over each entry of CHECKS.

const templates = CHECKS as unknown as readonly AnyCheckTemplate[]

// The template alone, with the one guard that the runtime adds before it: each key of needs.
function run(t: AnyCheckTemplate, params: unknown, value: Json, evidence: RunEvidence): string {
  if (t.needs.some((k: EvidenceKey) => evidence[k] === undefined)) return 'cannot_verify'
  return t.check(params as never, value, evidence as never).verdict
}

describe.each(templates.map(t => [t.name, t] as const))('checks.conformance %s', (_name, t) => {
  const vectors = t.vectors as readonly CheckVector<Record<string, unknown>>[]

  it('verify.vectors_complete: has a pass and a fail vector, and a cannot_verify vector with a key of needs absent', () => {
    expect(vectors.some(v => v.expected === 'pass')).toBe(true)
    expect(vectors.some(v => v.expected === 'fail')).toBe(true)
    if (t.needs.length > 0) {
      expect(vectors.some(v => v.expected === 'cannot_verify' && t.needs.some((k: EvidenceKey) => v.evidence[k] === undefined))).toBe(true)
    }
  })

  it('verify.vectors_complete: each vector gives its expected verdict', () => {
    for (const v of vectors) expect({ v, got: run(t, v.params, v.value, v.evidence) }).toEqual({ v, got: v.expected })
  })

  it('params.no_defaults: for each vector, the parsed parameters deep-equal the authored parameters', () => {
    for (const v of vectors) expect(t.params.parse(v.params)).toStrictEqual(v.params)
  })

  it('params.no_defaults: the order table has one order for each parameter, and no other key', () => {
    expect(Object.keys(t.order).sort()).toEqual(Object.keys(t.params.shape).sort())
  })

  it('weaken.order_is_sound: when parameters a are at least as strict as b, each item that passes under a passes under b', () => {
    const params = [...new Map(vectors.map(v => [JSON.stringify(v.params), v.params])).values()]
    let pairs = 0
    for (const a of params) {
      for (const b of params) {
        if (a === b || !paramsAtLeastAsStrict(a, b, t.order as never)) continue
        pairs++
        for (const item of vectors) {
          if (run(t, a, item.value, item.evidence) === 'pass') expect({ a, b, item: item.value, underB: run(t, b, item.value, item.evidence) }).toMatchObject({ underB: 'pass' })
        }
      }
    }
    // A template with a stricter parameter value must have vectors that compare them.
    const hasOrder = Object.values(t.order).some(o => o !== 'identity')
    if (hasOrder) expect(pairs).toBeGreaterThan(0)
  })

  // The runtime path: one plan with this template on a field of its target kind.
  it('verify.no_pass_without_evidence: an absent value never gives a pass, and for a template with keys in needs, empty evidence never gives a pass', async () => {
    const v = vectors.find(x => x.expected === 'pass')!
    const field = t.target === 'list' ? 'items' : 'items[].value'
    const shapes =
      t.target === 'list'
        ? [shapeRule('items.list', 'items', { type: 'list' }, [{ output: [], expected: 'pass' }]), ...Object.keys(v.params).map(k => shapeRule(`items.key_${k}`, `items[].${String(v.params[k])}`, { type: 'text' }, [{ output: 'x', expected: 'pass' }]))]
        : [shapeRule('items.value', field, { type: 'text' }, [{ output: 'x', expected: 'pass' }])]
    const rule = checkRule('items.checked', field, { name: t.name, params: v.params }, [{ output: v.value, expected: 'pass' }], { statement: 'Back each item.', reason: 'A grade must rest on evidence.' })
    const plan = planOf({ rules: [...shapes, rule] })
    const scorer = plan.scorers.code.find(s => s.rule.id === 'items.checked')!
    const present = t.target === 'list' ? { items: v.value } : { items: [{ value: v.value }] }
    expect((await scorer.verify(present, v.evidence)).map(r => r.verdict)).toEqual(['pass'])
    for (const absent of [{}, { items: [{}] }, 'not JSON'])
      for (const row of await scorer.verify(absent, v.evidence)) expect(row.verdict).not.toBe('pass')
    if (t.needs.length > 0) for (const row of await scorer.verify(present, {})) expect(row.verdict).toBe('cannot_verify')
  })

  it('verify.literals_and_render: render and literals read the same params object as check', () => {
    for (const v of vectors) {
      expect(t.render(v.params).length).toBeGreaterThan(0)
      for (const l of t.literals(v.params)) expect(Object.values(v.params).some(p => isDeepStrictEqual(p, l))).toBe(true)
    }
  })
})
