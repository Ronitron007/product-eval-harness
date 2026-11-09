import http from 'node:http'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { webFetchTool } from '@mastra/core/tools'
import { createTool } from '@mastra/core/tools'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { lockedClaudeAgent } from '../../src/agent'
import { defineEntry, defineRegistry, readSnapshot, READ_CALLS, REGISTRY, resolveTools, type StageOutcome } from '../../src/tools'
import { importsOf } from '../compiler/imports'
import { takeFetchCalls } from '../setup/no-network'
import { agentEnv, agentSnapshot, BUDGET, fenceMessages, markerCli, memoryRecorder } from '../agent/helpers'
import { resetSdk, sdkState } from '../agent/sdk-mock'
import { fakeStore, FIXTURE, fixtureHandles, SUCCESS } from './fixture'
import { PROBE } from './probe'
import { REPO } from './helpers'

vi.mock('@anthropic-ai/claude-agent-sdk', async () => (await import('../agent/sdk-mock')).sdkModule())

// second_path: an effect has a second path (tools.one_path).

const ALL = '{"allowEffects":["read","paid","db_write"]}'
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap(f => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []
  })
beforeEach(() => resetSdk(fenceMessages()))

describe('second_path', () => {
  it('second_path.handles_by_effect: a read tool gets only the read calls, never a write function or a paid door', () => {
    const seen: Record<string, object> = {}
    const spyEntry = (id: string, effects: readonly ('read' | 'paid' | 'db_write')[]) =>
      defineEntry({
        id,
        version: 1,
        toolset: 'graph',
        effects,
        openWorld: false,
        env: [],
        build: (h: object) => ((seen[id] = h), createTool({ id, description: 'x', inputSchema: z.object({}), execute: async () => ({}) })),
      })
    const registry = defineRegistry([spyEntry('only_read', ['read']), spyEntry('read_paid', ['read', 'paid']), spyEntry('only_write', ['db_write'])])
    const store = Object.assign(fakeStore(), { addNode: async () => 'WRITE', endRun: async () => 'WRITE' })
    resolveTools(readSnapshot({ HARNESS_TOOLS: ALL }, { runId: 'r', consumer: 'step' }, registry), { store, writes: { only_write: async () => true } }, registry)
    expect(Object.keys(seen.only_read!)).toEqual(['store'])
    expect(Object.keys((seen.only_read as { store: object }).store).sort()).toEqual([...READ_CALLS].sort())
    expect(Object.keys(seen.read_paid!).sort()).toEqual(['paid', 'store'])
    expect(Object.keys(seen.only_write!).sort()).toEqual(['store', 'write'])
    for (const h of Object.values(seen)) expect(Object.isFrozen(h)).toBe(true)
  })

  it('second_path.one_entry_per_write: two entries never get one write function', () => {
    const one = async (): Promise<StageOutcome> => SUCCESS
    const snapshot = readSnapshot({ HARNESS_TOOLS: ALL }, { runId: 'r', consumer: 'step' })
    const writes = { run_create_node: one, run_create_pack: one, run_define_criteria: async () => SUCCESS, run_create_layout: async () => SUCCESS }
    expect(() => resolveTools(snapshot, { store: fakeStore(), writes })).toThrow(/get one write function/)
    expect(() => resolveTools(readSnapshot({}, { runId: 'r', consumer: 'step' }, FIXTURE), { store: fakeStore(), writes: { read_thing: async () => true } }, FIXTURE)).toThrow(/names no db_write tool/)
  })

  it('second_path.no_store_import_in_tools: no file in src/tools/ other than handles.ts reaches the store, pg, drizzle-orm, or @mastra/pg', () => {
    const dir = join(REPO, 'src', 'tools')
    const banned = ['pg', 'drizzle-orm', '@mastra/pg']
    const bannedFiles = [join(REPO, 'src', 'store', 'store.ts'), join(REPO, 'src', 'store', 'schema.ts'), join(REPO, 'src', 'mastra', 'harness.ts'), join(dir, 'handles.ts')]
    // The import closure of a file through relative imports.
    const closure = (file: string, seen = new Set<string>()): Set<string> => {
      if (seen.has(file)) return seen
      seen.add(file)
      for (const spec of importsOf(readFileSync(file, 'utf8'))) {
        if (banned.some(b => spec === b || spec.startsWith(`${b}/`))) seen.add(`package:${spec}`)
        if (!spec.startsWith('.')) continue
        const target = resolve(dirname(file), spec)
        const path = [`${target}.ts`, join(target, 'index.ts')].find(p => statSync(p, { throwIfNoEntry: false })?.isFile())
        if (path && !bannedFiles.includes(path)) closure(path, seen)
        else if (path) seen.add(path)
      }
      return seen
    }
    for (const file of readdirSync(dir).filter(f => f.endsWith('.ts') && !['handles.ts', 'index.ts'].includes(f))) {
      const reached = [...closure(join(dir, file))].filter(p => p.startsWith('package:') || bannedFiles.includes(p))
      expect(reached, file).toEqual([])
    }
    expect(importsOf(readFileSync(join(dir, 'handles.ts'), 'utf8'))).toContain('../store/store')
  })

  it('second_path.no_generic_tool: src/ never makes code mode, and no tool input has a generic field', () => {
    const hits = files(join(REPO, 'src')).filter(f => /createCodeMode(Tool)?\b/.test(readFileSync(f, 'utf8')))
    expect(hits).toEqual([])
    const GENERIC = ['sql', 'command', 'code', 'script', 'method', 'toolId', 'tool', 'workflowId']
    const keysOf = (schema: unknown): string[] => {
      const def = (schema as { _zod?: { def?: { type?: string; shape?: Record<string, unknown>; element?: unknown; innerType?: unknown } } })?._zod?.def
      if (!def) return []
      if (def.type === 'object') return Object.entries(def.shape ?? {}).flatMap(([k, v]) => [k, ...keysOf(v)])
      return [...keysOf(def.element), ...keysOf(def.innerType)]
    }
    for (const entry of REGISTRY.entries) {
      const keys = keysOf(entry.build(PROBE as never).inputSchema)
      for (const k of keys) expect(GENERIC, `${entry.id}.${k}`).not.toContain(k)
    }
  })

  it('second_path.wrapper_effects_declared: each tool with spy handles shows only the effects that it declares', async () => {
    for (const entry of REGISTRY.entries) {
      const seen = new Set<string>()
      const store = fakeStore()
      const spied = new Proxy(store, {
        get: (t, k, r) => {
          const v = Reflect.get(t, k, r)
          return READ_CALLS.includes(k as never) ? (...a: unknown[]) => (seen.add('read'), (v as (...x: unknown[]) => unknown).apply(t, a)) : v
        },
      })
      const writes = Object.fromEntries(REGISTRY.entries.filter(e => e.effects.includes('db_write')).map(e => [e.id, async (): Promise<StageOutcome> => (seen.add('db_write'), SUCCESS)]))
      const snapshot = readSnapshot({ HARNESS_TOOLS: ALL }, { runId: crypto.randomUUID(), consumer: 'step' })
      const tool = resolveTools(snapshot, { store: spied, writes })[entry.id]!
      const original = tool.execute!
      await original({ nodeId: 'sunscreen' }, {} as never)
      // A paid door is reserved inside execute. A second call is refused, so the door was used.
      if (entry.effects.includes('paid')) {
        const again = (await original({ nodeId: 'sunscreen' }, {} as never)) as { result?: { code?: string } }
        if (again.result?.code === 'max_calls') seen.add('paid')
      }
      for (const effect of seen) expect(entry.effects, `${entry.id} shows ${effect}`).toContain(effect)
    }
    expect(fixtureHandles()).toBeDefined()
  })

  it('second_path.no_builtin_tools (repro opus/runs/run1, sonnet/p3.ts): the options give tools [], strictMcpConfig true, and one server', async () => {
    await lockedClaudeAgent({ id: 'nb', systemPrompt: 'x', snapshot: agentSnapshot(ALL), budget: BUDGET, store: memoryRecorder(), env: agentEnv(markerCli().path) }).run('hi')
    const o = sdkState.calls[0]!.options
    expect(o.tools).toEqual([])
    expect(o.strictMcpConfig).toBe(true)
    expect(o.settingSources).toEqual([])
    expect(Object.keys(o.mcpServers as object)).toEqual(['harness'])
    expect(o.permissionMode).toBe('dontAsk')
  })

  it('second_path.web_fetch_blocks_loopback (repro sonnet/p7.ts): the Mastra web_fetch tool reaches no loopback form of a local server', async () => {
    const hits: string[] = []
    const srv = http.createServer((req, res) => (hits.push(req.url ?? ''), res.end('LOCAL-SERVER-BODY')))
    await new Promise<void>(r => srv.listen(0, '127.0.0.1', r))
    const port = (srv.address() as { port: number }).port
    try {
      // The DNS forms of the repro (nip.io, localtest.me) need a lookup on the network, so they are left out.
      const targets = ['127.0.0.1', 'localhost', '[::1]', '[::ffff:127.0.0.1]', '[::ffff:7f00:1]', '0.0.0.0', '2130706433', '0x7f.1', '127.1', '[0:0:0:0:0:ffff:127.0.0.1]', '[::127.0.0.1]']
      for (const host of targets) {
        const r = (await (webFetchTool as unknown as { execute: (i: unknown, c: unknown) => Promise<{ content?: unknown }> }).execute({ url: `http://${host}:${port}/a` }, {})) as { content?: unknown }
        expect(String(r.content ?? ''), host).not.toContain('LOCAL-SERVER-BODY')
        expect(takeFetchCalls(), `${host}: web_fetch refuses before any fetch`).toBe(0)
      }
      expect(hits).toEqual([])
    } finally {
      srv.close()
      takeFetchCalls()
    }
  })
})
