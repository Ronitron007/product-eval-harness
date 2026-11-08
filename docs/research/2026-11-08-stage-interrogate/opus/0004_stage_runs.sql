-- Probe: 0004 as stage.store describes it (no repo file exists).
create table if not exists harness.drafts (
  run_id text not null references harness.stage_runs (run_id),
  round integer not null check (round >= 1),
  reply jsonb not null,
  drafter text not null check (drafter ~ '^[^/]+/.+$'),
  created_at timestamptz not null default now(),
  primary key (run_id, round)
);
create table if not exists harness.run_ends (
  run_id text primary key references harness.stage_runs (run_id),
  round integer not null,
  "end" text not null check ("end" in ('accepted', 'person_accepted', 'person_rejected')),
  reviewer text, note text,
  created_at timestamptz not null default now(),
  foreign key (run_id, round) references harness.drafts (run_id, round),
  unique (run_id, round),
  check ("end" = 'accepted' or reviewer is not null),
  check ("end" <> 'person_rejected' or note is not null)
);
alter table harness.verdicts add column if not exists round integer not null;
alter table harness.outputs add column if not exists round integer not null;
do $$ begin
  alter table harness.verdicts add constraint verdicts_draft foreign key (run_id, round) references harness.drafts (run_id, round);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table harness.outputs add constraint outputs_run_id_key unique (run_id);
exception when duplicate_table or duplicate_object then null; end $$;
do $$ begin
  alter table harness.outputs add constraint outputs_run_end foreign key (run_id, round) references harness.run_ends (run_id, round);
exception when duplicate_object then null; end $$;

create or replace function harness.check_run_end() returns trigger language plpgsql set search_path = '' as $$
begin
  if new."end" = 'accepted' then
    if not exists (select 1 from harness.verdicts v where v.run_id = new.run_id and v.round = new.round) then
      raise exception 'accepted needs verdict rows' using errcode = 'check_violation';
    end if;
    if exists (select 1 from harness.verdicts v where v.run_id = new.run_id and v.round = new.round and v.binding = 'strict' and v.verdict <> 'pass') then
      raise exception 'accepted needs each strict row pass' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create or replace trigger run_ends_check before insert on harness.run_ends for each row execute function harness.check_run_end();
create or replace function harness.check_output() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from harness.run_ends e where e.run_id = new.run_id and e.round = new.round and e."end" in ('accepted', 'person_accepted')) then
    raise exception 'output needs an accepting run end' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create or replace trigger outputs_check before insert on harness.outputs for each row execute function harness.check_output();

create or replace trigger drafts_append_only before update or delete on harness.drafts for each row execute function harness.refuse_change();
create or replace trigger drafts_no_truncate before truncate on harness.drafts for each statement execute function harness.refuse_change();
create or replace trigger run_ends_append_only before update or delete on harness.run_ends for each row execute function harness.refuse_change();
create or replace trigger run_ends_no_truncate before truncate on harness.run_ends for each statement execute function harness.refuse_change();

alter table harness.drafts enable row level security;
alter table harness.run_ends enable row level security;
do $$ declare t text; begin
  foreach t in array array['drafts', 'run_ends'] loop
    execute format('drop policy if exists harness_app_read on harness.%I', t);
    execute format('create policy harness_app_read on harness.%I for select to harness_app using (true)', t);
    execute format('drop policy if exists harness_app_insert on harness.%I', t);
    execute format('create policy harness_app_insert on harness.%I for insert to harness_app with check (true)', t);
  end loop;
end $$;
grant select, insert on harness.drafts, harness.run_ends to harness_app;
revoke all on all tables in schema harness from public;
revoke all on all functions in schema harness from public;
-- The guard: stop the migration, and roll it back, when an object in harness or mastra
-- has no row level security, or when PUBLIC, anon or authenticated holds a right on it.
-- It also stops when a harness_app that existed before has a system attribute or a membership.
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
    raise exception 'harness migration: %', leftover;
  end if;
end
$$;
