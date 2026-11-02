// TLC gives a set as an array, and a record as an object.
type Value = any

// The reader's words for formal/models/MigrationApply.tla.
export const title = 'Applying db/migrations/ to a database that can hold objects from before'

function leaks(db: Value): string[] {
  const out: string[] = []
  if (db.noRls) out.push('a table with no row level security')
  if (db.anonRight) out.push('anon holds a right')
  if (db.anonOwns) out.push('anon owns an object')
  if (db.anonIsApp) out.push('anon is a member of harness_app')
  if (db.attr || db.memberOf) out.push('harness_app has an extra right')
  if (db.defaultAcl) out.push('new tables open to anon')
  if (db.outsideGrant) out.push('harness_app reaches a Kyaloon table')
  return out
}

const roleWords: Record<string, string> = {
  absent: 'no harness_app',
  plain: 'a plain harness_app',
  system_attr: 'a harness_app with a system attribute',
  member_of_role: 'a harness_app in another role',
  anon_member: 'anon as a member of harness_app',
  outside_grant: 'a harness_app with a right on a Kyaloon table',
}
const schemaWords: Record<string, string> = {
  absent: 'no schema harness',
  empty: 'an empty schema harness',
  owned_by_anon: 'a schema harness that anon owns',
  anon_owns_table: 'a harness table that anon owns',
  default_acl_anon: 'a default privilege for anon in harness',
  table_no_rls: 'a harness table with no row level security',
}

export function state(v: Value): string {
  if (v.phase === 'before') {
    const p = v.pre
    return `Before: ${roleWords[p.role]}, ${schemaWords[p.schema]}${p.supabase ? ', Supabase default privileges' : ''}`
  }
  const phase: Record<string, string> = {
    before: 'Before the migration',
    after_0001: 'Harness tables made',
    after_0002: 'Mastra tables made',
    guard: 'Rights set, guard runs',
    committed: 'Migration committed',
    aborted: 'Migration stopped',
  }
  const l = leaks(v.db)
  if (v.phase === 'committed' || v.phase === 'aborted') return l.length ? `${phase[v.phase]}: ${l.join(', ')}` : phase[v.phase]
  return phase[v.phase]
}

export function step(action: string, from: Value, to: Value): string | null {
  if (action === 'Apply0001') return 'the tool runs 0001_harness_tables.sql'
  if (action === 'Apply0002') return 'the tool runs 0002_mastra_schema.sql'
  if (action === 'Apply0003') return 'the tool runs 0003_harness_role.sql'
  if (action === 'GuardPasses') return 'the guard finds nothing'
  if (action === 'GuardStops') return to.mode === 'per_file' ? 'the guard stops 0003 [each file is its own transaction]' : 'the guard stops the migration [one transaction]'
  if (action === 'Done') return null
  return action
}

export function group(v: Value): string {
  if (v.phase !== 'committed' && v.phase !== 'aborted') return 'running'
  return leaks(v.db).length ? 'broken' : 'ok'
}

export const colors = { running: 'blue', ok: 'teal', broken: 'orange' }
