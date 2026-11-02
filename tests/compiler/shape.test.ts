import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { problemsOf, rulesRoot } from './files'
import { labelUnit, shapeRule } from './rules'

// Hazard `shape`: two shape rules disagree, the schema accepts a bad output, or a bad output
// leaves no fail row.

describe('shape', () => {
  it('shape.not_strict: a shape rule with binding soft gives a loader problem that says the decoder enforces it', () => {
    const root = rulesRoot([{ ...labelUnit, binding: 'soft' }])
    expect(problemsOf(root)).toEqual([
      'binding: A shape rule is always strict, because the decoder enforces each shape rule. Set binding to strict, or write a code_check rule.',
    ])
  })

  it('shape.list_unique_refused: a list shape with unique: true gives a loader problem', () => {
    const root = rulesRoot([shapeRule('criteria.list', 'criteria', { type: 'list', min_items: 1, unique: true }, [{ output: [{}], expected: 'pass' }])])
    expect(problemsOf(root)).toEqual(['shape: A list shape has no unique. Add a code_check rule with the check unique_by on this list.'])
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
    expect(problemsOf(root)).toEqual(
      fields.map(() => 'scope.fields.0: Rename the field. A path segment cannot be __proto__, constructor, prototype, or start with __.'),
    )
  })

  // Repros interrogate/sonnet/p5_proto.mjs and p5b_proto.mjs: why the names are reserved.
  it('shape.reserved_names (repros p5_proto, p5b_proto): a Zod object drops a __proto__ key, so the schema would not require it', () => {
    const s = z.object(Object.fromEntries([['__proto__', z.enum(['mg', 'g'])], ['unit', z.enum(['mg', 'g'])]])).strict()
    expect(s.safeParse({ unit: 'mg' }).success).toBe(true)
  })
})
