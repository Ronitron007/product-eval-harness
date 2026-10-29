-- The database role of the harness (store.safety).
--
-- This file grants the role these rights only:
--   - harness: usage, and select and insert on its tables (no update, delete or truncate);
--   - mastra: usage, and select, insert, update and delete on its tables, and its sequences;
--   - extensions: usage, for the ltree type and operators.
-- The role also holds each right that PUBLIC holds in the database. This file revokes nothing
-- from PUBLIC, because that would change the live database outside the harness schemas.
-- On a default Postgres, PUBLIC can connect, make temporary tables, use schema public, and
-- execute each function that grants execute to PUBLIC, security definer functions too.
-- A security definer function runs with the rights of its owner, so it can give the role rows
-- of a table that the role cannot read. It can also read any table that grants select to PUBLIC.
-- Review db/audit-public-grants.sql on the live database before this migration.
--
-- This file sets no password. After the migration, an operator sets it by hand:
--   alter role harness_app password '<a new secret>';
-- The connection string with that password goes into HARNESS_DATABASE_URL, never into git.

-- A role belongs to the whole cluster, so the file keeps a role that already exists.
do $$
begin
  create role harness_app login noinherit nocreatedb nocreaterole;
-- unique_violation: two sessions that make the role at the same time.
exception when duplicate_object or unique_violation then
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

-- ltree lives in schema extensions (0001_harness_tables.sql). The search path lets the role
-- write the ltree type and operators with no schema name. The setting holds in this database only.
grant usage on schema extensions to harness_app;
do $$
begin
  execute format('alter role harness_app in database %I set search_path = harness, mastra, extensions', current_database());
end
$$;
