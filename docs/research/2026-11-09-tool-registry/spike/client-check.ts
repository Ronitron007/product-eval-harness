// No model call. Lists tools over stdio with three toggle sets, flips a toggle at run time over
// HTTP, calls a stale tool, and runs the workflow step that calls execute directly.
import http from 'node:http'
import { MCPClient } from '@mastra/mcp'
import { buildServer } from './server'
import { allowedToolsFor, DEFAULT_TOGGLES, resolveToolsets, togglesFromEnv } from './registry'
import { checkWorkflow } from './workflow'

async function listOverStdio(label: string, harnessTools?: string) {
  const env: Record<string, string> = { MASTRA_TELEMETRY_DISABLED: '1', PATH: process.env.PATH! }
  if (harnessTools) env.HARNESS_TOOLS = harnessTools
  const client = new MCPClient({ id: `stdio-${label}`, servers: { harness: { command: 'npx', args: ['tsx', 'server.ts'], env } } })
  const tools = await client.listTools()
  console.log(`[stdio ${label}] HARNESS_TOOLS=${harnessTools ?? '(unset)'} ->`, Object.keys(tools).sort().join(', '))
  await client.disconnect()
}

await listOverStdio('default')
await listOverStdio('research_off', '{"toolsets":{"research":false}}')
await listOverStdio('paid_and_db_on', '{"allowEffects":["read","paid","db_write"]}')
await listOverStdio('tool_beats_toolset', '{"toolsets":{"graph":false},"tools":{"get_node_context":true}}')

// Run-time flip: one in-process server over streamable HTTP.
const server = buildServer({ HARNESS_TOOLS: '{"allowEffects":["read","paid"]}' })
const httpServer = http.createServer(async (req, res) => {
  await server.startHTTP({ url: new URL(req.url ?? '/', 'http://127.0.0.1:4799'), httpPath: '/mcp', req, res })
})
await new Promise<void>(r => httpServer.listen(4799, '127.0.0.1', r))
const client = new MCPClient({ id: 'http', servers: { harness: { url: new URL('http://127.0.0.1:4799/mcp') } } })
const before = await client.listTools()
console.log('[http before flip]', Object.keys(before).sort().join(', '))
const staleSearch = before['harness_web_search']!
await server.toolActions.remove(['web_search']) // also sends notifications/tools/list_changed
const afterSame = await client.listTools()
console.log('[http after flip, same client]', Object.keys(afterSame).sort().join(', '))
const fresh = new MCPClient({ id: 'http-fresh', servers: { harness: { url: new URL('http://127.0.0.1:4799/mcp') } } })
console.log('[http after flip, fresh client]', Object.keys(await fresh.listTools()).sort().join(', '))
try {
  const r = await staleSearch.execute!({ query: 'spf' }, {} as any)
  console.log('[http stale call of removed tool] result:', JSON.stringify(r).slice(0, 200))
} catch (e) {
  console.log('[http stale call of removed tool] threw:', (e as Error).message.slice(0, 200))
}
const runWf = before['harness_run_check_records']!
console.log('[http run_check_records via MCP]', JSON.stringify(await runWf.execute!({ nodeId: 'sunscreen' }, {} as any)).slice(0, 300))
await client.disconnect()
await fresh.disconnect()
httpServer.close()

// Workflow step calling execute directly, toggle on and off.
const run = await checkWorkflow.createRun()
const ok = await run.start({ inputData: { nodeId: 'sunscreen' } })
console.log('[workflow direct, graph on]', ok.status, JSON.stringify((ok as any).result))
process.env.HARNESS_TOOLS = '{"toolsets":{"graph":false}}'
const run2 = await checkWorkflow.createRun()
const off = await run2.start({ inputData: { nodeId: 'sunscreen' } })
console.log('[workflow direct, graph off]', off.status, String((off as any).error?.message ?? (off as any).error).slice(0, 160))
delete process.env.HARNESS_TOOLS

// The same registry feeds an agent (toolsets at call time) and the claude -p allow-list.
console.log('[agent toolsets]', JSON.stringify(Object.fromEntries(Object.entries(resolveToolsets(DEFAULT_TOGGLES)).map(([k, v]) => [k, Object.keys(v)]))))
console.log('[--allowedTools]', allowedToolsFor('harness', togglesFromEnv({ HARNESS_TOOLS: '{"toolsets":{"research":false}}' }), ['check_records']).join(','))
process.exit(0)
