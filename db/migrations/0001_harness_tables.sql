-- The graph tables of store.tables (docs/design/graph-store.md), in schema harness.
-- src/store/schema.ts mirrors this file. tests/store/migrations.test.ts fails when they drift.
-- Each hash column holds a lowercase sha256 hex digest, as ruleHash() in src/rules/hash.ts makes.

-- ltree gives the tree walks of store.tree. "if not exists" keeps an ltree that the database
-- already has, in the schema where it is (see db/README.md).
create extension if not exists ltree;

create schema harness;

-- The category tree that the operator names. A domain node is a root. The path is the chain
-- of ids from the root, such as skincare.sunscreen.mineral_sunscreen.
create table harness.nodes (
  id text primary key check (id ~ '^[a-z][a-z0-9_]*$'),
  parent_id text references harness.nodes (id),
  level text not null check (level in ('domain', 'inner', 'leaf')),
  path ltree not null unique,
  label text not null check (label <> ''),
  created_at timestamptz not null default now(),
  check ((parent_id is null) = (level = 'domain')),
  check ((parent_id is null) = (nlevel(path) = 1)),
  check (subpath(path, -1)::text = id)
);
create index nodes_path_gist on harness.nodes using gist (path);
create index nodes_parent_id on harness.nodes (parent_id);

-- One row for each stage run. run_id is the Mastra run id.
create table harness.stage_runs (
  run_id text primary key check (run_id <> ''),
  stage text not null check (stage in ('define_criteria', 'create_node', 'create_pack', 'create_layout', 'evaluate_product')),
  node_id text not null references harness.nodes (id),
  rule_set_hash text not null check (rule_set_hash ~ '^[0-9a-f]{64}$'),
  started_at timestamptz not null default now(),
  -- The target of the composite key of outputs: an output repeats these columns of its run.
  unique (run_id, stage, node_id, rule_set_hash)
);

-- Each accepted stage output. The composite key makes stage, node and rule set hash agree with the run.
create table harness.outputs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
  stage text not null,
  node_id text not null,
  body jsonb not null,
  rule_set_hash text not null,
  accepted_at timestamptz not null default now(),
  foreign key (run_id, stage, node_id, rule_set_hash) references harness.stage_runs (run_id, stage, node_id, rule_set_hash)
);
create index outputs_node_stage on harness.outputs (node_id, stage);

-- One row for each target and each rule (VerdictRow of enforce.rule_record).
create table harness.verdicts (
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
create index verdicts_run_id on harness.verdicts (run_id);
create index verdicts_rule on harness.verdicts (rule_id, rule_version);

-- The metadata of each research record. The record itself is an artifact in object storage.
create table harness.records (
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
create table harness.derived_rules (
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
create function harness.refuse_change() returns trigger
  language plpgsql
  as $$
begin
  raise exception 'harness.% is append-only: % is refused', tg_table_name, lower(tg_op)
    using errcode = 'restrict_violation';
end
$$;

create trigger stage_runs_append_only before update or delete on harness.stage_runs
  for each row execute function harness.refuse_change();
create trigger stage_runs_no_truncate before truncate on harness.stage_runs
  for each statement execute function harness.refuse_change();
create trigger outputs_append_only before update or delete on harness.outputs
  for each row execute function harness.refuse_change();
create trigger outputs_no_truncate before truncate on harness.outputs
  for each statement execute function harness.refuse_change();
create trigger verdicts_append_only before update or delete on harness.verdicts
  for each row execute function harness.refuse_change();
create trigger verdicts_no_truncate before truncate on harness.verdicts
  for each statement execute function harness.refuse_change();
create trigger records_append_only before update or delete on harness.records
  for each row execute function harness.refuse_change();
create trigger records_no_truncate before truncate on harness.records
  for each statement execute function harness.refuse_change();
create trigger derived_rules_append_only before update or delete on harness.derived_rules
  for each row execute function harness.refuse_change();
create trigger derived_rules_no_truncate before truncate on harness.derived_rules
  for each statement execute function harness.refuse_change();
