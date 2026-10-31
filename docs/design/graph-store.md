# The graph store `store`

Status. Spec of 2026-10-29 for `plan.graph_store`. The code shipped on 2026-10-30 in [#12](https://github.com/Ronitron007/product-eval-harness/pull/12): `src/store/`, `db/migrations/`, and `db/README.md`. Rohan ruled on 2026-10-29 that the authoring database is the Kyaloon Supabase Postgres database ([decisions.tsv](../decisions.tsv)). A spike on a local Postgres 18 verified the parts below ([the spike](../research/2026-10-29-postgres-spike.md)). Terms are in [glossary.md](../glossary.md).

On 2026-10-31, [#14](https://github.com/Ronitron007/product-eval-harness/pull/14) made the migrations safe for the live database (`store.safety`). Nobody applied them to the Kyaloon database yet. They wait for [Ronitron007/RealDose#470](https://github.com/Ronitron007/RealDose/pull/470).

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

2. **Each migration lives in RealDose.** The migration files go into RealDose `supabase/migrations/`, like each other Kyaloon migration. Rohan runs `supabase db push` after a dry run. Claude writes the files and never applies them. [Ronitron007/RealDose#470](https://github.com/Ronitron007/RealDose/pull/470) copies the three files verbatim into `20261031103326_harness_graph_store.sql`. It also adds an audit file in `supabase/proofs/`, the test driver `api/tests/db/harness-graph-store.sh`, and a mirror in `api/src/db/schema.sql`. The PR is open and not applied. Rohan applies it.

3. **The harness has its own database role, `harness_app`.** It has rights on the schemas `harness` and `mastra`, and usage on `extensions`. It has no right on a Kyaloon table. The migration does not give the role a system attribute or a membership in another role.

4. **Row level security is on for each table.** Each of the 45 tables in `harness` and `mastra` has a policy for `harness_app`. In `harness`, the policies let the role read and insert. In `mastra`, a policy lets the role use all rows. The table owner bypasses row level security. Verified (the tests of #14).

5. **No other role reaches our schemas.** `0003_harness_role.sql` revokes each right on the tables, sequences, and functions in `harness` and `mastra` from `PUBLIC`. It also runs `revoke all on schema harness, mastra from public`. It revokes the same rights from `anon` and `authenticated` when those Supabase roles exist. The trigger functions have an empty search path and no execute right for `PUBLIC`. A trigger fires with no check of that right. Verified (the tests of #14).

6. **The migration revokes nothing from `PUBLIC` outside our two schemas.** That change would alter the rest of the Kyaloon database. So `harness_app` still holds each right that Postgres gives to `PUBLIC` elsewhere. Examples are the execute right on a public function and the right to make temporary tables. A security definer function can give the role rows of another table. Rohan reviews the report of `db/audit-public-grants.sql` before the migration.

7. **A second run changes nothing.** Each migration is idempotent. Each statement uses "if not exists" or "or replace". A role that exists stays. `scripts/idempotent-mastra-dump.awk` rewrites the Mastra dump in the same way. Verified (a second apply gives the same `pg_dump`, in the tests of #14).

8. **A guard stops a bad migration.** The last block of `0003_harness_role.sql` stops the migration and rolls it back in these cases:

   - A table in `harness` or `mastra` has no row level security.

   - `PUBLIC`, `anon`, or `authenticated` holds a right on a schema, table, sequence, or function in `harness` or `mastra`.

   - `harness_app` has a system attribute: superuser, bypassrls, createrole, createdb, or replication.

   - `harness_app` is a member of a role.

9. **A read-only pre-check runs first.** The first result of `db/audit-public-grants.sql` lists the schemas `harness` and `mastra` and the role `harness_app`, if they exist. On a database that never had the migration, it must return zero rows. A row means that an object exists already, and the migration keeps it. Review that object before the apply. The second result is the report of the rights of `PUBLIC`.

10. **Rows only grow.** Database triggers refuse each update, delete, and truncate of outputs, verdicts, records, stage runs, and derived rules. The role has no update or delete right on any harness table. A trigger also refuses a node whose path does not agree with its parent, and a child under a leaf. Verified (the tests of #12).

11. **No credential in this repo.** The connection string comes from `HARNESS_DATABASE_URL` in the environment.

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
