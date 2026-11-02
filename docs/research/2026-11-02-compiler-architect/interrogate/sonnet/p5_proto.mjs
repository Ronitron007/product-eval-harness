import { z } from 'zod'
import canonicalize from 'canonicalize'
import { createHash } from 'node:crypto'
const FieldPath = /^[A-Za-z_][A-Za-z0-9_]*(\[\])?(\.[A-Za-z_][A-Za-z0-9_]*(\[\])?)*$/   // src/rules/schema.ts
console.log('FieldPath accepts "__proto__":', FieldPath.test('__proto__'), '| "constructor":', FieldPath.test('constructor'))
const h = s => createHash('sha256').update(canonicalize(z.toJSONSchema(s))).digest('hex').slice(0,12)
// printSchema builds the object from the trie's keys, sorted. Two plans that differ ONLY in the allowed values of that field:
const mk = vals => z.object(Object.fromEntries([['__proto__', z.enum(vals)], ['unit', z.enum(['mg','g'])]])).strict()
// (a) Object.fromEntries defines own props; try the common alternatives too
const mkAssign = vals => { const shape = {}; shape['__proto__'] = z.enum(vals); shape.unit = z.enum(['mg','g']); return z.object(shape).strict() }
for (const [label, f] of [['fromEntries', mk], ['assign', mkAssign]]) {
  const A = f(['mg','g']), B = f(['x'])
  console.log(label, 'keys A:', Object.keys(A.shape), '| JSON-schema properties A:', Object.keys(z.toJSONSchema(A).properties), '| required:', z.toJSONSchema(A).required)
  console.log(label, 'hash A', h(A), 'hash B', h(B), 'equal?', h(A) === h(B))
  console.log(label, 'A accepts {__proto__:"x"}?', A.safeParse(JSON.parse('{"__proto__":"x","unit":"mg"}')).success, '| B accepts {__proto__:"x"}?', B.safeParse(JSON.parse('{"__proto__":"x","unit":"mg"}')).success)
}
