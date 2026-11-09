import { describe, expect, it } from 'vitest'
import { CONSUMERS, REGISTRY, readSnapshot, toolFor, ToolOff } from '../../src/tools'
import { fixtureHandles } from './fixture'
import { connectServer, snapshotFor, toolNames } from './helpers'

// write_unallowed: a db_write tool runs with no allow (tools.toggles).

const ALL = '{"allowEffects":["read","paid","db_write"]}'

describe('write_unallowed', () => {
  it('write_unallowed.default_off: the default snapshot turns on no db_write and no paid tool, for each consumer', () => {
    for (const consumer of CONSUMERS) {
      const s = readSnapshot({}, { runId: 'r', consumer })
      expect(s.toggles.allowEffects).toEqual(['read'])
      expect(s.manifest.filter(m => m.effects.some(e => e !== 'read'))).toEqual([])
      expect(s.manifest.map(m => m.id)).toEqual(['get_node_context'])
    }
  })

  it('write_unallowed.tool_switch_needs_effect: a tool switch with no db_write in allowEffects leaves the tool off', () => {
    expect(snapshotFor('{"tools":{"run_create_node":true}}').manifest.map(m => m.id)).toEqual(['get_node_context'])
    expect(snapshotFor('{"tools":{"run_create_node":true},"allowEffects":["read","paid"]}').manifest.map(m => m.id)).toEqual(['get_node_context'])
    expect(snapshotFor('{"tools":{"run_create_node":true},"toolsets":{"stages":false},"allowEffects":["read","paid","db_write"]}').manifest.map(m => m.id)).toEqual([
      'get_node_context',
      'run_create_node',
    ])
  })

  it('write_unallowed.server_does_not_list: a client lists no db_write tool from a server whose snapshot does not allow it', async () => {
    const off = await connectServer(snapshotFor(undefined))
    try {
      expect(await toolNames(off)).toEqual(['get_node_context'])
    } finally {
      await off.close()
    }
    const on = await connectServer(snapshotFor(ALL))
    try {
      expect(await toolNames(on)).toEqual([...REGISTRY.ids].sort())
    } finally {
      await on.close()
    }
  }, 60_000)

  it('write_unallowed.tool_for_throws: toolFor refuses a db_write tool that the snapshot does not allow', () => {
    const handles = { ...fixtureHandles(), writes: {} }
    expect(() => toolFor('run_create_node', snapshotFor(undefined, 'step'), handles)).toThrow(ToolOff)
    expect(() => toolFor('run_create_node', snapshotFor('{"allowEffects":["read","paid"]}', 'step'), handles)).toThrow(/is off \(toolset stages, effects paid,db_write\)/)
  })
})
