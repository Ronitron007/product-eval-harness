import { z } from '../../../../../node_modules/zod/index.js'
const s = z.object({ b: z.enum(['mg','mcg']), a: z.array(z.string()).min(1) }).strict()
console.log('toJSONSchema:', JSON.stringify(z.toJSONSchema(s)))
const r = z.string().refine(v => v.startsWith('x'))
try { console.log('refine ->', JSON.stringify(z.toJSONSchema(r))) } catch (e) { console.log('refine throws', e.message) }
const tr = z.string().transform(v => v.length)
try { console.log('transform ->', JSON.stringify(z.toJSONSchema(tr))) } catch (e) { console.log('transform throws:', e.message.split('\n')[0]) }
const f = z.fromJSONSchema({ type: 'object', properties: { u: { type: 'string', enum: ['mg'] } }, required: ['u'], additionalProperties: false })
console.log('fromJSONSchema ok:', f.safeParse({ u: 'mg' }).success, f.safeParse({ u: 'IU' }).success, f.safeParse({ u: 'mg', x: 1 }).success)
const du = z.discriminatedUnion('name', [z.object({ name: z.literal('a'), params: z.object({ min: z.number().int().min(0) }).strict() }).strict(), z.object({ name: z.literal('b'), params: z.object({}).strict() }).strict()])
console.log('du bad name:', JSON.stringify(du.safeParse({ name: 'c', params: {} }).error?.issues.map(i => [i.path.join('.'), i.message])))
console.log('du bad param:', JSON.stringify(du.safeParse({ name: 'a', params: { min: -1 } }).error?.issues.map(i => [i.path.join('.'), i.message])))
