// TLC gives a set as an array, and a record as an object.
type Value = any

// The reader's words for formal/models/RuleVersions.tla.
export const title = 'The versions of one rule: the lock in git and the derived rule rows'

function stagePart(v: Value): string {
  const lock: Value[] = v.lock ?? []
  if (lock.length === 0) return 'no stage rule'
  const at = (n: number) => lock.find(e => e.v === n)
  const unwatched = lock.some(e => {
    if (e.binding === 'watch') return false
    const before = at(e.v - 1)
    return !(before && before.binding === 'watch' && before.words === e.words)
  })
  const top = Math.max(...lock.map(e => e.v))
  if (lock.some(e => e.v > 1 && !at(e.v - 1))) return `stage rule locked to v${top}, with a version missing below it`
  if (unwatched) return `stage rule locked to v${top}, a version that never ran as watch`
  return `stage rule locked to v${top}`
}

function derivedPart(v: Value): string {
  const rows: Value[] = v.derived ?? []
  if (rows.length === 0) return 'no derived row'
  const marks: string[] = []
  if (rows.some(r => r.v > 1 && !rows.some(q => q.v === r.v - 1))) marks.push('a version skips one')
  if (new Set(rows.map(r => r.owner)).size > 1) marks.push('two owners')
  if (rows.filter(r => r.status === 'active').length > 1) marks.push('two active versions')
  const lock: Value[] = v.lock ?? []
  if (rows.some(r => lock.some(e => e.v === r.v && (e.words !== r.words || e.binding !== r.binding)))) {
    marks.push('one version with two hashes')
  }
  return marks.length ? `derived rows: ${marks.join(', ')}` : 'derived rows agree'
}

export function state(v: Value): string {
  return `${stagePart(v)}; ${derivedPart(v)}`
}

export function step(action: string): string {
  if (action === 'MergeRulePR') return 'a PR changes the rule file and passes rules:check'
  if (action === 'MergeLockEdit') return 'a PR edits the lock by hand and passes rules:check'
  if (action === 'MergeLockAdd') return 'a PR adds a lock entry by hand and passes rules:check'
  if (action === 'AddDerivedRule') return 'a stage run adds a derived rule version'
  return action
}

export function group(v: Value): string {
  const s = state(v)
  return s.includes('never ran') || s.includes('missing') || s.includes('derived rows:') ? 'broken' : 'ok'
}

export const colors = { ok: 'teal', broken: 'orange' }
