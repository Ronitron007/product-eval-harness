import { z } from '../../../../../node_modules/zod/index.js'
const back = z.fromJSONSchema({ type: 'array', items: { type: 'string' }, uniqueItems: true })
console.log('toJSONSchema(fromJSONSchema(uniqueItems)):', JSON.stringify(z.toJSONSchema(back)))
// override hook: can toJSONSchema be told? (spec: printer emits only constructs shown in full)
const withMeta = z.array(z.string()).refine(a => new Set(a).size === a.length).meta({ uniqueItems: true })
console.log('refine+meta toJSONSchema:', JSON.stringify(z.toJSONSchema(withMeta)))
// hash impact: list {unique:true} and list {} print to the same manifest.schema
const a = z.object({ items: z.array(z.string()).min(1).refine(x => new Set(x).size === x.length) }).strict()
const b = z.object({ items: z.array(z.string()).min(1) }).strict()
console.log('manifest.schema equal for unique vs not:', JSON.stringify(z.toJSONSchema(a)) === JSON.stringify(z.toJSONSchema(b)))
