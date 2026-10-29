-- The database role of the harness (store.safety). It can use the schemas harness and mastra only.
-- It gets no right on any other schema, so it cannot read or change a Kyaloon table.
--
-- This file sets no password. After the migration, an operator sets it by hand:
--   alter role harness_app password '<a new secret>';
-- The connection string with that password goes into HARNESS_DATABASE_URL, never into git.

-- A role belongs to the whole cluster, so the file keeps a role that already exists.
do $$
begin
  create role harness_app login noinherit nocreatedb nocreaterole;
exception when duplicate_object then
  null;
end
$$;

-- harness: the graph tables only grow, so the role can read and insert, never update or delete.
grant usage on schema harness to harness_app;
grant select, insert on all tables in schema harness to harness_app;
alter default privileges in schema harness grant select, insert on tables to harness_app;

-- mastra: Mastra updates and deletes its own rows, such as workflow snapshots.
grant usage on schema mastra to harness_app;
grant select, insert, update, delete on all tables in schema mastra to harness_app;
grant usage, select on all sequences in schema mastra to harness_app;
alter default privileges in schema mastra grant select, insert, update, delete on tables to harness_app;
alter default privileges in schema mastra grant usage, select on sequences to harness_app;

-- The role needs the ltree type and its operators for the path column. Grant usage on the
-- schema that holds the extension (public on a plain Postgres, often extensions on Supabase).
do $$
declare
  ltree_schema text;
begin
  select n.nspname into strict ltree_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'ltree';
  execute format('grant usage on schema %I to harness_app', ltree_schema);
end
$$;
