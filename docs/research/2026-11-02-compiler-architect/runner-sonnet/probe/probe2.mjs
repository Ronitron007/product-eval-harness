import { z } from '../../../../../node_modules/zod/index.js'
const closed = z.fromJSONSchema({ type:'object', properties:{a:{type:'string'}}, required:['a'], additionalProperties:false })
console.log('single closed, extra key rejected:', !closed.safeParse({a:'x', c:1}).success)
const js = { allOf: [ { type:'object', properties:{a:{type:'string'}}, required:['a'], additionalProperties:false }, { type:'object', properties:{b:{type:'string'}}, required:['b'], additionalProperties:false } ] }
const zz = z.fromJSONSchema(js)
console.log('allOf of two closed objects accepts {a,b} (spec says reject):', zz.safeParse({a:'x', b:'y'}).success)
// enum widening via allOf: spec says intersection
const e = z.fromJSONSchema({ allOf: [ {type:'string', enum:['mg','g']}, {type:'string', enum:['g','mcg']} ] })
console.log('enum allOf g ok:', e.safeParse('g').success, 'mg rejected:', !e.safeParse('mg').success, 'mcg rejected:', !e.safeParse('mcg').success)
