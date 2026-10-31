# Database migrations

This folder holds the SQL migrations of the graph store (`store` in [docs/design/graph-store.md](../docs/design/graph-store.md)).

Do not apply these files to a remote database from this repo. Copy them into the RealDose repo as one Supabase migration. The files meet the migration rules of RealDose (`docs/practices/db-migrations.md` in RealDose), and the tests check them. Rohan applies that migration with `supabase db push`, after a dry run. The tests apply the files only to a throwaway local Postgres.

## The files

Apply the files in the order of their names:

- `0001_harness_tables.sql` makes the schema `extensions` and the `ltree` extension in it, if the database does not have them. It also makes the schema `harness`, the graph tables, the node path trigger, and the append-only triggers.

- `0002_mastra_schema.sql` makes the schema `mastra` with the tables of Mastra storage. It is a generated file. Do not edit it by hand.

- `0003_harness_role.sql` makes the role `harness_app`. The file grants the role rights on the schemas `harness`, `mastra`, and `extensions` only. The role also holds each right of PUBLIC. The header of the file lists these rights.

- `0003_harness_role.sql` also turns on row level security for each table in `harness` and `mastra`, with a policy for `harness_app`. It revokes each right in `harness` and `mastra` from PUBLIC, and from `anon` and `authenticated` when they exist. Its last block stops the migration when one of these rights remains, or when a table has no row level security. It also stops the migration when `harness_app` has a system attribute or a membership in a role.

- A second run of each file changes nothing. The RealDose test drivers apply each migration twice.

- `audit-public-grants.sql` is not a migration. It is read-only. Its first result is a pre-check, which must give no row on a database that has never had the migration. Its second result is a report of the rights of PUBLIC.

## Make the Mastra schema again

After each upgrade of `@mastra/pg`, run this command:

```bash
scripts/dump-mastra-schema.sh
```

The script starts a throwaway local Postgres. It runs `storage.init()` of `PostgresStore` once, in the schema `mastra`. Then `scripts/pg-dump-mastra.sh` dumps that schema, `scripts/idempotent-mastra-dump.awk` makes each statement safe to run twice, and the script writes `0002_mastra_schema.sql` and stops the server. The awk script stops on a statement that it has no rule for. A test compares the full dump of a migrated database with the dump of `init()`. The test fails when the file and the installed `@mastra/pg` do not agree.

## Before you copy the files into RealDose

- The migration sets no password for `harness_app`. After the migration, set the password by hand with `alter role harness_app password '...'`. Put the connection string in `HARNESS_DATABASE_URL`, never in git.

- Run `audit-public-grants.sql` on the live database, and review its rows. The role `harness_app` gets each right in the report. The migration revokes nothing from PUBLIC outside `harness` and `mastra`, because that would change the rest of the database. Look especially at each security definer function, because it can give the role rows of other tables.

- Keep `with schema extensions` in the RealDose copy. Supabase keeps its extensions in the schema `extensions`. If `ltree` exists in another schema, `0001_harness_tables.sql` stops with an error.

- `0003_harness_role.sql` sets the search path of `harness_app` to `harness, mastra, extensions`, in this database only.

- Copy the three files, in this order, into one RealDose migration with a Supabase timestamp name.
