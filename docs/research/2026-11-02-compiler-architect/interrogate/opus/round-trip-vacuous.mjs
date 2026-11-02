// hash.schema_round_trip: "z.fromJSONSchema(manifest.schema) agrees with plan.schema on each golden example.
// This test finds a refine that the hash cannot see." Golden examples are FIELD values (compile.usage.files).
import { z } from '../../../../../node_modules/zod/index.js'
const HIDDEN = v => v !== 'mg' // a refine the printer must never emit: it rejects mg
const plan = z.object({ criteria: z.array(z.object({ attributes: z.array(z.object({
  quote: z.string(),                                            // quotes rule field: "a shape rule defines this field"
  unit: z.enum(['g', 'mcg', 'mg']).refine(HIDDEN),               // units.label_unit, plus the hidden refine
}).strict()) }).strict()) }).strict()
const manifestSchema = z.toJSONSchema(plan)
const back = z.fromJSONSchema(manifestSchema)
const goldens = [{ output: 'mg', expected: 'pass' }, { output: 'IU', expected: 'fail' }] // units.label_unit examples
const embed = v => ({ criteria: [{ attributes: [{ unit: v }] }] }) // paths.embed of one field value
for (const g of goldens) {
  const raw = [plan.safeParse(g.output).success, back.safeParse(g.output).success]
  const emb = [plan.safeParse(embed(g.output)).success, back.safeParse(embed(g.output)).success]
  console.log(`golden ${g.output}: raw plan/back=${raw} agree=${raw[0] === raw[1]} | embedded plan/back=${emb} agree=${emb[0] === emb[1]}`)
}
const full = { criteria: [{ attributes: [{ quote: 'x', unit: 'mg' }] }] }
console.log('a full output with unit mg: plan', plan.safeParse(full).success, '| back', back.safeParse(full).success, '-> the refine is real and the hash misses it')
