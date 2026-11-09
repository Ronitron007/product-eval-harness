import { buildToolServer, handlesFromEnvFile, prepareServerProcess, recordedServerSnapshot, toolRunWriter } from '../src/tools'

// The stdio entry of the tool server (tools.consumers in docs/design/tool-registry.md). The CLI of
// each agent run starts its own process. The parent passes the snapshot and its hash, and the path
// of the env file. The secrets stay in that file (tools.secrets_off_argv).
//
//   HARNESS_TOOL_SNAPSHOT='<json>' HARNESS_TOOL_SNAPSHOT_HASH=<hex> HARNESS_ENV_FILE=.env npx tsx scripts/tool-server.ts
//
// With no snapshot, an outside MCP client gets a snapshot from HARNESS_TOOLS, with the consumer
// mcp_client. The server writes its run row before it serves a tool. With no row, it serves read tools only.

const prepared = prepareServerProcess(process.env)
const writer = prepared.fallback ? toolRunWriter(prepared.databaseUrl) : undefined
const snapshot = await recordedServerSnapshot(prepared, writer?.record)
await writer?.close()
const server = buildToolServer(snapshot, handlesFromEnvFile(process.env))
await server.startStdio()
