import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ClaudeSDKAgent } from '@mastra/claude'
import { createStep, createWorkflow } from '@mastra/core/workflows'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import * as claude from '../../src/agent/claude'
import { lockedClaudeAgent, lockedSdkOptions, tapSpawn } from '../../src/agent'
import { deepFreeze, harnessServerCommand, readSnapshot } from '../../src/tools'
import { importsOf } from '../compiler/imports'
import { agentEnv, agentSnapshot, BUDGET, fenceMessages, markerCli, memoryRecorder, tmp } from './helpers'
import { resetSdk, sdkState } from './sdk-mock'

vi.mock('@anthropic-ai/claude-agent-sdk', async () => (await import('./sdk-mock')).sdkModule())

// mode_unset: permissionMode is unset, or a call changes a locked option (tools.agent_run, tools.locked_agent).

const cli = markerCli()
beforeEach(() => resetSdk(fenceMessages()))
afterEach(() => {
  vi.restoreAllMocks()
  expect(cli.spawned()).toBe(false)
})

const optionsInput = (over: Partial<Parameters<typeof lockedSdkOptions>[0]> = {}) => ({
  snapshot: agentSnapshot(),
  systemPrompt: 'You are a test agent.',
  budget: BUDGET,
  cwd: tmp('cwd'),
  withSchema: false,
  spawn: tapSpawn(() => {}),
  env: agentEnv(cli.path),
  ...over,
})

// Runs a locked agent once and gives the inner sealed agent, through a spy on the base class.
async function innerOf(): Promise<ClaudeSDKAgent> {
  let inner: ClaudeSDKAgent | undefined
  const original = ClaudeSDKAgent.prototype.generate
  vi.spyOn(ClaudeSDKAgent.prototype, 'generate').mockImplementation(function (this: ClaudeSDKAgent, ...a: Parameters<ClaudeSDKAgent['generate']>) {
    inner = this
    return original.apply(this, a)
  })
  await lockedClaudeAgent({ id: 'probe', systemPrompt: 'x', snapshot: agentSnapshot(), budget: BUDGET, store: memoryRecorder(), env: agentEnv(cli.path) }).run('hi')
  vi.restoreAllMocks()
  sdkState.calls = []
  return inner!
}

const EVIL = { permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true, tools: ['Bash'], allowedTools: ['Bash'], strictMcpConfig: false, settingSources: ['project', 'user'] }

describe('mode_unset', () => {
  it('mode_unset.options_locked: the options that the mocked query gets are the table of tools.agent_run, and only these', async () => {
    const snapshot = agentSnapshot()
    const env = agentEnv(cli.path)
    const out = await lockedClaudeAgent({ id: 'locked', systemPrompt: 'SYSTEM', snapshot, budget: BUDGET, store: memoryRecorder(), env }).run('hi')
    expect(out.kind).toBe('ok')
    expect(sdkState.calls).toHaveLength(1)
    const o = sdkState.calls[0]!.options
    expect(Object.keys(o).sort()).toEqual(
      ['allowedTools', 'cwd', 'env', 'maxBudgetUsd', 'maxTurns', 'mcpServers', 'pathToClaudeCodeExecutable', 'permissionMode', 'persistSession', 'settingSources', 'spawnClaudeCodeProcess', 'strictMcpConfig', 'systemPrompt', 'tools'].sort(),
    )
    expect(o).toMatchObject({
      settingSources: [],
      strictMcpConfig: true,
      tools: [],
      mcpServers: { harness: harnessServerCommand(snapshot, { path: env.PATH!, envFile: env.HARNESS_ENV_FILE! }) },
      allowedTools: ['mcp__harness__get_node_context'],
      permissionMode: 'dontAsk',
      maxTurns: BUDGET.maxTurns,
      maxBudgetUsd: BUDGET.maxBudgetUsd,
      env: { PATH: env.PATH, HOME: env.HOME, MASTRA_TELEMETRY_DISABLED: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' },
      persistSession: false,
      systemPrompt: 'SYSTEM',
      pathToClaudeCodeExecutable: cli.path,
    })
    expect(Object.keys(o.env as object).sort()).toEqual(['CLAUDE_CODE_DISABLE_AUTO_MEMORY', 'HOME', 'MASTRA_TELEMETRY_DISABLED', 'PATH'])
    expect(typeof o.spawnClaudeCodeProcess).toBe('function')
  })

  it('mode_unset.bypass_refused: lockedSdkOptions refuses bypassPermissions or allowDangerouslySkipPermissions anywhere in its input', () => {
    expect(() => lockedSdkOptions(optionsInput())).not.toThrow()
    expect(() => lockedSdkOptions(optionsInput({ systemPrompt: 'use bypassPermissions' }))).toThrow(/refuses bypassPermissions/)
    expect(() => lockedSdkOptions(optionsInput({ env: { ...agentEnv(cli.path), allowDangerouslySkipPermissions: '1' } }))).toThrow(/refuses allowDangerouslySkipPermissions/)
    expect(() => lockedSdkOptions({ ...optionsInput(), extra: { deep: { mode: 'bypassPermissions' } } } as never)).toThrow(/refuses bypassPermissions/)
  })

  it('mode_unset.consumer_must_be_agent: lockedSdkOptions refuses a snapshot of another consumer, or one that breaks the mix rule', () => {
    for (const consumer of ['step', 'mcp_client'] as const) {
      const snapshot = readSnapshot({}, { runId: 'r', consumer })
      expect(() => lockedSdkOptions(optionsInput({ snapshot }))).toThrow(/consumer agent/)
    }
    // A snapshot made by hand, with an open-world tool and a db_write tool, and its own hash.
    const forged = agentSnapshot('{"allowEffects":["read","paid","db_write"]}')
    const mix = deepFreeze({ ...structuredClone(forged), manifest: [...forged.manifest, { id: 'web_fetch', version: 1, toolset: 'research', effects: ['read'], openWorld: true }] })
    expect(() => lockedSdkOptions(optionsInput({ snapshot: mix as never }))).toThrow()
  })

  it('mode_unset.generate_override_refused: a call of generate on the inner agent with sdkOptions never reaches query', async () => {
    const inner = await innerOf()
    await expect(inner.generate('hi', { sdkOptions: EVIL as never })).rejects.toThrow(/refuses generate with its own sdkOptions/)
    expect(sdkState.calls).toHaveLength(0)
  })

  it('mode_unset.stream_override_refused (repro opus/probe-stream.ts, sonnet/p2.ts): a call of stream with sdkOptions never reaches query', async () => {
    const inner = await innerOf()
    await expect(inner.stream('hi', { sdkOptions: EVIL as never })).rejects.toThrow(/refuses stream/)
    expect(sdkState.calls).toHaveLength(0)
  })

  it('mode_unset.resume_generate_refused (repro sonnet/p2.ts): resumeGenerate never reaches query', async () => {
    const inner = await innerOf()
    await expect(inner.resumeGenerate({ message: 'hi', sessionId: 'abc' }, { sdkOptions: EVIL as never })).rejects.toThrow(/refuses resumeGenerate/)
    await expect(inner.resumeGenerate({ message: 'hi', sessionId: 'abc' })).rejects.toThrow(/refuses resumeGenerate/)
    expect(sdkState.calls).toHaveLength(0)
  })

  it('mode_unset.resume_stream_refused (repro sonnet/p2.ts): resumeStream never reaches query', async () => {
    const inner = await innerOf()
    await expect(inner.resumeStream({ message: 'hi', continue: true }, { sdkOptions: EVIL as never })).rejects.toThrow(/refuses resumeStream/)
    await expect(inner.resumeStream({ message: 'hi', continue: true })).rejects.toThrow(/refuses resumeStream/)
    expect(sdkState.calls).toHaveLength(0)
  })

  it('mode_unset.create_step_override_refused (repro opus/probe-stream.ts, run5): a workflow step of the inner agent with sdkOptions never reaches query', async () => {
    const inner = await innerOf()
    const wf = createWorkflow({ id: 'w', inputSchema: z.object({ prompt: z.string() }), outputSchema: z.any() })
      .then(createStep(inner, { sdkOptions: EVIL } as never))
      .commit()
    const result = await (await wf.createRun()).start({ inputData: { prompt: 'go' } })
    expect(result.status).toBe('failed')
    expect(String((result as { error?: { message?: string } }).error?.message)).toMatch(/refuses stream with its own sdkOptions/)
    expect(sdkState.calls).toHaveLength(0)
  })

  it('mode_unset.options_unreachable: the locked object has only run, no options field and no getter, and its options are frozen', async () => {
    const agent = lockedClaudeAgent({ id: 'locked', systemPrompt: 'x', snapshot: agentSnapshot(), budget: BUDGET, store: memoryRecorder(), env: agentEnv(cli.path) })
    expect(Object.keys(agent)).toEqual([])
    expect(Reflect.ownKeys(agent)).toEqual([])
    expect('options' in agent).toBe(false)
    expect(Object.isFrozen(agent)).toBe(true)
    const proto = Object.getPrototypeOf(agent) as object
    expect(Object.getOwnPropertyNames(proto).sort()).toEqual(['constructor', 'run'])
    expect(Object.values(Object.getOwnPropertyDescriptors(proto)).some(d => d.get !== undefined || d.set !== undefined)).toBe(false)
    expect(Object.getPrototypeOf(proto)).toBe(Object.prototype)
    await agent.run('hi')
    const o = sdkState.calls[0]!.options
    for (const part of [o.env, o.allowedTools, o.mcpServers, (o.mcpServers as Record<string, unknown>).harness, o.tools, o.settingSources]) expect(Object.isFrozen(part)).toBe(true)
    const again = await agent.run('hi')
    expect(again).toMatchObject({ kind: 'failed', reason: expect.stringMatching(/runs once/) })
    expect(sdkState.calls).toHaveLength(1)
  })

  it('mode_unset.raw_agent_not_exported: only src/agent/claude.ts imports @mastra/claude, and it exports no class that extends ClaudeSDKAgent', () => {
    const repo = join(import.meta.dirname, '..', '..')
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap(f => {
        const p = join(dir, f)
        return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []
      })
    const importers = [...files(join(repo, 'src')), ...files(join(repo, 'scripts'))].filter(f => importsOf(readFileSync(f, 'utf8')).includes('@mastra/claude'))
    expect(importers.map(f => f.slice(repo.length + 1))).toEqual(['src/agent/claude.ts'])
    for (const [name, value] of Object.entries(claude)) {
      if (typeof value !== 'function') continue
      expect(value, name).not.toBe(ClaudeSDKAgent)
      expect(value.prototype instanceof ClaudeSDKAgent, name).toBe(false)
    }
  })
})
