# Postgres spike `pg_spike`

Status. Research of 2026-10-29. Rohan asked to try Postgres, because Kyaloon already pays for Supabase. The spike ran on a throwaway local Postgres 18, not on the Kyaloon database, and called no model. The code is [2026-10-29-postgres-spike.ts](2026-10-29-postgres-spike.ts). Versions: `@mastra/core` 1.79.0, `@mastra/pg` 1.32.0, `drizzle-orm` 0.45.4, `pg` 8.23.1.

| Check | Result |
|---|---|
| Mastra storage (`PostgresStore`) on a connection pool that our code makes, in schema `mastra` | Pass |
| A second instance on a new pool reads a stored run back | Pass |
| Our tables through Drizzle on the same pool, in schema `harness` | Pass |
| `ltree`: a node and its descendants, and the path to the root | Pass |
| A verdict row joins with its Mastra run (`mastra.mastra_workflow_snapshot`) | Pass |
| A failed transaction leaves no row | Pass |
| A trigger refuses an update of a verdict row | Pass |

Findings:

- On first start, Mastra made 39 tables in its schema. On a live database this needs a reviewed migration, so the harness uses `disableInit: true` (`store.safety`).

- `@mastra/pg` 1.33.0 needs `@mastra/core` 1.80. Version 1.32.0 works with core 1.79.0.

- The local Postgres had no `pgvector`. Supabase has it. Not tested.
