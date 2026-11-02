import { z } from 'zod'
const js = { type: 'array', items: { type: 'string' }, uniqueItems: true }
console.log('fromJSONSchema(uniqueItems:true) accepts dup:', z.fromJSONSchema(js).safeParse(['a','a']).success)
const printed = z.array(z.string()).min(0).max(5)               // the only things the spec table lists for list: min_items, max_items
console.log('printed plan.schema accepts ["a","a"]:', printed.safeParse(['a','a']).success)
const sch = z.toJSONSchema(printed)
console.log('manifest.schema has uniqueItems?', 'uniqueItems' in sch, JSON.stringify(sch))
console.log('round-trip agrees on dup list (both accept):', z.fromJSONSchema(sch).safeParse(['a','a']).success === printed.safeParse(['a','a']).success)
