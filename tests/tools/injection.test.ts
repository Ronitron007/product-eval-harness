import fc from 'fast-check'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { FRONT_DOOR_PROMPT, FrontDoorReply, frontDoor, lockedClaudeAgent } from '../../src/agent'
import { assertRegistry, CONSUMERS, defineEntry, innerSnapshot, readSnapshot, REGISTRY, resolveTools, SnapshotRefused, workflowTool, type ToolSnapshot } from '../../src/tools'
import { createTool } from '@mastra/core/tools'
import { agentEnv, BUDGET, markerCli, memoryRecorder, structuredReply, withResult } from '../agent/helpers'
import { resetSdk, sdkState } from '../agent/sdk-mock'
import { useDb } from '../stage/helpers'
import { BASE_ENTRIES, FIXTURE, fixtureHandles, WITH_WRAPPER, webEntry, writeEntry } from './fixture'
import { snapshotFor } from './helpers'
import { spyDrafterOptions, stageTool, wrapStore, type StageSpy } from './stage-env'

vi.mock('@anthropic-ai/claude-agent-sdk', async () => (await import('../agent/sdk-mock')).sdkModule())

// injection: a model holds a db_write tool while open-world text is in its context, or the front
// door throws (tools.injection, tools.injection_scope, tools.front_door).

const db = useDb()
const cli = markerCli()
beforeEach(() => resetSdk())
const URL_REQUEST = { kind: 'product_url', url: 'https://example.com/p' } as const

function frontDoorRun(script: unknown[], harnessTools?: string) {
  resetSdk(script)
  const snapshot = snapshotFor(harnessTools)
  const agent = lockedClaudeAgent({ id: 'front_door', systemPrompt: FRONT_DOOR_PROMPT, snapshot, budget: BUDGET, store: memoryRecorder(), env: agentEnv(cli.path) })
  return frontDoor(agent, URL_REQUEST, snapshot)
}

describe('injection', () => {
  it('injection.open_world_and_write_refused (repro opus/probe-mix.ts): an agent or mcp_client snapshot refuses an openWorld tool with a db_write tool', () => {
    const both = '{"allowEffects":["read","db_write"]}'
    for (const consumer of ['agent', 'mcp_client'] as const) {
      expect(() => readSnapshot({ HARNESS_TOOLS: both }, { runId: 'r', consumer }, FIXTURE)).toThrow(SnapshotRefused)
      expect(() => readSnapshot({ HARNESS_TOOLS: both }, { runId: 'r', consumer }, FIXTURE)).toThrow(/web_thing .* save_thing/)
      expect(readSnapshot({ HARNESS_TOOLS: '{"allowEffects":["read","db_write"],"tools":{"web_thing":false}}' }, { runId: 'r', consumer }, FIXTURE).manifest.map(m => m.id)).toContain('save_thing')
    }
    expect(readSnapshot({ HARNESS_TOOLS: both }, { runId: 'r', consumer: 'step' }, FIXTURE).manifest.map(m => m.id)).toEqual(['read_thing', 'save_thing', 'web_thing'])
    // A stage wrapper is not open-world for its caller: its result is status only (tools.injection_scope).
    // The direct mix of the wrapper and an open-world tool in one snapshot stays refused.
    expect(readSnapshot({ HARNESS_TOOLS: '{"allowEffects":["read","paid","db_write"],"tools":{"web_thing":false}}' }, { runId: 'r', consumer: 'agent' }, WITH_WRAPPER).manifest.map(m => m.id)).toContain('run_create_node')
    expect(() => readSnapshot({ HARNESS_TOOLS: '{"allowEffects":["read","paid","db_write"],"tools":{"save_thing":false}}' }, { runId: 'r', consumer: 'agent' }, WITH_WRAPPER)).toThrow(/web_thing and the db_write tools run_create_node/)
  })

  it('injection.no_tool_changes_toggles: no tool gets the snapshot in its handles, and the snapshot is frozen', () => {
    const seen: object[] = []
    const spy = defineEntry({
      id: 'spy_thing',
      version: 1,
      toolset: 'graph',
      effects: ['read', 'paid', 'db_write'] as const,
      openWorld: false,
      env: [],
      build: h => (seen.push(h), createTool({ id: 'spy_thing', description: 'x', inputSchema: z.object({}), execute: async () => ({}) })),
    })
    const registry = { ...FIXTURE, entries: [...FIXTURE.entries, spy] }
    assertRegistry(registry.entries)
    const snapshot = readSnapshot({ HARNESS_TOOLS: '{"allowEffects":["read","paid","db_write"],"tools":{"web_thing":false}}' }, { runId: 'r', consumer: 'step' }, FIXTURE)
    resolveTools(snapshot, fixtureHandles(), FIXTURE)
    expect(seen.length).toBeGreaterThan(0)
    for (const h of seen) expect(Object.keys(h).sort()).toEqual(['paid', 'store', 'write'])
    const s = snapshot as unknown as { toggles: { allowEffects: string[]; tools: Record<string, boolean> }; manifest: unknown[] }
    expect(Object.isFrozen(snapshot) && Object.isFrozen(s.toggles) && Object.isFrozen(s.toggles.allowEffects) && Object.isFrozen(s.manifest)).toBe(true)
    expect(() => s.toggles.allowEffects.push('db_write')).toThrow()
    expect(() => (s.toggles.tools.web_thing = true)).toThrow()
  })

  it('injection.stage_result_no_free_text: assertRegistry refuses a wrapper with openWorld false whose result schema fails assertStatusOnly', () => {
    const wrapper = workflowTool({ id: 'run_create_node', version: 1, description: 'x', inner: [], env: [] })
    const leaky = { ...wrapper, build: () => createTool({ id: 'run_create_node', description: 'x', inputSchema: z.object({}), outputSchema: z.object({ status: z.enum(['failed']), error: z.string() }).strict(), execute: async () => ({ status: 'failed' as const, error: '' }) }) }
    expect(() => assertRegistry([...BASE_ENTRIES, leaky])).toThrow(/openWorld false: The result schema is not status only at .error/)
    expect(() => assertRegistry([...BASE_ENTRIES, { ...leaky, build: () => createTool({ id: 'run_create_node', description: 'x', inputSchema: z.object({}), execute: async () => ({}) }) }])).toThrow(/has no result schema/)
    expect(() => assertRegistry([...BASE_ENTRIES, wrapper])).not.toThrow()
  })

  it('injection.stage_inner_snapshot_no_write: the inner snapshot of a stage wrapper holds no db_write tool, for any toggles of the run', () => {
    const wrappers = [...REGISTRY.entries.filter(e => e.inner), WITH_WRAPPER.byId('run_create_node')!]
    fc.assert(
      fc.property(
        fc.record({ graph: fc.boolean(), research: fc.boolean(), stages: fc.boolean() }),
        fc.subarray(['read', 'paid', 'db_write'] as const),
        fc.constantFrom(...CONSUMERS),
        (toolsets, allowEffects, consumer) => {
          for (const [registry, wrapper] of wrappers.map(w => [w.id === 'run_create_node' && w.inner!.length ? WITH_WRAPPER : REGISTRY, w] as const)) {
            let run: ToolSnapshot
            try {
              run = readSnapshot({ HARNESS_TOOLS: JSON.stringify({ toolsets, allowEffects }) }, { runId: 'r', consumer }, registry)
            } catch {
              continue // a refused mix
            }
            const inner = innerSnapshot(run, wrapper, 'stage-run', registry)
            expect(inner.consumer).toBe('agent')
            expect(inner.manifest.filter(m => m.effects.includes('db_write'))).toEqual([])
            for (const m of inner.manifest) expect(wrapper.inner).toContain(m.id)
          }
        },
      ),
    )
    const run = readSnapshot({ HARNESS_TOOLS: '{"allowEffects":["read","paid","db_write"],"tools":{"web_thing":false}}' }, { runId: 'r', consumer: 'agent' }, WITH_WRAPPER)
    expect(innerSnapshot(run, WITH_WRAPPER.byId('run_create_node')!, 's', WITH_WRAPPER).manifest.map(m => m.id)).toEqual(['read_thing', 'web_thing'])
  })

  it('injection.inner_list_refuses_write: assertRegistry refuses a wrapper whose inner list holds a db_write tool', () => {
    const bad = workflowTool({ id: 'run_create_node', version: 1, description: 'x', inner: ['web_thing', 'save_thing'], env: [] })
    expect(() => assertRegistry([...BASE_ENTRIES, bad])).toThrow(/names the db_write tool save_thing as an inner tool/)
    expect(() => assertRegistry([webEntry(), writeEntry(), workflowTool({ id: 'run_create_node', version: 1, description: 'x', inner: ['nope'], env: [] })])).toThrow(/not in the registry/)
  })

  it('injection.stage_writes_in_code_only: a stage run through its wrapper writes only through the store calls of the stage code', async () => {
    const spy: StageSpy = { writes: [], drafterTools: [] }
    const env = db.env({ drafter: spyDrafterOptions(spy), wrap: wrapStore(spy) })
    const { tool } = stageTool(env, spy)
    const result = (await tool.execute!({ nodeId: 'sunscreen' }, {} as never)) as { status: string; runId: string }
    expect(result).toMatchObject({ status: 'ended', end: 'accepted' })
    expect(spy.drafterTools).toEqual([[]]) // the drafter model holds no tool
    expect(spy.writes[0]).toBe('recordToolRun') // the inner snapshot, in code
    expect(spy.writes).toEqual(expect.arrayContaining(['recordStageRun', 'claimDraft', 'addDraft', 'claimJudge', 'writeVerdicts', 'endRun']))
    expect(await env.graph.toolRunOf(result.runId)).toMatchObject({ consumer: 'agent', manifest: [] })
  })

  it('injection.front_door_reply_parsed: a reply that fails FrontDoorReply, or a done with no tool, gives cannot_route with reply_unparsed', async () => {
    expect(await frontDoorRun(structuredReply({ kind: 'cannot_route', missing: 'matcher', detail: 'No registry tool matches a product to a node.' }))).toEqual({
      kind: 'cannot_route',
      missing: 'matcher',
      detail: 'No registry tool matches a product to a node.',
    })
    expect(await frontDoorRun(structuredReply({ kind: 'done', tool: 'get_node_context', result: { path: [] } }))).toEqual({ kind: 'done', tool: 'get_node_context', result: { path: [] } })
    for (const bad of [{ kind: 'done', result: 1 }, { kind: 'done', tool: 'get_node_context' }, { kind: 'nope' }, { kind: 'cannot_route', missing: 'matcher' }, { kind: 'done', tool: 'save_record', result: 1 }, 'text'])
      expect(await frontDoorRun(structuredReply(bad, 'x'.repeat(900))), JSON.stringify(bad)).toEqual({ kind: 'cannot_route', missing: 'reply_unparsed', detail: 'x'.repeat(500) })
    expect(await frontDoorRun(structuredReply({ kind: 'done', tool: 'run_create_node', result: {} }))).toMatchObject({ kind: 'cannot_route', missing: 'tool_off' })
    expect(await frontDoor(lockedClaudeAgent({ id: 'fd', systemPrompt: 'x', snapshot: snapshotFor(undefined), budget: BUDGET, store: memoryRecorder(), env: agentEnv(cli.path) }), { kind: 'other' }, snapshotFor(undefined))).toMatchObject({ kind: 'cannot_route', missing: 'run_failed' })
  })

  it('injection.front_door_throw_maps (repro sonnet/p9.ts): a run that throws, such as with error_max_budget_usd, gives cannot_route with run_failed', async () => {
    const budget = withResult({ subtype: 'error_max_budget_usd', is_error: true, errors: ['Reached maximum budget ($0.05)'] })
    expect(await frontDoorRun(budget)).toEqual({ kind: 'cannot_route', missing: 'run_failed', detail: expect.stringMatching(/Reached maximum budget/) })
    resetSdk([])
    sdkState.throwAfter = new Error('Claude Code process exited with code 1')
    const snapshot = snapshotFor(undefined)
    const thrown = await frontDoor(lockedClaudeAgent({ id: 'fd', systemPrompt: 'x', snapshot, budget: BUDGET, store: memoryRecorder(), env: agentEnv(cli.path) }), URL_REQUEST, snapshot)
    expect(thrown).toEqual({ kind: 'cannot_route', missing: 'run_failed', detail: expect.stringMatching(/exited with code 1/) })
    const broken = { run: async () => Promise.reject(new Error('boom')) }
    await expect(frontDoor(broken, URL_REQUEST, snapshot)).resolves.toEqual({ kind: 'cannot_route', missing: 'run_failed', detail: 'boom' })
  })

  it('injection.front_door_schema_root_object (repro opus/runs/run4): the JSON Schema of FrontDoorReply has type object at its root, and no root oneOf or anyOf', async () => {
    const schema = z.toJSONSchema(FrontDoorReply) as Record<string, unknown>
    expect(schema.type).toBe('object')
    expect(schema.oneOf).toBeUndefined()
    expect(schema.anyOf).toBeUndefined()
    // The schema that the CLI gets, through @mastra/claude.
    await frontDoorRun(structuredReply({ kind: 'cannot_route', missing: 'matcher', detail: 'd' }))
    const sent = (sdkState.calls[0]!.options.outputFormat as { type: string; schema: Record<string, unknown> })
    expect(sent.type).toBe('json_schema')
    expect(sent.schema.type).toBe('object')
    expect(sent.schema.oneOf ?? sent.schema.anyOf).toBeUndefined()
  })

  it('injection.front_door_allows_structured_output (repro opus/runs/run2, run3): a run with a schema allows StructuredOutput, and a run with no schema does not', async () => {
    await frontDoorRun(structuredReply({ kind: 'cannot_route', missing: 'matcher', detail: 'd' }))
    expect(sdkState.calls[0]!.options.allowedTools).toEqual(['mcp__harness__get_node_context', 'StructuredOutput'])
    resetSdk(structuredReply('x'))
    const snapshot = snapshotFor(undefined)
    await lockedClaudeAgent({ id: 'plain', systemPrompt: 'x', snapshot, budget: BUDGET, store: memoryRecorder(), env: agentEnv(cli.path) }).run('hi')
    expect(sdkState.calls[0]!.options.allowedTools).toEqual(['mcp__harness__get_node_context'])
  })
})
