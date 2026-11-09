#!/bin/bash
# records argv + env names, spawns nothing, exits 1. No model call.
OUT="${FAKE_CLI_OUT:-/tmp/fake-cli.out}"
{ echo "ARGV:"; for a in "$@"; do printf '  [%s]\n' "$a"; done; echo "ENV_KEYS:"; env | cut -d= -f1 | sort | tr '\n' ' '; echo; echo "HOME=$HOME"; echo "ANTHROPIC_API_KEY set: ${ANTHROPIC_API_KEY:+yes}"; echo "CWD=$(pwd)"; } > "$OUT"
exit 1
