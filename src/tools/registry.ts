import { PROVIDER_REGISTRY } from '@mastra/core/llm'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { NodeId } from '../rules/schema'
import { defineEntry, EFFECTS, TOOL_IDS, TOOLSETS, type AnyTool, type HandlesFor, type PaidDoor, type ReadStore, type ToolEntry } from './types'
import { assertStatusOnly, isStoreError, logToolFailure, workflowTool } from './workflow-tool'

// The tool registry (tools.registry in docs/design/tool-registry.md): each tool has one entry,
// with its version, toolset, effects, openWorld flag, and a build function. A workflow enters
// only as a thin wrapper tool. src/tools/code.lock.json pins a fingerprint of each entry version
// (npm run tools:lock).

export interface Registry {
  readonly entries: readonly ToolEntry[]
  readonly ids: readonly [string, ...string[]]
  byId(id: string): ToolEntry | undefined
}

const SNAKE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/

// Handles that throw on each use. assertRegistry() builds each tool with them, to read its id
// and its schemas. Building a tool never calls a handle.
const unused = (what: string) => () => {
  throw new Error(`assertRegistry built a tool with probe handles, and the tool used ${what}.`)
}
const PROBE_STORE: ReadStore = { pathToRoot: unused('the store'), siblings: unused('the store'), subtree: unused('the store') }
const PROBE_PAID: PaidDoor = { call: unused('the paid door') }
const PROBE_HANDLES = Object.freeze({ store: PROBE_STORE, paid: PROBE_PAID, write: unused('the write door') })

export class RegistryRefused extends Error {
  constructor(problems: readonly string[]) {
    super(`The tool registry is refused:\n${problems.join('\n')}`)
    this.name = 'RegistryRefused'
  }
}

// Refuses each bad entry (toggle_bypass.registry_refuses_bad_entry, toggle_bypass.built_id_matches_entry,
// injection.stage_result_no_free_text, injection.inner_list_refuses_write).
export function assertRegistry(entries: readonly ToolEntry[]): void {
  const problems: string[] = []
  const seen = new Set<string>()
  const byId = new Map(entries.map(e => [e.id, e]))
  for (const e of entries) {
    const at = `The entry ${JSON.stringify(e.id)}`
    if (seen.has(e.id)) problems.push(`${at} appears twice. Each tool has one entry.`)
    seen.add(e.id)
    if (!SNAKE.test(e.id)) problems.push(`${at} has an id that is not snake_case.`)
    if (!(TOOLSETS as readonly string[]).includes(e.toolset)) problems.push(`${at} has the toolset ${JSON.stringify(e.toolset)}, which is not one of ${TOOLSETS.join(', ')}.`)
    if (e.effects.length === 0) problems.push(`${at} has no effects.`)
    for (const x of e.effects) if (!(EFFECTS as readonly string[]).includes(x)) problems.push(`${at} has the effect ${JSON.stringify(x)}, which is not one of ${EFFECTS.join(', ')}.`)
    if (new Set(e.effects).size !== e.effects.length) problems.push(`${at} names an effect twice.`)
    if (!Number.isInteger(e.version) || e.version < 1) problems.push(`${at} has the version ${String(e.version)}. Give a positive integer.`)
    if (e.maxCallsPerRun !== undefined && (!e.effects.includes('paid') || !Number.isInteger(e.maxCallsPerRun) || e.maxCallsPerRun < 1)) {
      problems.push(`${at} sets maxCallsPerRun, which only a paid tool takes, as a positive integer.`)
    }
    let tool: AnyTool | undefined
    try {
      tool = e.build(PROBE_HANDLES as never)
    } catch (err) {
      problems.push(`${at} fails to build: ${(err as Error).message}`)
    }
    if (tool !== undefined && tool.id !== e.id) problems.push(`${at} builds a tool with the id ${JSON.stringify(tool.id)}. The ids must be equal.`)
    if (e.inner !== undefined) {
      for (const id of e.inner) {
        const inner = byId.get(id)
        if (inner === undefined) problems.push(`${at} names the inner tool ${id}, which is not in the registry.`)
        else if (inner.effects.includes('db_write')) problems.push(`${at} names the db_write tool ${id} as an inner tool (tools.injection_scope).`)
      }
      if (!e.openWorld) {
        try {
          if (tool?.outputSchema === undefined) throw new Error('The wrapper has no result schema.')
          assertStatusOnly(tool.outputSchema)
        } catch (err) {
          problems.push(`${at} is a wrapper with openWorld false: ${(err as Error).message}`)
        }
      }
    }
  }
  if (problems.length > 0) throw new RegistryRefused(problems)
}

export function defineRegistry(entries: readonly ToolEntry[]): Registry {
  assertRegistry(entries)
  const frozen = Object.freeze([...entries].sort((a, b) => (a.id < b.id ? -1 : 1)))
  const ids = frozen.map(e => e.id)
  if (ids.length === 0) throw new RegistryRefused(['A registry needs at least one entry.'])
  const map = new Map(frozen.map(e => [e.id, e]))
  return Object.freeze({ entries: frozen, ids: ids as [string, ...string[]], byId: (id: string) => map.get(id) })
}

// ---- the entries ----

const NodeRef = z.object({ id: z.string(), label: z.string() }).strict()

export const DATABASE_ENV = 'HARNESS_DATABASE_URL'
// A stage run calls models on the Mastra model router, so it needs the key of each provider.
const MODEL_KEYS = [...new Set(Object.values(PROVIDER_REGISTRY).flatMap(p => [p.apiKeyEnvVar].flat()))].sort()
const STAGE_ENV = [DATABASE_ENV, 'HARNESS_DRAFTER_MODEL', 'HARNESS_JUDGE_MODEL', ...MODEL_KEYS]

const STAGE_TEXT = 'It starts one run of the stage workflow and returns its status only: the run id, the end or the reason to wait, the round, and the output id. A run is a paid run.'

export const REGISTRY: Registry = defineRegistry([
  defineEntry({
    id: 'get_node_context',
    version: 2,
    toolset: 'graph',
    effects: ['read'] as const,
    openWorld: false,
    env: [DATABASE_ENV],
    build: (handles: HandlesFor<readonly ['read']>) =>
      createTool({
        id: 'get_node_context',
        description: 'Reads one node of the category tree: the path from the root down to the node, and the other children of its parent.',
        inputSchema: z.object({ nodeId: NodeId }).strict(),
        outputSchema: z.object({ path: z.array(NodeRef), siblings: z.array(NodeRef) }).strict(),
        mcp: { annotations: { readOnlyHint: true, openWorldHint: false } },
        execute: async ({ nodeId }) => {
          try {
            const [path, siblings] = await Promise.all([handles.store.pathToRoot(nodeId), handles.store.siblings(nodeId)])
            const pick = (n: { id: string; label: string }) => ({ id: n.id, label: n.label })
            return { path: path.map(pick), siblings: siblings.map(pick) }
          } catch (error) {
            // The detail goes to the log. The model gets a fixed text (tools.status_only).
            logToolFailure('get_node_context', null, error)
            const missing = error instanceof Error && error.message.startsWith(`No node ${nodeId} `)
            throw new Error(missing ? `The node ${nodeId} is not in the category tree.` : `get_node_context failed (${isStoreError(error) ? 'store_error' : 'unknown'}).`)
          }
        },
      }),
  }),
  workflowTool({ id: 'run_define_criteria', version: 3, description: `Runs the stage define_criteria at one domain node. ${STAGE_TEXT}`, inner: [], env: STAGE_ENV }),
  workflowTool({ id: 'run_create_node', version: 3, description: `Runs the stage create_node at one node. ${STAGE_TEXT}`, inner: [], env: STAGE_ENV }),
  workflowTool({ id: 'run_create_pack', version: 3, description: `Runs the stage create_pack at one leaf node. ${STAGE_TEXT}`, inner: [], env: STAGE_ENV }),
  workflowTool({ id: 'run_create_layout', version: 3, description: `Runs the stage create_layout at one leaf node. ${STAGE_TEXT}`, inner: [], env: STAGE_ENV }),
])

if (REGISTRY.ids.join(',') !== [...TOOL_IDS].sort().join(',')) {
  throw new RegistryRefused([`TOOL_IDS in src/tools/types.ts (${TOOL_IDS.join(', ')}) and the registry (${REGISTRY.ids.join(', ')}) differ.`])
}
