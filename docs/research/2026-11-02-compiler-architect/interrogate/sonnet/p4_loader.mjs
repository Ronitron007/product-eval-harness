import { z } from 'zod'
const CheckRef = z.discriminatedUnion('name', [
  z.object({ name: z.literal('unique_by'), params: z.object({ by: z.string().min(1) }).strict() }).strict(),
  z.object({ name: z.literal('quote_in_source'), params: z.object({ source: z.string(), case_sensitive: z.boolean() }).strict() }).strict(),
])
const Base = { id: z.string(), binding: z.enum(['strict','soft','watch']) }
const Rec = z.discriminatedUnion('kind', [
  z.object({ ...Base, kind: z.literal('shape'), shape: z.object({type:z.literal('text')}).strict(), binding: z.literal('strict') }).strict(),
  z.object({ ...Base, kind: z.literal('code_check'), check: CheckRef }).strict(),
]).superRefine((r, ctx) => { console.log('   [recordLint ran]') })
const run = (label, v) => { const r = Rec.safeParse(v); console.log(label, r.success ? 'OK' : JSON.stringify(r.error.issues.map(i => ({ field: i.path.join('.') || '(file)', code: i.code, message: i.message })))) }
run('unknown check name :', { id:'a.b', binding:'strict', kind:'code_check', check:{ name:'min_itemz', params:{} } })
run('bad param         :', { id:'a.b', binding:'strict', kind:'code_check', check:{ name:'unique_by', params:{ by: 5 } } })
run('shape binding soft:', { id:'a.b', binding:'soft', kind:'shape', shape:{type:'text'} })
