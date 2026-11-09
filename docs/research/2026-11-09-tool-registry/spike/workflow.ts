// A workflow step that calls a registry tool's execute directly (no agent, no MCP, no model).
import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { togglesFromEnv, toolFor } from './registry'

const lookup = createStep({
  id: 'lookup',
  inputSchema: z.object({ nodeId: z.string() }),
  outputSchema: z.object({ depth: z.number() }),
  execute: async ({ inputData }) => {
    const tool = toolFor('get_node_context', togglesFromEnv(process.env))
    const out = (await tool.execute!({ nodeId: inputData.nodeId }, {} as any)) as { path: string[] }
    return { depth: out.path.length }
  },
})

export const checkWorkflow = createWorkflow({
  id: 'check_records',
  description: 'Dummy workflow: depth of a node, from get_node_context.',
  inputSchema: z.object({ nodeId: z.string() }),
  outputSchema: z.object({ depth: z.number() }),
})
  .then(lookup)
  .commit()
