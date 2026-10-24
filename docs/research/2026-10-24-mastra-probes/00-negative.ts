// Negative control: each line must be a type error, or tsc fails.
import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
createStep({
  id: 'x',
  inputSchema: z.object({}),
  outputSchema: z.object({ a: z.string() }),
  // @ts-expect-error wrong return type must be rejected
  execute: async () => ({ a: 1 }),
})
