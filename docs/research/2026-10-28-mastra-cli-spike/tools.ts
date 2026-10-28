import { createTool } from '@mastra/core/tools'
import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'

// A harness-style tool: read the path from a node to the root (fake data, no model).
export const getNodeContext = createTool({
  id: 'get_node_context',
  description: 'Read the path from a node to the root of the category tree.',
  inputSchema: z.object({ nodeId: z.string() }),
  outputSchema: z.object({ path: z.array(z.string()) }),
  execute: async ({ nodeId }) => ({ path: nodeId === 'sunscreen' ? ['skincare', 'sunscreen'] : [nodeId] }),
})

// A harness-style workflow: a code check with no model call.
const check = createStep({
  id: 'min_items',
  inputSchema: z.object({ recordIds: z.array(z.string()) }),
  outputSchema: z.object({ verdict: z.enum(['pass', 'fail']) }),
  execute: async ({ inputData }) => ({ verdict: (inputData.recordIds.length > 0 ? 'pass' : 'fail') as 'pass' | 'fail' }),
})
export const checkRecords = createWorkflow({
  id: 'check_records',
  description: 'Check that a criterion cites at least one research record.',
  inputSchema: z.object({ recordIds: z.array(z.string()) }),
  outputSchema: z.object({ verdict: z.enum(['pass', 'fail']) }),
}).then(check).commit()
