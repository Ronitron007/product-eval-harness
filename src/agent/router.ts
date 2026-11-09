import { Agent } from '@mastra/core/agent'
import type { MastraModelConfig } from '@mastra/core/llm'
import type { z } from 'zod'
import { resolveTools, type HandleSet, type ToolSnapshot } from '../tools'

// A Mastra agent on the model router (tools.consumers in docs/design/tool-registry.md). The
// wrapper gives the inner Agent its tools from the snapshot, once. Its one method, run(), takes no
// options object, so no call passes toolsets, clientTools, or tools (toggle_bypass.router_call_tools_refused).
// No code registers a harness agent in new Mastra({ agents }) (toggle_bypass.no_agent_registered).

export interface RouterAgent {
  run(prompt: string, schema?: z.ZodObject): Promise<{ readonly text: string; readonly object: unknown }>
}

export interface RouterAgentInput {
  readonly id: string
  readonly model: MastraModelConfig // provider/model, or a model object in tests
  readonly instructions: string
  readonly snapshot: ToolSnapshot
  readonly handles: HandleSet
}

class Router implements RouterAgent {
  readonly #agent: Agent

  constructor(input: RouterAgentInput) {
    if (input.snapshot.consumer !== 'agent') throw new Error(`A router agent needs a snapshot with the consumer agent, not ${input.snapshot.consumer}.`)
    const tools = resolveTools(input.snapshot, input.handles)
    this.#agent = new Agent({ id: input.id, name: input.id, instructions: input.instructions, model: input.model, tools: { ...tools } })
  }

  async run(prompt: string, schema?: z.ZodObject): Promise<{ readonly text: string; readonly object: unknown }> {
    const out = schema ? await this.#agent.generate(prompt, { structuredOutput: { schema, errorStrategy: 'warn' } }) : await this.#agent.generate(prompt)
    return { text: out.text, object: out.object }
  }
}

export function routerAgent(input: RouterAgentInput): RouterAgent {
  return Object.freeze(new Router(input))
}
