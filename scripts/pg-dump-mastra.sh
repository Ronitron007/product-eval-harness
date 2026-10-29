#!/usr/bin/env bash
# Prints the schema mastra of the database at the URL in $1, as plain SQL.
# scripts/dump-mastra-schema.sh and tests/store/migrations.test.ts both use it, so the
# committed file and the test compare the same normal form.
# PG_BIN sets the folder of pg_dump. Its major version must be at least the server version.
set -euo pipefail

URL="${1:?Usage: scripts/pg-dump-mastra.sh <postgres URL>}"
# Postgres 18 from Homebrew when present, else the pg_dump on PATH.
if [ -z "${PG_BIN:-}" ]; then
  if [ -x /opt/homebrew/opt/postgresql@18/bin/pg_dump ]; then PG_BIN=/opt/homebrew/opt/postgresql@18/bin
  else PG_BIN="$(dirname "$(command -v pg_dump)")"; fi
fi

# pg_dump 18 adds \restrict and \unrestrict lines with a random key: psql commands, not SQL.
# Its SET lines change the session (search_path to ''), which would leak into later files.
"$PG_BIN/pg_dump" --schema-only --schema=mastra --no-owner --no-privileges "$URL" \
  | grep -v -E '^\\(restrict|unrestrict) ' \
  | grep -v -E '^SET [a-z_]+ = ' \
  | grep -v -E "^SELECT pg_catalog\.set_config\('search_path'" \
  | cat -s
