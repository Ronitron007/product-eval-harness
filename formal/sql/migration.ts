import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { adminUrl, applyMigrations, MIGRATIONS_DIR, migrationFiles } from '../../tests/db'
import { dumpStates } from '../tlc'

// The pre-states, the apply modes, and the safety oracle of the migration sweep
// (formal/sql/migration-sweep.check.ts). The names match formal/models/MigrationApply.tla.

export const ROLES = ['absent', 'plain', 'system_attr', 'member_of_role', 'anon_member', 'outside_grant'] as const
export const SCHEMAS = ['absent', 'empty', 'owned_by_anon', 'anon_owns_table', 'default_acl_anon', 'table_no_rls'] as const
export const MODES = ['one_tx', 'per_file'] as const
export type Role = (typeof ROLES)[number]
export type Schema = (typeof SCHEMAS)[number]
export type Mode = (typeof MODES)[number]
export interface PreState {
  role: Role
  schema: Schema
  supabase: boolean
}

export async function query(url: string, sql: string): Promise<pg.QueryResult> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    return await client.query(sql)
  } finally {
    await client.end()
  }
}

// harness_app belongs to the whole cluster, so the sweep sets it before it makes each database.
export async function setRole(role: Role): Promise<void> {
  const admin = adminUrl()
  await query(admin, `do $$ begin if exists (select 1 from pg_roles where rolname = 'harness_app') then drop role harness_app; end if; end $$`)
  const make: Record<Role, string> = {
    absent: '',
    plain: 'create role harness_app login noinherit nocreatedb nocreaterole',
    system_attr: 'create role harness_app login noinherit createdb',
    member_of_role: `do $$ begin create role zz_group nologin; exception when duplicate_object then null; end $$;
                     create role harness_app login noinherit; grant zz_group to harness_app`,
    anon_member: 'create role harness_app login noinherit; grant harness_app to anon',
    // The table and its grant live in one database, so schemaSetup() adds them.
    outside_grant: 'create role harness_app login noinherit nocreatedb nocreaterole',
  }
  if (make[role]) await query(admin, make[role])
}

// The objects of a pre-state inside one database.
export function schemaSetup(p: PreState): string {
  const supabase = `
    alter default privileges for role postgres grant all on tables to public, anon, authenticated, service_role;
    alter default privileges for role postgres grant all on sequences to public, anon, authenticated, service_role;
    alter default privileges for role postgres grant all on functions to anon, authenticated, service_role;
    alter default privileges for role postgres grant all on schemas to public, anon, authenticated, service_role;`
  const schema: Record<Schema, string> = {
    absent: '',
    empty: 'create schema harness;',
    owned_by_anon: 'create schema harness authorization anon;',
    anon_owns_table: `create schema harness; create table harness.zz_anon (id int);
                      alter table harness.zz_anon enable row level security; alter table harness.zz_anon owner to anon;`,
    default_acl_anon: 'create schema harness; alter default privileges in schema harness grant select on tables to anon;',
    table_no_rls: 'create schema harness; create table harness.zz_no_rls (id int);',
  }
  const outside = 'create table public.zz_kyaloon (id int); grant select, update on public.zz_kyaloon to harness_app;'
  return (p.supabase ? supabase : '') + schema[p.schema] + (p.role === 'outside_grant' ? outside : '')
}

// Applies db/migrations/: in one transaction, as one RealDose migration file (db/README.md),
// or each file in its own transaction, as applyMigrations() of tests/db.ts.
export async function apply(url: string, mode: Mode): Promise<'committed' | 'aborted'> {
  try {
    if (mode === 'per_file') await applyMigrations(url)
    else await query(url, migrationFiles().map(f => readFileSync(join(MIGRATIONS_DIR, f), 'utf8')).join('\n;\n'))
    return 'committed'
  } catch {
    return 'aborted'
  }
}

// The safety oracle of store.safety. It asks Postgres what a role can do (has_*_privilege,
// pg_has_role), so it counts ownership and membership too. acl_rights reads the ACL entries, as
// the guard of 0003 does.
const OURS = `select oid from pg_namespace where nspname in ('harness', 'mastra')`
const OUTSIDERS = `(values ('public'), ('anon'), ('authenticated')) as r(name)`
export const FACTS_SQL = `select
  (select count(*) from pg_namespace where nspname in ('harness', 'mastra'))::int as schemas,
  (select count(*) from pg_class c where c.relnamespace in (${OURS}) and c.relkind in ('r', 'p') and not c.relrowsecurity)::int as no_rls,
  (select count(*) from (
     select a.grantee from pg_class c, aclexplode(c.relacl) a where c.relnamespace in (${OURS})
     union all select a.grantee from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.pronamespace in (${OURS})
     union all select a.grantee from pg_namespace n, aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a where n.oid in (${OURS})
   ) g where g.grantee = 0 or g.grantee in ('anon'::regrole, 'authenticated'::regrole))::int as acl_rights,
  (select count(*) from ${OUTSIDERS}, pg_class c where c.relnamespace in (${OURS}) and (
     (c.relkind in ('r', 'p', 'v', 'm', 'f') and (has_table_privilege(r.name, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                                               or has_any_column_privilege(r.name, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')))
     or (c.relkind = 'S' and has_sequence_privilege(r.name, c.oid, 'USAGE,SELECT,UPDATE'))))::int
   + (select count(*) from ${OUTSIDERS}, pg_proc p where p.pronamespace in (${OURS}) and has_function_privilege(r.name, p.oid, 'EXECUTE'))::int
   + (select count(*) from ${OUTSIDERS}, pg_namespace n where n.oid in (${OURS}) and has_schema_privilege(r.name, n.oid, 'USAGE,CREATE'))::int
   as effective_rights,
  (select count(*) from (values ('anon'), ('authenticated')) as r(name), (
     select relowner as owner from pg_class where relnamespace in (${OURS})
     union all select nspowner from pg_namespace where oid in (${OURS})
     union all select proowner from pg_proc where pronamespace in (${OURS})) o
   where pg_has_role(r.name, o.owner, 'USAGE'))::int as anon_owns,
  exists (select 1 from pg_roles where rolname = 'harness_app') as role,
  coalesce((select pg_has_role('anon', 'harness_app', 'MEMBER') or pg_has_role('authenticated', 'harness_app', 'MEMBER')
              from pg_roles where rolname = 'harness_app'), false) as anon_is_app,
  coalesce((select rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication
              from pg_roles where rolname = 'harness_app'), false) as app_attr,
  (select count(*) from pg_auth_members m join pg_roles r on r.oid = m.member where r.rolname = 'harness_app')::int as app_member_of,
  (select count(*) from pg_roles r, pg_class c, aclexplode(c.relacl) a
     where r.rolname = 'harness_app' and a.grantee = r.oid and c.relnamespace not in (${OURS}))::int
   + (select count(*) from pg_roles r, pg_namespace n, aclexplode(n.nspacl) a
     where r.rolname = 'harness_app' and a.grantee = r.oid and n.nspname not in ('harness', 'mastra', 'extensions'))::int
   + (select count(*) from pg_roles r, pg_class c where r.rolname = 'harness_app' and c.relowner = r.oid and c.relnamespace not in (${OURS}))::int
   as app_outside,
  coalesce((select bool_or(has_table_privilege('harness_app', c.oid, 'UPDATE,DELETE,TRUNCATE')) from pg_class c
              where c.relnamespace = to_regnamespace('harness') and c.relkind in ('r', 'p')
                and exists (select 1 from pg_roles where rolname = 'harness_app')), false) as app_writes,
  coalesce((select bool_or(pg_has_role('harness_app', c.relowner, 'USAGE')) from pg_class c
              where c.relnamespace in (${OURS}) and exists (select 1 from pg_roles where rolname = 'harness_app')), false) as app_owns`

export interface Facts {
  schemas: number
  no_rls: number
  acl_rights: number
  effective_rights: number
  anon_owns: number
  role: boolean
  anon_is_app: boolean
  app_attr: boolean
  app_member_of: number
  app_outside: number
  new_table_open: boolean
  app_writes: boolean
  app_owns: boolean
}

// new_table_open: a table that a later migration makes in schema harness gets an ACL entry for
// PUBLIC, anon or authenticated from a default privilege. The probe makes the table and rolls it
// back. It reads ACL entries, so a membership in harness_app counts in anon_is_app only.
const NEW_TABLE_SQL = `begin;
  create schema if not exists harness;
  create table harness.zz_probe (id int);
  select exists (select 1 from aclexplode((select relacl from pg_class where oid = 'harness.zz_probe'::regclass)) a
                  where a.grantee = 0 or a.grantee in ('anon'::regrole, 'authenticated'::regrole)) as open;
  rollback;`

export async function facts(url: string): Promise<Facts> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    const base = (await client.query(FACTS_SQL)).rows[0]
    const probe = (await client.query(NEW_TABLE_SQL)) as unknown as pg.QueryResult[]
    return { ...base, new_table_open: probe[3]!.rows[0].open } as Facts
  } finally {
    await client.end()
  }
}

// store.safety after a commit, by what Postgres lets each role do.
export function unsafe(f: Facts): string[] {
  const out: string[] = []
  if (f.schemas !== 2) out.push(`${f.schemas} of the schemas harness and mastra exist`)
  if (f.no_rls) out.push(`${f.no_rls} tables have no row level security`)
  if (f.effective_rights) out.push(`PUBLIC, anon or authenticated can use ${f.effective_rights} objects`)
  if (f.anon_owns) out.push(`anon or authenticated owns ${f.anon_owns} objects`)
  if (f.anon_is_app) out.push('anon or authenticated is a member of harness_app')
  if (f.app_attr) out.push('harness_app has a system attribute')
  if (f.app_member_of) out.push(`harness_app is a member of ${f.app_member_of} roles`)
  if (f.new_table_open) out.push('a default privilege opens each new harness table to PUBLIC, anon or authenticated')
  if (f.app_outside) out.push(`harness_app holds ${f.app_outside} rights or objects outside harness, mastra and extensions`)
  if (f.app_writes) out.push('harness_app can update, delete or truncate a harness table')
  if (f.app_owns) out.push('harness_app owns an object')
  return out
}

// The end states of formal/models/MigrationApply.tla, from TLC -dump, by pre-state and mode.
// The sweep compares each of them with the real database, so that a wrong model shows.
export interface ModelFacts {
  outcome: 'committed' | 'aborted'
  schemas: boolean
  noRls: boolean
  anonRight: boolean
  anonOwns: boolean
  anonIsApp: boolean
  role: boolean
  attr: boolean
  memberOf: boolean
  defaultAcl: boolean
  outsideGrant: boolean
}

export const caseKey = (p: PreState, mode: Mode) => `${p.role}/${p.schema}/${p.supabase}/${mode}`

export async function modelEndStates(): Promise<Map<string, ModelFacts>> {
  const ends = new Map<string, ModelFacts>()
  for (const s of (await dumpStates('MigrationApply', 'MigrationApply')) as any[]) {
    if (s.phase !== 'committed' && s.phase !== 'aborted') continue
    const key = caseKey(s.pre, s.mode)
    if (ends.has(key)) throw new Error(`MigrationApply.tla has two end states for ${key}.`)
    ends.set(key, { outcome: s.phase, ...s.db })
  }
  return ends
}

export function modelView(f: Facts): Omit<ModelFacts, 'outcome'> {
  return {
    schemas: f.schemas > 0,
    noRls: f.no_rls > 0,
    anonRight: f.acl_rights > 0,
    anonOwns: f.anon_owns > 0,
    anonIsApp: f.anon_is_app,
    role: f.role,
    attr: f.app_attr,
    memberOf: f.app_member_of > 0,
    defaultAcl: f.new_table_open,
    outsideGrant: f.app_outside > 0,
  }
}
