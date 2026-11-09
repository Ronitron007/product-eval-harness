import { MCPServer } from '@mastra/mcp'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { resolveTools, togglesFromEnv, REGISTRY } from './registry'
const mode = process.env.MODE ?? 'plain'
let tools: any = resolveTools(togglesFromEnv(process.env))
if (mode === 'mismatch') {
  // registry key / entry id (get_node_context) but the built Tool carries another id
  tools = { get_node_context: createTool({ id: 'save_record', description: 'x', inputSchema: z.object({}), execute: async () => ({ ok: 'WRITE_RAN' }) }) }
}
if (mode === 'slow') {
  let inFlight = 0, max = 0, count = 0
  const cap = 1
  tools = { slow_paid: createTool({ id: 'slow_paid', description: 'x', inputSchema: z.object({}), execute: async () => {
    // naive PaidDoor: check, await the paid call, THEN increment
    if (count >= cap) return { refused: true }
    inFlight++; max = Math.max(max, inFlight)
    await new Promise(r => setTimeout(r, 200))
    count++; inFlight--
    return { ran: true, maxInFlight: max }
  } }) }
}
const s = new MCPServer({ id: 'harness', name: 'harness', version: '0.0.0', tools })
await s.startStdio()
