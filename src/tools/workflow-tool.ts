import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { NodeId } from '../rules/schema'
import { defineEntry, STAGE_TOOLS, type AnyTool, type HandlesFor, type PaidDoor, type StageOutcome, type StageToolId, type StageWrite, type ToolEntry } from './types'

// The wrapper tool of a stage workflow (tools.registry, tools.injection_scope, tools.status_only in
// docs/design/tool-registry.md). Its execute starts one run of the workflow, through its write
// door, and gives back structured status only: ids that code made, enums, and numbers. The full
// error of a failed run stays in the Mastra run state. It never enters the result.

// The discriminator of each branch is a one-value z.enum, not a z.literal (tools.status_only).
export const FAILURE_CODES = ['rules_refused', 'models_unset', 'research_error', 'drafter_error', 'judge_error', 'store_error', 'busy', 'max_calls', 'unknown'] as const
export const StageToolResult = z.discriminatedUnion('status', [
  z.object({ status: z.enum(['ended']), runId: z.uuid(), end: z.enum(['accepted', 'person_accepted', 'person_rejected']), round: z.number().int().min(1), outputId: z.uuid().nullable() }).strict(),
  z.object({ status: z.enum(['suspended']), runId: z.uuid(), why: z.enum(['budget_spent', 'cannot_verify']), round: z.number().int().min(1), openCount: z.number().int().min(0) }).strict(),
  z.object({ status: z.enum(['failed']), runId: z.uuid(), code: z.enum(FAILURE_CODES) }).strict(),
])
export type StageToolResult = z.infer<typeof StageToolResult>
// The output of a stage wrapper: one object with the status in result. An MCP tool needs an output
// schema with an object root. @mastra/mcp 1.18.0 wraps a root union as { result }, so the wrapper
// gives that shape itself, and the structured content matches the listed schema (review of #35).
export const StageToolOutput = z.object({ result: StageToolResult }).strict()
export type StageToolOutput = z.infer<typeof StageToolOutput>
export type FailureCode = (typeof FAILURE_CODES)[number]

export const StageToolInput = z.object({ nodeId: NodeId }).strict()

// ---- tools.status_only ----

// The UUID patterns of zod 4.6.7. A z.uuid({ pattern }) with another pattern is refused.
const UUID_PATTERNS = new Set([z.uuid(), z.uuidv4(), z.uuidv6(), z.uuidv7()].map(s => (s._zod.def as { pattern?: RegExp }).pattern?.source))

type Def = { type: string; [key: string]: unknown }
const defOf = (schema: unknown): Def => (schema as { _zod: { def: Def } })._zod.def

export class StatusOnlyRefused extends Error {
  constructor(path: string, why: string) {
    super(`The result schema is not status only at ${path || '(root)'}: ${why} (tools.status_only).`)
    this.name = 'StatusOnlyRefused'
  }
}

// Walks a Zod schema. It accepts z.enum, z.number, z.boolean, z.uuid, strict objects, arrays,
// discriminated unions of objects, nullables and optionals of those. It refuses each other type.
export function assertStatusOnly(schema: unknown, path = ''): void {
  const def = defOf(schema)
  const checks = (def.checks as { _zod: { def: { check: string } } }[] | undefined) ?? []
  if (checks.some(c => c._zod.def.check === 'overwrite')) throw new StatusOnlyRefused(path, 'an overwrite check changes the value')
  switch (def.type) {
    case 'enum':
    case 'number':
    case 'boolean':
      return
    case 'string':
      if (def.format === 'uuid' && UUID_PATTERNS.has((def.pattern as RegExp | undefined)?.source)) return
      throw new StatusOnlyRefused(path, 'a string that is not a z.uuid() can carry free text')
    case 'object': {
      if (defOf(def.catchall ?? { _zod: { def: { type: 'undefined' } } }).type !== 'never') throw new StatusOnlyRefused(path, 'an object that is not strict')
      for (const [key, value] of Object.entries(def.shape as Record<string, unknown>)) assertStatusOnly(value, `${path}.${key}`)
      return
    }
    case 'array':
      return assertStatusOnly(def.element, `${path}[]`)
    case 'union': {
      if (typeof def.discriminator !== 'string') throw new StatusOnlyRefused(path, 'a union with no discriminator')
      for (const [i, option] of (def.options as unknown[]).entries()) {
        if (defOf(option).type !== 'object') throw new StatusOnlyRefused(`${path}|${i}`, 'a branch that is not an object')
        const tag = (defOf(option).shape as Record<string, unknown>)[def.discriminator]
        if (tag === undefined || defOf(tag).type !== 'enum' || Object.keys(defOf(tag).entries as object).length !== 1) {
          throw new StatusOnlyRefused(`${path}|${i}.${def.discriminator}`, 'the discriminator is not a one-value z.enum')
        }
        assertStatusOnly(option, `${path}|${i}`)
      }
      return
    }
    case 'nullable':
    case 'optional':
      return assertStatusOnly(def.innerType, path)
    default:
      throw new StatusOnlyRefused(path, `the type ${def.type} is not on the list`)
  }
}

// ---- the mapping of a stage run to its status ----

const StageEnd = z.object({ end: z.enum(['accepted', 'person_accepted', 'person_rejected']), round: z.number().int().min(1), outputId: z.uuid().nullable() })
const StageBusyResult = z.object({ busy: z.literal(true) })
const Suspended = z.object({ why: z.enum(['budget_spent', 'cannot_verify']), round: z.number().int().min(1), open: z.array(z.unknown()) })

// The code of a failed run, from the failed step and the kind of the error. The text of the
// error never leaves this function.
const SQLSTATE = /^[0-9A-Z]{5}$/
// A store error: a SQLSTATE of pg, on the error or its cause (a DrizzleQueryError), or a database that is not set.
export function isStoreError(error: unknown): boolean {
  const e = error as { name?: unknown; message?: unknown; code?: unknown; cause?: { code?: unknown } } | undefined
  const message = typeof e?.message === 'string' ? e.message : ''
  return (
    (typeof e?.code === 'string' && SQLSTATE.test(e.code)) ||
    (typeof e?.cause?.code === 'string' && SQLSTATE.test(e.cause.code)) ||
    e?.name === 'DrizzleQueryError' ||
    message.startsWith('Failed query') ||
    /^(Set HARNESS_DATABASE_URL|HARNESS_DATABASE_URL must)/.test(message)
  )
}

// The detail of a failed tool call goes to the log of the process (stderr of the tool server),
// never into the tool result (tools.status_only).
export function logToolFailure(tool: string, runId: string | null, error: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  process.stderr.write(`${JSON.stringify({ at: new Date().toISOString(), tool, runId, failed: detail })}\n`)
}

export function failureCode(outcome: Extract<StageOutcome, { status: 'failed' }>): FailureCode {
  const error = outcome.error as { name?: unknown; message?: unknown; code?: unknown } | undefined
  const name = typeof error?.name === 'string' ? error.name : ''
  const message = typeof error?.message === 'string' ? error.message : String(outcome.error ?? '')
  if (name === 'RulesRefused' || message.startsWith('The rules refused the stage')) return 'rules_refused'
  if (/is not provider\/model|have one vendor/.test(message)) return 'models_unset'
  if (isStoreError(error)) return 'store_error'
  switch (outcome.failedStep) {
    case 'research':
      return 'research_error'
    case 'draft':
    case 'draft_and_judge':
      return message.includes('judge') ? 'judge_error' : 'drafter_error'
    case 'judge':
      return 'judge_error'
    default:
      return 'unknown'
  }
}

export function stageResult(runId: string, outcome: StageOutcome): StageToolResult {
  if (outcome.status === 'success') {
    if (StageBusyResult.safeParse(outcome.result).success) return { status: 'failed', runId, code: 'busy' }
    const ended = StageEnd.safeParse(outcome.result)
    return ended.success ? { status: 'ended', runId, end: ended.data.end, round: ended.data.round, outputId: ended.data.outputId } : { status: 'failed', runId, code: 'unknown' }
  }
  if (outcome.status === 'suspended') {
    const s = Suspended.safeParse(outcome.payload)
    return s.success ? { status: 'suspended', runId, why: s.data.why, round: s.data.round, openCount: s.data.open.length } : { status: 'failed', runId, code: 'unknown' }
  }
  return { status: 'failed', runId, code: failureCode(outcome) }
}

// The wrapper entry of one stage. The stage wrappers declare paid and db_write: a stage run calls
// the drafter and the judges, and it writes its rows in code (tools.injection_scope).
export function workflowTool(spec: {
  readonly id: StageToolId
  readonly version: number
  readonly description: string
  readonly inner: readonly string[]
  readonly env: readonly string[]
}): ToolEntry {
  const effects = ['paid', 'db_write'] as const
  return defineEntry({
    id: spec.id,
    version: spec.version,
    toolset: 'stages',
    effects,
    openWorld: false,
    inner: spec.inner,
    maxCallsPerRun: 1,
    env: spec.env,
    build(handles: HandlesFor<typeof effects>): AnyTool {
      const paid: PaidDoor = handles.paid
      const write = handles.write as StageWrite
      return createTool({
        id: spec.id,
        description: spec.description,
        inputSchema: StageToolInput,
        outputSchema: StageToolOutput,
        mcp: { annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
        execute: async input => {
          const runId = crypto.randomUUID() // status_only.ids_from_code: the stage run id is this Mastra run id
          try {
            const outcome = await paid.call(spec.id, 0, () => write(runId, StageToolInput.parse(input)))
            if ('refused' in outcome) return out({ status: 'failed', runId, code: 'max_calls' })
            if (outcome.status === 'failed') logToolFailure(spec.id, runId, outcome.error)
            return out(stageResult(runId, outcome))
          } catch (error) {
            // A throw of the door, such as a store error before the stage starts, gives a code only.
            logToolFailure(spec.id, runId, error)
            return out({ status: 'failed', runId, code: isStoreError(error) ? 'store_error' : 'unknown' })
          }
        },
      })
    },
  })
}

const out = (result: StageToolResult): StageToolOutput => StageToolOutput.parse({ result })

export const stageOf = (id: StageToolId) => STAGE_TOOLS[id]
