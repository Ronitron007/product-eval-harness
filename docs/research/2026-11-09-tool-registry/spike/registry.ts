// tools.registry: one place that defines every tool, its toolset, its effects, and its toggle.
// All three consumers read resolveTools(): the MCP server, Mastra agents, and workflow steps.
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

export type Effect = 'read' | 'paid' | 'db_write'

export interface ToolEntry {
  toolset: string
  effects: readonly Effect[]
  tool: ReturnType<typeof createTool<any, any, any, any, any, any>>
}

// Three dummy tools in two toolsets. No network, no model, no database.
export const REGISTRY = {
  get_node_context: {
    toolset: 'graph',
    effects: ['read'],
    tool: createTool({
      id: 'get_node_context',
      description: 'Read the path from a node to the root of the category tree.',
      inputSchema: z.object({ nodeId: z.string() }),
      outputSchema: z.object({ path: z.array(z.string()) }),
      mcp: { annotations: { readOnlyHint: true, openWorldHint: false } },
      execute: async ({ nodeId }) => ({ path: nodeId === 'sunscreen' ? ['skincare', 'sunscreen'] : [nodeId] }),
    }),
  },
  save_record: {
    toolset: 'graph',
    effects: ['db_write'],
    tool: createTool({
      id: 'save_record',
      description: 'Save one research record (dummy: returns a fake id).',
      inputSchema: z.object({ text: z.string() }),
      outputSchema: z.object({ recordId: z.string() }),
      mcp: { annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } },
      execute: async ({ text }) => ({ recordId: `rec_${text.length}` }),
    }),
  },
  web_search: {
    toolset: 'research',
    effects: ['read', 'paid'],
    tool: createTool({
      id: 'web_search',
      description: 'Search the web (dummy: returns one fake hit).',
      inputSchema: z.object({ query: z.string() }),
      outputSchema: z.object({ hits: z.array(z.object({ url: z.string(), title: z.string() })) }),
      mcp: { annotations: { readOnlyHint: true, openWorldHint: true } },
      execute: async ({ query }) => ({ hits: [{ url: 'https://example.com', title: `fake hit for ${query}` }] }),
    }),
  },
} as const satisfies Record<string, ToolEntry>

export type ToolId = keyof typeof REGISTRY

// tools.toggles: a toolset switch, a tool switch (wins over its toolset), and an effect allow-list.
// A paid or db_write tool stays off unless its effect is allowed, whatever the switches say.
export interface Toggles {
  toolsets: Record<string, boolean>
  tools: Partial<Record<ToolId, boolean>>
  allowEffects: readonly Effect[]
}

export const DEFAULT_TOGGLES: Toggles = { toolsets: { graph: true, research: true }, tools: {}, allowEffects: ['read'] }

// HARNESS_TOOLS='{"toolsets":{"research":false},"allowEffects":["read","db_write"]}' (merged over the default).
export function togglesFromEnv(env: Record<string, string | undefined>): Toggles {
  const raw = env.HARNESS_TOOLS
  if (!raw) return DEFAULT_TOGGLES
  const parsed = z
    .object({
      toolsets: z.record(z.string(), z.boolean()).optional(),
      tools: z.record(z.string(), z.boolean()).optional(),
      allowEffects: z.array(z.enum(['read', 'paid', 'db_write'])).optional(),
    })
    .strict()
    .parse(JSON.parse(raw))
  const unknownTool = Object.keys(parsed.tools ?? {}).find(id => !(id in REGISTRY))
  if (unknownTool) throw new Error(`HARNESS_TOOLS names an unknown tool: ${unknownTool}`)
  return {
    toolsets: { ...DEFAULT_TOGGLES.toolsets, ...parsed.toolsets },
    tools: parsed.tools ?? {},
    allowEffects: parsed.allowEffects ?? DEFAULT_TOGGLES.allowEffects,
  }
}

export function isOn(id: ToolId, t: Toggles): boolean {
  const e: ToolEntry = REGISTRY[id]
  const switched = t.tools[id] ?? t.toolsets[e.toolset] ?? false
  return switched && e.effects.every(x => t.allowEffects.includes(x))
}

// The one resolver. Returns the enabled tools keyed by id. The MCP server, an Agent `tools`
// property, and an `--allowedTools` list all derive from this.
export function resolveTools(t: Toggles): Partial<Record<ToolId, ToolEntry['tool']>> {
  return Object.fromEntries((Object.keys(REGISTRY) as ToolId[]).filter(id => isOn(id, t)).map(id => [id, REGISTRY[id].tool]))
}

export function resolveToolsets(t: Toggles): Record<string, Record<string, ToolEntry['tool']>> {
  const out: Record<string, Record<string, ToolEntry['tool']>> = {}
  for (const id of Object.keys(REGISTRY) as ToolId[]) if (isOn(id, t)) (out[REGISTRY[id].toolset] ??= {})[id] = REGISTRY[id].tool
  return out
}

// The second fence for claude -p: the exact allow-list, in Claude Code names.
export function allowedToolsFor(serverName: string, t: Toggles, workflowKeys: string[] = []): string[] {
  return [...Object.keys(resolveTools(t)), ...workflowKeys.map(k => `run_${k}`)].map(n => `mcp__${serverName}__${n}`)
}

// A workflow step calls this, never REGISTRY directly, so an off tool refuses there too.
export function toolFor(id: ToolId, t: Toggles): ToolEntry['tool'] {
  if (!isOn(id, t)) throw new Error(`The tool ${id} is off (toolset ${REGISTRY[id].toolset}, effects ${REGISTRY[id].effects.join(',')}).`)
  return REGISTRY[id].tool
}
