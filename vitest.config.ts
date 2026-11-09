import { defineConfig } from 'vitest/config'

// The setup file replaces fetch with a stub that throws, so no test can call a model (judge.no_network).
// @mastra/claude is inlined, so that vi.mock('@anthropic-ai/claude-agent-sdk') reaches its call of
// query (tools.hazards, model_call.sdk_query_mocked).
export default defineConfig({
  test: {
    setupFiles: ['tests/setup/no-network.ts'],
    server: { deps: { inline: ['@mastra/claude'] } },
  },
})
