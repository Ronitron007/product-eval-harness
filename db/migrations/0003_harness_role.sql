-- The database role of the harness (store.safety).
--
-- This file grants the role these rights only:
--   - harness: usage, and select and insert on its tables (no update, delete or truncate);
--   - mastra: usage, and select, insert, update and delete on its tables, and its sequences;
--   - extensions: usage, for the ltree type and operators.
-- Row level security is on for each table in harness and mastra. A policy for each table lets
-- harness_app use the rows that its grants allow. The table owner bypasses row level security.
-- PUBLIC, anon and authenticated hold no right on an object in harness or mastra. The last
-- block of this file stops the migration when one of them does.
-- The role also holds each right that PUBLIC holds in the database. This file revokes nothing
-- from PUBLIC outside harness and mastra, because that would change the live database.
-- On a default Postgres, PUBLIC can connect, make temporary tables, use schema public, and
-- execute each function that grants execute to PUBLIC, security definer functions too.
-- A security definer function runs with the rights of its owner, so it can give the role rows
-- of a table that the role cannot read. It can also read any table that grants select to PUBLIC.
-- Review db/audit-public-grants.sql on the live database before this migration.
--
-- This file sets no password. After the migration, an operator sets it by hand:
--   alter role harness_app password '<a new secret>';
-- The connection string with that password goes into HARNESS_DATABASE_URL, never into git.

-- A second run of this file changes nothing.

-- A role belongs to the whole cluster, so the file keeps a role that already exists.
do $$
begin
  create role harness_app login noinherit nocreatedb nocreaterole;
-- unique_violation: two sessions that make the role at the same time.
exception when duplicate_object or unique_violation then
  null;
end
$$;

-- harness: the graph tables only grow, so the role can read and insert, never update or delete.
grant usage on schema harness to harness_app;
grant select, insert on all tables in schema harness to harness_app;
alter default privileges in schema harness grant select, insert on tables to harness_app;

-- mastra: Mastra updates and deletes its own rows, such as workflow snapshots.
grant usage on schema mastra to harness_app;
grant select, insert, update, delete on all tables in schema mastra to harness_app;
grant usage, select on all sequences in schema mastra to harness_app;
alter default privileges in schema mastra grant select, insert, update, delete on tables to harness_app;
alter default privileges in schema mastra grant usage, select on sequences to harness_app;

-- ltree lives in schema extensions (0001_harness_tables.sql). The search path lets the role
-- write the ltree type and operators with no schema name. The setting holds in this database only.
grant usage on schema extensions to harness_app;
do $$
begin
  execute format('alter role harness_app in database %I set search_path = harness, mastra, extensions', current_database());
end
$$;

-- Row level security (the RealDose rule: each new table enables it in the same migration).
-- harness: harness_app reads and inserts. The append-only triggers still refuse each update,
-- delete and truncate, and the role has no grant for them.
alter table harness.nodes enable row level security;
alter table harness.stage_runs enable row level security;
alter table harness.outputs enable row level security;
alter table harness.verdicts enable row level security;
alter table harness.records enable row level security;
alter table harness.derived_rules enable row level security;
do $$
declare
  t text;
begin
  foreach t in array array['nodes', 'stage_runs', 'outputs', 'verdicts', 'records', 'derived_rules'] loop
    execute format('drop policy if exists harness_app_read on harness.%I', t);
    execute format('create policy harness_app_read on harness.%I for select to harness_app using (true)', t);
    execute format('drop policy if exists harness_app_insert on harness.%I', t);
    execute format('create policy harness_app_insert on harness.%I for insert to harness_app with check (true)', t);
  end loop;
end
$$;

-- mastra: harness_app reads and writes each row of each table, as its grants allow. The loop
-- covers each table of 0002_mastra_schema.sql, so a new dump needs no change here.
do $$
declare
  t regclass;
begin
  for t in select c.oid::regclass from pg_class c
            where c.relnamespace = 'mastra'::regnamespace and c.relkind in ('r', 'p') order by c.relname loop
    execute format('alter table %s enable row level security', t);
    execute format('drop policy if exists harness_app_all on %s', t);
    execute format('create policy harness_app_all on %s for all to harness_app using (true) with check (true)', t);
  end loop;
end
$$;

-- Postgres grants execute on each new function to PUBLIC. The functions here are trigger
-- functions. A trigger fires without a check of the execute right, so no role needs it.
-- A default privilege of the database can also give PUBLIC a right on a new table.
revoke all on all tables in schema harness, mastra from public;
revoke all on all sequences in schema harness, mastra from public;
revoke all on all functions in schema harness, mastra from public;
-- The Mastra function calls now() of pg_catalog only, so it needs no search path.
alter function mastra.trigger_set_timestamps() set search_path = '';

-- anon and authenticated are the public-key roles of Supabase. A default privilege of the
-- database can give them a right on a new object, so revoke each right in harness and mastra.
-- A database without the roles, such as a plain local Postgres, skips this block.
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema harness, mastra from %I', r);
      execute format('revoke all on all tables in schema harness, mastra from %I', r);
      execute format('revoke all on all sequences in schema harness, mastra from %I', r);
      execute format('revoke all on all functions in schema harness, mastra from %I', r);
    end if;
  end loop;
end
$$;

-- The guard: stop the migration, and roll it back, when an object in harness or mastra
-- has no row level security, or when PUBLIC, anon or authenticated holds a right on it.
do $$
declare
  leftover text;
begin
  select string_agg(item, ', ' order by item) into leftover from (
    select format('table %s has no row level security', c.oid::regclass) as item
      from pg_class c
     where c.relnamespace in ('harness'::regnamespace, 'mastra'::regnamespace)
       and c.relkind in ('r', 'p') and not c.relrowsecurity
    union all
    select format('%s on %s %s', a.privilege_type, case c.relkind when 'S' then 'sequence' else 'relation' end, c.oid::regclass)
           || ' for ' || case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end
      from pg_class c, aclexplode(c.relacl) a
     where c.relnamespace in ('harness'::regnamespace, 'mastra'::regnamespace)
       and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated'))
    union all
    select format('%s on function %s for %s', a.privilege_type, p.oid::regprocedure,
                  case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end)
      from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.pronamespace in ('harness'::regnamespace, 'mastra'::regnamespace)
       and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated'))
    union all
    select format('%s on schema %s for %s', a.privilege_type, n.nspname,
                  case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end)
      from pg_namespace n, aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
     where n.nspname in ('harness', 'mastra')
       and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated'))
  ) x;
  if leftover is not null then
    raise exception 'harness migration: %', leftover;
  end if;
end
$$;
