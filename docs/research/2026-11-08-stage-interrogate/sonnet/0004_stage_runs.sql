-- Prototype of docs/design/stage-workflow.md `stage.store`, written by the adversary from the spec table only.
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
  round integer not null check (round >= 1),
  "end" text not null check ("end" in ('accepted', 'person_accepted', 'person_rejected')),
  reviewer text check (reviewer is null or reviewer <> ''),
  note text,
  created_at timestamptz not null default now(),
  foreign key (run_id, round) references harness.drafts (run_id, round),
  unique (run_id, round),
  check ("end" = 'accepted' or reviewer is not null),
  check ("end" <> 'person_rejected' or (note is not null and note <> ''))
);

alter table harness.verdicts add column if not exists round integer not null;
alter table harness.outputs add column if not exists round integer not null;
do $$ begin
  alter table harness.verdicts add constraint verdicts_draft_fk foreign key (run_id, round) references harness.drafts (run_id, round);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table harness.outputs add constraint outputs_run_unique unique (run_id);
exception when duplicate_object or duplicate_table then null; end $$;
do $$ begin
  alter table harness.outputs add constraint outputs_end_fk foreign key (run_id, round) references harness.run_ends (run_id, round);
exception when duplicate_object then null; end $$;

create or replace function harness.check_run_end() returns trigger language plpgsql set search_path = '' as $$
begin
  if new."end" = 'accepted' then
    if not exists (select 1 from harness.verdicts v where v.run_id = new.run_id and v.round = new.round) then
      raise exception 'harness.run_ends: accepted needs a verdict row of run % round %', new.run_id, new.round using errcode = 'check_violation';
    end if;
    if exists (select 1 from harness.verdicts v where v.run_id = new.run_id and v.round = new.round and v.binding = 'strict' and v.verdict <> 'pass') then
      raise exception 'harness.run_ends: accepted needs each strict row to pass' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create or replace trigger run_ends_check before insert on harness.run_ends for each row execute function harness.check_run_end();

create or replace function harness.check_output() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from harness.run_ends e where e.run_id = new.run_id and e.round = new.round and e."end" in ('accepted', 'person_accepted')) then
    raise exception 'harness.outputs: needs an accepting run_ends row of the same run and round' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create or replace trigger outputs_check before insert on harness.outputs for each row execute function harness.check_output();

create or replace trigger drafts_append_only before update or delete on harness.drafts for each row execute function harness.refuse_change();
create or replace trigger drafts_no_truncate before truncate on harness.drafts for each statement execute function harness.refuse_change();
create or replace trigger run_ends_append_only before update or delete on harness.run_ends for each row execute function harness.refuse_change();
create or replace trigger run_ends_no_truncate before truncate on harness.run_ends for each statement execute function harness.refuse_change();

grant select, insert on all tables in schema harness to harness_app;
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
revoke all on all tables in schema harness from public;
