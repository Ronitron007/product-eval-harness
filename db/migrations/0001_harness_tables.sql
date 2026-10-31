-- The graph tables of store.tables (docs/design/graph-store.md), in schema harness.
-- src/store/schema.ts mirrors this file. tests/store/migrations.test.ts fails when they drift.
-- Each hash column holds a lowercase sha256 hex digest, as ruleHash() in src/rules/hash.ts makes.
-- A second run of this file changes nothing: each create statement has "if not exists" or "or replace".
-- 0003_harness_role.sql turns on row level security and revokes execute on the functions.

-- ltree gives the tree walks of store.tree. It lives in schema extensions, as on Supabase.
-- This file names the ltree type and functions with that schema, so it needs no search_path.
-- An ltree in another schema stops the migration with a clear error (see db/README.md).
create schema if not exists extensions;
do $$
declare
  found text;
begin
  select n.nspname into found from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'ltree';
  if found is not null and found <> 'extensions' then
    raise exception 'ltree is installed in schema %, but the harness needs it in schema extensions', found;
  end if;
end
$$;
create extension if not exists ltree with schema extensions;

create schema if not exists harness;

-- The category tree that the operator names. A domain node is a root. The path is the chain
-- of ids from the root, such as skincare.sunscreen.mineral_sunscreen.
create table if not exists harness.nodes (
  id text primary key check (id ~ '^[a-z][a-z0-9_]*$'),
  parent_id text references harness.nodes (id),
  level text not null check (level in ('domain', 'inner', 'leaf')),
  path extensions.ltree not null unique,
  label text not null check (label <> ''),
  created_at timestamptz not null default now(),
  check ((parent_id is null) = (level = 'domain')),
  check ((parent_id is null) = (extensions.nlevel(path) = 1)),
  check (extensions.subpath(path, -1)::text = id)
);
create index if not exists nodes_path_gist on harness.nodes using gist (path);
create index if not exists nodes_parent_id on harness.nodes (parent_id);

-- A node path is the path of its parent plus its id, and a leaf has no child.
-- The checks above cannot read the parent row, so a trigger checks it on insert.
create or replace function harness.check_node_path() returns trigger
  language plpgsql
  set search_path = ''
  as $$
declare
  parent_path text;
  parent_level text;
begin
  if new.parent_id is null then
    if new.path::text <> new.id then
      raise exception 'harness.nodes: root node % must have the path %, not %', new.id, new.id, new.path
        using errcode = 'check_violation';
    end if;
    return new;
  end if;
  select p.path::text, p.level into parent_path, parent_level from harness.nodes p where p.id = new.parent_id;
  if not found then
    raise exception 'harness.nodes: parent % of node % does not exist', new.parent_id, new.id
      using errcode = 'foreign_key_violation';
  end if;
  if parent_level = 'leaf' then
    raise exception 'harness.nodes: parent % is a leaf, so it cannot have the child %', new.parent_id, new.id
      using errcode = 'check_violation';
  end if;
  if new.path::text <> parent_path || '.' || new.id then
    raise exception 'harness.nodes: node % must have the path %.%, not %', new.id, parent_path, new.id, new.path
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create or replace trigger nodes_check_path before insert on harness.nodes
  for each row execute function harness.check_node_path();

-- One row for each stage run. run_id is the Mastra run id.
create table if not exists harness.stage_runs (
  run_id text primary key check (run_id <> ''),
  stage text not null check (stage in ('define_criteria', 'create_node', 'create_pack', 'create_layout', 'evaluate_product')),
  node_id text not null references harness.nodes (id),
  rule_set_hash text not null check (rule_set_hash ~ '^[0-9a-f]{64}$'),
  started_at timestamptz not null default now(),
  -- The target of the composite key of outputs: an output repeats these columns of its run.
  unique (run_id, stage, node_id, rule_set_hash)
);

-- Each accepted stage output. The composite key makes stage, node and rule set hash agree with the run.
create table if not exists harness.outputs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
  stage text not null,
  node_id text not null,
  body jsonb not null,
  rule_set_hash text not null,
  accepted_at timestamptz not null default now(),
  foreign key (run_id, stage, node_id, rule_set_hash) references harness.stage_runs (run_id, stage, node_id, rule_set_hash)
);
create index if not exists outputs_node_stage on harness.outputs (node_id, stage);

-- One row for each target and each rule (VerdictRow of enforce.rule_record).
create table if not exists harness.verdicts (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references harness.stage_runs (run_id),
  rule_id text not null check (rule_id ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  rule_version integer not null check (rule_version >= 1),
  rule_hash text not null check (rule_hash ~ '^[0-9a-f]{64}$'),
  binding text not null check (binding in ('strict', 'soft', 'watch')),
  target text not null check (target <> ''),
  verdict text not null check (verdict in ('pass', 'fail', 'cannot_verify')),
  -- {"by": "code"} or {"by": "judge", "model": "...", "promptHash": "..."}
  -- coalesce: a check passes on null, and a missing key gives null.
  decider jsonb not null check (coalesce(
    decider = '{"by": "code"}'::jsonb
    or (decider ->> 'by' = 'judge'
        and jsonb_typeof(decider -> 'model') = 'string'
        and jsonb_typeof(decider -> 'promptHash') = 'string'
        and (decider - 'by' - 'model' - 'promptHash') = '{}'::jsonb),
    false)),
  reason text not null check (reason <> ''),
  -- {"quote": "...", "source": "..."} or null
  evidence jsonb check (coalesce(
    evidence is null
    or (jsonb_typeof(evidence -> 'quote') = 'string'
        and jsonb_typeof(evidence -> 'source') = 'string'
        and (evidence - 'quote' - 'source') = '{}'::jsonb),
    false)),
  created_at timestamptz not null default now()
);
create index if not exists verdicts_run_id on harness.verdicts (run_id);
create index if not exists verdicts_rule on harness.verdicts (rule_id, rule_version);

-- The metadata of each research record. The record itself is an artifact in object storage.
create table if not exists harness.records (
  id text not null check (id <> ''),
  version integer not null check (version >= 1),
  question text not null check (question <> ''),
  run_id text not null references harness.stage_runs (run_id),
  artifact_ref text not null check (artifact_ref <> ''),
  artifact_hash text not null check (artifact_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (id, version)
);

-- Each derived rule. record holds the whole RuleRecord. The key columns repeat its fields.
create table if not exists harness.derived_rules (
  id text not null check (id ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  version integer not null check (version >= 1),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  owner text not null references harness.nodes (id),
  record jsonb not null,
  run_id text not null references harness.stage_runs (run_id),
  created_at timestamptz not null default now(),
  primary key (id, version),
  check (coalesce(record ->> 'id' = id and record ->> 'version' = version::text and record ->> 'owner' = owner, false))
);

-- Rows only grow (store.safety). These triggers refuse each update, delete and truncate,
-- also for the table owner. A new run writes new rows.
create or replace function harness.refuse_change() returns trigger
  language plpgsql
  set search_path = ''
  as $$
begin
  raise exception 'harness.% is append-only: % is refused', tg_table_name, lower(tg_op)
    using errcode = 'restrict_violation';
end
$$;

create or replace trigger stage_runs_append_only before update or delete on harness.stage_runs
  for each row execute function harness.refuse_change();
create or replace trigger stage_runs_no_truncate before truncate on harness.stage_runs
  for each statement execute function harness.refuse_change();
create or replace trigger outputs_append_only before update or delete on harness.outputs
  for each row execute function harness.refuse_change();
create or replace trigger outputs_no_truncate before truncate on harness.outputs
  for each statement execute function harness.refuse_change();
create or replace trigger verdicts_append_only before update or delete on harness.verdicts
  for each row execute function harness.refuse_change();
create or replace trigger verdicts_no_truncate before truncate on harness.verdicts
  for each statement execute function harness.refuse_change();
create or replace trigger records_append_only before update or delete on harness.records
  for each row execute function harness.refuse_change();
create or replace trigger records_no_truncate before truncate on harness.records
  for each statement execute function harness.refuse_change();
create or replace trigger derived_rules_append_only before update or delete on harness.derived_rules
  for each row execute function harness.refuse_change();
create or replace trigger derived_rules_no_truncate before truncate on harness.derived_rules
  for each statement execute function harness.refuse_change();
