import canonicalize from 'canonicalize'
import { createHash } from 'node:crypto'
// Transcription of compile.scope + compile.ledger + STAGE_LEVELS (compile.record) + the recordLint list. Nothing else.
const tree = [
  { id: 'skincare', parentId: null, level: 'domain' }, { id: 'sunscreen', parentId: 'skincare', level: 'inner' },
  { id: 'moisturizer', parentId: 'skincare', level: 'inner' }, { id: 'mineral_sunscreen', parentId: 'sunscreen', level: 'leaf' }]
const STAGE_LEVELS = { define_criteria: ['domain'], create_node: ['inner', 'leaf'], create_pack: ['leaf'], create_layout: ['leaf'], evaluate_product: ['leaf'] }
const byId = Object.fromEntries(tree.map(n => [n.id, n]))
const path = id => { const p = []; for (let n = byId[id]; n; n = byId[n.parentId]) p.unshift(n.id); return p }
const inSubtree = (owner, id) => path(id).includes(owner)
function lint(r) {            // the recordLint bullets that can see scope (no tree)
  const out = []
  if (r.owner === 'all' && r.scope.nodes === 'owner') out.push('owner all + selector owner')
  if (typeof r.scope.nodes === 'object' && r.scope.stages.every(s => !STAGE_LEVELS[s].includes(r.scope.nodes.level))) out.push('level never runs stage')
  return out
}
function resolve(rule, node, stage) {   // returns ledger disposition
  if (rule.status !== 'active') return 'excluded:draft'
  if (!(rule.owner === 'all' || path(node).includes(rule.owner))) return 'excluded:owner_not_on_path'
  if (!rule.scope.stages.includes(stage)) return 'excluded:stage_not_named'
  const sel = rule.scope.nodes, own = rule.owner
  const ok = sel === 'owner' ? node === own : sel === 'subtree' ? (own === 'all' || inSubtree(own, node)) : (byId[node].level === sel.level && (own === 'all' || inSubtree(own, node)))
  return ok ? 'applied' : 'excluded:selector_misses_node'
}
const mk = (id, owner, nodes, stages, extra = {}) => ({ id, version: 1, owner, status: 'active', scope: { nodes, stages, fields: ['criteria[].attributes[].unit'] }, ...extra })

// (1) active rule that applies nowhere, and no lint/problem fires without a tree
const dormant = mk('units.dormant', 'mineral_sunscreen', { level: 'inner' }, ['create_node'])
console.log('lint problems (no tree):', lint(dormant))
const where = []
for (const n of tree) for (const s of Object.keys(STAGE_LEVELS)) if (STAGE_LEVELS[s].includes(n.level) && resolve(dormant, n.id, s) === 'applied') where.push(n.id + '/' + s)
console.log('(node,stage) pairs where it applies:', where.length)
console.log('dispositions at sunscreen/create_node:', resolve(dormant, 'sunscreen', 'create_node'), '| at mineral_sunscreen/create_node:', resolve(dormant, 'mineral_sunscreen', 'create_node'))

// (2) trial candidate that applies nowhere: manifest.rules lists only applied+trial entries (compile.hash, compile.ledger)
const live = mk('units.label_unit', 'skincare', 'subtree', ['create_node'], { hash: 'a'.repeat(64), binding: 'strict', origin: 'git' })
const cand = mk('units.new', 'skincare', 'subtree', ['create_pack'], { version: 2, hash: 'b'.repeat(64), binding: 'watch', origin: 'trial' })
const manifest = trial => ({ format: 1, stage: 'create_node', rules: [live, ...(trial ? [cand] : [])].filter(r => ['applied'].includes(resolve(r, 'sunscreen', 'create_node'))).map(r => ({ id: r.id, version: r.version, hash: r.hash, binding: r.binding, origin: r.origin })) })
const H = m => createHash('sha256').update(canonicalize(m)).digest('hex').slice(0, 12)
console.log('trial candidate disposition:', resolve(cand, 'sunscreen', 'create_node'), '| live hash', H(manifest(false)), '| trial hash', H(manifest(true)), '| equal:', H(manifest(false)) === H(manifest(true)))
console.log('ProblemCodes that could report either: none (no trial_* or inert-rule code in the compile.api list)')
