-- The tables of the tool registry (tools.run_record in docs/design/tool-registry.md), in schema harness.
-- src/store/schema.ts mirrors this file. tests/store/migrations.test.ts fails when they drift.
-- A second run of this file changes nothing: each statement has "if not exists", "or replace",
-- or a block that skips an object that exists. The file runs in one transaction.
begin;

-- The precondition: 0003 and 0004 ran, so harness_app and harness.refuse_change exist.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'harness_app') then
    raise exception 'harness migration 0005: the role harness_app is missing. Run 0003_harness_role.sql first.' using errcode = 'check_violation';
  end if;
  if to_regprocedure('harness.refuse_change()') is null then
    raise exception 'harness migration 0005: harness.refuse_change() is missing. Run 0001 to 0004 first.' using errcode = 'check_violation';
  end if;
end
$$;

-- tools.toggles, tools.run_record: the snapshot of each run, written before its first tool call.
create table if not exists harness.tool_runs (
  run_id text primary key check (btrim(run_id) <> ''),
  consumer text not null check (consumer in ('agent', 'mcp_client', 'step')),
  toggles jsonb not null,
  manifest jsonb not null check (jsonb_typeof(manifest) = 'array'),
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  allowed_tools text[] not null,
  started_at timestamptz not null default now()
);

-- tools.run_record: the end of each run, from the tap on the CLI stream. Null when no result message came.
create table if not exists harness.tool_run_ends (
  run_id text primary key references harness.tool_runs (run_id),
  subtype text,                -- such as 'success' or 'error_max_budget_usd'
  cost_usd numeric check (cost_usd is null or cost_usd >= 0),
  num_turns integer check (num_turns is null or num_turns >= 0),
  terminal_reason text,
  denials jsonb not null default '[]'::jsonb check (jsonb_typeof(denials) = 'array'),
  ended_at timestamptz not null default now()
);

-- Rows only grow (store.safety).
do $$ declare t text; begin
  foreach t in array array['tool_runs', 'tool_run_ends'] loop
    execute format('create or replace trigger %I before update or delete on harness.%I for each row execute function harness.refuse_change()', t || '_append_only', t);
    execute format('create or replace trigger %I before truncate on harness.%I for each statement execute function harness.refuse_change()', t || '_no_truncate', t);
    execute format('alter table harness.%I enable row level security', t);
    execute format('drop policy if exists harness_app_read on harness.%I', t);
    execute format('create policy harness_app_read on harness.%I for select to harness_app using (true)', t);
    execute format('drop policy if exists harness_app_insert on harness.%I', t);
    execute format('create policy harness_app_insert on harness.%I for insert to harness_app with check (true)', t);
    execute format('revoke all on harness.%I from public', t);
    execute format('grant select, insert on harness.%I to harness_app', t);
  end loop;
end $$;

do $$ declare r text; begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on harness.tool_runs, harness.tool_run_ends from %I', r);
    end if;
  end loop;
end $$;

-- The guard of 0003_harness_role.sql, again, as 0004 repeats it: stop the migration, and roll it
-- back, when an object in harness or mastra has no row level security, or when PUBLIC, anon or
-- authenticated holds a right on it. It also stops when harness_app has a system attribute or a membership.
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
    union all
    select 'harness_app has a system attribute'
      from pg_roles r
     where r.rolname = 'harness_app'
       and (r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb or r.rolreplication)
    union all
    select format('harness_app is a member of %s', pg_get_userbyid(m.roleid))
      from pg_auth_members m
     where m.member = 'harness_app'::regrole
  ) x;
  if leftover is not null then
    raise exception 'harness migration 0005: %', leftover;
  end if;
end
$$;

commit;
