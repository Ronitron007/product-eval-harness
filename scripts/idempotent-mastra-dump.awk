# Rewrites the pg_dump output of schema mastra (scripts/pg-dump-mastra.sh) so that a second
# run of it changes nothing. scripts/dump-mastra-schema.sh pipes the dump through this file.
# RealDose test drivers apply each migration twice (docs/practices/db-migrations.md in RealDose).
#   CREATE SCHEMA, TABLE, INDEX        -> ... IF NOT EXISTS
#   CREATE FUNCTION, TRIGGER           -> CREATE OR REPLACE ...
#   ALTER TABLE ONLY t ADD CONSTRAINT  -> a DO block that adds the constraint only when t lacks it
# A CREATE or ADD CONSTRAINT of another form stops the script, so that a new kind of statement
# after a @mastra/pg upgrade gets a rule here before it reaches a migration.
function fail(msg) { print "idempotent-mastra-dump.awk: " msg > "/dev/stderr"; failed = 1; exit 1 }

held != "" {
  if ($0 ~ /^    ADD CONSTRAINT [a-z0-9_]+ .*;$/) {
    split($0, w, " ")
    print "DO $$"
    print "BEGIN"
    print "  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '" table "'::regclass AND conname = '" w[3] "') THEN"
    print "    " held
    print "    " $0
    print "  END IF;"
    print "END"
    print "$$;"
    held = ""
    next
  }
  fail("line " NR ": ALTER TABLE ONLY " table " is not followed by a one-line ADD CONSTRAINT")
}

/^ALTER TABLE ONLY [a-z0-9_.]+$/ { held = $0; table = $4; next }

/^CREATE SCHEMA /               { sub(/^CREATE SCHEMA /, "CREATE SCHEMA IF NOT EXISTS ") }
/^CREATE TABLE /                { sub(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ") }
/^CREATE INDEX /                { sub(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ") }
/^CREATE UNIQUE INDEX /         { sub(/^CREATE UNIQUE INDEX /, "CREATE UNIQUE INDEX IF NOT EXISTS ") }
/^CREATE FUNCTION /             { sub(/^CREATE FUNCTION /, "CREATE OR REPLACE FUNCTION ") }
/^CREATE TRIGGER /              { sub(/^CREATE TRIGGER /, "CREATE OR REPLACE TRIGGER ") }

/^CREATE / && !/^CREATE (SCHEMA IF NOT EXISTS|TABLE IF NOT EXISTS|INDEX IF NOT EXISTS|UNIQUE INDEX IF NOT EXISTS|OR REPLACE FUNCTION|OR REPLACE TRIGGER) / {
  fail("line " NR ": no idempotent form for: " $0)
}
/ADD CONSTRAINT/ { fail("line " NR ": ADD CONSTRAINT outside ALTER TABLE ONLY: " $0) }

{ print }

END { if (!failed && held != "") fail("the dump ends after ALTER TABLE ONLY " table) }
