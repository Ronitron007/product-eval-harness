// No test calls a model or another HTTP service (rules.gates). Judge tests use createMockModel.
globalThis.fetch = (() => {
  throw new Error('A test called fetch. Tests make no network call: use createMockModel from @mastra/core/test-utils/llm-mock.')
}) as typeof fetch
