#!/usr/bin/env bash
# Starts or stops a throwaway local Postgres for the tests. It never touches a remote database.
#
#   scripts/test-db.sh start   # prints HARNESS_TEST_DATABASE_URL=...
#   scripts/test-db.sh stop    # stops the server and deletes its data folder
#
# HARNESS_TEST_DB_DIR sets the data folder. PG_BIN sets the folder of the Postgres binaries.
set -euo pipefail

DIR="${HARNESS_TEST_DB_DIR:-${TMPDIR:-/tmp}/product-eval-harness-test-db}"
DIR="${DIR%/}"
# Postgres 18 from Homebrew when present, else the pg_ctl on PATH.
if [ -z "${PG_BIN:-}" ]; then
  if [ -x /opt/homebrew/opt/postgresql@18/bin/pg_ctl ]; then PG_BIN=/opt/homebrew/opt/postgresql@18/bin
  else PG_BIN="$(dirname "$(command -v pg_ctl)")"; fi
fi
export LC_ALL=en_US.UTF-8

url() { echo "postgresql://postgres@127.0.0.1:$(cat "$DIR/port")/postgres"; }

case "${1:-}" in
  start)
    if [ -f "$DIR/port" ] && "$PG_BIN/pg_ctl" -D "$DIR/data" status >/dev/null 2>&1; then
      echo "HARNESS_TEST_DATABASE_URL=$(url)"; exit 0
    fi
    rm -rf "$DIR"; mkdir -p "$DIR"
    # A free TCP port on 127.0.0.1, chosen by the OS.
    node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})' > "$DIR/port"
    "$PG_BIN/initdb" -D "$DIR/data" -U postgres -A trust -E UTF8 >"$DIR/initdb.log" 2>&1
    "$PG_BIN/pg_ctl" -D "$DIR/data" -l "$DIR/server.log" -w \
      -o "-c port=$(cat "$DIR/port") -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" start >/dev/null
    echo "HARNESS_TEST_DATABASE_URL=$(url)"
    ;;
  stop)
    if [ -d "$DIR/data" ]; then "$PG_BIN/pg_ctl" -D "$DIR/data" -m fast stop >/dev/null; fi
    rm -rf "$DIR"
    ;;
  *) echo "Usage: $0 start|stop" >&2; exit 2 ;;
esac
