import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { describe, expect, it } from 'vitest'
import type { CheckVector, EvidenceKey, Json, RunEvidence } from '../../src/rules/checks/define'
import { CHECKS, type AnyCheckTemplate } from '../../src/rules/checks'
import { paramsAtLeastAsStrict } from '../../src/rules/strictness'
import { importsOf, importsOfFile } from './imports'
import { REPO } from './files'

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

  it('verify.literals_and_render: render and literals read the same params object as check', () => {
    for (const v of vectors) {
      expect(t.render(v.params).length).toBeGreaterThan(0)
      for (const l of t.literals(v.params)) expect(Object.values(v.params).some(p => isDeepStrictEqual(p, l))).toBe(true)
    }
  })
})

describe('hash.template_imports', () => {
  const folder = join(REPO, 'src', 'rules', 'checks')
  const files = readdirSync(folder).filter(f => f.endsWith('.ts') && f !== 'define.ts' && f !== 'index.ts')

  it('lists one template file for each entry of CHECKS', () => {
    expect(files.map(f => f.replace(/\.ts$/, '')).sort()).toEqual(templates.map(t => t.name).sort())
  })

  it.each(files)('the template file %s imports only zod and ./define', file => {
    expect(importsOfFile(join(folder, file)).filter(m => m !== 'zod' && m !== './define')).toEqual([])
  })

  it('a template file that imports another module fails the test', () => {
    const source = "import { z } from 'zod'\nimport { defineCheck } from './define'\nimport { distance } from 'fastest-levenshtein'\n"
    expect(importsOf(source).filter(m => m !== 'zod' && m !== './define')).toEqual(['fastest-levenshtein'])
  })
})
