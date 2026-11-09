import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
async function open(env: Record<string,string>) {
  const t = new StdioClientTransport({ command: 'npx', args: ['tsx', 'p1-server.ts'], env: { PATH: process.env.PATH!, MASTRA_TELEMETRY_DISABLED: '1', ...env }, stderr: 'ignore' })
  const c = new Client({ name: 'probe', version: '0' }, { capabilities: {} })
  await c.connect(t); return c
}
const show = (x: any) => JSON.stringify(x).slice(0, 260)
{
  const c = await open({ MODE: 'plain' }) // default toggles: only get_node_context is on
  console.log('capabilities:', show(c.getServerCapabilities()))
  console.log('tools/list:', (await c.listTools()).tools.map(t => t.name).join(','))
  for (const name of ['save_record', 'web_search', 'toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf', 'get_node_context']) {
    try { console.log(`call ${name}:`, show(await c.callTool({ name, arguments: { nodeId: 'sunscreen' } }))) } catch (e) { console.log(`call ${name}: THREW`, String((e as Error).message).slice(0, 160)) }
  }
  for (const m of ['listResources', 'listPrompts', 'listResourceTemplates'] as const) {
    try { console.log(m, show(await (c as any)[m]())) } catch (e) { console.log(m, 'THREW', String((e as Error).message).slice(0, 120)) }
  }
  await c.close()
}
{
  const c = await open({ MODE: 'mismatch' })
  console.log('[mismatch] tools/list names:', (await c.listTools()).tools.map(t => t.name).join(','))
  for (const name of ['get_node_context', 'save_record']) {
    try { console.log(`[mismatch] call ${name}:`, show(await c.callTool({ name, arguments: {} }))) } catch (e) { console.log(`[mismatch] call ${name}: THREW`, String((e as Error).message).slice(0,120)) }
  }
  await c.close()
}
{
  const c = await open({ MODE: 'slow' })
  const rs = await Promise.all([1,2,3,4].map(() => c.callTool({ name: 'slow_paid', arguments: {} })))
  console.log('[parallel x4, cap 1]', rs.map(r => show((r as any).content[0].text)).join(' | '))
  await c.close()
}
process.exit(0)
