import type { Agent } from '@mastra/core/agent'
import type { Drafter } from './types'

// The agent adapter for a real drafter (plan.stage_workflow). errorStrategy warn keeps a reply that
// breaks the schema: object is undefined, and text holds the raw reply (compile.usage.calls).
export function agentDrafter(agent: Agent, id: string): Drafter {
  return {
    id,
    async draft({ plan, evidence, context, errors }) {
      const prompt = JSON.stringify({ context, evidence, errors })
      const out = await agent.generate(prompt, { structuredOutput: { schema: plan.schema, errorStrategy: 'warn' } })
      return out.object !== undefined ? out.object : out.text
    },
  }
}
