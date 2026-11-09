// Spec-shaped stdio server: tools only (no workflows/agents), built once from the snapshot env.
// PaidDoor per spec: counts calls in this process, refuses past maxCallsPerRun (1).
import fs from 'node:fs'
import { MCPServer } from '@mastra/mcp'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
const LOG = process.env.SERVER_LOG!
const log = (m: string) => fs.appendFileSync(LOG, `${Date.now()} pid=${process.pid} ${m}\n`)
log('start')
let paidCalls = 0
const paidDoor = { async call<T>(name: string, fn: () => Promise<T>) { if (paidCalls >= 1) throw new Error(`paid cap: ${name}`); paidCalls++; return fn() } }
const all = {
  get_node_context: createTool({ id: 'get_node_context', description: 'read', inputSchema: z.object({ nodeId: z.string() }), outputSchema: z.object({ path: z.array(z.string()) }),
    execute: async ({ nodeId }) => { log(`call get_node_context ${nodeId}`); return { path: ['skincare', nodeId] } } }),
  save_record: createTool({ id: 'save_record', description: 'db_write', inputSchema: z.object({ text: z.string() }), outputSchema: z.object({ recordId: z.string() }),
    execute: async ({ text }) => { log(`call save_record WRITE ${text}`); return { recordId: 'rec_1' } } }),
  web_search: createTool({ id: 'web_search', description: 'paid', inputSchema: z.object({ query: z.string() }), outputSchema: z.object({ hits: z.array(z.string()) }),
    execute: async ({ query }) => paidDoor.call('web_search', async () => { log(`call web_search begin ${query}`); await new Promise(r => setTimeout(r, 800)); log(`call web_search end ${query}`); return { hits: [query] } }) }),
}
const on: string[] = JSON.parse(process.env.HARNESS_TOOL_SNAPSHOT!).on
const tools = Object.fromEntries(Object.entries(all).filter(([k]) => on.includes(k)))
const server = new MCPServer({ id: 'harness', name: 'harness', version: '0.0.0', tools })
await server.startStdio()
