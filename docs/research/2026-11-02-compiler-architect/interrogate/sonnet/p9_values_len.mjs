import { z } from 'zod'
// skincare units.label_unit: values [mg,mcg,g]; sunscreen child adds max_length 2 (spec: weaken.addition_accepted -> compiles)
const A = z.enum(['g','mcg','mg'])        // reading 1 of the table: values wins, limit dropped
const B = z.string().max(2)               // reading 2: limits win, values dropped
const ok = s => ['mcg','mg','IU','xyz'].map(v => `${v}:${s.safeParse(v).success}`).join(' ')
console.log('decoder = enum      ->', ok(A))
console.log('decoder = string.max->', ok(B))
console.log('both rules together (what the conjunction requires) ->', ['mcg','mg','IU','xyz'].map(v => `${v}:${A.safeParse(v).success && B.safeParse(v).success}`).join(' '))
console.log('z.enum has .max?', typeof A.max)
