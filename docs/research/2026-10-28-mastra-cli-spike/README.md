# Mastra with the Claude CLI and the Cursor CLI `cli_spike`

Status. Research of 2026-10-28. Rohan asked if Mastra fits a harness whose models run mostly through the Claude CLI, and if Mastra tools work with the Claude CLI and the Cursor CLI. This folder holds the spike code. Versions: `@mastra/core` 1.79.0, `@mastra/claude` 0.3.3, `@mastra/cursor` 0.3.3, `@mastra/mcp` 2.5.0 and 1.18.0, Claude Code 2.1.312, Cursor CLI 2026.10.22.

## Findings `cli_spike.findings`

| Question | Answer | Evidence |
|---|---|---|
| Can a Mastra agent run on the Claude CLI? | Yes. `ClaudeSDKAgent` (`@mastra/claude`) wraps the Claude Agent SDK. The Claude Code runtime keeps its own agent loop. | Verified (ran `smoke.ts`, one Haiku run on Rohan's yes, $0.0137 by the SDK estimate) |
| Does it run on the CLI login, with no API key? | Yes, with `pathToClaudeCodeExecutable` set to the installed `claude` binary. | Verified (ran with no `ANTHROPIC_API_KEY` in the environment) |
| Does `structuredOutput` work? | Yes. `result.object` was `{"path":["skincare","sunscreen"]}`. | Verified (ran) |
| Can a Mastra agent run on the Cursor CLI? | `CursorSDKAgent` (`@mastra/cursor`) type-checks. It has no `structuredOutput`, and its docs ask for a `CURSOR_API_KEY`. | Verified (type-checked, read the docs). Not run. |
| Can `ClaudeSDKAgent` take Mastra tools directly? | No. The vendor runtime owns the loop, so tools reach it through MCP. | Verified (read `docs-connections-sdk-agents`) |
| Can one Mastra MCP server serve our tools and workflows? | Yes. `MCPServer` served `get_node_context` and the workflow `check_records` as `run_check_records`. | Verified (ran `client-check.ts`) |
| Does the Claude CLI connect to that server? | Yes, with `@mastra/mcp` 2.5.0 and with 1.18.0. | Verified (ran `claude mcp list`: `✔ Connected`) |
| Does the Cursor CLI connect to that server? | Only with `@mastra/mcp` 1.18.0. Version 2.x serves only MCP 2026-07-28, and the Cursor CLI asks for 2025-11-25. | Verified (ran `cursor-agent mcp list-tools`: an error on 2.5.0, two tools on 1.18.0) |

## Traps `cli_spike.traps`

- The Claude Agent SDK needs its native binary. A copied `node_modules` lost it. Set `pathToClaudeCodeExecutable` to the installed CLI.

- The smoke run read 231,092 input tokens, of which 173,080 came from the cache. The CLI loads its full context. Each harness run must isolate the settings of the CLI, for example with `settingSources: []`, and pass only the rules in scope.

- `result.toolCalls` was empty for the SDK run, although the tool ran. Tool activity of an SDK run must come from the traces.

## What this changes `cli_spike.changes`

- The Claude CLI is the default runtime of each stage agent, through `ClaudeSDKAgent`.

- The harness tools live on one MCP server, on `@mastra/mcp` 1.18.0, until the Cursor CLI speaks MCP 2026-07-28.

- The repair loop stays in the workflow, because the CLI runs its own agent loop (`mastra.stage_workflow`).
