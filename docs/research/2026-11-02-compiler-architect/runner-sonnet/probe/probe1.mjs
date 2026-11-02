import { z } from '../../../../../node_modules/zod/index.js'
const attr = z.strictObject({ key: z.string(), unit: z.enum(['mg','g']), note: z.string().nullable() })
const s = z.strictObject({ criteria: z.array(z.strictObject({ name: z.string(), attributes: z.array(attr) })) })
const a = JSON.stringify(z.toJSONSchema(s, { io: 'input' }))
const b = JSON.stringify(z.toJSONSchema(s, { io: 'input' }))
console.log(a === b)
console.log(a)
// allOf with strict objects
const js = { allOf: [ { type:'object', properties:{a:{type:'string'}}, required:['a'], additionalProperties:false }, { type:'object', properties:{b:{type:'string'}}, required:['b'], additionalProperties:false } ] }
const zz = z.fromJSONSchema(js)
console.log('allOf strict ab:', zz.safeParse({a:'x', b:'y'}).success, 'a only:', zz.safeParse({a:'x'}).success)
