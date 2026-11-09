# The interrogate run of the tool registry spec `tools_interrogate`

Status. Two adversaries, Opus and Sonnet, interrogated the spec [tool-registry.md](../../../design/tool-registry.md) at `7a4ced0` on 2026-11-09. The coordinator ran the key repros again. No repro called a model. The Opus repros drive the real Claude Code 2.1.319 against a fake Messages API on 127.0.0.1. The Sonnet repros use a fake CLI script that records its argv, or an MCP client, or `createMockModel`.

The files keep their probe names. Paths are relative or `<probe-dir>`, `<tmp>`, `<repo>`, and `<home>`. The fake secrets of `sonnet/p4.ts` are `PLACEHOLDER-PW` and `PLACEHOLDER-KEY`. The folder holds no `node_modules`, no lock files, and no request bodies of the fake API.

## Findings `tools_interrogate.findings`

| Finding | Repro | Result | Fix in the spec |
|---|---|---|---|
| A call of `stream` with its own `sdkOptions` ran `bypassPermissions` and Bash. `createStep(agent, { sdkOptions })` uses `stream`. | `opus/probe-stream.ts`, `opus/runs/run5` (the file `pwned` exists) | Reproduced | `tools.locked_agent` |
| `stream`, `resumeGenerate`, and `resumeStream` pass their own `sdkOptions` to the CLI argv | `sonnet/p2.ts`, `sonnet/outputs/p2-*.argv` | Reproduced | `tools.locked_agent` |
| Auto memory loads with `settingSources: []`. `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` stops it. | `opus/probe-cli.ts`, `opus/runs/run6` (memory text sent), `opus/runs/run61` (not sent) | Reproduced | `tools.no_auto_memory` |
| The front door needs the CLI tool `StructuredOutput`. A Zod discriminated union gives a JSON Schema with a root `oneOf`. | `opus/runs/run2`, `run3`, `run4` | Reproduced | `tools.front_door` |
| A wrapper that runs research inside it hides `openWorld`, so the mix rule does not see it | `opus/probe-mix.ts` | Reproduced | `tools.injection` |
| 4 parallel calls of a paid tool with a cap of 1 all ran | `sonnet/p1.ts` with `p1-server.ts` (`MODE=slow`), `sonnet/outputs/p1.out` | Reproduced | `tools.budget` |
| The database password and an API key show in the process list, because the SDK passes `--mcp-config` as JSON on the argv | `sonnet/p4.ts`, `sonnet/outputs/p4.out`, `sonnet/outputs/p2.out` | Reproduced | `tools.secrets_off_argv` |
| `z.record` with an enum key refuses partial toggles | `sonnet/p5.ts`, `sonnet/outputs/p5.out` | Reproduced | `tools.types` |
| The hash does not cover the consumer, and a new tool that is off changes the manifest | `sonnet/p6.mjs`, `sonnet/outputs/p6.out` | Reproduced | `tools.toggles` |
| The result of `generate` has no `num_turns`, `terminal_reason`, or `permission_denials`. `error_max_budget_usd` throws with no fields. | `sonnet/p9.ts`, `sonnet/replay-cli.mjs`, `sonnet/outputs/p9.out` | Reproduced | `tools.run_record` |
| Per-call `toolsets` and `clientTools` give a router agent a tool that is off | `sonnet/p8.ts`, `sonnet/outputs/p8.out` | Reproduced | `tools.consumers` |
| A registry key and the id of its built tool can differ, and the server then runs the other tool | `sonnet/p1.ts` (`MODE=mismatch`) | Reproduced | `tools.registry` |

## Checks with no finding `tools_interrogate.held`

| Check | Repro | Result |
|---|---|---|
| The locked options keep out project `.mcp.json` servers, project commands, CLAUDE.md files, hooks, and settings | `sonnet/p3.ts`, `sonnet/outputs/p3.out` against `p3-control.out`, `opus/runs/run1` | Held. Only the `harness` server connected. |
| `dontAsk` denies Bash and a tool of another server | `opus/runs/run1` | Held |
| `web_fetch` blocks 13 forms of a loopback address | `sonnet/p7.ts`, `sonnet/outputs/p7.out` | Held |
| A call of a tool that is off | `sonnet/outputs/p1.out` | Held: `Unknown tool`. A name such as `toString` gives an error, and no tool runs. |
| The server lists no resources and no prompts | `opus/probe-surface.ts`, `sonnet/outputs/p1.out` | Held: `Method not found` |
