# The graph store `store`

Status. Spec of 2026-10-29 for `plan.graph_store`. The code shipped on 2026-10-30 in [#12](https://github.com/Ronitron007/product-eval-harness/pull/12): `src/store/`, `db/migrations/`, and `db/README.md`. The migrations are not applied to the Kyaloon database yet. Rohan ruled on 2026-10-29 that the authoring database is the Kyaloon Supabase Postgres database ([decisions.tsv](../decisions.tsv)). A spike on a local Postgres 18 verified the parts below ([the spike](../research/2026-10-29-postgres-spike.md)). Terms are in [glossary.md](../glossary.md).

## Where it lives `store.place`

| Part | Where | Why |
|---|---|---|
| `ltree` | Schema `extensions`, as on Supabase. The migration stops if `ltree` sits in another schema. | Supabase keeps extensions in `extensions`. |
| Our graph tables | Schema `harness` in the Kyaloon Supabase database | One database for the authoring graph and the run state (`data.layers`). A schema of its own keeps it apart from the Kyaloon tables. |
| Mastra run state | Schema `mastra` in the same database | `PostgresStore({ pool, schemaName: 'mastra' })` takes our connection pool. Verified (ran). |
| Large artifacts and bundles | Object storage (`data.artifacts`, `data.bundles`) | The database holds their ids and hashes only. |
| Mastra traces | Open | The Mastra docs advise a separate analytics store for high-volume traces. |

## Safety on a live database `store.safety`

The Kyaloon database serves staging and production. Each migration reaches production (`rules.live_systems`). So:

1. **Mastra never creates tables at run time.** The harness runs `PostgresStore` with `disableInit: true`. A script runs `storage.init()` once on a local Postgres, dumps the `mastra` schema, and the dump becomes a reviewed migration. Verified (the option exists in `@mastra/pg` 1.32.0).

2. **Each migration lives in RealDose.** The migration files go into RealDose `supabase/migrations/`, like each other Kyaloon migration. Rohan runs `supabase db push` after a dry run. Claude writes the files and never applies them.

3. **The harness has its own database role, `harness_app`.** It has rights on the schemas `harness` and `mastra`, and usage on `extensions`. It has no right on a Kyaloon table. It still holds each right that Postgres gives to `PUBLIC`, such as the execute right on a public function and the right to make temporary tables. Nothing here revokes a right from `PUBLIC`, because that would change the Kyaloon database outside our schemas. Before the migration, Rohan runs the read-only `db/audit-public-grants.sql`, which lists what `PUBLIC` can reach. Verified (the review of #12 ran it).

4. **Rows only grow.** Database triggers refuse each update, delete, and truncate of outputs, verdicts, records, stage runs, and derived rules. The role has no update or delete right on any harness table. A trigger also refuses a node whose path does not agree with its parent, and a child under a leaf. Verified (the tests of #12).

5. **No credential in this repo.** The connection string comes from `HARNESS_DATABASE_URL` in the environment.

## The tables of this unit `store.tables`

This unit builds the tables that every stage needs. The tables of the stage outputs, such as criteria and attributes, come with the stage unit that writes them, so each table has a writer and a test when it lands.

| Table | Holds | Key columns |
|---|---|---|
| `harness.nodes` | The category tree that the operator names | `id`, `parent_id`, `level` (`domain`, `inner`, `leaf`), `path` (`ltree`), `label`, `created_at` |
| `harness.stage_runs` | One row for each stage run | `run_id` (the Mastra run id), `stage`, `node_id`, `rule_set_hash`, `started_at` |
| `harness.outputs` | Each accepted stage output | `id`, `run_id`, `stage`, `node_id`, `body` (JSON), `rule_set_hash`, `accepted_at` |
| `harness.verdicts` | One row for each target and each rule (`VerdictRow`) | `id`, `run_id`, `rule_id`, `rule_version`, `rule_hash`, `binding`, `target`, `verdict`, `decider`, `reason`, `evidence` (JSON), `created_at` |
| `harness.records` | The metadata of each research record | `id`, `version`, `question`, `run_id`, `artifact_ref`, `artifact_hash`, `created_at` |
| `harness.derived_rules` | Each derived rule, with the fields of `RuleRecord` | `id`, `version`, `hash`, `owner`, `record` (JSON), `run_id`, `created_at` |

## The tree walk `store.tree`

The `ltree` path of each node gives the three walks of `graph.traversal`. Verified (ran on a four-node tree).

| Walk | Query |
|---|---|
| Path to the root | `path @> <node path>` |
| A node and its descendants | `path <@ <node path>` |
| The siblings | same `parent_id`, other `id` |

## Tests `store.tests`

Tests run on Postgres, with no network. The unit uses an in-process Postgres if one supports `ltree`, or else a local Postgres in CI. Each test uses a schema of its own and drops it after.

## What is open `store.open`

- Whether Mastra's own writes can join our transactions. Not verified.

- The Supabase connection mode. The transaction pooler can break some clients. The harness probably needs the session pooler or a direct connection (inferred).

- The store of Mastra traces.

- `@mastra/pg` 1.33.0 needs `@mastra/core` 1.80. The harness pins core 1.79.0 and pg 1.32.0, until a deliberate upgrade.
