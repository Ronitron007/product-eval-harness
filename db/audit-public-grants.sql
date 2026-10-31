-- A read-only report of the rights that PUBLIC holds in this database. The role harness_app
-- holds each of them too (0003_harness_role.sql). Review the report on the live database
-- before the migration. The script changes nothing.

-- The pre-check, the first result. On a database that has never had the harness migration, this query must
-- return zero rows. A row means that schema harness, schema mastra or the role harness_app
-- exists already. The migration keeps an object that exists, so review it before the apply.
select nspname from pg_namespace where nspname in ('harness', 'mastra')
union all
select rolname from pg_roles where rolname = 'harness_app';

-- The report, the second result.
-- The database rights of PUBLIC, such as CONNECT and TEMPORARY.
select 'database' as kind, d.datname as object, a.privilege_type
  from pg_database d, aclexplode(coalesce(d.datacl, acldefault('d', d.datdba))) a
  where d.datname = current_database() and a.grantee = 0
union all
-- The schemas that PUBLIC can use or create objects in.
select 'schema', n.nspname, a.privilege_type
  from pg_namespace n, aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
  where a.grantee = 0 and n.nspname not in ('pg_catalog', 'information_schema') and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp%'
union all
-- The security definer functions that PUBLIC can execute. Each runs with the rights of its owner.
select 'security definer function', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', a.privilege_type
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
       aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where p.prosecdef and a.grantee = 0 and n.nspname not in ('pg_catalog', 'information_schema')
union all
-- The tables, views and sequences that grant a right to PUBLIC.
select 'relation', n.nspname || '.' || c.relname, a.privilege_type
  from pg_class c join pg_namespace n on n.oid = c.relnamespace,
       aclexplode(c.relacl) a
  where a.grantee = 0 and n.nspname not in ('pg_catalog', 'information_schema')
order by 1, 2, 3;
