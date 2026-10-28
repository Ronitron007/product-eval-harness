import { MCPServer } from '@mastra/mcp'
import { checkRecords, getNodeContext } from './tools'

const server = new MCPServer({
  id: 'harness',
  name: 'harness',
  version: '0.0.0',
  tools: { get_node_context: getNodeContext },
  workflows: { check_records: checkRecords },
})
await server.startStdio()
