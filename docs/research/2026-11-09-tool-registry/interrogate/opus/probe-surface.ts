import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
const t = new StdioClientTransport({ command: 'node_modules/.bin/tsx', args: ['server-spec.ts'], env: { PATH: process.env.PATH!, HARNESS_TOOL_SNAPSHOT: '{"on":["get_node_context"]}', SERVER_LOG: '/dev/null' } })
const c = new Client({ name: 'p', version: '0' }); await c.connect(t)
console.log('caps', JSON.stringify(c.getServerCapabilities()))
console.log('tools', (await c.listTools()).tools.map(x => x.name))
for (const [k, f] of [['resources', () => c.listResources()], ['templates', () => c.listResourceTemplates()], ['prompts', () => c.listPrompts()]] as const)
  try { console.log(k, JSON.stringify(await (f as any)())) } catch (e) { console.log(k, 'err', (e as Error).message.slice(0, 80)) }
try { console.log('call off tool', JSON.stringify(await c.callTool({ name: 'save_record', arguments: { text: 'x' } })).slice(0, 120)) } catch (e) { console.log('call off tool threw', (e as Error).message.slice(0, 100)) }
await c.close()
