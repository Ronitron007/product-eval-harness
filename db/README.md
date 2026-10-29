# Database migrations

This folder holds the SQL migrations of the graph store (`store` in [docs/design/graph-store.md](../docs/design/graph-store.md)).

Do not apply these files to a remote database from this repo. Copy them into the RealDose repo as one Supabase migration. Rohan applies that migration with `supabase db push`, after a dry run. The tests apply the files only to a throwaway local Postgres.

## The files

Apply the files in the order of their names:

- `0001_harness_tables.sql` makes the `ltree` extension (if the database does not have it), the schema `harness`, the graph tables, and the append-only triggers.

- `0002_mastra_schema.sql` makes the schema `mastra` with the tables of Mastra storage. It is a generated file. Do not edit it by hand.

- `0003_harness_role.sql` makes the role `harness_app`. The role can use the schemas `harness` and `mastra` only.

## Make the Mastra schema again

After each upgrade of `@mastra/pg`, run this command:

```bash
scripts/dump-mastra-schema.sh
```

The script starts a throwaway local Postgres. It runs `storage.init()` of `PostgresStore` once, in the schema `mastra`. Then it dumps that schema with `pg_dump` into `0002_mastra_schema.sql`, and stops the server. A test fails when the file and the installed `@mastra/pg` do not agree.

## Before you copy the files into RealDose

- The migration sets no password for `harness_app`. After the migration, set the password by hand with `alter role harness_app password '...'`. Put the connection string in `HARNESS_DATABASE_URL`, never in git.

- Find the schema of `ltree` on the live database. If `ltree` exists already, `0001_harness_tables.sql` keeps it where it is. `0003_harness_role.sql` grants `harness_app` usage on that schema. The ltree operators must also be in the search path of `harness_app`.

- Give each file a Supabase timestamp name, in the same order.
