// compile.record keeps ruleHash's field list ("Also covers shape and the structured check") and anchors
// scope at the owner. ruleHash leaves out owner (src/rules/hash.ts at 803301a). The lock key is id@version -> hash.
import { ruleHash } from '../../../../../src/rules/hash.ts'
import canonicalize from '../../../../../node_modules/canonicalize/lib/canonicalize.js'
import { createHash } from 'node:crypto'
const base = {
  id: 'units.label_unit', version: 1, kind: 'shape', binding: 'strict', status: 'active',
  statement: 'Write the amount in the unit that the label prints.', reason: 'A grade must rest on what the label states.',
  examples: [{ output: 'mg', expected: 'pass' }], provenance: { record_id: 'rec_label_units' },
}
// today (803301a): the scope names the node, so a move changes the hash and the lock demands a new version
const today = (node: string) => ({ ...base, owner: node, scope: { nodes: { node, descendants: true }, stages: ['create_node'], fields: ['criteria[].attributes[].unit'] } })
console.log('today  skincare vs sunscreen hash equal:', ruleHash(today('skincare') as any) === ruleHash(today('sunscreen') as any))
// spec: anchored scope, owner carries the location; ruleHash as specified = today's fields + shape + check
const spec = (owner: string) => ({ ...base, owner, shape: { type: 'text', values: ['mg', 'mcg', 'g'] }, scope: { nodes: 'subtree', stages: ['create_node'], fields: ['criteria[].attributes[].unit'] } })
const specHash = (r: any) => createHash('sha256').update(canonicalize({ statement: r.statement, reason: r.reason, kind: r.kind, scope: r.scope, binding: r.binding, judge: r.judge ?? null, check: r.check ?? null, shape: r.shape ?? null, examples: r.examples })!).digest('hex')
const h1 = specHash(spec('skincare')), h2 = specHash(spec('sunscreen'))
console.log('spec   skincare vs sunscreen hash equal:', h1 === h2, '| also real ruleHash equal:', ruleHash(spec('skincare') as any) === ruleHash(spec('sunscreen') as any))
// compile.scope over the fixture tree: where does units.label_unit@1 apply at create_node?
const tree: Record<string, string | null> = { skincare: null, sunscreen: 'skincare', moisturizer: 'skincare', mineral_sunscreen: 'sunscreen' }
const path = (n: string) => { const p = []; for (let x: string | null = n; x; x = tree[x]) p.push(x); return p }
const applies = (owner: string, n: string) => path(n).includes(owner) // subtree selector
for (const owner of ['skincare', 'sunscreen']) console.log(`owner ${owner}: applies at`, Object.keys(tree).filter(n => applies(owner, n)), '| lock entry units.label_unit@1 =', specHash(spec(owner)).slice(0, 12))
