import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminUrl, freshDatabase, pgDump, supabaseRoles } from '../../tests/db'
import {
  apply,
  facts,
  modelView,
  MODES,
  predict,
  query,
  ROLES,
  SCHEMAS,
  schemaSetup,
  setRole,
  unsafe,
  type Mode,
  type PreState,
} from './migration'

// The migration sweep: db/migrations/ on each pre-state of formal/models/MigrationApply.tla, in
// each apply mode, on a real local Postgres. 5 roles x 6 schemas x 2 x 2 modes = 120 cases.
// Each case checks these rules:
//   CommittedIsSafe            a committed migration meets store.safety, by what Postgres lets
//                              PUBLIC, anon and authenticated do (formal/sql/migration.ts)
//   StopRollsBack              a stopped migration leaves the schema dump as it was
//   SecondApplyChangesNothing  a second apply commits and leaves the schema dump as it was
//   GuardStopsNamedCases       the guard stops each case that it names
//   ModelAgrees                the end state is the one that MigrationApply.tla gives
// FINDINGS lists the rules that break today. A case must break exactly those rules.

type Rule = 'CommittedIsSafe' | 'StopRollsBack' | 'SecondApplyChangesNothing' | 'GuardStopsNamedCases' | 'ModelAgrees'

const guardNames = (p: PreState) => p.role === 'system_attr' || p.role === 'member_of_role' || p.schema === 'table_no_rls'

// The findings of 2026-11-02. When a fix lands, remove its line here and in the skill.
const FINDINGS: Record<string, (p: PreState, mode: Mode) => boolean> = {
  // migration.guard_gaps: the guard reads ACL entries only. It misses anon as a member of
  // harness_app, anon as the owner of the schema or a table, and a default privilege in harness.
  CommittedIsSafe: p =>
    !guardNames(p) && (p.role === 'anon_member' || ['owned_by_anon', 'anon_owns_table', 'default_acl_anon'].includes(p.schema)),
  // migration.per_file_stop: with each file in its own transaction, a stop in 0003 keeps the
  // tables of 0001 and 0002, with no row level security and with the rights of default privileges.
  StopRollsBack: (p, mode) => guardNames(p) && mode === 'per_file',
}

const cases: { p: PreState; mode: Mode; name: string }[] = []
for (const role of ROLES)
  for (const schema of SCHEMAS)
    for (const supabase of [false, true])
      for (const mode of MODES) cases.push({ p: { role, schema, supabase }, mode, name: `${role} / ${schema}${supabase ? ' / supabase' : ''} / ${mode}` })

let roleBefore = false
beforeAll(async () => {
  const { rows } = await query(adminUrl(), `select datname from pg_database where datname like 'harness_test_%'`)
  if (rows.length) {
    throw new Error(
      `The sweep drops and makes the cluster role harness_app, so it runs alone on its Postgres. Drop these databases first: ${rows.map(r => r.datname).join(', ')}`,
    )
  }
  await supabaseRoles()
  roleBefore = (await query(adminUrl(), `select 1 from pg_roles where rolname = 'harness_app'`)).rowCount === 1
})
afterAll(async () => {
  await setRole(roleBefore ? 'plain' : 'absent')
})

describe('the migration sweep', () => {
  it.each(cases)('$name', async ({ p, mode }) => {
    await setRole(p.role)
    const db = await freshDatabase({ migrate: false })
    const broken = new Map<Rule, string>()
    try {
      const setup = schemaSetup(p)
      if (setup) await query(db.url, setup)
      const before = pgDump(db.url, ['--schema-only'])
      const outcome = await apply(db.url, mode)
      const f = await facts(db.url)

      if (outcome === 'committed') {
        const bad = unsafe(f)
        if (bad.length) broken.set('CommittedIsSafe', bad.join('; '))
        const once = pgDump(db.url, ['--schema-only'])
        const again = await apply(db.url, mode)
        if (again !== 'committed') broken.set('SecondApplyChangesNothing', 'the second apply stopped')
        else if (pgDump(db.url, ['--schema-only']) !== once) broken.set('SecondApplyChangesNothing', 'the schema dump changed')
      } else if (pgDump(db.url, ['--schema-only']) !== before) {
        broken.set('StopRollsBack', `the stop kept objects: ${unsafe(f).join('; ') || 'the schema dump changed'}`)
      }
      if (guardNames(p) && outcome !== 'aborted') broken.set('GuardStopsNamedCases', 'the guard let a case that it names commit')

      const model = predict(p, mode)
      const real = { outcome, ...modelView(f) }
      if (JSON.stringify(model) !== JSON.stringify(real)) {
        broken.set('ModelAgrees', `model ${JSON.stringify(model)} but real ${JSON.stringify(real)}`)
      }
    } finally {
      await db.drop()
    }

    const expected = Object.entries(FINDINGS)
      .filter(([, breaks]) => breaks(p, mode))
      .map(([rule]) => rule)
      .sort()
    const actual = [...broken.keys()].sort()
    expect(
      actual,
      'A rule broke that FINDINGS does not list (a new bug or a wrong model), or a finding no longer breaks ' +
        `(fixed: update FINDINGS and the skill). Why each rule broke: ${JSON.stringify(Object.fromEntries(broken))}`,
    ).toEqual(expected)
  })
})
