import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import type { SpawnedProcess, SpawnOptions } from '@anthropic-ai/claude-agent-sdk'
import { ClaudeSDKAgent, type ClaudeSDKAgentResumeData, type ClaudeSDKAgentRunOptions, type ClaudeSDKOptions } from '@mastra/claude'
import type { MessageListInput } from '@mastra/core/agent/message-list'
import type { FullOutput, MastraModelOutput } from '@mastra/core/stream'
import type { z } from 'zod'
import { allowedToolsFor, checkedSnapshot, deepFreeze, harnessServerCommand, SERVER_NAME, type ToolSnapshot } from '../tools'

// An agent on claude -p (tools.agent_run, tools.locked_agent, tools.no_auto_memory,
// tools.secrets_off_argv and tools.run_record in docs/design/tool-registry.md). It runs through
// Mastra ClaudeSDKAgent of @mastra/claude 0.3.3 on @anthropic-ai/claude-agent-sdk 0.3.319. No code
// outside this file gets a raw ClaudeSDKAgent. Each run is a paid run, and it needs Rohan's yes
// for its prompt, model, and cost (rules.gates).

// The ceilings of each run. The values are a guess. Rohan sets them.
export const MAX_TURNS_CEILING = 12
export const MAX_BUDGET_USD_CEILING = 0.5

// The reply tool of the CLI for a run with a schema (tools.front_door).
export const STRUCTURED_OUTPUT_TOOL = 'StructuredOutput'

export interface Budget {
  readonly maxTurns: number
  readonly maxBudgetUsd: number
}

// The end of a run, from the result message that the tap keeps. Each field is null when no result message came.
export interface RunEnd {
  readonly costUsd: number | null
  readonly numTurns: number | null
  readonly terminalReason: string | null
  readonly subtype: string | null
  readonly denials: readonly unknown[]
}
export type RunOutcome =
  | { readonly kind: 'ok'; readonly object: unknown; readonly text: string; readonly end: RunEnd }
  | { readonly kind: 'failed'; readonly reason: string; readonly end: RunEnd } // a throw, such as error_max_budget_usd
export interface LockedClaudeAgent {
  run(prompt: string, schema?: z.ZodObject): Promise<RunOutcome> // the one method
}

// The calls of the graph store that a locked agent uses (tools.run_record).
export interface ToolRunRecorder {
  recordToolRun(input: { runId: string; snapshot: ToolSnapshot; allowedTools?: readonly string[] }): Promise<unknown>
  endToolRun(input: { runId: string } & RunEnd): Promise<unknown>
}

type Env = Readonly<Record<string, string | undefined>>

// The result message of the CLI stream, as the tap reads it.
interface ResultLine {
  type: 'result'
  subtype?: unknown
  total_cost_usd?: unknown
  num_turns?: unknown
  terminal_reason?: unknown
  permission_denials?: unknown
}

const numberOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const stringOrNull = (v: unknown) => (typeof v === 'string' ? v : null)

export function endOf(line: ResultLine | undefined): RunEnd {
  return {
    costUsd: numberOrNull(line?.total_cost_usd),
    numTurns: numberOrNull(line?.num_turns),
    terminalReason: stringOrNull(line?.terminal_reason),
    subtype: stringOrNull(line?.subtype),
    denials: Array.isArray(line?.permission_denials) ? line.permission_denials : [],
  }
}

// tools.run_record: the spawnClaudeCodeProcess option. It starts the CLI with the options that the
// SDK gives, passes stdout through, and keeps the last message of type result.
export function tapSpawn(onResult: (line: ResultLine) => void): (options: SpawnOptions) => SpawnedProcess {
  return options => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env as NodeJS.ProcessEnv,
      signal: options.signal,
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    const out = new PassThrough()
    child.stdout.pipe(out)
    let rest = ''
    const read = (line: string) => {
      if (!line.trim().startsWith('{')) return
      try {
        const m = JSON.parse(line) as { type?: unknown }
        if (m.type === 'result') onResult(m as ResultLine)
      } catch {
        // Not a JSON line. The SDK reads the same stream and reports its own parse errors.
      }
    }
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      rest += chunk
      for (let i = rest.indexOf('\n'); i >= 0; i = rest.indexOf('\n')) {
        read(rest.slice(0, i))
        rest = rest.slice(i + 1)
      }
    })
    child.stdout.on('end', () => read(rest))
    const proc = {
      stdin: child.stdin,
      stdout: out,
      get killed() {
        return child.killed
      },
      get exitCode() {
        return child.exitCode
      },
      get signalCode() {
        return child.signalCode
      },
      kill: (signal: NodeJS.Signals) => child.kill(signal),
      on: (event: string, listener: (...a: unknown[]) => void) => void child.on(event, listener),
      once: (event: string, listener: (...a: unknown[]) => void) => void child.once(event, listener),
      off: (event: string, listener: (...a: unknown[]) => void) => void child.off(event, listener),
    }
    return proc as unknown as SpawnedProcess
  }
}

export interface LockedOptionsInput {
  readonly snapshot: ToolSnapshot
  readonly systemPrompt: string
  readonly budget: Budget
  readonly cwd: string
  readonly withSchema: boolean
  readonly spawn: (options: SpawnOptions) => SpawnedProcess
  readonly env: Env // CLAUDE_CLI_PATH, PATH, HOME, and HARNESS_ENV_FILE are read. Nothing else passes.
}

const FORBIDDEN = ['bypassPermissions', 'allowDangerouslySkipPermissions']

// mode_unset.bypass_refused: the words appear nowhere in the input, as a key or as a value.
function assertNoBypass(value: unknown, path: string, seen = new Set<unknown>()): void {
  if (typeof value === 'string') {
    for (const word of FORBIDDEN) if (value.includes(word)) throw new Error(`lockedSdkOptions refuses ${word} at ${path || '(root)'}.`)
    return
  }
  if (value === null || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  for (const [key, v] of Object.entries(value)) {
    for (const word of FORBIDDEN) if (key.includes(word)) throw new Error(`lockedSdkOptions refuses ${word} at ${path}.${key}.`)
    assertNoBypass(v, `${path}.${key}`, seen)
  }
}

function need(env: Env, key: string): string {
  const v = env[key]
  if (v === undefined || v.trim() === '') throw new Error(`Set ${key} for an agent run on claude -p.`)
  return v
}

// The options of tools.agent_run, and only these. Deep-frozen.
export function lockedSdkOptions(input: LockedOptionsInput): Readonly<ClaudeSDKOptions> {
  assertNoBypass({ ...input, spawn: undefined }, '')
  if (input.snapshot.consumer !== 'agent') throw new Error(`An agent run needs a snapshot with the consumer agent, not ${input.snapshot.consumer}.`)
  const snapshot = checkedSnapshot(input.snapshot) // the mix rule of tools.injection, again
  if (snapshot.hash !== input.snapshot.hash) throw new Error('The tool snapshot does not match the registry.')
  const { maxTurns, maxBudgetUsd } = input.budget
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > MAX_TURNS_CEILING) throw new Error(`maxTurns ${maxTurns} is not an integer from 1 to ${MAX_TURNS_CEILING} (MAX_TURNS_CEILING).`)
  if (!(maxBudgetUsd > 0) || maxBudgetUsd > MAX_BUDGET_USD_CEILING) throw new Error(`maxBudgetUsd ${maxBudgetUsd} is not above 0 and at most ${MAX_BUDGET_USD_CEILING} (MAX_BUDGET_USD_CEILING).`)
  if (input.systemPrompt.trim() === '') throw new Error('An agent run needs a system prompt.')
  const path = need(input.env, 'PATH')
  const envFile = input.env.HARNESS_ENV_FILE
  const server = harnessServerCommand(snapshot, envFile ? { path, envFile } : { path })
  const options: ClaudeSDKOptions = {
    settingSources: [],
    strictMcpConfig: true,
    tools: [],
    mcpServers: { [SERVER_NAME]: { ...server, args: [...server.args], env: { ...server.env } } },
    allowedTools: [...allowedToolsFor(SERVER_NAME, snapshot), ...(input.withSchema ? [STRUCTURED_OUTPUT_TOOL] : [])],
    permissionMode: 'dontAsk',
    maxTurns,
    maxBudgetUsd,
    env: { PATH: path, HOME: need(input.env, 'HOME'), MASTRA_TELEMETRY_DISABLED: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' },
    persistSession: false,
    systemPrompt: input.systemPrompt,
    pathToClaudeCodeExecutable: need(input.env, 'CLAUDE_CLI_PATH'),
    cwd: input.cwd,
    spawnClaudeCodeProcess: input.spawn,
  }
  return deepFreeze(options)
}

const refuse = (method: string) => new Error(`The locked agent refuses ${method} with its own sdkOptions (tools.locked_agent).`)

// Not exported. Each entry point refuses per-call sdkOptions. The resume methods always refuse,
// because persistSession is false.
class SealedClaudeSDKAgent extends ClaudeSDKAgent {
  override async generate<OUTPUT = undefined>(messages: MessageListInput, options?: ClaudeSDKAgentRunOptions<OUTPUT>): Promise<FullOutput<OUTPUT>> {
    if (options?.sdkOptions !== undefined) throw refuse('generate')
    return super.generate(messages, options)
  }

  override async stream<OUTPUT = undefined>(messages: MessageListInput, options?: ClaudeSDKAgentRunOptions<OUTPUT>): Promise<MastraModelOutput<OUTPUT>> {
    if (options?.sdkOptions !== undefined) throw refuse('stream')
    return super.stream(messages, options)
  }

  override async resumeGenerate<OUTPUT = undefined>(_resumeData: ClaudeSDKAgentResumeData, _options?: ClaudeSDKAgentRunOptions<OUTPUT>): Promise<FullOutput<OUTPUT>> {
    throw new Error('The locked agent refuses resumeGenerate: a run keeps no session (persistSession false).')
  }

  override async resumeStream<OUTPUT = undefined>(_resumeData: ClaudeSDKAgentResumeData, _options?: ClaudeSDKAgentRunOptions<OUTPUT>): Promise<MastraModelOutput<OUTPUT>> {
    throw new Error('The locked agent refuses resumeStream: a run keeps no session (persistSession false).')
  }
}

export interface LockedAgentInput {
  readonly id: string
  readonly systemPrompt: string
  readonly snapshot: ToolSnapshot
  readonly budget: Budget
  readonly store: ToolRunRecorder
  readonly env?: Env // default process.env. Only CLAUDE_CLI_PATH, PATH, HOME, and HARNESS_ENV_FILE are read.
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

// One object for one run: the snapshot holds the run id, and the run folder is new and empty.
class LockedAgent implements LockedClaudeAgent {
  readonly #plain: SealedClaudeSDKAgent
  readonly #withSchema: SealedClaudeSDKAgent
  readonly #allowed: { readonly plain: readonly string[]; readonly withSchema: readonly string[] }
  readonly #snapshot: ToolSnapshot
  readonly #store: ToolRunRecorder
  readonly #cwd: string
  readonly #box: { last: ResultLine | undefined } = { last: undefined }
  #ran = false

  constructor(input: LockedAgentInput) {
    const env = input.env ?? process.env
    const cwd = mkdtempSync(join(tmpdir(), 'harness-agent-run-'))
    const tap = tapSpawn(line => (this.#box.last = line))
    const make = (withSchema: boolean) => lockedSdkOptions({ snapshot: input.snapshot, systemPrompt: input.systemPrompt, budget: input.budget, cwd, withSchema, spawn: tap, env })
    const plain = make(false)
    const withSchema = make(true)
    this.#plain = new SealedClaudeSDKAgent(Object.freeze({ id: input.id, description: `The locked agent ${input.id}.`, sdkOptions: plain }))
    this.#withSchema = new SealedClaudeSDKAgent(Object.freeze({ id: input.id, description: `The locked agent ${input.id}.`, sdkOptions: withSchema }))
    this.#allowed = Object.freeze({ plain: plain.allowedTools ?? [], withSchema: withSchema.allowedTools ?? [] })
    this.#snapshot = input.snapshot
    this.#store = input.store
    this.#cwd = cwd
  }

  async run(prompt: string, schema?: z.ZodObject): Promise<RunOutcome> {
    if (this.#ran) return { kind: 'failed', reason: 'A locked agent runs once. Make a new one, with a new snapshot, for each run.', end: endOf(undefined) }
    this.#ran = true
    const runId = this.#snapshot.runId
    try {
      // toggle_flip.run_row_before_first_call: the row exists before the CLI starts.
      await this.#store.recordToolRun({ runId, snapshot: this.#snapshot, allowedTools: schema ? this.#allowed.withSchema : this.#allowed.plain })
    } catch (e) {
      return { kind: 'failed', reason: `The run record of ${runId} failed: ${messageOf(e)}`, end: endOf(undefined) }
    }
    let outcome: RunOutcome = { kind: 'failed', reason: 'The run gave no outcome.', end: endOf(undefined) }
    try {
      const out = schema
        ? await this.#withSchema.generate(prompt, { structuredOutput: { schema, errorStrategy: 'warn' } })
        : await this.#plain.generate(prompt)
      outcome = { kind: 'ok', object: out.object, text: out.text, end: endOf(this.#box.last) }
    } catch (e) {
      outcome = { kind: 'failed', reason: messageOf(e), end: endOf(this.#box.last) }
    } finally {
      rmSync(this.#cwd, { recursive: true, force: true }) // the run folder of this one run
      try {
        await this.#store.endToolRun({ runId, ...outcome.end })
      } catch (e) {
        outcome = { kind: 'failed', reason: `The run end of ${runId} was not stored: ${messageOf(e)}`, end: outcome.end }
      }
    }
    return outcome
  }
}

export function lockedClaudeAgent(input: LockedAgentInput): LockedClaudeAgent {
  return Object.freeze(new LockedAgent(input))
}
