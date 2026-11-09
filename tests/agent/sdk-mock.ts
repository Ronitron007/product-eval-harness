// The mock of the Agent SDK for tests/agent/ and tests/tools/ (tools.hazards, model_call). A test
// file mocks the package with:
//
//   vi.mock('@anthropic-ai/claude-agent-sdk', async () => (await import('../agent/sdk-mock')).sdkModule())
//
// query() then replays the recorded messages of sdkState.script, and keeps each call. No CLI starts.

export interface QueryCall {
  readonly prompt: unknown
  readonly options: Record<string, unknown>
}

export const sdkState: { calls: QueryCall[]; script: unknown[]; onCall?: (call: QueryCall) => void | Promise<void>; throwAfter?: Error } = { calls: [], script: [] }

export function resetSdk(script: unknown[] = []): void {
  sdkState.calls = []
  sdkState.script = script
  delete sdkState.onCall
  delete sdkState.throwAfter
}

async function* replay(call: QueryCall): AsyncGenerator<unknown> {
  await sdkState.onCall?.(call)
  for (const m of sdkState.script) yield structuredClone(m)
  if (sdkState.throwAfter) throw sdkState.throwAfter
}

export function sdkModule() {
  return {
    query(params: { prompt: unknown; options?: Record<string, unknown> }) {
      const call = { prompt: params.prompt, options: params.options ?? {} }
      sdkState.calls.push(call)
      const it = replay(call)
      return Object.assign(it, { close() {}, interrupt: async () => {} })
    },
  }
}
