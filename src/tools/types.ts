import type { Tool } from '@mastra/core/tools'
import { z } from 'zod'

// The types of the tool registry (tools.types in docs/design/tool-registry.md). This file imports
// no store module. ReadStore names the read calls of the graph store by their shape only.

export const EFFECTS = ['read', 'paid', 'db_write'] as const
export type Effect = (typeof EFFECTS)[number]
export const TOOLSETS = ['graph', 'research', 'stages'] as const // a closed list
export const Toolset = z.enum(TOOLSETS)
export type Toolset = z.infer<typeof Toolset>

// The ids of the registry, as a const tuple. assertRegistry() refuses a registry with other ids.
export const TOOL_IDS = ['get_node_context', 'run_create_layout', 'run_create_node', 'run_create_pack', 'run_define_criteria'] as const
export const ToolIdSchema = z.enum(TOOL_IDS)
export type ToolId = z.infer<typeof ToolIdSchema>

// The stage wrappers, by the stage that each one starts.
export const STAGE_TOOLS = {
  run_define_criteria: 'define_criteria',
  run_create_node: 'create_node',
  run_create_pack: 'create_pack',
  run_create_layout: 'create_layout',
} as const
export type StageToolId = keyof typeof STAGE_TOOLS
export type StageName = (typeof STAGE_TOOLS)[StageToolId]

// A built Mastra tool. createTool gives each tool its own schema types, so the registry keeps them as any.
export type AnyTool = Tool<any, any, any, any, any, string, any>

// A node row as the read calls give it. GraphNode of src/store/store.ts has this shape.
export interface NodeRow {
  readonly id: string
  readonly parentId: string | null
  readonly level: string
  readonly path: string
  readonly label: string
}

// What a tool may touch. The registry gives a tool only the handles that its effects name (tools.one_path).
export const READ_CALLS = ['pathToRoot', 'siblings', 'subtree'] as const
export interface ReadStore {
  pathToRoot(nodeId: string): Promise<readonly NodeRow[]>
  siblings(nodeId: string): Promise<readonly NodeRow[]>
  subtree(nodeId: string): Promise<readonly NodeRow[]>
}
export interface ReadHandles {
  readonly store: ReadStore
}

// tools.budget: a refused call. The door never throws for a refusal.
export interface PaidRefused {
  readonly refused: true
  readonly name: string
  readonly cap: number
}
export interface PaidDoor {
  call<T>(name: string, costUsd: number, fn: () => Promise<T>): Promise<T | PaidRefused>
}
export interface WriteDoor<W> {
  readonly write: W // one write function, for one tool only
}
export type HandlesFor<E extends readonly Effect[]> = ReadHandles &
  ('paid' extends E[number] ? { readonly paid: PaidDoor } : unknown) &
  ('db_write' extends E[number] ? WriteDoor<unknown> : unknown)

export interface ToolEntry<E extends readonly Effect[] = readonly Effect[]> {
  readonly id: string // snake_case, unique. The MCP name and the Claude name derive from it.
  readonly version: number // a positive integer. A change of the input, the output, or the effect moves it.
  readonly toolset: Toolset
  readonly effects: E // never empty. A wrapper declares the union of the effects of its workflow.
  readonly openWorld: boolean // true when the result gives outside text to the caller (tools.injection_scope)
  readonly inner?: readonly string[] // wrappers only: the tools of its model steps. Never a db_write tool.
  readonly maxCallsPerRun?: number // paid tools only. Default 1 (tools.budget).
  readonly env: readonly string[] // the names of the environment variables that the tool needs
  // createTool with Zod schemas. Its id must equal the entry id. Method syntax, so that an entry
  // with narrow effects fits a list of entries.
  build(handles: HandlesFor<E>): AnyTool
}

// Keeps the effects of each entry narrow for its build function, and gives a plain entry.
export function defineEntry<const E extends readonly Effect[]>(entry: ToolEntry<E>): ToolEntry {
  return entry as unknown as ToolEntry
}

// The handles of one process: the read calls, and one write function for each db_write tool.
// resolveTools() gives each tool only the part that its effects name.
export interface HandleSet {
  readonly store: ReadStore
  readonly writes: Readonly<Record<string, (...args: never[]) => Promise<unknown>>>
}

// tools.types: z.partialRecord, so that a run can name some toolsets or tools only. z.record with
// an enum key needs each key (verified, ran sonnet/p5.ts).
export function togglesSchema(ids: readonly [string, ...string[]]) {
  return z
    .object({
      toolsets: z.partialRecord(Toolset, z.boolean()).optional(),
      tools: z.partialRecord(z.enum(ids), z.boolean()).optional(), // a tool switch wins over its toolset switch
      allowEffects: z.array(z.enum(EFFECTS)).optional(), // default ['read']
    })
    .strict()
}
export const Toggles = togglesSchema(TOOL_IDS)
export type Toggles = z.infer<typeof Toggles>

// The toggles after the defaults: each toolset named, the tool switches as given, the effects sorted.
export interface ResolvedToggles {
  readonly toolsets: Readonly<Record<Toolset, boolean>>
  readonly tools: Readonly<Record<string, boolean>>
  readonly allowEffects: readonly Effect[]
}

export const CONSUMERS = ['agent', 'mcp_client', 'step'] as const
export type Consumer = (typeof CONSUMERS)[number] // tools.consumers
export interface ManifestRow {
  readonly id: string
  readonly version: number
  readonly toolset: Toolset
  readonly effects: readonly Effect[]
  readonly openWorld: boolean
}
export interface ToolSnapshot {
  readonly runId: string
  readonly consumer: Consumer
  readonly toggles: ResolvedToggles // after the defaults
  readonly manifest: readonly ManifestRow[] // the tools that are on, sorted by id
  readonly hash: string // sha256 of the RFC 8785 JSON of { consumer, toggles, manifest }
}

// The run of a stage workflow, as the write door of a stage wrapper gives it to the wrapper.
// src/tools/handles.ts makes it from the Mastra workflow result. The wrapper keeps only status.
export type StageOutcome =
  | { readonly status: 'success'; readonly result: unknown }
  | { readonly status: 'suspended'; readonly payload: unknown }
  | { readonly status: 'failed'; readonly error: unknown; readonly failedStep?: string }

// The write door of a stage wrapper, as the wrapper sees it: the run id that the wrapper made,
// and the input. resolveTools() binds the inner snapshot of the run (tools.injection_scope).
export type StageWrite = (runId: string, input: { nodeId: string }) => Promise<StageOutcome>
// The write function of a stage wrapper in a HandleSet: it gets the inner snapshot too, and
// writes it to harness.tool_runs before it starts the stage.
export type RawStageWrite = (run: { readonly runId: string; readonly inner: ToolSnapshot }, input: { nodeId: string }) => Promise<StageOutcome>
