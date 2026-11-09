import { buildToolServer, handlesFromEnvFile, prepareServerProcess } from '../src/tools'

// The stdio entry of the tool server (tools.consumers in docs/design/tool-registry.md). The CLI of
// each agent run starts its own process. The parent passes the snapshot and its hash, and the path
// of the env file. The secrets stay in that file (tools.secrets_off_argv).
//
//   HARNESS_TOOL_SNAPSHOT='<json>' HARNESS_TOOL_SNAPSHOT_HASH=<hex> HARNESS_ENV_FILE=.env npx tsx scripts/tool-server.ts
//
// With no snapshot, an outside MCP client gets a snapshot from HARNESS_TOOLS, with the consumer mcp_client.

const snapshot = prepareServerProcess(process.env)
const server = buildToolServer(snapshot, handlesFromEnvFile(process.env))
await server.startStdio()
