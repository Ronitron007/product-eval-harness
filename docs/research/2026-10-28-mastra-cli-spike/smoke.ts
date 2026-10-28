import { ClaudeSDKAgent } from '@mastra/claude'
import { z } from 'zod'

const agent = new ClaudeSDKAgent({
  id: 'smoke',
  name: 'smoke',
  description: 'Haiku smoke test',
  sdkOptions: {
    model: 'haiku',
    cwd: process.cwd(),
    mcpServers: { harness: { type: 'stdio', command: 'npx', args: ['tsx', `${process.cwd()}/src/server.ts`], env: { MASTRA_TELEMETRY_DISABLED: '1' } } },
    allowedTools: ['mcp__harness__get_node_context'],
    maxTurns: 4,
    pathToClaudeCodeExecutable: process.env.CLAUDE_CLI_PATH!,
  },
})

const r = await agent.generate('Call the tool get_node_context with nodeId sunscreen. Return the path.', {
  structuredOutput: { schema: z.object({ path: z.array(z.string()) }) },
})
console.log('object:', JSON.stringify(r.object))
console.log('tool calls:', JSON.stringify((r as any).toolCalls?.map((t: any) => t.payload?.toolName ?? t.toolName)))
console.log('usage:', JSON.stringify((r as any).usage), 'cost:', JSON.stringify((r as any).providerMetadata ?? (r as any).response?.providerMetadata ?? null).slice(0, 400))
