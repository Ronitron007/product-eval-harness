import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { defineEntry, defineRegistry, workflowTool, type HandleSet, type HandlesFor, type ReadStore, type StageOutcome, type ToolEntry } from '../../src/tools'

// A registry of test tools, with no store and no model. Each entry goes through defineRegistry, so
// assertRegistry checks it as it checks the real registry. tests/tools/fixture-server.ts serves it.

export const nodeRows = (id: string) => [{ id: 'skincare', parentId: null, level: 'domain', path: 'skincare', label: 'Skincare' }, { id, parentId: 'skincare', level: 'inner', path: `skincare.${id}`, label: id }]

export const readEntry = (id = 'read_thing', o: Partial<ToolEntry> = {}) =>
  defineEntry({
    id,
    version: 1,
    toolset: 'graph',
    effects: ['read'] as const,
    openWorld: false,
    env: ['FIXTURE_READ_KEY'],
    build: (h: HandlesFor<readonly ['read']>) =>
      createTool({
        id,
        description: 'Reads the path of a node.',
        inputSchema: z.object({ nodeId: z.string() }).strict(),
        outputSchema: z.object({ path: z.array(z.string()) }),
        execute: async ({ nodeId }) => ({ path: (await h.store.pathToRoot(nodeId)).map(n => n.id) }),
      }),
    ...o,
  })

// A paid tool with a slow execute that counts its runs (budget_burn.parallel_calls_one_runs).
export const slowPaidEntry = (id = 'slow_paid', ms = 300) =>
  defineEntry({
    id,
    version: 1,
    toolset: 'research',
    effects: ['read', 'paid'] as const,
    openWorld: false,
    maxCallsPerRun: 1,
    env: [],
    build: (h: HandlesFor<readonly ['read', 'paid']>) =>
      createTool({
        id,
        description: 'A slow paid call.',
        inputSchema: z.object({}).strict(),
        outputSchema: z.object({ ran: z.boolean() }),
        execute: async () => {
          const r = await h.paid.call(id, 0.01, async () => (await new Promise(res => setTimeout(res, ms)), { ran: true }))
          return 'refused' in r ? { ran: false } : r
        },
      }),
  })

export const writeEntry = (id = 'save_thing') =>
  defineEntry({
    id,
    version: 1,
    toolset: 'graph',
    effects: ['db_write'] as const,
    openWorld: false,
    env: [],
    build: (h: HandlesFor<readonly ['db_write']>) =>
      createTool({
        id,
        description: 'Saves one thing.',
        inputSchema: z.object({ text: z.string() }).strict(),
        outputSchema: z.object({ saved: z.boolean() }),
        execute: async ({ text }) => ({ saved: Boolean(await (h.write as (t: string) => Promise<boolean>)(text)) }),
      }),
  })

export const webEntry = (id = 'web_thing') =>
  defineEntry({
    id,
    version: 1,
    toolset: 'research',
    effects: ['read'] as const,
    openWorld: true,
    env: [],
    build: () =>
      createTool({
        id,
        description: 'Gives outside text.',
        inputSchema: z.object({ url: z.string() }).strict(),
        outputSchema: z.object({ text: z.string() }),
        execute: async () => ({ text: 'outside text' }),
      }),
  })

export const BASE_ENTRIES = [readEntry(), slowPaidEntry(), writeEntry(), webEntry()]
export const FIXTURE = defineRegistry(BASE_ENTRIES)
// The same tools with a stage wrapper whose inner tool reads the web (tools.injection_scope).
export const WITH_WRAPPER = defineRegistry([...BASE_ENTRIES, workflowTool({ id: 'run_create_node', version: 1, description: 'A test wrapper.', inner: ['web_thing', 'read_thing'], env: [] })])

export const fakeStore = (): ReadStore & { calls: string[] } => {
  const calls: string[] = []
  return {
    calls,
    pathToRoot: async id => (calls.push('pathToRoot'), nodeRows(id)),
    siblings: async () => (calls.push('siblings'), []),
    subtree: async id => (calls.push('subtree'), nodeRows(id)),
  }
}

export function fixtureHandles(o: { writes?: HandleSet['writes'] } = {}): HandleSet {
  return { store: fakeStore(), writes: o.writes ?? { save_thing: async () => true } }
}

export const SUCCESS: StageOutcome = { status: 'success', result: { runId: 'x', end: 'accepted', round: 1, outputId: '6f1c1c4e-1111-4a4a-8a8a-1234567890ab' } }

// The toggles that turn on the one stage wrapper run_create_node, with its effects.
export const ONLY_NODE = '{"toolsets":{"stages":false},"tools":{"run_create_node":true},"allowEffects":["read","paid","db_write"]}'
