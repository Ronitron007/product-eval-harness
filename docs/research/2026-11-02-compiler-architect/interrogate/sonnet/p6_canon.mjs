import canonicalize from 'canonicalize'
const t = v => { try { return canonicalize(v) } catch (e) { return 'THROWS ' + e.message } }
console.log('undefined key  :', t({ a: undefined, b: 1 }))
console.log('undefined in [] :', t([undefined, 1]))
console.log('-0 vs 0         :', t({ m: -0 }), t({ m: 0 }))
console.log('NaN             :', t({ m: NaN }))
console.log('Infinity        :', t({ m: Infinity }))
console.log('1e21 / 0.1+0.2  :', t({ m: 1e21, n: 0.1 + 0.2 }))
console.log('lone surrogate  :', t({ s: '\ud800' }))
console.log('Map             :', t({ m: new Map([['a', 1]]) }))
console.log('Set             :', t({ m: new Set([1]) }))
console.log('Date            :', t({ m: new Date(0) }))
console.log('Zod-ish class   :', t({ m: Object.create({ inherited: 1 }) }))
