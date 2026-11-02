import { z } from '../../../../../node_modules/zod/index.js'
const show = (l, v) => console.log(l, JSON.stringify(v))

// F1: list.unique has no Zod/JSON-Schema form
console.log('has .unique on ZodArray?', typeof z.array(z.string()).unique)
const withRefine = z.array(z.string()).refine(a => new Set(a).size === a.length)
show('toJSONSchema(array.refine(unique))', z.toJSONSchema(withRefine))
show('plain array accepts duplicates', z.array(z.string()).safeParse(['a','a']).success)
try { show('z.set toJSONSchema', z.toJSONSchema(z.set(z.string()))) } catch (e) { console.log('z.set toJSONSchema throws:', e.message.slice(0,80)) }

// F2: values + max_length : which Zod?
const widthRule = z.string().max(2)            // child strict rule: max_length 2
const printed   = z.enum(['g','mcg','mg'])      // spec table: "z.enum of the sorted values, or z.string with its limits"
show('printed enum accepts "mcg"', printed.safeParse('mcg').success)
show('child max_length:2 rule rejects "mcg"', widthRule.safeParse('mcg').success)
show('toJSONSchema(printed enum) has maxLength?', z.toJSONSchema(printed))

// F3: cross-dimension empty meets that no schema can fill
const intRange = z.number().int().min(0.2).max(0.8)
show('int in [0.2,0.8] accepts any of 0,0.5,1', [0,0.5,1].map(x => intRange.safeParse(x).success))
show('toJSONSchema(int in [0.2,0.8])', z.toJSONSchema(intRange))
const enumVsLen = z.enum(['mcg'])
show('values [mcg] + max_length 2: enum ok / len rule ok', [enumVsLen.safeParse('mcg').success, widthRule.safeParse('mcg').success])

// F4: fromJSONSchema round trip on a strict object
const strictObj = z.object({ unit: z.enum(['mg','g']), n: z.number().int() }).strict()
const js = z.toJSONSchema(strictObj)
show('json', js)
const back = z.fromJSONSchema(js)
const bad = { unit: 'mg', n: 1, extra: 1 }
show('plan.schema rejects extra key', !strictObj.safeParse(bad).success)
const r = back.safeParse(bad)
show('fromJSONSchema(manifest.schema) accepts extra key?', r.success, )
show('fromJSONSchema out for extra key', r.success ? r.data : r.error.issues)
