// Type-check only. Mastra's own SDK agents: Claude Code and Cursor keep their own agent loop.
// The harness tools reach both through one Mastra MCP server (src/server.ts) over stdio.
import { ClaudeSDKAgent } from '@mastra/claude'
import { CursorSDKAgent } from '@mastra/cursor'
import { Mastra } from '@mastra/core/mastra'
import { z } from 'zod'

const harnessMcp = { type: 'stdio' as const, command: 'npx', args: ['tsx', 'src/server.ts'] }

export const claudeResearcher = new ClaudeSDKAgent({
  id: 'claude-researcher',
  name: 'Claude researcher',
  description: 'Research through the Claude Code runtime.',
  sdkOptions: {
    model: 'sonnet',
    cwd: process.cwd(),
    mcpServers: { harness: harnessMcp },
    allowedTools: ['mcp__harness__get_node_context', 'mcp__harness__run_check_records'],
  },
})

export const cursorResearcher = new CursorSDKAgent({
  id: 'cursor-researcher',
  name: 'Cursor researcher',
  description: 'Research through the Cursor runtime.',
  sdkOptions: { model: { id: 'auto' }, local: { cwd: process.cwd() } },
})

export const mastra = new Mastra({ agents: { claudeResearcher, cursorResearcher } })

export async function draft() {
  const agent = mastra.getAgentById('claude-researcher')
  const r = await agent.generate('Read the context of sunscreen.', {
    structuredOutput: { schema: z.object({ path: z.array(z.string()) }) },
  })
  return r.object.path
}
