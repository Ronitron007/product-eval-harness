# product-eval-harness: CLAUDE.md

This file is a routing index. The rules of this repo are in `.claude/rulebooks/`. The project hooks in `.claude/settings.json` load them into each session and each subagent.

## Task to required reading

| Area | File |
|---|---|
| The rules for agents, gates, git, docs, names, replies, and writing | `.claude/rulebooks/` (each `.md` file) |
| How the rulebooks load, and how to change them | `.claude/rulebooks/README.md` |
| The harness design, the research, the plan, and the decisions trail | `docs/README.md` (the docs hub) |

## Rules that this file adds

- Keep this file under 40 lines. Put domain content in `docs/`, and link to it from the docs hub.
