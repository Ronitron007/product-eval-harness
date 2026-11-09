import { describe, expect, it, vi } from 'vitest'
import { buildToolServer, readSnapshot } from '../../src/tools'
import { fixtureHandles, SUCCESS } from './fixture'
import { connectServer, snapshotFor, toolNames } from './helpers'

const captured = vi.hoisted(() => [] as Record<string, unknown>[])
vi.mock('@mastra/mcp', async importOriginal => {
  const real = await importOriginal<typeof import('@mastra/mcp')>()
  class SpyServer extends real.MCPServer {
    constructor(opts: ConstructorParameters<typeof real.MCPServer>[0]) {
      captured.push(opts as never)
      super(opts)
    }
  }
  return { ...real, MCPServer: SpyServer }
})

// workflow_listed: the server lists a workflow past its toggle (tools.registry, tools.not_used).

const ALL = '{"allowEffects":["read","paid","db_write"]}'

describe('workflow_listed', () => {
  it('workflow_listed.wrapper_only (repro fence-2.ndjson, run_check_records): buildToolServer passes no workflows and no agents to MCPServer', () => {
    const writes = { run_create_node: async () => SUCCESS, run_create_pack: async () => SUCCESS, run_define_criteria: async () => SUCCESS, run_create_layout: async () => SUCCESS }
    for (const toggles of [undefined, ALL]) {
      captured.length = 0
      buildToolServer(snapshotFor(toggles), { ...fixtureHandles(), writes })
      expect(captured).toHaveLength(1)
      expect(Object.keys(captured[0]!).sort()).toEqual(['id', 'name', 'tools', 'version'])
    }
    expect(() => buildToolServer(readSnapshot({}, { runId: 'r', consumer: 'step' }), fixtureHandles())).toThrow(/step snapshot/)
  })

  it('workflow_listed.stages_off_none_listed: a server whose snapshot has the toolset stages off lists no run_ tool', async () => {
    const off = await connectServer(snapshotFor('{"toolsets":{"stages":false},"allowEffects":["read","paid","db_write"]}'))
    try {
      expect((await toolNames(off)).filter(n => n.startsWith('run_'))).toEqual([])
      expect(await toolNames(off)).toEqual(['get_node_context'])
    } finally {
      await off.close()
    }
    const on = await connectServer(snapshotFor(ALL))
    try {
      expect((await toolNames(on)).filter(n => n.startsWith('run_'))).toEqual(['run_create_layout', 'run_create_node', 'run_create_pack', 'run_define_criteria'])
    } finally {
      await on.close()
    }
  }, 60_000)
})
