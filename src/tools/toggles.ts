import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import { z } from 'zod'
import { REGISTRY, type Registry } from './registry'
import {
  CONSUMERS,
  EFFECTS,
  TOOLSETS,
  togglesSchema,
  Toolset,
  type Consumer,
  type Effect,
  type ManifestRow,
  type ResolvedToggles,
  type ToolEntry,
  type ToolSnapshot,
} from './types'

// The toggles and the tool snapshot of a run (tools.toggles in docs/design/tool-registry.md).
// A run reads HARNESS_TOOLS once. No other code reads it again in the run.

type Env = Readonly<Record<string, string | undefined>>

export const DEFAULT_EFFECTS: readonly Effect[] = ['read']

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Reflect.ownKeys(value)) deepFreeze((value as Record<PropertyKey, unknown>)[key])
  }
  return value
}

// The defaults: each toolset on, allowEffects ['read'] (write_unallowed.default_off).
export function resolveToggles(raw: unknown, registry: Registry = REGISTRY): ResolvedToggles {
  const parsed = togglesSchema(registry.ids).parse(raw)
  const toolsets = Object.fromEntries(TOOLSETS.map(t => [t, parsed.toolsets?.[t] ?? true])) as Record<Toolset, boolean>
  const tools = Object.fromEntries(Object.entries(parsed.tools ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) as Record<string, boolean>
  const allow = parsed.allowEffects ?? DEFAULT_EFFECTS
  const allowEffects = EFFECTS.filter(e => allow.includes(e))
  return { toolsets, tools, allowEffects }
}

// A tool is on when its switch is on, or when it has no switch and its toolset is on. Each of its
// effects must be in allowEffects too, so a tool switch cannot turn on an effect that the run did not allow.
export function isOn(entry: ToolEntry, toggles: ResolvedToggles): boolean {
  const switched = toggles.tools[entry.id] ?? toggles.toolsets[entry.toolset] ?? false
  return switched && entry.effects.every(e => toggles.allowEffects.includes(e))
}

// The tools that are on, sorted by id. A tool that is off is not in it, so a new entry that is off
// does not move the hash (toggle_flip.off_entry_keeps_hash).
export function manifestOf(toggles: ResolvedToggles, registry: Registry = REGISTRY): ManifestRow[] {
  return registry.entries
    .filter(e => isOn(e, toggles))
    .map(e => ({ id: e.id, version: e.version, toolset: e.toolset, effects: [...e.effects].sort(), openWorld: e.openWorld }))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
}

export function snapshotHash(parts: { consumer: Consumer; toggles: ResolvedToggles; manifest: readonly ManifestRow[] }): string {
  const text = canonicalize({ consumer: parts.consumer, toggles: parts.toggles, manifest: parts.manifest })
  if (text === undefined) throw new Error('The tool snapshot has no canonical form.')
  return createHash('sha256').update(text).digest('hex')
}

export class SnapshotRefused extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SnapshotRefused'
  }
}

// tools.injection: a model never holds a db_write tool while open-world text is in its context.
export function assertMix(consumer: Consumer, manifest: readonly ManifestRow[]): void {
  if (consumer === 'step') return
  const open = manifest.filter(m => m.openWorld).map(m => m.id)
  const write = manifest.filter(m => m.effects.includes('db_write')).map(m => m.id)
  if (open.length > 0 && write.length > 0) {
    throw new SnapshotRefused(
      `A ${consumer} snapshot turns on the open-world tools ${open.join(', ')} and the db_write tools ${write.join(', ')} together (tools.injection). Turn one side off.`,
    )
  }
}

// The one maker of a snapshot. It applies the mix rule and freezes the result, deep.
export function snapshotOf(runId: string, consumer: Consumer, toggles: ResolvedToggles, registry: Registry = REGISTRY): ToolSnapshot {
  if (runId.trim() === '') throw new SnapshotRefused('A tool snapshot needs a run id.')
  if (!CONSUMERS.includes(consumer)) throw new SnapshotRefused(`The consumer ${String(consumer)} is not one of ${CONSUMERS.join(', ')}.`)
  const manifest = manifestOf(toggles, registry)
  assertMix(consumer, manifest)
  const copy = structuredClone(toggles) as ResolvedToggles
  return deepFreeze({ runId, consumer, toggles: copy, manifest, hash: snapshotHash({ consumer, toggles: copy, manifest }) })
}

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new SnapshotRefused(`${what} is not JSON: ${(e as Error).message}`)
  }
}

// readSnapshot(env, { runId, consumer }) at the start of each run. It throws on bad toggles or a refused mix.
export function readSnapshot(env: Env, run: { runId: string; consumer: Consumer }, registry: Registry = REGISTRY): ToolSnapshot {
  const raw = env.HARNESS_TOOLS
  const toggles = resolveToggles(raw === undefined || raw.trim() === '' ? {} : parseJson(raw, 'HARNESS_TOOLS'), registry)
  return snapshotOf(run.runId, run.consumer, toggles, registry)
}

// A stored or sent snapshot, before the checks.
const StoredSnapshot = z
  .object({
    runId: z.string().min(1),
    consumer: z.enum(CONSUMERS),
    toggles: z.unknown(),
    manifest: z.array(z.unknown()),
    hash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict()

// A snapshot from the outside (the server env, a stored row) goes on only when the manifest that
// the current registry gives for its toggles equals its manifest, and its hash matches.
export function checkedSnapshot(sent: unknown, registry: Registry = REGISTRY): ToolSnapshot {
  const s = StoredSnapshot.parse(sent)
  const toggles = resolveToggles(s.toggles, registry)
  const fresh = snapshotOf(s.runId, s.consumer, toggles, registry)
  if (canonicalize(fresh.manifest) !== canonicalize(s.manifest)) {
    throw new SnapshotRefused(`The manifest of run ${s.runId} differs from the manifest that the current registry gives for its toggles. Start a new run.`)
  }
  if (fresh.hash !== s.hash) throw new SnapshotRefused(`The hash of the tool snapshot of run ${s.runId} does not match its content.`)
  return fresh
}

// The server side of tools.toggles: the parent sends the snapshot and its hash, never the toggles.
// With no snapshot, an outside MCP client (the Cursor CLI) gets a snapshot from HARNESS_TOOLS.
export function snapshotFromServerEnv(env: Env, registry: Registry = REGISTRY): ToolSnapshot {
  const sent = env.HARNESS_TOOL_SNAPSHOT
  if (sent === undefined || sent === '') {
    if (env.HARNESS_TOOL_SNAPSHOT_HASH) throw new SnapshotRefused('HARNESS_TOOL_SNAPSHOT_HASH is set, and HARNESS_TOOL_SNAPSHOT is not.')
    return readSnapshot(env, { runId: crypto.randomUUID(), consumer: 'mcp_client' }, registry)
  }
  const snapshot = checkedSnapshot(parseJson(sent, 'HARNESS_TOOL_SNAPSHOT'), registry)
  if (snapshot.consumer === 'step') throw new SnapshotRefused('A step snapshot never reaches the tool server.')
  if (env.HARNESS_TOOL_SNAPSHOT_HASH !== snapshot.hash) {
    throw new SnapshotRefused(`HARNESS_TOOL_SNAPSHOT_HASH does not match the hash of the snapshot of run ${snapshot.runId}. The server does not start.`)
  }
  return snapshot
}

// A resume reads the stored row and goes on only when the manifest matches (stage.hash_on_resume).
export function resumeSnapshot(
  stored: { runId: string; consumer: Consumer; toggles: unknown; manifest: unknown; snapshotHash: string },
  registry: Registry = REGISTRY,
): ToolSnapshot {
  return checkedSnapshot({ runId: stored.runId, consumer: stored.consumer, toggles: stored.toggles, manifest: stored.manifest, hash: stored.snapshotHash }, registry)
}

// tools.injection_scope: the snapshot of the model steps of a stage. It holds the tools of
// wrapper.inner whose effects the run allows, with the consumer agent. A db_write tool is refused.
export function innerSnapshot(run: ToolSnapshot, wrapper: ToolEntry, runId: string, registry: Registry = REGISTRY): ToolSnapshot {
  if (wrapper.inner === undefined) throw new SnapshotRefused(`The tool ${wrapper.id} is not a wrapper, so it has no inner snapshot.`)
  const toolsets = Object.fromEntries(TOOLSETS.map(t => [t, false])) as Record<Toolset, boolean>
  const tools = Object.fromEntries([...wrapper.inner].sort().map(id => [id, true]))
  const snapshot = snapshotOf(runId, 'agent', { toolsets, tools, allowEffects: run.toggles.allowEffects }, registry)
  const write = snapshot.manifest.filter(m => m.effects.includes('db_write'))
  if (write.length > 0) throw new SnapshotRefused(`The inner snapshot of ${wrapper.id} holds the db_write tools ${write.map(m => m.id).join(', ')} (tools.injection_scope).`)
  return snapshot
}
