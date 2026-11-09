// tools.server: the stdio MCP server. Toggles are read ONCE at start (a snapshot for the run).
// Each `claude -p` spawns its own stdio process, so each run gets its own snapshot.
import { MCPServer } from '@mastra/mcp'
import { checkWorkflow } from './workflow'
import { resolveTools, togglesFromEnv } from './registry'

export function buildServer(env: Record<string, string | undefined>) {
  const toggles = togglesFromEnv(env)
  return new MCPServer({
    id: 'harness',
    name: 'harness',
    version: '0.0.0',
    tools: resolveTools(toggles) as any,
    workflows: { check_records: checkWorkflow },
  })
}

if (process.argv[1]?.endsWith('server.ts')) await buildServer(process.env).startStdio()
