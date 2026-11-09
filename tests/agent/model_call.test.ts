import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { lockedClaudeAgent } from '../../src/agent'
import { takeFetchCalls } from '../setup/no-network'
import { agentEnv, agentSnapshot, BUDGET, fenceMessages, markerCli, memoryRecorder } from './helpers'
import { resetSdk, sdkState } from './sdk-mock'

vi.mock('@anthropic-ai/claude-agent-sdk', async () => (await import('./sdk-mock')).sdkModule())

// model_call: a test calls a real model (tools.hazards). query of the Agent SDK is a replay of
// recorded messages. CLAUDE_CLI_PATH names a script that writes a marker and exits 1.

const cli = markerCli()
beforeEach(() => resetSdk(fenceMessages()))
afterAll(() => expect(cli.spawned()).toBe(false))

const agent = () => lockedClaudeAgent({ id: 'mc', systemPrompt: 'x', snapshot: agentSnapshot(), budget: BUDGET, store: memoryRecorder(), env: agentEnv(cli.path) })

describe('model_call', () => {
  it('model_call.sdk_query_mocked: run() reaches the mocked query of the Agent SDK, never the real one', async () => {
    const out = await agent().run('hi')
    expect(sdkState.calls).toHaveLength(1)
    expect(sdkState.calls[0]!.prompt).toBe('hi')
    expect(out).toMatchObject({ kind: 'ok', text: expect.stringContaining('get_node_context(sunscreen)') })
  })

  it('model_call.cli_never_spawned: the script at CLAUDE_CLI_PATH never starts in a mocked run', async () => {
    await agent().run('hi')
    await agent().run('again')
    expect(sdkState.calls).toHaveLength(2)
    expect(cli.spawned()).toBe(false)
  })

  it('model_call.zero_fetch_each_test: fetch is the counting stub of judge.no_network in tests/agent and tests/tools', () => {
    expect(() => fetch('https://example.com')).toThrow(/A test called fetch/)
    expect(takeFetchCalls()).toBe(1)
    expect(takeFetchCalls()).toBe(0)
  })
})
