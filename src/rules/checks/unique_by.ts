import { z } from 'zod'
import { defineCheck, type Json } from './define'

const isObject = (v: Json): v is { [key: string]: Json } => typeof v === 'object' && v !== null && !Array.isArray(v)

// No two items of a list share the value of one key. Equal means equal JSON text.
export const uniqueBy = defineCheck({
  name: 'unique_by',
  version: 1,
  fact: 'uniqueness',
  target: 'list',
  params: z
    .object({
      by: z
        .string({ error: 'Give by: one key of the list items, such as name.' })
        .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Name one key of the list items, such as name.')
        .refine(k => !['__proto__', 'constructor', 'prototype'].includes(k) && !k.startsWith('__'), 'Rename the key. It cannot be __proto__, constructor, prototype, or start with __.'),
    })
    .strict(),
  order: { by: 'identity' },
  needs: [],
  render: p => `No two items share the same ${p.by}.`,
  literals: p => [p.by],
  requires: (p, field) => [`${field}[].${p.by}`],
  check(p, value) {
    if (!Array.isArray(value)) return { verdict: 'cannot_verify', why: 'The value is not a list.' }
    const seen = new Map<string, number>()
    for (const [i, item] of value.entries()) {
      if (!isObject(item) || !Object.hasOwn(item, p.by)) {
        return { verdict: 'cannot_verify', why: `Item ${i} has no ${p.by}. Its shape rule reports the absence.` }
      }
      const key = JSON.stringify(item[p.by])
      const first = seen.get(key)
      if (first !== undefined) return { verdict: 'fail', fix: `Give each item its own ${p.by}. Items ${first} and ${i} share ${key}.` }
      seen.set(key, i)
    }
    return { verdict: 'pass' }
  },
  vectors: [
    { params: { by: 'name' }, value: [{ name: 'spf' }, { name: 'zinc' }], evidence: {}, expected: 'pass' },
    { params: { by: 'name' }, value: [{ name: 'spf' }, { name: 'spf' }], evidence: {}, expected: 'fail' },
    { params: { by: 'name' }, value: [{ name: 'spf' }, { key: 'spf' }], evidence: {}, expected: 'cannot_verify' },
    { params: { by: 'key' }, value: [{ name: 'spf', key: 'a' }, { name: 'spf', key: 'b' }], evidence: {}, expected: 'pass' },
    { params: { by: 'key' }, value: [{ key: 'a' }, { key: 'a' }], evidence: {}, expected: 'fail' },
  ],
})
