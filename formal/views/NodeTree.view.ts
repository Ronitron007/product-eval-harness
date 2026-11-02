// TLC gives a sequence as an object with keys from 1, and a function with string keys as an object.
type Value = any
const seq = (x: Value): Value[] =>
  Array.isArray(x) ? x : x && typeof x === 'object' ? Object.keys(x).sort((a, b) => Number(a) - Number(b)).map(k => x[k]) : []
const entries = (f: Value): [string, Value][] => (f && typeof f === 'object' && !Array.isArray(f) ? Object.entries(f) : [])

// The reader's words for formal/models/NodeTree.tla.
export const title = 'The category tree in harness.nodes'

export function state(v: Value): string {
  const nodes = new Map(entries(v.nodes))
  if (nodes.size === 0) return 'No node yet'
  const path = (id: string) => seq(nodes.get(id)?.path).join('.')
  let pathWrong = false
  let underLeaf = false
  for (const [id, n] of nodes) {
    if (n.parent === 'none') pathWrong ||= path(id) !== id
    else {
      pathWrong ||= !nodes.has(n.parent) || path(id) !== `${path(n.parent)}.${id}`
      underLeaf ||= nodes.get(n.parent)?.level === 'leaf'
    }
  }
  if (pathWrong && underLeaf) return 'A path disagrees with its parent, and a child sits under a leaf'
  if (pathWrong) return 'A path disagrees with its parent'
  if (underLeaf) return 'A child sits under a leaf'
  return 'Each path agrees with its parent'
}

export function step(action: string): string {
  if (action === 'InsertNode') return 'harness_app adds a node'
  if (action === 'OwnerSetLevel') return 'the table owner changes the level of a node'
  if (action === 'OwnerSetParent') return 'the table owner moves a node to another parent'
  return action
}

export function group(v: Value): string {
  return state(v).startsWith('A ') ? 'broken' : 'ok'
}

export const colors = { ok: 'teal', broken: 'orange' }
