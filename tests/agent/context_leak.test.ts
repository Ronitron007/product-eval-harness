import { existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { lockedClaudeAgent } from '../../src/agent'
import { agentEnv, agentSnapshot, BUDGET, fenceMessages, markerCli, memoryRecorder } from './helpers'
import { resetSdk, sdkState } from './sdk-mock'

vi.mock('@anthropic-ai/claude-agent-sdk', async () => (await import('./sdk-mock')).sdkModule())

// context_leak: memory or settings reach the context of the model (tools.no_auto_memory).

const cli = markerCli()
beforeEach(() => resetSdk(fenceMessages()))

describe('context_leak', () => {
  it('context_leak.auto_memory_off (repro opus/probe-cli.ts, run6 and run61): the env that query gets sets CLAUDE_CODE_DISABLE_AUTO_MEMORY=1', async () => {
    await lockedClaudeAgent({ id: 'mem', systemPrompt: 'x', snapshot: agentSnapshot(), budget: BUDGET, store: memoryRecorder(), env: agentEnv(cli.path) }).run('hi')
    const o = sdkState.calls[0]!.options
    expect((o.env as Record<string, string>).CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe('1')
    expect(o.settingSources).toEqual([])
  })

  it('context_leak.auto_memory_off (repro sonnet/p3.ts): each run gets a new empty folder in the temp folder, with no project file near it', async () => {
    const seen = new Set<string>()
    sdkState.onCall = call => {
      const cwd = call.options.cwd as string
      expect(relative(tmpdir(), cwd).startsWith('..')).toBe(false)
      expect(readdirSync(cwd)).toEqual([])
      expect(cwd.startsWith(join(import.meta.dirname, '..', '..'))).toBe(false)
      seen.add(cwd)
    }
    for (let i = 0; i < 2; i++) {
      const out = await lockedClaudeAgent({ id: 'cwd', systemPrompt: 'x', snapshot: agentSnapshot(), budget: BUDGET, store: memoryRecorder(), env: agentEnv(cli.path) }).run('hi')
      expect(out.kind).toBe('ok')
    }
    expect(seen.size).toBe(2)
    for (const cwd of seen) expect(existsSync(cwd)).toBe(false) // the run removes its folder
  })
})
