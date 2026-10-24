// Negative controls. Each @ts-expect-error must hit a real type error.
import { Classifier } from '@mastra/core/classifier'
import { MastraCompositeStore } from '@mastra/core/storage'
import { LibSQLStore } from '@mastra/libsql'

export const c = new Classifier({
  id: 'x',
  // @ts-expect-error Classifier needs a decision model object, not a provider/model string
  model: 'openai/gpt-5-mini',
  questions: { q: { type: 'boolean' } },
})

const app = new LibSQLStore({ id: 'a', url: 'file:./a.db' })
export const s = new MastraCompositeStore({
  id: 'c',
  default: app,
  domains: {
    // @ts-expect-error no custom application domain key such as rules
    rules: {},
  },
})
