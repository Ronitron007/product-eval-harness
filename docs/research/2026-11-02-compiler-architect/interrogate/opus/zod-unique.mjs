// list.unique: is there a zod 4.6.7 construct that z.toJSONSchema shows as uniqueItems?
import { z } from '../../../../../node_modules/zod/index.js'
const arr = z.array(z.string())
console.log('ZodArray has .unique?', typeof arr.unique, '| methods with uniq:', Object.getOwnPropertyNames(Object.getPrototypeOf(arr)).concat(Object.keys(arr)).filter(k => /uniq/i.test(k)))
const viaRefine = z.array(z.string()).refine(a => new Set(a).size === a.length)
console.log('refine-unique toJSONSchema:', JSON.stringify(z.toJSONSchema(viaRefine)))
console.log('refine-unique accepts [mg,mg]:', viaRefine.safeParse(['mg','mg']).success)
try { console.log('z.set toJSONSchema:', JSON.stringify(z.toJSONSchema(z.set(z.string())))) } catch (e) { console.log('z.set toJSONSchema throws:', e.message.split('\n')[0]) }
const plain = z.array(z.string()).min(1)
console.log('plain array toJSONSchema:', JSON.stringify(z.toJSONSchema(plain)), '| accepts [mg,mg]:', plain.safeParse(['mg','mg']).success)
// does fromJSONSchema honour uniqueItems?
const back = z.fromJSONSchema({ type: 'array', items: { type: 'string' }, uniqueItems: true })
console.log('fromJSONSchema(uniqueItems) accepts [mg,mg]:', back.safeParse(['mg','mg']).success)
