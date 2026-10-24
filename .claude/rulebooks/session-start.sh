#!/bin/sh
# Project-level SessionStart and SubagentStart hook (see .claude/settings.json).
# It prints the rulebooks beside this script as hook JSON. Copied from the
# Kyaloon rulebooks (kyaloonAI .claude/rulebooks/, staging d9810206), with the
# check of the git remote removed, because a project hook runs only here.
#
#   session-start.sh --part N  hook mode: reads the hook JSON on stdin and
#                              prints part N of the rulebooks
#   session-start.sh --check   exits 1 if a part passes the hook cap, or if
#                              the rulebooks need more parts than the setup has

# Byte mode, so no input can break tr, awk, or wc. A byte count is never
# below the character count that Claude Code measures.
export LC_ALL=C

dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P) || exit 1

# Claude Code caps the context of one hook at 10,000 characters. Past the cap
# it keeps only a 2,000-character preview, so the end of the text never
# arrives. So the rulebooks go out in parts, one hook for each part. The README
# setup has one hook for each of the $parts parts.
cap=10000
parts=2
footer_room=300

count() { wc -m | tr -d ' '; }

topics() {
  for f in "$dir"/*.md; do
    [ -f "$f" ] && [ "$(basename -- "$f")" != README.md ] && printf '%s\n' "$f"
  done
}

no_topics() {
  [ -z "$(topics)" ] || return 1
  echo "session-start.sh: no rulebooks in $dir" >&2
}

# One rulebook as it goes into the context. Drop invalid UTF-8 (the UTF-16
# round trip also drops code points past U+10FFFF), control characters that
# JSON would need escaped, and blank lines.
clean() {
  printf '\n'
  iconv -c -f UTF-8 -t UTF-16LE < "$1" | iconv -c -f UTF-16LE -t UTF-8 |
    tr -d '\000-\010\013-\037\177' | grep -v '^[[:space:]]*$'
}

header() {
  if [ "$1" -eq 1 ]; then
    cat <<'HEADER'
# Harness rulebooks

These rules apply to each agent session in product-eval-harness. "The user" is the person who runs the session. Source: `.claude/rulebooks/` in this repo, changed by PR to `main`. They start as a copy of the Kyaloon rulebooks.
HEADER
  else
    printf '# Harness rulebooks, part %s\n' "$1"
  fi
}

# The footer of a part. Without --part, the hook is an old one-hook setup
# that gets part 1 only, so the footer asks for the new setup.
footer() {
  printf '\nrulebooks-end part %s\n' "$1"
  if [ "$2" = old ] && [ "$(total)" -gt 1 ]; then
    cat <<'NOTE'
This session got part 1 of the rulebooks only. Tell the user to add a hook for each part to `.claude/settings.json`, as `rulebooks.load` in `.claude/rulebooks/README.md` says.
NOTE
  fi
}

# Print "<part> <file>" for each rulebook. Files fill the parts in name order,
# and each part keeps room for its footer.
assign() {
  part=1
  used=$(header 1 | count)
  topics | while IFS= read -r f; do
    size=$(clean "$f" | count)
    if [ $((used + size)) -gt $((cap - footer_room)) ] && [ "$used" -gt "$(header "$part" | count)" ]; then
      part=$((part + 1))
      used=$(header "$part" | count)
    fi
    used=$((used + size))
    printf '%s %s\n' "$part" "$f"
  done
}

total() { assign | tail -n 1 | cut -d ' ' -f 1; }

render() {
  header "$1"
  assign | while IFS=' ' read -r p f; do
    [ "$p" = "$1" ] && clean "$f"
  done
  footer "$1" "$2"
}

if [ "${1-}" = --check ]; then
  no_topics && exit 1
  m=$(total)
  status=0
  i=1
  while [ "$i" -le "$m" ]; do
    n=$(render "$i" old | count)
    echo "part $i: $n of $cap characters"
    [ "$n" -le "$cap" ] || status=1
    i=$((i + 1))
  done
  echo "rulebooks: $(topics | wc -l | tr -d ' ') files in $m parts, the setup has $parts"
  [ "$m" -le "$parts" ] || status=1
  exit "$status"
fi

mode=old
part=1
if [ "${1-}" = --part ]; then
  mode=new
  part=${2-}
fi
case $part in '' | *[!0-9]* | ????*) echo "session-start.sh: bad part: $part" >&2; exit 1 ;; esac
# Drop leading zeros, so that sh does not read the number as octal.
while [ "${part#0}" != "$part" ]; do part=${part#0}; done
part=${part:-0}

input=$(cat)
event=$(printf '%s' "$input" | sed -n 's/.*"hook_event_name"[[:space:]]*:[[:space:]]*"\([A-Za-z]*\)".*/\1/p' | head -n 1)
[ -n "$event" ] || event=SessionStart

no_topics && exit 1
[ "$part" -ge 1 ] && [ "$part" -le "$(total)" ] || exit 0

render "$part" "$mode" | awk -v event="$event" '
  {
    gsub(/\\/, "&&"); gsub(/"/, "\\\""); gsub(/\t/, "\\t")
    body = body $0 "\\n"
  }
  END {
    printf "{\"hookSpecificOutput\":{\"hookEventName\":\"%s\",\"additionalContext\":\"%s\"}}\n", event, body
  }'
