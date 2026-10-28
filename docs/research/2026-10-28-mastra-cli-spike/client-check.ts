// Lists and calls the tools of the stdio server with a plain MCP client. No model call.
import { MCPClient } from '@mastra/mcp'
const client = new MCPClient({
  id: 'spike',
  servers: { harness: { command: 'npx', args: ['tsx', 'src/server.ts'] } },
})
const tools = await client.listTools()
console.log('tools:', Object.keys(tools))
const t = tools['harness_get_node_context'] ?? Object.values(tools)[0]
// @ts-ignore spike only
console.log('call get_node_context:', JSON.stringify(await t.execute({ nodeId: 'sunscreen' })))
const w = tools['harness_run_check_records']
// @ts-ignore spike only
if (w) console.log('call run_check_records:', JSON.stringify(await w.execute({ recordIds: [] })))
await client.disconnect()
