import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { Agent } from '@mastra/core/agent'
import { createMockModel } from '@mastra/core/test-utils/llm-mock'
import { createTool } from '@mastra/core/tools'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { FRONT_DOOR_PROMPT, FrontDoorReply, frontDoor, lockedClaudeAgent, routerAgent } from '../../src/agent'
import { allowedToolsFor, assertRegistry, defineEntry, REGISTRY, resolveTools, RegistryRefused, toolFor, type ToolEntry } from '../../src/tools'
import { currentTools, readToolsLock, REGISTRY_FILE, toolsLockProblems } from '../../scripts/tools-lock'
import { importsOf } from '../compiler/imports'
import { agentEnv, BUDGET, markerCli, memoryRecorder, structuredReply, tmp } from '../agent/helpers'
import { resetSdk, sdkState } from '../agent/sdk-mock'
import { fixtureHandles, readEntry, writeEntry } from './fixture'
import { callText, connectServer, REPO, snapshotFor, toolNames } from './helpers'
import { cpSync, writeFileSync } from 'node:fs'

vi.mock('@anthropic-ai/claude-agent-sdk', async () => (await import('../agent/sdk-mock')).sdkModule())

// toggle_bypass: a tool is reachable around its toggle (tools.registry, tools.consumers).

const ALL = '{"allowEffects":["read","paid","db_write"]}'
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap(f => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []
  })

// The tool names that a createMockModel spy gets on its first call.
function spyModel() {
  const seen: { tools?: { name: string }[] }[] = []
  const model = createMockModel({ version: 'v2', mockText: 'ok', spyGenerate: (o: never) => seen.push(o), spyStream: (o: never) => seen.push(o) } as never)
  return { model, names: () => (seen[0]?.tools ?? []).map(t => t.name).sort() }
}

beforeEach(() => resetSdk())
afterEach(() => vi.restoreAllMocks())

describe('toggle_bypass', () => {
  it('toggle_bypass.three_consumers_one_list: the server, the router agent, allowedTools, and toolFor give one list for one snapshot', async () => {
    for (const toggles of [undefined, ALL, '{"toolsets":{"graph":false},"allowEffects":["read","paid","db_write"]}']) {
      const snapshot = snapshotFor(toggles)
      const ids = snapshot.manifest.map(m => m.id).sort()
      const server = await connectServer(snapshot)
      try {
        expect(await toolNames(server)).toEqual(ids)
      } finally {
        await server.close()
      }
      const handles = { ...fixtureHandles(), writes: Object.fromEntries(REGISTRY.entries.filter(e => e.effects.includes('db_write')).map(e => [e.id, async () => undefined])) }
      const spy = spyModel()
      await routerAgent({ id: 'r', model: spy.model as never, instructions: 'x', snapshot, handles }).run('hi')
      expect(spy.names()).toEqual(ids)
      expect(allowedToolsFor('harness', snapshot).map(n => n.replace('mcp__harness__', '')).sort()).toEqual(ids)
      const stepSnapshot = snapshotFor(toggles, 'step')
      expect(REGISTRY.ids.filter(id => (() => {
        try {
          toolFor(id, stepSnapshot, handles)
          return true
        } catch {
          return false
        }
      })()).sort()).toEqual(ids)
    }
  }, 120_000)

  it('toggle_bypass.stale_call_unknown (repro sonnet/p1.ts): a call of a tool that is off gets an error, never a result', async () => {
    const server = await connectServer(snapshotFor(undefined))
    try {
      for (const name of ['run_create_node', 'save_record', 'web_search']) {
        const r = await callText(server, name, { nodeId: 'sunscreen' })
        expect(r, name).toMatchObject({ isError: true, text: expect.stringMatching(/Unknown tool/) })
      }
      // A name of the object prototype gives an error, and no tool runs.
      for (const name of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf']) expect((await callText(server, name, {})).isError, name).toBe(true)
    } finally {
      await server.close()
    }
  }, 60_000)

  it('toggle_bypass.stale_call_unknown (repro opus/probe-surface.ts): the server lists no resources and no prompts', async () => {
    const server = await connectServer(snapshotFor(undefined))
    try {
      for (const call of [() => server.client.listResources(), () => server.client.listPrompts(), () => server.client.listResourceTemplates()]) {
        await expect(call()).rejects.toThrow(/Method not found/)
      }
    } finally {
      await server.close()
    }
  }, 60_000)

  it('toggle_bypass.no_direct_import: no file outside src/tools/ imports a tool module other than src/tools/index.ts', () => {
    const toolsDir = join(REPO, 'src', 'tools')
    const bad: string[] = []
    for (const file of [...files(join(REPO, 'src')), ...files(join(REPO, 'scripts')), ...files(join(REPO, 'tests'))]) {
      if (file.startsWith(toolsDir + '/')) continue
      for (const spec of importsOf(readFileSync(file, 'utf8'))) {
        if (!spec.startsWith('.')) continue
        const target = resolve(dirname(file), spec).replace(/\.ts$/, '')
        if (target.startsWith(toolsDir + '/') && target !== join(toolsDir, 'index')) bad.push(`${file.slice(REPO.length + 1)} -> ${spec}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('toggle_bypass.registry_refuses_bad_entry: assertRegistry refuses no effects, a duplicate id, a bad id, a bad version, and an unknown toolset', () => {
    const ok = readEntry('fine')
    const cases: [ToolEntry[], RegExp][] = [
      [[{ ...ok, effects: [] }], /has no effects/],
      [[ok, readEntry('fine')], /appears twice/],
      [[readEntry('Bad-Id')], /not snake_case/],
      [[readEntry('x__y')], /not snake_case/],
      [[readEntry('fine', { version: 0 })], /Give a positive integer/],
      [[readEntry('fine', { version: 1.5 })], /Give a positive integer/],
      [[readEntry('fine', { toolset: 'web' as never })], /toolset "web"/],
      [[readEntry('fine', { effects: ['read', 'write'] as never })], /effect "write"/],
      [[readEntry('fine', { maxCallsPerRun: 2 })], /maxCallsPerRun/],
    ]
    expect(() => assertRegistry([ok])).not.toThrow()
    for (const [entries, error] of cases) expect(() => assertRegistry(entries)).toThrow(error)
    expect(() => assertRegistry([{ ...ok, effects: [] }])).toThrow(RegistryRefused)
  })

  it('toggle_bypass.built_id_matches_entry (repro sonnet/p1.ts MODE=mismatch): assertRegistry refuses an entry whose built tool has another id', () => {
    const mismatch = defineEntry({
      id: 'get_thing',
      version: 1,
      toolset: 'graph',
      effects: ['read'] as const,
      openWorld: false,
      env: [],
      build: () => createTool({ id: 'save_thing', description: 'x', inputSchema: z.object({}), execute: async () => ({ ok: 'WRITE_RAN' }) }),
    })
    expect(() => assertRegistry([mismatch])).toThrow(/builds a tool with the id "save_thing"/)
  })

  it('toggle_bypass.version_moves_with_code: the lock holds each entry version, and a change of an entry under its version fails', () => {
    expect(toolsLockProblems(readToolsLock(), currentTools())).toEqual([])
    const root = tmp('tools-lock')
    for (const dir of ['src/tools']) cpSync(join(REPO, dir), join(root, dir), { recursive: true })
    const source = readFileSync(join(root, REGISTRY_FILE), 'utf8')
    writeFileSync(join(root, REGISTRY_FILE), source.replace("description: 'Reads one node of the category tree", "description: 'Reads one node of the tree"))
    expect(toolsLockProblems(readToolsLock(), currentTools(root))).toEqual([expect.stringMatching(/^The tool get_node_context changed under version \d+/)])
    writeFileSync(join(root, REGISTRY_FILE), source)
    writeFileSync(join(root, 'src/tools/workflow-tool.ts'), readFileSync(join(root, 'src/tools/workflow-tool.ts'), 'utf8').replace("'unknown'] as const", "'unknown', 'new_code'] as const"))
    expect(toolsLockProblems(readToolsLock(), currentTools(root)).length).toBe(4) // each stage wrapper
    // A comment edit does not move a fingerprint.
    writeFileSync(join(root, 'src/tools/workflow-tool.ts'), `// a new comment\n${readFileSync(join(REPO, 'src/tools/workflow-tool.ts'), 'utf8')}`)
    expect(toolsLockProblems(readToolsLock(), currentTools(root))).toEqual([])
  })

  it('toggle_bypass.router_call_tools_refused: routerAgent passes no toolsets, clientTools, or tools to a call of the inner agent', async () => {
    const calls: unknown[][] = []
    const original = Agent.prototype.generate
    vi.spyOn(Agent.prototype, 'generate').mockImplementation(function (this: Agent, ...a: unknown[]) {
      calls.push(a)
      return (original as (...x: unknown[]) => Promise<unknown>).apply(this, a) as never
    })
    const spy = spyModel()
    const agent = routerAgent({ id: 'r', model: spy.model as never, instructions: 'x', snapshot: snapshotFor(undefined), handles: { ...fixtureHandles(), writes: {} } })
    expect(agent.run.length).toBe(2)
    await (agent.run as (...a: unknown[]) => Promise<unknown>)('hi', undefined, { toolsets: { sneaky: {} }, clientTools: {}, tools: {} })
    await agent.run('hi', z.object({ a: z.string() }))
    for (const [, options] of calls) {
      for (const key of ['toolsets', 'clientTools', 'tools']) expect(Object.keys((options ?? {}) as object)).not.toContain(key)
    }
    expect(Object.keys(agent)).toEqual([])
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(agent)).sort()).toEqual(['constructor', 'run'])
  })

  it('toggle_bypass.off_tool_never_in_model_list (repro sonnet/p8.ts): the tool list of the model holds only the tools that are on', async () => {
    const spy = spyModel()
    await routerAgent({ id: 'r', model: spy.model as never, instructions: 'x', snapshot: snapshotFor(undefined), handles: { ...fixtureHandles(), writes: {} } }).run('hi')
    expect(spy.names()).toEqual(['get_node_context'])
    expect(() => routerAgent({ id: 'r', model: spy.model as never, instructions: 'x', snapshot: snapshotFor(undefined, 'step'), handles: { ...fixtureHandles(), writes: {} } })).toThrow(/consumer agent/)
  })

  it('toggle_bypass.no_agent_registered: src/mastra/index.ts registers no agent', () => {
    const source = readFileSync(join(REPO, 'src', 'mastra', 'index.ts'), 'utf8')
    const file = ts.createSourceFile('index.ts', source, ts.ScriptTarget.ES2022, true)
    const keys: string[] = []
    const visit = (n: ts.Node) => {
      if (ts.isNewExpression(n) && n.expression.getText(file) === 'Mastra') {
        const arg = n.arguments?.[0]
        if (arg && ts.isObjectLiteralExpression(arg)) for (const p of arg.properties) keys.push(p.name?.getText(file) ?? p.getText(file))
      }
      ts.forEachChild(n, visit)
    }
    visit(file)
    expect(keys.sort()).toEqual(['storage', 'workflows'])
  })

  it('toggle_bypass.front_door_registry_only: the options of a front-door run name only registry tools, StructuredOutput, and the one server harness', async () => {
    resetSdk(structuredReply({ kind: 'cannot_route', missing: 'matcher', detail: 'No matcher.' }))
    const snapshot = snapshotFor(ALL)
    const agent = lockedClaudeAgent({ id: 'front_door', systemPrompt: FRONT_DOOR_PROMPT, snapshot, budget: BUDGET, store: memoryRecorder(), env: agentEnv(markerCli().path) })
    await frontDoor(agent, { kind: 'product_url', url: 'https://example.com/p' }, snapshot)
    const o = sdkState.calls[0]!.options
    expect(Object.keys(o.mcpServers as object)).toEqual(['harness'])
    const names = REGISTRY.ids.map(id => `mcp__harness__${id}`)
    for (const t of o.allowedTools as string[]) expect([...names, 'StructuredOutput']).toContain(t)
    expect(o.tools).toEqual([])
    expect(FrontDoorReply).toBeDefined()
  })

  it('toggle_bypass: resolveTools refuses a forged snapshot', () => {
    const forged = Object.freeze({ ...snapshotFor(undefined), manifest: Object.freeze([...snapshotFor(ALL).manifest]) })
    expect(() => resolveTools(forged, fixtureHandles())).toThrow(/does not match the registry/)
    expect(() => resolveTools({ ...snapshotFor(undefined) }, fixtureHandles())).toThrow(/not frozen/)
    expect(writeEntry()).toBeDefined()
  })
})
