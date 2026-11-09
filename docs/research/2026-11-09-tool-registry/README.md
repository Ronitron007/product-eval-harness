# Tools for claude -p and one tool registry `tools_research`

Research of 2026-11-09 for Rohan's goal: run the agent with `claude -p`, learn how tool access works, and design one tool registry with switchable toggles that every agent and workflow uses. No model call was made. No file of the global Claude config changed. Its md5 was the same before and after the CLI checks.

Versions: Claude Code 2.1.319 (verified, ran `claude --version`). Spike pins: `@mastra/core` 1.79.0, `@mastra/mcp` 1.18.0, `@mastra/claude` 0.3.3 (pulls `@anthropic-ai/claude-agent-sdk` 0.3.319), `@modelcontextprotocol/sdk` 1.32.2, zod 4.6.7 (verified, ran `npm ls`). Harness `main` at `a73b49e` (verified, ran `git log`).

Spike code: `spike/` beside this file. Run `npm install`, then `npx tsx client-check.ts` in it. The folder holds no `node_modules`, no lock file, and no CLI config.

Status. Copied into the repo on 2026-11-09 from the session scratchpad, with personal paths removed. The spec that builds on it is [tool-registry.md](../../design/tool-registry.md). The paid probe ran on Rohan's yes. Its result is `tools_research.probes.fence_result`.

| File | What it holds |
|---|---|
| `spike/registry.ts` | Three dummy tools, the toggles, and the resolvers |
| `spike/server.ts` | The stdio MCP server, built from the toggles once at start |
| `spike/workflow.ts` | A workflow step that calls a tool through `toolFor` |
| `spike/client-check.ts` | The checks with no model call: lists, the flip over HTTP, the stale call, the workflow step |
| `spike/package.json` | The packages of the spike. `npm install` resolves the versions above. |
| `interrogate/` | The repros of the interrogate run of the spec, with their outputs ([interrogate/README.md](interrogate/README.md)) |
| `fence-2.ndjson` | The stream of the paid probe, cut down. It has no uuids, no session ids, no message or request ids, no paths, no thinking text, and no rate-limit event. The tool use ids are `toolu_A` and `toolu_B`. |

## The CLI flags `tools_research.flags`

All rows verified (ran `claude --help`, 2.1.319), except where the row says otherwise.

| Flag | Exists | What it does for us |
|---|---|---|
| `-p` / `--print` | yes | Non-interactive. Skips the workspace trust dialog. Settings files that fail validation are silently ignored. |
| `--mcp-config <files or json...>` | yes | Loads MCP servers for this session. |
| `--strict-mcp-config` | yes | Only the servers of `--mcp-config`. User, project and plugin servers are ignored. |
| `--allowedTools` | yes | Tools that run with no permission prompt. NOT a restriction: the Agent SDK doc says "To restrict which tools are available, use the `tools` option instead" (verified, read `sdk.d.ts`). |
| `--disallowedTools` | yes | Removes tools from the model context. Takes rule syntax (`Bash(git *)`). |
| `--tools <list>` | yes | The base set of BUILT-IN tools. `""` disables all built-ins. It does not filter MCP tools (verified, read `sdk.d.ts` `tools` option). |
| `--permission-mode` | yes | `acceptEdits, auto, bypassPermissions, manual, dontAsk, plan`. `dontAsk` denies each tool that is not pre-approved. When omitted, the mode can default to `auto`, a model classifier (verified, read `sdk.d.ts` `permissionMode`). |
| `--permission-prompts host|none` | yes | `none` auto-denies anything that would prompt in `-p`. |
| `--setting-sources` | yes | Which of user, project, local to load. SDK `settingSources: []` loads none, and no CLAUDE.md without `project` (verified, read `sdk.d.ts`). |
| `--settings <json>` | yes | Extra settings, e.g. `{"disableAllHooks":true}` as RealDose passes. |
| `--bare` | yes | Skips hooks, LSP, plugins, auto-memory, CLAUDE.md discovery. Auth is ONLY `ANTHROPIC_API_KEY` or `apiKeyHelper`. OAuth and keychain are never read, so the CLI login does not work under `--bare`. |
| `--output-format stream-json` | yes | Needs `--verbose`. One NDJSON event per line. |
| `--max-turns` | yes, hidden | Not in `--help`, present in the binary: "Maximum number of agentic turns in non-interactive mode" (verified, read the 2.1.319 binary strings). |
| `--max-budget-usd` | yes | Stops a `-p` run at a dollar cap. SDK result `error_max_budget_usd`. |
| `--model`, `--fallback-model`, `--effort` | yes | Model alias or full id. |
| `--append-system-prompt`, `--system-prompt` | yes | `--system-prompt` replaces the default prompt. |
| `--json-schema <schema>` | yes | Structured output validation, `-p` only. |
| `--no-session-persistence` | yes | No session saved to disk. |
| `--disable-slash-commands` | yes | All skills and commands off. |
| `--restricted` | yes | Removes code-running built-ins and WebFetch unless `--tools` names them, ignores user, project and local settings, refuses `bypassPermissions`. Add `--strict-mcp-config` to skip MCP servers too. |

## Three ways to run the agent `tools_research.runners`

| Way | Tools reach it by | Fits? | Why |
|---|---|---|---|
| Bare `claude -p` subprocess (RealDose `callClaude`) | `--mcp-config` file | For probes and ops scripts only | We own the spawn, the stream-json parse, the log, the retry, and the cost meter. RealDose built all of it in `pipeline/src/claude.ts`. RealDose passes `--dangerously-skip-permissions`, so its `allowedTools` is no fence (verified, read `claude-subprocess.md` on `origin/staging`). |
| Claude Agent SDK `query()` | `mcpServers` option, or in-process `createSdkMcpServer` | Underneath the next row | Same CLI binary. Typed options for every flag above, plus `canUseTool`, `hooks`, `maxBudgetUsd`, `persistSession`, `outputFormat` (verified, read `sdk.d.ts`). |
| Mastra `ClaudeSDKAgent` (`@mastra/claude` 0.3.3) | `sdkOptions.mcpServers` | **Recommended** | `ClaudeSDKOptions` IS the Agent SDK `Options` type, passed through (verified, read `@mastra/claude/dist/index.d.ts`). It adds Mastra `generate`, `structuredOutput` (Zod to JSON Schema, then validate), a cost estimate from `total_cost_usd`, and runs as a workflow step. Rohan ruled this runtime on 2026-10-28 (`docs/decisions.tsv`). It runs on the CLI login with `pathToClaudeCodeExecutable` (verified in the 2026-10-28 spike). |

The recommended `sdkOptions` for each stage or front-door run (inferred from the flags, and the paid probe `tools_research.probes.fence` verifies the fence):

```ts
sdkOptions: {
  model, maxTurns, maxBudgetUsd,                // a cap for each run, from the cost ledger
  pathToClaudeCodeExecutable: CLAUDE_CLI_PATH,  // CLI login, no API key
  settingSources: [], strictMcpConfig: true,    // no user CLAUDE.md, hooks, plugins or MCP servers
  tools: [],                                    // no built-in tools; WebFetch etc. only through our registry
  mcpServers: { harness: { type: 'stdio', command, args, env: { HARNESS_TOOLS: snapshot, ... } } },
  allowedTools: allowedToolsFor('harness', toggles, workflowKeys),
  permissionMode: 'dontAsk',                    // anything not in allowedTools is denied, not classified
  persistSession: false,
  systemPrompt: stagePrompt,                    // replaces the 231K-token default context (2026-10-28 trap)
  env: { PATH, HOME, ... },                     // explicit: the SDK env REPLACES process.env
}
```

## How tools reach the agent `tools_research.tool_path`

- Claude Code names an MCP tool `mcp__<server>__<tool>` (verified, read the template ``mcp__${serverName}__${toolName}`` in the 2.1.319 binary). The `--allowedTools` list uses that name.

- `MCPServer` turns `tools` into tools of the same id, `workflows` into `run_<key>`, and `agents` into `ask_<key>` (verified, read `@mastra/core/dist/mcp/types.d.ts`, and ran: `run_check_records` listed).

- `MCPClient.listTools()` names a tool `<server>_<tool>`, e.g. `harness_get_node_context`. `listToolsets()` groups by server (verified, ran `client-check.ts`).

- The host env holds `CLAUDE_AGENT_SDK_MCP_NO_PREFIX` (verified, ran `env`). In the binary, the code that reads it checks for servers of type `sdk` (verified, read the 2.1.319 binary strings). Inferred: it drops the `mcp__` prefix for in-process `sdk` servers only, not for our stdio server. Still pass an explicit `env` to every spawn, so a host variable never changes tool names.

- `--strict-mcp-config` plus one `--mcp-config` server gives the agent our server only. `--tools ""` removes built-ins. `dontAsk` plus `--allowedTools` denies every MCP tool that is not on the list. Inferred from the docs. Not run.

### Filtering in `MCPServer` 1.18.0 `tools_research.server_filter`

| Way | Scope | Evidence |
|---|---|---|
| Build the `tools` map from the toggles before `new MCPServer` | One server instance. One stdio process for each `claude -p`, so one snapshot for each run | Verified (ran: four env toggle sets gave four lists) |
| `server.toolActions.remove([...])` / `.add({...})` at run time | Global to the instance. Sends `notifications/tools/list_changed` | Verified (ran: the same client's next `listTools` lost `web_search`, and a stale call got `Unknown tool: web_search`) |
| FGA (`fga`, `mapAuthInfoToUser`) | Per user, on `tools/list` and `tools/call` | Read only. Needs a Mastra server FGA provider from `@mastra/core/auth/ee`, which is under the separate `ee/LICENSE`, not Apache-2.0 (verified, read `core/LICENSE.md` and `mcp/dist/index.js` `getAuthorizedConvertedToolEntries`). Rejected for now. |
| Per HTTP connection or session | None built in, other than FGA | Verified (read the `tools/list` handler: it lists `this.convertedTools`, filtered only by FGA) |

`tools/call` on a tool that is not in the map returns `Unknown tool` (verified, ran). So the server refuses both list and call for an off tool when the map is built from the toggles.

## The registry and its toggles `tools_research.registry`

```ts
type Effect = 'read' | 'paid' | 'db_write'
interface ToolEntry { toolset: string; effects: readonly Effect[]; tool: Tool }   // tool = createTool(...) with Zod schemas
const REGISTRY = { get_node_context: {...}, save_record: {...}, web_search: {...} } satisfies Record<string, ToolEntry>
interface Toggles { toolsets: Record<string, boolean>; tools: Partial<Record<ToolId, boolean>>; allowEffects: readonly Effect[] }
isOn(id, t)            = (t.tools[id] ?? t.toolsets[entry.toolset] ?? false) && entry.effects ⊆ t.allowEffects
resolveTools(t)        → Record<ToolId, Tool>            // MCPServer `tools`, Agent `tools`
resolveToolsets(t)     → Record<toolset, Record<ToolId, Tool>>   // Agent generate({ toolsets })
allowedToolsFor(s, t)  → `mcp__${s}__${id}`[]           // the second fence for claude -p
toolFor(id, t)         → Tool, or throws "off"           // workflow steps call execute through this
togglesFromEnv(env)    → Toggles from HARNESS_TOOLS JSON, strict Zod, unknown tool id throws
```

- Default: every toolset on, effects `['read']` only. A paid or db_write tool stays off until a run names its effect. A tool switch wins over its toolset switch (verified, ran `tool_beats_toolset`).

- Effect labels also map to MCP annotations: `read` → `readOnlyHint: true`, `db_write` → `readOnlyHint: false`, web tools → `openWorldHint: true` (verified, `createTool({ mcp: { annotations } })` typechecks and the server sends `tool.mcp.annotations` on `tools/list`). The annotations are hints for clients. Our toggle is the enforcement.

- A paid tool also carries its price in the entry (guess for the shape: `costUsd` per call), so `plan.improve_ledger` can count it.

### What enforces a toggle `tools_research.fences`

| Fence | Where | Holds when |
|---|---|---|
| The server never lists or calls an off tool | `MCPServer` built from `resolveTools` | Always, for MCP consumers (verified, ran) |
| `--allowedTools` + `dontAsk` | the CLI | The run does not pass `--dangerously-skip-permissions` or `bypassPermissions` (inferred) |
| `toolFor()` throws | workflow steps | Steps call through the registry, not `REGISTRY[id]` (verified, ran: the step failed with "The tool get_node_context is off") |
| `strictMcpConfig`, `tools: []`, `settingSources: []` | the CLI | No other server or built-in tool reaches the agent (inferred) |

### Finding: workflows bypass the toggles `tools_research.workflow_gap`

`run_check_records` stayed listed in every toggle set, because `MCPServer` takes `workflows` apart from `tools` (verified, ran). With `graph` off it is listed, and fails inside when its step calls `toolFor`. The registry must hold workflows too, with a toolset and effects, and `resolveWorkflows(t)` feeds the `workflows` map. A workflow's effects are the union of the effects of the tools it calls.

The MCP result of `run_check_records` holds the full step trace (`steps`, `startedAt`, `stepExecutionPath`), not only the result (verified, ran). That trace enters the model context. Expose a workflow to the agent through a thin `createTool` that returns only `result`.

## Look Before You Build `tools_research.prior_art`

| Candidate | Verdict | Reason |
|---|---|---|
| Mastra `MCPServer` (1.18.0) | Adopt | Serves tools and workflows, refuses unknown tools, has `toolActions` and list_changed. Already planned (`plan.tool_server`). |
| Mastra Agent `tools` (DynamicArgument) and `toolsets` at call time | Adopt | `tools` may be a function of the request context, `toolsets` is a call option (verified, read `agent.types.d.ts`). Both take `resolveTools`/`resolveToolsets`. |
| Mastra `MCPClient.listToolsets()` | Adopt where an agent uses a remote server | Per-server grouping (verified, ran). |
| Mastra FGA on `MCPServer` | Reject for now | `ee/` license and needs an auth provider. Revisit when users other than Rohan call tools. |
| Mastra `BaseToolProvider` (`allowedToolkits`, `allowedTools`) | Reject | Built for external integrations with OAuth connections (`authorize`, `listConnections`). Our tools are local code. The toolkit plus allow-list shape is the same idea, which we copy. |
| Agent SDK `McpServerToolPolicy` (`always_allow/ask/deny`) | Reject as the toggle | Only on http, sse and sdk server configs, not stdio (verified, read `sdk.d.ts`). It is a permission, not a removal: a denied tool stays in context. |
| Claude Code permission rules (`--allowedTools`, `dontAsk`) | Adopt as the second fence | Claude-only. The Cursor CLI needs its own allow list. |
| OpenFeature `@openfeature/server-sdk` 1.23.0 (Apache-2.0, updated 2026-07) | Not now | A flag SDK with providers (env, flagd). It adds value only when toggles must change without a deploy or per user. Our toggle is one JSON value per run. The `Toggles` type can sit behind an OpenFeature provider later with no change for consumers. |
| `unleash-client` 6.12.2 | Reject | Needs an Unleash server. |
| MCP gateways: `@1mcp/agent` 0.39.8, `mcp-proxy` 6.10.0, `mcp-hub`, MetaMCP | Reject | They aggregate many servers and filter by tag. We own one server, and a proxy adds a hop and its own MCP protocol version, which is the risk that pins us to 1.18.0. |
| RealDose `@kyaloon/shared/jev` single door | Adopt the pattern | One module owns the external client, question names not words, never throws, a cost line per call, and a guard test that fails on any other import (verified, read `origin/staging:packages/shared/src/jev/`). Apply it: each paid tool has one door in the registry, and a guard test fails when code imports a tool file outside the registry. |

## Spike result `tools_research.spike`

Verified (ran `npx tsx client-check.ts` in `spike/`, no model call):

```
[stdio default]             -> harness_get_node_context, harness_run_check_records
[stdio research_off]        -> harness_get_node_context, harness_run_check_records
[stdio paid_and_db_on]      -> harness_get_node_context, harness_run_check_records, harness_save_record, harness_web_search
[stdio tool_beats_toolset]  -> harness_get_node_context, harness_run_check_records
[http before flip]          -> harness_get_node_context, harness_run_check_records, harness_web_search
[http after flip, same client]  -> harness_get_node_context, harness_run_check_records
[http after flip, fresh client] -> harness_get_node_context, harness_run_check_records
[http stale call of removed tool] threw: Unknown tool: web_search
[workflow direct, graph on]  success {"depth":2}
[workflow direct, graph off] failed The tool get_node_context is off (toolset graph, effects read).
[--allowedTools] mcp__harness__get_node_context,mcp__harness__run_check_records
```

CLI check, with `CLAUDE_CONFIG_DIR=spike/.claude-config` so that the global config stays untouched:

- A project `.mcp.json` shows `⏸ Pending approval`, even with `enableAllProjectMcpServers: true` in the folder's `.claude/settings.json` (verified, ran `claude mcp list`). Approval is interactive.

- `claude mcp add-json --scope local harness-local …` into the isolated config dir gives `harness-local: npx tsx …/server.ts - ✔ Connected` (verified, ran `claude mcp list`).

- A no-prompt `claude -p --bare --input-format stream-json` with empty stdin and no credentials emitted no `init` event (verified, ran). The CLI lists tools only after a first message. So the names the model sees are not verified here. See `tools_research.probes`.

## Risks `tools_research.risks`

| Risk | What happens | Guard |
|---|---|---|
| Cost burn | The default CLI context was 231K input tokens in the 2026-10-28 spike. The `auto` mode classifier is a model call of its own (inferred). A loop can call a paid tool many times. | `systemPrompt`, `settingSources: []`, `tools: []`, `maxTurns`, `maxBudgetUsd` on each run. A paid tool counts its calls against a per-run cap in the registry door, and refuses past it. |
| A tool writes to the live database | The Kyaloon database serves staging and production. One `db_write` tool on by default writes prod rows. | `db_write` off by default. A run names it in `allowEffects`. The tool connects as `harness_app`, which only reads and inserts (`docs/decisions.tsv`, 2026-10-31). |
| Prompt injection through tool results | Web text tells the agent to call `save_record` or a paid tool. | A run that reads the web gets no `db_write` tool (the effect allow-list decides it per run). Results are data, as `mastra.research_tools` says. `dontAsk` stops tools outside the list. |
| MCP protocol versions | `@mastra/mcp` 2.x serves only MCP 2026-07-28, and the Cursor CLI asks for 2025-11-25 (2026-10-28 spike). 1.18.0 already pulls `@modelcontextprotocol/server-legacy` 2.0.0, marked deprecated (verified, `npm install` warning). | Pin 1.18.0. A CI test lists tools with both a 1.x and a 2.x client. Re-check the Cursor CLI on each release. |
| Auth and keys | `--bare` refuses the CLI login. The SDK `env` replaces `process.env`, so a missing key fails, and an inherited key leaks into every MCP server. | No `--bare` on the CLI-login path. Pass an explicit `env` to the CLI and to each MCP server, with only the keys of the tools that are on. |
| A toggle flips during a run | Over stdio, the server read its toggles once, so the run keeps its snapshot. Over HTTP, `toolActions.remove` changes the list for every connected client at once. A cached tool then fails with `Unknown tool` (verified, ran). | One stdio server for each run. Record the toggle snapshot and its hash in the run row, as the workflow does for `ruleSetHash`. A resume with another hash refuses. |
| `--dangerously-skip-permissions` | Every permission fence is off. Only the server-side map holds. | Never pass it on harness runs. RealDose passes it (and the box needs `IS_SANDBOX=1` for it as root). |

## The paid probe `tools_research.probes`

`tools_research.probes.fence`, a paid probe. It checks that the agent sees only `mcp__harness__*` tools, that `dontAsk` denies a listed but not allowed tool, and the input tokens with isolation.

- Model: Haiku. Estimated cost: about $0.01 to $0.03 (the 2026-10-28 Haiku smoke run cost $0.0137 with the full CLI context, and this run has less context).

- Command (from `spike/`, with the stdio server listing `get_node_context` and `save_record`):

```bash
cd spike
cat > mcp-fence.json <<EOF
{"mcpServers":{"harness":{"type":"stdio","command":"npx","args":["tsx","$PWD/server.ts"],"env":{"MASTRA_TELEMETRY_DISABLED":"1","PATH":"$PATH","HARNESS_TOOLS":"{\"allowEffects\":[\"read\",\"db_write\"]}"}}}}
EOF
claude -p "Call get_node_context with nodeId sunscreen, then call save_record with text x. Report each tool result or error in one line." \
  --model haiku --output-format stream-json --verbose \
  --strict-mcp-config --mcp-config mcp-fence.json --setting-sources "" --tools "" \
  --allowedTools mcp__harness__get_node_context --permission-mode dontAsk \
  --system-prompt "You are a test agent. Use only the tools you have." \
  --max-turns 4 --max-budget-usd 0.05 --no-session-persistence > fence.ndjson
```

- Pass: the `init` event lists only `mcp__harness__get_node_context`, `mcp__harness__save_record` and `mcp__harness__run_check_records`. `save_record` returns a permission denial. The result event shows `usage` far below 231K input tokens.

### The probe result `tools_research.probes.fence_result`

Rohan gave his yes. The probe ran once on 2026-11-09, with Haiku. It cost $0.00066 by `total_cost_usd`. The stream is [fence-2.ndjson](fence-2.ndjson). Each row is verified (read `fence-2.ndjson`):

| Check | Result |
|---|---|
| The tools in the `init` event | Only `mcp__harness__get_node_context`, `mcp__harness__run_check_records`, and `mcp__harness__save_record`. No built-in tool. |
| The permission mode | `permissionMode` is `dontAsk`. |
| The allowed tool | `get_node_context` ran and returned `{"path":["skincare","sunscreen"]}`. |
| A tool that is listed but not allowed | `save_record` was denied. The `permission_denied` event and the `permission_denials` list of the result name it. |
| The input tokens | 4 plain, 1,873 cache writes, and 1,393 cache reads: about 3.3K in all, against 231K in the 2026-10-28 smoke run. |
| The denial text | The CLI tells the model that it "*may* attempt to accomplish this action using other tools". The model stopped and asked. A model can also try another tool. `tools.one_path` in the spec answers this. |
| The workflow | `run_check_records` was listed, although the run did not allow it. This confirms `tools_research.workflow_gap`. |

Other facts in the `init` event, verified (read `fence-2.ndjson`):

- The CLI still loaded its built-in plugins, and it listed bundled skills and agents. With no built-in tools, the model has no Skill tool and no Agent tool to use them.

- The `init` event named an auto-memory folder. The first text guessed that no memory text loaded. The interrogate run showed that it did load, and that `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` stops it ([interrogate/README.md](interrogate/README.md)).
