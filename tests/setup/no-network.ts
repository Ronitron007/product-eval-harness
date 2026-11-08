import { PROVIDER_REGISTRY } from '@mastra/core/llm'
import { afterEach } from 'vitest'

// No test calls a model or another HTTP service (rules.gates). Judge tests use createMockModel.
// The stub counts each call, and the hook below fails each test that left a call (judge.no_network).
// So a scorer that catches the throw can no longer hide a call.
let calls = 0

// Each provider key of the Mastra model router gets a placeholder. With no key, the router throws
// before fetch, and an unmocked model would pass a test as person. With the placeholder, each
// unmocked model reaches the stub below, and the hook fails the test. No real key reaches a test.
for (const provider of Object.values(PROVIDER_REGISTRY)) {
  for (const name of [provider.apiKeyEnvVar].flat()) process.env[name] = 'placeholder-for-a-test-with-no-network'
}

globalThis.fetch = (() => {
  calls++
  throw new Error('A test called fetch. Tests make no network call: use createMockModel from @mastra/core/test-utils/llm-mock.')
}) as typeof fetch

// The calls of fetch since the last take. It sets the count to zero. A test that calls fetch on
// purpose takes the count, so the hook passes.
export function takeFetchCalls(): number {
  const n = calls
  calls = 0
  return n
}

// The guard of the hook. It sets the count to zero, then throws when the test left a call.
export function fetchGuard(): void {
  const n = takeFetchCalls()
  if (n > 0) throw new Error(`The test left ${n} call${n === 1 ? '' : 's'} of fetch. A test with a model that is not a mock fails (judge.no_network).`)
}

afterEach(fetchGuard)
