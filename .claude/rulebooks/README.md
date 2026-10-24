# Harness rulebooks

This folder holds the rulebooks for agent sessions in this repo. Each topic has one file. The rulebooks start as a copy of the Kyaloon rulebooks (kyaloonAI `.claude/rulebooks/`, `staging` at `d9810206`, 2026-10-24), with changes and additions for the harness.

## What changed from the Kyaloon copy `rulebooks.origin`

| File | Change |
|---|---|
| `agents.md`, `writing.md` | Copied without change. |
| `gates.md` | Harness stage runs count as paid runs. Rule promotion counts as a live change. Posts to outside services need a yes. Research records count as expensive outputs. This copy drops the RealDose eval-runner rule, and the Kyaloon list of live changes (migration, flag, eval runner, eval rules). |
| `git-prs.md` | `main` is the integration branch. This copy adds the docs-PR rule, the public-repo rule, and the rule to merge by a fast-forward push. It drops the Kyaloon CI noise, and the line that overrides a fixed `rohan/` prefix of a repo CLAUDE.md, because this repo has none. |
| `replies.md` | Boards live in this repo, in `docs/canvas/`. |
| `product.md` | It describes the harness, and Kyaloon as its planned first user. It drops the Kyaloon product vision and its rule "describe Kyaloon by this vision". This repo is public and describes only what its code does. |
| `documentation.md` | Docs live in this repo. This copy drops the RealDose doc tools and the log doc kind. It keeps one decisions trail for the repo, `docs/decisions.tsv`, in place of one trail for each design. It adds links pinned to a commit SHA, and `AGENTS.md` as a routing index. |
| `harness.md` | New. The design rules of the harness. |
| `naming.md` | The examples use harness names, and the name map is `harness.names`. It drops the RealDose name map. |
| `mastra.md` | New. The rules for Mastra code. |
| `architecture.md`, `live-systems.md` | Not copied. They describe Kyaloon chat systems and the Kyaloon database, which this repo does not use. |

## How the rulebooks load `rulebooks.load`

- `.claude/settings.json` in this repo runs `session-start.sh` at two events: SessionStart and SubagentStart. Claude Code runs project hooks only in a folder that you trust. A `-p` or SDK session treats each folder as trusted.

- Each event has one hook for each part of the rulebooks. Each part stays below the context limit of one hook (see `rulebooks.change`).

- The SessionStart hook gives the rulebooks to the main session. The SubagentStart hook gives them to each subagent. A subagent does not get the context of the SessionStart hook.

- Agents that do not run Claude Code read `AGENTS.md`. It tells them to read each file in this folder.

## Make sure that the setup works `rulebooks.check`

1. Run the script from the repo root:

   ```bash
   printf '{"hook_event_name":"SessionStart"}' | sh .claude/rulebooks/session-start.sh --part 1 | head -c 60
   ```

2. Make sure that the output starts with `{"hookSpecificOutput"`.

3. Start a new Claude Code session in this repo. Ask this question: "Which headings that contain `rules.` are in your context?"

4. Make sure that the answer gives each rulebook heading.

## Change a rulebook `rulebooks.change`

- Edit the files in this folder on a branch. Open the PR against `main`. A rulebook change is a code change, not a docs change.

- Keep each file short. Each line loads into each session and each subagent.

- To add a topic, add a new `.md` file to this folder. Start it with a heading that has a backticked `rules.` name. The script loads each `.md` file except this README.

- Do not add frontmatter. The script prints each file as text. It removes blank lines and ASCII control characters other than tabs. It removes or replaces bytes that are not valid UTF-8. It puts one blank line between files.

- Claude Code keeps a maximum of 10,000 characters of context from one hook. If the output is longer, it keeps only a preview of 2,000 characters. The script fills the parts in file-name order and keeps each part below the limit.

- Before you commit, run `sh .claude/rulebooks/session-start.sh --check`. It fails if a part is too long, or if the rulebooks need more parts than the setup has. The `rulebooks` CI job runs the same check.

- If the rulebooks need one more part, increase `parts` in the script. Then add a hook for the new part to each event in `.claude/settings.json`.

## Limits `rulebooks.limits`

- Cloud sessions get the rulebooks only if they run the project hooks of this repo.

- The hooks run the script of the branch that you checked out. A session on the branch of an outside PR runs the script of that PR. Read the changes of a PR to `.claude/` before you start a session on its branch.

- The script needs `sh`, `grep`, `sed`, `iconv`, `tr`, and `awk`. Nobody tested it on Windows.
