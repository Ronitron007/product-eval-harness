import { defineConfig } from 'vitest/config'

// The setup file replaces fetch with a stub that throws, so no test can call a model (judge.no_network).
export default defineConfig({
  test: {
    setupFiles: ['tests/setup/no-network.ts'],
  },
})
