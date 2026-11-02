--------------------------- MODULE MigrationApply ---------------------------
(* The apply path of db/migrations/ on a database that can hold objects from before.
   Code:
     db/migrations/0001_harness_tables.sql  schema harness and its tables ("if not exists")
     db/migrations/0002_mastra_schema.sql   schema mastra and its tables ("if not exists")
     db/migrations/0003_harness_role.sql    role harness_app, grants, row level security,
                                            revokes, and the guard (its last block)
     tests/db.ts                            applyMigrations(): each file in its own transaction
     db/README.md                           RealDose copies the three files into one migration
   The model abstracts the database to the facts that store.safety names. The transitions come
   from runs on a real Postgres 18. formal/sql/migration-sweep.check.ts compares the end state
   of each pre-state and mode, which TLC dumps, with the real database.
   A file is one transaction. With Mode = "one_tx", the three files are one transaction. *)
EXTENDS Naturals

Roles == {"absent", "plain", "system_attr", "member_of_role", "anon_member", "outside_grant"}
\* harness_app before the migration: absent, with no extra right, with a system attribute
\* (such as createdb), as a member of another role, with anon as its member, or with a right
\* on a table outside harness and mastra (a Kyaloon table).
Schemas == {"absent", "empty", "owned_by_anon", "anon_owns_table", "default_acl_anon", "table_no_rls"}
\* schema harness before the migration: absent, empty, owned by anon, with a table that anon
\* owns, with a default privilege for anon, or with a table that has no row level security.
Modes == {"one_tx", "per_file"}

VARIABLES
  pre,     \* the database before the migration: [role, schema, supabase]
  mode,    \* how the tool runs the files
  phase,   \* "before", "after_0001", "after_0002", "guard", "committed", "aborted"
  db,      \* the facts of the database now
  saved    \* the facts at the last commit, which an abort returns to
vars == <<pre, mode, phase, db, saved>>

\* The facts that store.safety names, for schemas harness and mastra.
\* defaultAcl: a new table in schema harness opens to PUBLIC or anon, by a default privilege of
\* the database (Supabase) or of the schema. outsideGrant: harness_app has a right on a table
\* outside harness and mastra.
Facts(schemas, noRls, anonRight, anonOwns, anonIsApp, role, attr, memberOf, defaultAcl, outsideGrant) ==
  [schemas |-> schemas, noRls |-> noRls, anonRight |-> anonRight, anonOwns |-> anonOwns,
   anonIsApp |-> anonIsApp, role |-> role, attr |-> attr, memberOf |-> memberOf,
   defaultAcl |-> defaultAcl, outsideGrant |-> outsideGrant]

Before(p) ==
  Facts(p.schema # "absent",
        p.schema = "table_no_rls",
        \/ p.supabase /\ p.schema # "absent"  \* objects made under the default privileges
        \/ p.schema = "owned_by_anon",          \* the owner entries of anon on its schema
        p.schema \in {"owned_by_anon", "anon_owns_table"},
        p.role = "anon_member",
        p.role # "absent",
        p.role = "system_attr",
        p.role = "member_of_role",
        p.supabase \/ p.schema = "default_acl_anon",
        p.role = "outside_grant")

Init ==
  /\ pre \in [role : Roles, schema : Schemas, supabase : BOOLEAN]
  /\ mode \in Modes
  /\ phase = "before"
  /\ db = Before(pre)
  /\ saved = db

\* 0001_harness_tables.sql: makes the schemas, tables and trigger functions that do not exist.
\* A new table has no row level security until 0003. Postgres gives PUBLIC the execute right on
\* each new function, and a default privilege (Supabase, or one in schema harness) gives PUBLIC
\* or anon rights on new tables and schemas. 0003 revokes them.
Apply0001 ==
  /\ phase = "before"
  /\ db' = [db EXCEPT !.schemas = TRUE, !.noRls = TRUE, !.anonRight = TRUE]
  /\ phase' = "after_0001"
  /\ saved' = IF mode = "per_file" THEN db' ELSE saved
  /\ UNCHANGED <<pre, mode>>

\* 0002_mastra_schema.sql: the same for schema mastra.
Apply0002 ==
  /\ phase = "after_0001"
  /\ db' = [db EXCEPT !.noRls = TRUE, !.anonRight = TRUE]
  /\ phase' = "after_0002"
  /\ saved' = IF mode = "per_file" THEN db' ELSE saved
  /\ UNCHANGED <<pre, mode>>

\* 0003_harness_role.sql before its guard: makes harness_app if it does not exist, turns on row
\* level security for the six named harness tables and each mastra table, and revokes each
\* right of PUBLIC, anon and authenticated on the schemas, tables, sequences and functions.
\* It changes no owner, no membership in harness_app, no default privilege, and no right
\* outside harness, mastra and extensions.
Apply0003 ==
  /\ phase = "after_0002"
  /\ db' = [db EXCEPT !.role = TRUE, !.noRls = (pre.schema = "table_no_rls"), !.anonRight = FALSE]
  /\ phase' = "guard"
  /\ UNCHANGED <<pre, mode, saved>>

\* The guard: the last block of 0003_harness_role.sql. It reads the ACL entries, the row level
\* security flag, the system attributes of harness_app, and the roles that harness_app is a
\* member of.
GuardSees == db.noRls \/ db.anonRight \/ db.attr \/ db.memberOf

GuardPasses ==
  /\ phase = "guard"
  /\ ~GuardSees
  /\ phase' = "committed"
  /\ saved' = db
  /\ UNCHANGED <<pre, mode, db>>

GuardStops ==
  /\ phase = "guard"
  /\ GuardSees
  /\ phase' = "aborted"
  /\ db' = saved
  /\ UNCHANGED <<pre, mode, saved>>

\* An end state: the migration committed or stopped.
Done == phase \in {"committed", "aborted"} /\ UNCHANGED vars

Next == Apply0001 \/ Apply0002 \/ Apply0003 \/ GuardPasses \/ GuardStops \/ Done

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* The rules. *)

\* store.safety: after a migration commits, each table has row level security, PUBLIC, anon and
\* authenticated hold no right in harness and mastra, and harness_app has no system attribute,
\* no membership, and no right on a Kyaloon table. The model reads "no right" as what Postgres
\* lets the role do: an owner, or a member of harness_app, can use the objects with no ACL entry.
\* A new table that opens to anon by a default privilege also breaks the rule.
CommittedIsSafe ==
  phase = "committed" =>
    ~db.noRls /\ ~db.anonRight /\ ~db.anonOwns /\ ~db.anonIsApp
    /\ ~db.attr /\ ~db.memberOf /\ ~db.defaultAcl /\ ~db.outsideGrant

\* The guard stops the migration "and rolls it back" (0003_harness_role.sql): a stopped
\* migration leaves the database as it was before.
StopRollsBack ==
  phase = "aborted" => db = Before(pre)

\* What the guard reads, it stops on. A committed migration has none of those facts.
CommittedPassesTheGuard ==
  phase = "committed" => ~GuardSees
=============================================================================
