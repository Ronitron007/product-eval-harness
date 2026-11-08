-- The tables of the stage workflow (stage.store in docs/design/stage-workflow.md), in schema harness.
-- src/store/schema.ts mirrors this file. tests/store/migrations.test.ts fails when they drift.
-- It adds harness.drafts, harness.draft_claims, harness.judge_claims, harness.person_decisions and harness.run_ends, and
-- it adds the round to harness.verdicts and harness.outputs. Triggers hold the rules that a check
-- cannot: no verdict and no decision after the run end, and what each run end and output needs.
-- A second run of this file changes nothing: each statement has "if not exists", "or replace",
-- or a block that skips an object that exists.
-- Before the first stage run, harness.verdicts and harness.outputs are empty, so the new
-- not-null round columns need no default.
-- Each new table only grows, has row level security with a policy for harness_app, and gives
-- PUBLIC, anon and authenticated no right (store.safety). The last block repeats the guard of
-- 0003_harness_role.sql, so that it also covers the new tables and functions.
-- The file runs in one transaction, so a stop never leaves a new table with no row level security.

begin;

-- The precondition: harness.verdicts and harness.outputs get a not-null round column with no
-- default, so they must be empty before that column exists. A second run, after the column
-- exists, skips this check.
do $$
declare
  t text;
  filled boolean;
begin
  foreach t in array array['verdicts', 'outputs'] loop
    if not exists (select 1 from information_schema.columns where table_schema = 'harness' and table_name = t and column_name = 'round') then
      execute format('select exists (select 1 from harness.%I)', t) into filled;
      if filled then
        raise exception 'harness migration 0004: harness.% has rows, and 0004 adds a not-null round column with no default. Ask Rohan what to do with the rows before this migration.', t
          using errcode = 'check_violation';
      end if;
    end if;
  end loop;
end
$$;

-- stage.reply_lossless: the jsonb value of a reply text, or null when jsonb refuses it (NUL, a lone surrogate).
create or replace function harness.try_jsonb(t text) returns jsonb
  language plpgsql immutable set search_path = '' as $$
begin
  return t::jsonb;
exception when others then
  return null;
end $$;

-- stage.draft_log, stage.budget_in_db, stage.reply_lossless
create table if not exists harness.drafts (
  run_id text not null references harness.stage_runs (run_id),
  round integer not null check (round between 1 and 3),
  reply_text text,           -- JSON.stringify(reply): exact, with NUL and lone surrogates as escapes. Null only with an error.
  reply jsonb,               -- harness.try_jsonb(reply_text): null when jsonb refuses it
  error text check (error is null or btrim(error) <> ''),  -- stage.draft_deadline: such as 'drafter deadline'
  drafter text not null check (drafter ~ '^[^/]+/.+$'),
  created_at timestamptz not null default now(),
  primary key (run_id, round),
  check ((reply_text is null) = (error is not null))
);

-- stage.draft_claim: one row for each attempt to draft one round, with the lease of
-- stage.claim_lease. Only the caller whose insert wins calls the drafter. A row, not a session
-- lock, so that no connection stays open across the model call.
create table if not exists harness.draft_claims (
  run_id text not null references harness.stage_runs (run_id),
  round integer not null check (round between 1 and 3),
  attempt integer not null check (attempt >= 1),
  claimed_at timestamptz not null default now(),
  primary key (run_id, round, attempt)
);

-- stage.judge_claim, stage.claim_lease: one row for each attempt to judge one round. Only the caller whose
-- insert wins calls the judge. A new attempt is a new row, so the table stays append-only. The store inserts
-- attempt max + 1 only when the latest claim is older than the lease and the round has no verdict row.
create table if not exists harness.judge_claims (
  run_id text not null,
  round integer not null,
  attempt integer not null check (attempt >= 1),
  claimed_at timestamptz not null default now(),
  primary key (run_id, round, attempt),
  foreign key (run_id, round) references harness.drafts (run_id, round)
);

-- stage.decision_first: the decision of a person, written before assimilate runs.
create table if not exists harness.person_decisions (
  run_id text primary key,
  round integer not null,
  decision text not null check (decision in ('accept', 'reject')),
  reviewer text not null check (btrim(reviewer) <> ''),
  note text check (note is null or btrim(note) <> ''),
  created_at timestamptz not null default now(),
  foreign key (run_id, round) references harness.drafts (run_id, round),
  check (decision <> 'reject' or note is not null)
);

-- stage.reject_end, stage.end_once
create table if not exists harness.run_ends (
  run_id text primary key references harness.stage_runs (run_id),
  round integer not null,
  "end" text not null check ("end" in ('accepted', 'person_accepted', 'person_rejected')),
  reviewer text check (reviewer is null or btrim(reviewer) <> ''),
  note text check (note is null or btrim(note) <> ''),
  created_at timestamptz not null default now(),
  foreign key (run_id, round) references harness.drafts (run_id, round),
  unique (run_id, round),
  check (("end" = 'accepted') = (reviewer is null)),
  check ("end" <> 'person_rejected' or note is not null)
);

-- stage.round_rows, stage.budget_in_db, stage.judge_claim
alter table harness.verdicts add column if not exists round integer not null;
alter table harness.outputs add column if not exists round integer not null;
do $$ begin
  alter table harness.verdicts add constraint verdicts_round_budget check (round between 1 and 3);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table harness.verdicts add constraint verdicts_draft foreign key (run_id, round) references harness.drafts (run_id, round);
exception when duplicate_object then null; end $$;
create unique index if not exists verdicts_one_row on harness.verdicts (run_id, round, rule_id, rule_version, target);
do $$ begin
  alter table harness.outputs add constraint outputs_one_per_run unique (run_id);
exception when duplicate_object or duplicate_table then null; end $$;
do $$ begin
  alter table harness.outputs add constraint outputs_run_end foreign key (run_id, round) references harness.run_ends (run_id, round);
exception when duplicate_object then null; end $$;

-- stage.round_closed: no verdict row after the run ended.
create or replace function harness.check_verdict_open() returns trigger language plpgsql set search_path = '' as $$
begin
  -- One lock for each run, held to the end of the transaction, so that an end and a late row of
  -- two open transactions cannot pass each other's check.
  perform pg_advisory_xact_lock(hashtext(new.run_id));
  if exists (select 1 from harness.run_ends e where e.run_id = new.run_id) then
    raise exception 'harness.verdicts: run % has ended, so it takes no verdict row', new.run_id using errcode = 'check_violation';
  end if;
  return new;
end $$;
create or replace trigger verdicts_open before insert on harness.verdicts for each row execute function harness.check_verdict_open();

-- stage.decision_closed: no decision of a person after the run ended.
create or replace function harness.check_decision_open() returns trigger language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.run_id));
  if exists (select 1 from harness.run_ends e where e.run_id = new.run_id) then
    raise exception 'harness.person_decisions: run % has ended, so it takes no decision', new.run_id using errcode = 'check_violation';
  end if;
  return new;
end $$;
create or replace trigger person_decisions_open before insert on harness.person_decisions for each row execute function harness.check_decision_open();

-- stage.loop_on_outcome, stage.decision_first: what each end needs.
create or replace function harness.check_run_end() returns trigger language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.run_id));
  if new."end" = 'accepted' then
    -- The database holds only "at least one strict row, and each strict row passes". "Each rule has a row" is in code (judge.outcome_total).
    if not exists (select 1 from harness.verdicts v where v.run_id = new.run_id and v.round = new.round and v.binding = 'strict') then
      raise exception 'harness.run_ends: accepted needs a strict verdict row of run % round %', new.run_id, new.round using errcode = 'check_violation';
    end if;
    if exists (select 1 from harness.verdicts v where v.run_id = new.run_id and v.round = new.round and v.binding = 'strict' and v.verdict <> 'pass') then
      raise exception 'harness.run_ends: accepted needs each strict row to pass' using errcode = 'check_violation';
    end if;
    if exists (select 1 from harness.person_decisions d where d.run_id = new.run_id) then
      raise exception 'harness.run_ends: run % has a person decision, so its end is a person end', new.run_id using errcode = 'check_violation';
    end if;
  elsif not exists (
    select 1 from harness.person_decisions d
     where d.run_id = new.run_id and d.round = new.round and d.reviewer = new.reviewer and d.note is not distinct from new.note
       and d.decision = case new."end" when 'person_accepted' then 'accept' else 'reject' end) then
    raise exception 'harness.run_ends: a person end needs the equal person decision of run %', new.run_id using errcode = 'check_violation';
  end if;
  return new;
end $$;
create or replace trigger run_ends_check before insert on harness.run_ends for each row execute function harness.check_run_end();

create or replace function harness.check_output() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from harness.run_ends e where e.run_id = new.run_id and e.round = new.round and e."end" in ('accepted', 'person_accepted')) then
    raise exception 'harness.outputs: needs an accepting run end of the same run and round' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create or replace trigger outputs_check before insert on harness.outputs for each row execute function harness.check_output();

-- Rows only grow (store.safety).
do $$ declare t text; begin
  foreach t in array array['drafts', 'draft_claims', 'judge_claims', 'person_decisions', 'run_ends'] loop
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
      execute format('revoke all on harness.drafts, harness.draft_claims, harness.judge_claims, harness.person_decisions, harness.run_ends from %I', r);
      execute format('revoke all on function harness.try_jsonb(text), harness.check_verdict_open(), harness.check_decision_open(), harness.check_run_end(), harness.check_output() from %I', r);
    end if;
  end loop;
end $$;
revoke all on function harness.try_jsonb(text), harness.check_verdict_open(), harness.check_decision_open(), harness.check_run_end(), harness.check_output() from public;
grant execute on function harness.try_jsonb(text) to harness_app;

-- The guard of 0003_harness_role.sql, again: stop the migration, and roll it back, when an object
-- in harness or mastra has no row level security, or when PUBLIC, anon or authenticated holds a
-- right on it. It also stops when harness_app has a system attribute or a membership.
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
    raise exception 'harness migration 0004: %', leftover;
  end if;
end
$$;

commit;
