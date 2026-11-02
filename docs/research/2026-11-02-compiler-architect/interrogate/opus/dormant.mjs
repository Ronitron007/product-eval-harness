// compile.scope + compile.record lint over the compile.tests fixture tree. Which (node, stage) compiles apply the rule?
const STAGE_LEVELS = { define_criteria: ['domain'], create_node: ['inner', 'leaf'], create_pack: ['leaf'], create_layout: ['leaf'], evaluate_product: ['leaf'] }
const tree = { skincare: { parent: null, level: 'domain' }, sunscreen: { parent: 'skincare', level: 'inner' }, moisturizer: { parent: 'skincare', level: 'inner' }, mineral_sunscreen: { parent: 'sunscreen', level: 'leaf' } }
const pathToRoot = n => { const p = []; for (let x = n; x; x = tree[x].parent) p.push(x); return p }
const recordLint = r => { const out = []
  if (r.owner === 'all' && r.scope.nodes === 'owner') out.push('owner all + selector owner')
  if (typeof r.scope.nodes === 'object') for (const s of r.scope.stages) if (!STAGE_LEVELS[s].includes(r.scope.nodes.level)) out.push(`stage ${s} never runs at level ${r.scope.nodes.level}`)
  return out }
const owner_unknown = r => r.status === 'active' && r.owner !== 'all' && !(r.owner in tree)
function disposition(r, N, S) {
  if (!(r.owner === 'all' || pathToRoot(N).includes(r.owner))) return 'owner_not_on_path'
  if (!r.scope.stages.includes(S)) return 'stage_not_named'
  const sel = r.scope.nodes
  const hit = sel === 'owner' ? N === r.owner : sel === 'subtree' ? true : tree[N].level === sel.level
  return hit ? 'applied' : 'selector_misses_node'
}
const rules = [
  { id: 'pack.cite_records', owner: 'sunscreen', status: 'active', scope: { nodes: 'owner', stages: ['create_pack'] } },
  { id: 'criteria.domain_only', owner: 'sunscreen', status: 'active', scope: { nodes: { level: 'domain' }, stages: ['define_criteria'] } },
]
for (const r of rules) {
  const runs = []
  for (const N of Object.keys(tree)) for (const S of Object.keys(STAGE_LEVELS)) {
    if (!STAGE_LEVELS[S].includes(tree[N].level)) continue // stage_not_at_level: that compile itself is refused
    runs.push(`${N}/${S}:${disposition(r, N, S)}`)
  }
  console.log(r.id, '| recordLint:', JSON.stringify(recordLint(r)), '| owner_unknown:', owner_unknown(r), '| applied anywhere:', runs.some(x => x.endsWith(':applied')))
  console.log('   ', runs.filter(x => !x.endsWith('owner_not_on_path')).join(' '))
}
