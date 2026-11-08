import { afterEach } from 'vitest'

// No test calls a model or another HTTP service (rules.gates). Judge tests use createMockModel.
// The stub counts each call, and the hook below fails each test that left a call (judge.no_network).
// So a scorer that catches the throw can no longer hide a call.
let calls = 0

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
