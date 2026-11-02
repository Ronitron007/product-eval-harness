// The spec's meet is per dimension (SHAPE_ORDERS); its shape_conflict examples are per dimension
// (values [mg] vs [g], min above max). Two rules that set DIFFERENT dimensions share no dimension,
// so compile.weaken calls the child an addition, and the per-dimension meet is non-empty.
import { z } from '../../../../../node_modules/zod/index.js'
const ORDER = { text: { values: 'subset', min_length: 'higher', max_length: 'lower' }, number: { min: 'higher', max: 'lower', integer: 'true' } }
function meet(type, a, b) { // compile.weaken table, applied dimension by dimension
  const out = {}; const o = ORDER[type]
  for (const k of Object.keys(o)) {
    const x = a[k], y = b[k]
    if (x === undefined) { if (y !== undefined) out[k] = y; continue }
    if (y === undefined) { out[k] = x; continue }
    out[k] = o[k] === 'subset' ? x.filter(v => y.includes(v)) : o[k] === 'higher' ? Math.max(x, y) : o[k] === 'lower' ? Math.min(x, y) : (x || y)
  }
  return out
}
function perDimEmpty(m) { // the spec's empty-meet tests
  return (m.values && m.values.length === 0) || (m.min !== undefined && m.max !== undefined && m.min > m.max) || (m.min_length !== undefined && m.max_length !== undefined && m.min_length > m.max_length)
}
function sharedLooser(type, parent, child) { // compile.weaken: a dimension that BOTH set is looser in child
  return Object.keys(ORDER[type]).filter(k => parent[k] !== undefined && child[k] !== undefined)
}
// printShape per its own shape (the per-rule scorer)
const own = (t, s) => t === 'text' ? (s.values ? z.enum([...s.values].sort()) : z.string().min(s.min_length ?? 0).max(s.max_length ?? 1e9))
  : (s.integer ? z.number().int() : z.number()).min(s.min ?? -Infinity).max(s.max ?? Infinity)
// printSchema per compile.shape table: "z.enum of the sorted values, OR z.string with its limits"
const printed = (t, m) => t === 'text' ? (m.values ? z.enum([...m.values].sort()) : z.string().min(m.min_length ?? 0).max(m.max_length ?? 1e9))
  : (m.integer ? z.number().int() : z.number()).min(m.min ?? -Infinity).max(m.max ?? Infinity)

console.log('--- case text: parent skincare {max_length:2}, child sunscreen {values:[mg,mcg]}')
let P = { type: 'text', max_length: 2 }, C = { type: 'text', values: ['mg', 'mcg'] }
let m = meet('text', P, C)
console.log('shared dims (weaken test input):', sharedLooser('text', P, C), '| meet:', JSON.stringify(m), '| per-dim empty:', perDimEmpty(m))
let S = printed('text', m)
console.log('printed schema JSON:', JSON.stringify(z.toJSONSchema(S)))
console.log('decoder accepts "mcg":', S.safeParse('mcg').success, '| parent own-shape scorer on "mcg":', own('text', P).safeParse('mcg').success ? 'pass' : 'fail')

console.log('--- case number: parent {min:0.5,max:0.9}, child {integer:true}')
P = { type: 'number', min: 0.5, max: 0.9 }; C = { type: 'number', integer: true }
m = meet('number', P, C)
console.log('shared dims:', sharedLooser('number', P, C), '| meet:', JSON.stringify(m), '| per-dim empty:', perDimEmpty(m))
S = printed('number', m)
console.log('printed schema JSON:', JSON.stringify(z.toJSONSchema(S)))
const tried = [0, 0.5, 0.7, 0.9, 1]
console.log('values the decoder accepts from', JSON.stringify(tried), ':', JSON.stringify(tried.filter(v => S.safeParse(v).success)))

console.log('--- one rule alone: {type:text, values:[mcg], max_length:2} (record lint: no min>max, no duplicate)')
m = { values: ['mcg'], max_length: 2 }
console.log('per-dim empty:', perDimEmpty(m), '| printed accepts "mcg":', printed('text', m).safeParse('mcg').success, '| intended set (values AND max_length) is empty:', ['mcg'].filter(v => v.length <= 2).length === 0)
