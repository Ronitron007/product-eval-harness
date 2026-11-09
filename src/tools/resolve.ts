import canonicalize from 'canonicalize'
import { REGISTRY, type Registry } from './registry'
import { innerSnapshot, manifestOf, snapshotHash, SnapshotRefused } from './toggles'
import { READ_CALLS, type AnyTool, type HandleSet, type PaidDoor, type PaidRefused, type RawStageWrite, type ReadStore, type ToolEntry, type ToolSnapshot } from './types'

// The resolvers of tools.consumers in docs/design/tool-registry.md. Each consumer reads one
// snapshot. The MCP server, the router agent, the allowedTools list, and toolFor all derive
// from resolveTools().

export class ToolOff extends Error {
  constructor(id: string, entry: ToolEntry | undefined) {
    super(entry ? `The tool ${id} is off (toolset ${entry.toolset}, effects ${entry.effects.join(',')}).` : `The tool ${id} is not in the registry.`)
    this.name = 'ToolOff'
  }
}

// tools.budget: the reservation is one synchronous block before the first await, so no second
// call can pass the check in between. A call that fails after its reservation still counts.
export function createPaidDoor(cap: number): PaidDoor & { readonly used: () => number } {
  let used = 0
  return {
    used: () => used,
    call<T>(name: string, _costUsd: number, fn: () => Promise<T>): Promise<T | PaidRefused> {
      if (used >= cap) return Promise.resolve({ refused: true, name, cap })
      used += 1
      return fn()
    },
  }
}

// tools.budget: one counter for each run and paid tool, in this process. Each handle set, each
// copy of the snapshot, and each toolFor of one run id shares it.
const runCounters = new Map<string, { used: number }>()

export function runPaidDoor(runId: string, toolId: string, cap: number): PaidDoor & { readonly used: () => number } {
  const key = JSON.stringify([runId, toolId])
  const counter = runCounters.get(key) ?? { used: 0 }
  runCounters.set(key, counter)
  return {
    used: () => counter.used,
    call<T>(name: string, _costUsd: number, fn: () => Promise<T>): Promise<T | PaidRefused> {
      if (counter.used >= cap) return Promise.resolve({ refused: true, name, cap })
      counter.used += 1
      return fn()
    },
  }
}

// Only the read calls, bound, so that a read tool has no write function in scope (second_path.handles_by_effect).
export function readOnly(store: ReadStore): ReadStore {
  const out: Record<string, unknown> = {}
  for (const call of READ_CALLS) {
    const fn = store[call]
    if (typeof fn !== 'function') throw new Error(`The read store has no ${call}.`)
    out[call] = fn.bind(store)
  }
  return Object.freeze(out) as unknown as ReadStore
}

// A caller can hand in any object as a snapshot, so each resolve checks it against the registry.
function assertSnapshot(snapshot: ToolSnapshot, registry: Registry): void {
  if (!Object.isFrozen(snapshot) || !Object.isFrozen(snapshot.toggles) || !Object.isFrozen(snapshot.manifest)) {
    throw new SnapshotRefused('The tool snapshot is not frozen. Make it with readSnapshot().')
  }
  const manifest = manifestOf(snapshot.toggles, registry)
  if (canonicalize(manifest) !== canonicalize(snapshot.manifest)) throw new SnapshotRefused(`The manifest of run ${snapshot.runId} does not match the registry.`)
  if (snapshotHash({ consumer: snapshot.consumer, toggles: snapshot.toggles, manifest }) !== snapshot.hash) {
    throw new SnapshotRefused(`The hash of the tool snapshot of run ${snapshot.runId} does not match its content.`)
  }
}

// second_path.one_entry_per_write: each write function goes to exactly one entry.
function assertWrites(handles: HandleSet, registry: Registry): void {
  const owners = new Map<unknown, string>()
  for (const [id, fn] of Object.entries(handles.writes)) {
    const entry = registry.byId(id)
    if (entry === undefined || !entry.effects.includes('db_write')) throw new Error(`The write door ${id} names no db_write tool of the registry.`)
    if (typeof fn !== 'function') throw new Error(`The write door ${id} is not a function.`)
    const other = owners.get(fn)
    if (other !== undefined) throw new Error(`The tools ${other} and ${id} get one write function. Each write function goes to one entry (tools.one_path).`)
    owners.set(fn, id)
  }
}

function build(entry: ToolEntry, snapshot: ToolSnapshot, handles: HandleSet, registry: Registry): AnyTool {
  const h: Record<string, unknown> = { store: readOnly(handles.store) }
  if (entry.effects.includes('paid')) h.paid = runPaidDoor(snapshot.runId, entry.id, entry.maxCallsPerRun ?? 1)
  if (entry.effects.includes('db_write')) {
    const raw = handles.writes[entry.id]
    if (raw === undefined) throw new Error(`The tool ${entry.id} is on, and the handles have no write door for it.`)
    // A wrapper gets its write with the inner snapshot of the run bound in, never the snapshot itself.
    h.write =
      entry.inner === undefined
        ? raw
        : (runId: string, input: { nodeId: string }) => (raw as unknown as RawStageWrite)({ runId, inner: innerSnapshot(snapshot, entry, runId, registry) }, input)
  }
  const tool = entry.build(Object.freeze(h) as never)
  if (tool.id !== entry.id) throw new Error(`The entry ${entry.id} built the tool ${tool.id}.`)
  return tool
}

// One built set for each snapshot and handle set. The paid count lives with the run id (runPaidDoor).
const built = new WeakMap<Registry, WeakMap<ToolSnapshot, WeakMap<HandleSet, Readonly<Record<string, AnyTool>>>>>()

// The tools that are on, by id. The one resolver of the registry.
export function resolveTools(snapshot: ToolSnapshot, handles: HandleSet, registry: Registry = REGISTRY): Readonly<Record<string, AnyTool>> {
  assertSnapshot(snapshot, registry)
  const bySnapshot = built.get(registry) ?? new WeakMap()
  built.set(registry, bySnapshot)
  const byHandles = bySnapshot.get(snapshot) ?? new WeakMap()
  bySnapshot.set(snapshot, byHandles)
  const known = byHandles.get(handles)
  if (known !== undefined) return known
  assertWrites(handles, registry)
  const tools: Record<string, AnyTool> = {}
  for (const row of snapshot.manifest) tools[row.id] = build(registry.byId(row.id)!, snapshot, handles, registry)
  const frozen = Object.freeze(tools)
  byHandles.set(handles, frozen)
  return frozen
}

// The second fence for claude -p: the exact allow-list, in Claude Code names (mcp__<server>__<id>).
export function allowedToolsFor(server: string, snapshot: ToolSnapshot): string[] {
  return snapshot.manifest.map(m => `mcp__${server}__${m.id}`)
}

// A workflow step calls this, never an entry, so a tool that is off refuses there too.
export function toolFor(id: string, snapshot: ToolSnapshot, handles: HandleSet, registry: Registry = REGISTRY): AnyTool {
  const tool = resolveTools(snapshot, handles, registry)[id]
  if (tool === undefined) throw new ToolOff(id, registry.byId(id))
  return tool
}
