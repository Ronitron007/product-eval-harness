import { Agent } from '@mastra/core/agent'
import { createMockModel } from '@mastra/core/test-utils/llm-mock'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { problemsOf as loaderProblems, rulesRoot } from './files'
import { codes, compile, planOf, problemsOf, setAt, withRules } from './library'
import { attributeAmount, BOUNDARIES, COMPOSED, COMPOSED_OUTPUT, GOOD_EVIDENCE, GOOD_OUTPUT, labelUnit, shapeRule } from './rules'

// Hazard `shape`: two shape rules disagree, the schema accepts a bad output, or a bad output
// leaves no fail row.

describe('shape', () => {
  it('shape.not_strict: a shape rule with binding soft gives a loader problem that says the decoder enforces it', () => {
    const root = rulesRoot([{ ...labelUnit, binding: 'soft' }])
    expect(loaderProblems(root)).toEqual([
      'binding: A shape rule is always strict, because the decoder enforces each shape rule. Set binding to strict, or write a code_check rule.',
    ])
  })

  it('shape.list_unique_refused: a list shape with unique: true gives a loader problem', () => {
    const root = rulesRoot([shapeRule('criteria.list', 'criteria', { type: 'list', min_items: 1, unique: true }, [{ output: [{}], expected: 'pass' }])])
    expect(loaderProblems(root)).toEqual(['shape: A list shape has no unique. Add a code_check rule with the check unique_by on this list.'])
  })

  // Repros interrogate/opus/zod-unique.mjs, zod-unique2.mjs, sonnet/p1_zod.mjs, p7_unique.mjs:
  // Zod cannot print uniqueness, so a hash of the printed schema cannot see it.
  it('shape.list_unique_refused (repros zod-unique, p1_zod, p7_unique): a unique refine prints the same JSON Schema as a plain list', () => {
    const plain = z.object({ items: z.array(z.string()).min(1) }).strict()
    const unique = z.object({ items: z.array(z.string()).min(1).refine(a => new Set(a).size === a.length) }).strict()
    expect(z.toJSONSchema(unique)).toEqual(z.toJSONSchema(plain))
    expect(unique.safeParse({ items: ['mg', 'mg'] }).success).toBe(false)
    expect(z.fromJSONSchema(z.toJSONSchema(unique)).safeParse({ items: ['mg', 'mg'] }).success).toBe(true)
  })

  it('shape.reserved_names: a field path with the segment __proto__, constructor, prototype, or __x gives a loader problem', () => {
    const fields = ['__proto__', 'criteria[].constructor', 'criteria[].prototype[]', 'a.__x']
    const root = rulesRoot(fields.map((f, i) => shapeRule(`fields.reserved_${i}`, f, { type: 'text' }, [{ output: 'x', expected: 'pass' }])))
    expect(loaderProblems(root)).toEqual(
      fields.map(() => 'scope.fields.0: Rename the field. A path segment cannot be __proto__, constructor, prototype, or start with __.'),
    )
  })

  // Repros interrogate/sonnet/p5_proto.mjs and p5b_proto.mjs: why the names are reserved.
  it('shape.reserved_names (repros p5_proto, p5b_proto): a Zod object drops a __proto__ key, so the schema would not require it', () => {
    const s = z.object(Object.fromEntries([['__proto__', z.enum(['mg', 'g'])], ['unit', z.enum(['mg', 'g'])]])).strict()
    expect(s.safeParse({ unit: 'mg' }).success).toBe(true)
  })
})

const unitAt = (unit: unknown) => setAt(GOOD_OUTPUT, 'criteria[].attributes[].unit', unit)

describe('shape, at compile time', () => {
  it('shape.two_leaf_types: a text rule and a number rule on one path give shape_conflict, with both rules named', () => {
    const asNumber = shapeRule('units.as_number', 'criteria[].attributes[].unit', { type: 'number' }, [{ output: 1, expected: 'pass' }])
    expect(problemsOf({ rules: withRules(asNumber) })).toEqual([
      expect.objectContaining({ code: 'shape_conflict', rules: ['units.as_number@1', 'units.label_unit@1'], field: 'criteria[].attributes[].unit' }),
    ])
  })

  it('shape.empty_meet: the values [mg] and [g] on one path give shape_conflict', () => {
    const grams = shapeRule('units.grams', 'criteria[].attributes[].unit', { type: 'text', values: ['g'] }, [{ output: 'g', expected: 'pass' }])
    const r = problemsOf({ rules: withRules({ ...labelUnit, shape: { type: 'text', values: ['mg'] } }, grams) })
    // Two peers on one slot also restate it with other values (slot_conflict).
    expect(r).toEqual([
      expect.objectContaining({ code: 'slot_conflict', rules: ['units.grams@1', 'units.label_unit@1'] }),
      expect.objectContaining({ code: 'shape_conflict', rules: ['units.grams@1', 'units.label_unit@1'] }),
    ])
    expect(r[1]!.message).toMatch(/share no value, so no value fits/)
  })

  it('shape.empty_meet: a min above the max of another rule gives shape_conflict', () => {
    const cap = shapeRule('attributes.amount_cap', 'criteria[].attributes[].amount', { type: 'number', max: -1 }, [{ output: -2, expected: 'pass' }])
    expect(problemsOf({ rules: withRules(cap) })).toEqual([expect.objectContaining({ code: 'shape_conflict', rules: ['attributes.amount@1', 'attributes.amount_cap@1'] })])
  })

  it('shape.leaf_and_container: a text rule on criteria[] and a rule on criteria[].name give shape_conflict', () => {
    const asText = shapeRule('criteria.as_text', 'criteria[]', { type: 'text' }, [{ output: 'x', expected: 'pass' }])
    const problems = problemsOf({ rules: withRules(asText) })
    expect(problems).toEqual([expect.objectContaining({ code: 'shape_conflict', field: 'criteria[]' })])
    expect(problems[0]!.rules).toContain('criteria.as_text@1')
  })

  it('shape.list_without_items: a list shape at x with no rule on x[] gives list_without_items', () => {
    const tags = shapeRule('criteria.tags', 'tags', { type: 'list', max_items: 3 }, [{ output: [], expected: 'pass' }])
    expect(problemsOf({ rules: withRules(tags) })).toEqual([expect.objectContaining({ code: 'list_without_items', rules: ['criteria.tags@1'], field: 'tags' })])
  })

  // Repros interrogate/opus/meet-cross-dim.mjs and sonnet/p9_values_len.mjs.
  it('shape.joint_meet_values_and_length: a text shape with values and max_length gives shape_conflict, in one rule and across a parent and a child rule', () => {
    const one = { ...labelUnit, shape: { type: 'text', values: ['mg', 'mcg'], max_length: 2 } }
    expect(problemsOf({ rules: withRules(one) })).toEqual([expect.objectContaining({ code: 'shape_conflict', rules: ['units.label_unit@1'] })])
    const width = shapeRule('units.short', 'criteria[].attributes[].unit', { type: 'text', max_length: 2 }, [{ output: 'mg', expected: 'pass' }], { owner: 'sunscreen' })
    const problems = problemsOf({ rules: withRules(width) })
    expect(problems).toEqual([expect.objectContaining({ code: 'shape_conflict', rules: ['units.label_unit@1', 'units.short@1'] })])
    expect(problems[0]!.message).toMatch(/has values and a length limit/)
  })

  it('shape.joint_meet_integer: a number meet with integer, min 1.2 and max 1.8 gives shape_conflict', () => {
    const range = { ...attributeAmount, shape: { type: 'number', min: 1.2, max: 1.8 } }
    const whole = shapeRule('attributes.amount_whole', 'criteria[].attributes[].amount', { type: 'number', integer: true }, [{ output: 2, expected: 'pass' }], { owner: 'sunscreen' })
    expect(problemsOf({ rules: withRules(range, whole) })).toEqual([
      expect.objectContaining({ code: 'shape_conflict', rules: ['attributes.amount@1', 'attributes.amount_whole@1'], message: expect.stringMatching(/no whole number lies there/) }),
    ])
    // meet-cross-dim.mjs, number case: min 0.5, max 0.9, and integer from another rule.
    const tight = { ...attributeAmount, shape: { type: 'number', min: 0.5, max: 0.9 } }
    expect(codes(problemsOf({ rules: withRules(tight, whole) }))).toEqual(['shape_conflict'])
    // The control: min 0.5 and max 1.5 hold the whole number 1.
    expect(compile({ rules: withRules({ ...attributeAmount, shape: { type: 'number', min: 0.5, max: 1.5 } }, whole) }).ok).toBe(true)
  })

  it('shape.reserved_names: the schema keeps its keys in a Map and an object with no prototype', () => {
    const plan = planOf()
    expect(Object.keys((plan.manifest.schema as { properties: object }).properties)).toEqual(['criteria'])
  })

  it('shape.schema_rejects_bad_output: the compiled schema rejects an extra key, a value outside the enum, and a missing unit', () => {
    const plan = planOf()
    expect(plan.schema.safeParse(GOOD_OUTPUT).success).toBe(true)
    const extraKey = setAt(GOOD_OUTPUT, 'criteria[].attributes[].grade', 9)
    const outsideEnum = unitAt('IU')
    const noUnit = structuredClone(GOOD_OUTPUT) as { criteria: { attributes: Record<string, unknown>[] }[] }
    delete noUnit.criteria[0]!.attributes[0]!.unit
    for (const bad of [extraKey, outsideEnum, noUnit]) expect(plan.schema.safeParse(bad).success).toBe(false)
    expect(plan.decode(extraKey)).toMatchObject({ ok: false, issues: [{ path: 'criteria[0].attributes[0].grade' }] })
    expect(plan.decode(outsideEnum)).toMatchObject({ ok: false, issues: [{ path: 'criteria[0].attributes[0].unit' }] })
    expect(plan.decode(noUnit)).toMatchObject({ ok: false, issues: [{ path: 'criteria[0].attributes[0].unit' }] })
  })

  // Repro interrogate/opus/decode-bad-value.mjs: the default errorStrategy throws, so the call site uses warn.
  it('shape.decode_failure_rows: the raw output with the unit IU gives a fail row for units.label_unit, with IU in evidence.quote', async () => {
    const plan = planOf()
    const model = () => createMockModel({ version: 'v2', mockText: JSON.stringify(unitAt('IU')) }) as never
    const strict = new Agent({ id: 'd1', name: 'd1', instructions: plan.instructions, model: model() })
    await expect(strict.generate('Draft.', { structuredOutput: { schema: plan.schema } })).rejects.toThrow(/Structured output validation failed/)

    const warn = new Agent({ id: 'd2', name: 'd2', instructions: plan.instructions, model: model() })
    const draft = await warn.generate('Draft.', { structuredOutput: { schema: plan.schema, errorStrategy: 'warn' } })
    const decoded = plan.decode(draft.object !== undefined ? draft.object : draft.text)
    expect(decoded.ok).toBe(false)
    const output = decoded.ok ? decoded.output : decoded.raw
    const rows = await plan.scorers.code.find(s => s.rule.id === 'units.label_unit')!.verify(output, GOOD_EVIDENCE)
    expect(rows).toEqual([expect.objectContaining({ verdict: 'fail', target: 'criteria[0].attributes[0].unit', evidence: { quote: '"IU"', source: 'output' } })])
  })

  it('shape.decode_failure_rows: a raw reply that is not JSON gives a fail row for each shape rule', async () => {
    const plan = planOf()
    const decoded = plan.decode('Sorry, I cannot help.')
    const output = decoded.ok ? decoded.output : decoded.raw
    const shapes = plan.scorers.code.filter(s => s.rule.kind === 'shape')
    expect(shapes.length).toBe(6)
    for (const s of shapes) {
      const rows = await s.verify(output, GOOD_EVIDENCE)
      expect(rows).toEqual([expect.objectContaining({ verdict: 'fail', evidence: { quote: '"Sorry, I cannot help."', source: 'output' } })])
    }
  })

  it('shape.joint_meet_agrees: for each composed fixture shape and the boundary values of each dimension, plan.schema and the shape scorers accept and reject the same values', async () => {
    const plan = planOf({ rules: [...COMPOSED] })
    let compared = 0
    for (const [field, values] of Object.entries(BOUNDARIES)) {
      const scorers = plan.scorers.code.filter(s => s.rule.kind === 'shape' && s.fields.includes(field))
      expect(scorers.length).toBeGreaterThan(0)
      const target = field.replaceAll('[]', '[0]')
      for (const value of values) {
        const output = setAt(COMPOSED_OUTPUT, field, value)
        const schemaAccepts = plan.schema.safeParse(output).success
        const rows = (await Promise.all(scorers.map(s => s.verify(output, GOOD_EVIDENCE)))).flat().filter(r => r.target === target)
        expect(rows.length).toBe(scorers.length)
        expect({ field, value, scorersAccept: rows.every(r => r.verdict === 'pass') }).toEqual({ field, value, scorersAccept: schemaAccepts })
        compared++
      }
    }
    expect(compared).toBeGreaterThan(30)
  })
})
