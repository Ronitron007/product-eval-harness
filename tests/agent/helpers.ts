import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readSnapshot, type ToolSnapshot } from '../../src/tools'
import type { RunEnd, ToolRunRecorder } from '../../src/agent'
import { tmp } from '../tools/helpers'

// Shared parts of the agent tests (tools.hazards). No part calls a model or the network.

export const RESEARCH = join(import.meta.dirname, '..', '..', 'docs', 'research', '2026-11-09-tool-registry')
export const FENCE = join(RESEARCH, 'fence-2.ndjson')
export const REPLAY_CLI = join(RESEARCH, 'interrogate', 'sonnet', 'replay-cli.mjs')

// The recorded messages of the paid probe tools_research.probes.fence_result.
export function fenceMessages(): Record<string, unknown>[] {
  return readFileSync(FENCE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l) as Record<string, unknown>)
}

// The fence stream with its result message changed, such as a budget stop.
export function withResult(patch: Record<string, unknown>, messages = fenceMessages()): Record<string, unknown>[] {
  return messages.map(m => (m.type === 'result' ? { ...m, ...patch } : m))
}

// A result message whose structured_output carries a reply (the StructuredOutput tool of the CLI).
export function structuredReply(object: unknown, text = 'reply'): Record<string, unknown>[] {
  return withResult({ result: text, structured_output: object, permission_denials: [] })
}

export { tmp }

// model_call.cli_never_spawned: a CLI that writes a marker file and exits 1.
export function markerCli(): { path: string; spawned: () => boolean } {
  const dir = tmp('marker-cli')
  const marker = join(dir, 'spawned')
  const path = join(dir, 'claude')
  writeFileSync(path, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`)
  chmodSync(path, 0o755)
  return { path, spawned: () => existsSync(marker) }
}

// The env of an agent run in a test. CLAUDE_CLI_PATH names the marker CLI unless a test gives another.
export function agentEnv(cli: string, extra: Record<string, string> = {}): Record<string, string> {
  return { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: tmp('home'), CLAUDE_CLI_PATH: cli, HARNESS_ENV_FILE: join(tmp('envfile'), '.env'), ...extra }
}

export function agentSnapshot(harnessTools?: string): ToolSnapshot {
  return readSnapshot(harnessTools === undefined ? {} : { HARNESS_TOOLS: harnessTools }, { runId: randomUUID(), consumer: 'agent' })
}

export const BUDGET = { maxTurns: 4, maxBudgetUsd: 0.05 }

// An in-memory run record, with the order of each call.
export function memoryRecorder(): ToolRunRecorder & { log: string[]; runs: Map<string, unknown>; ends: Map<string, RunEnd> } {
  const log: string[] = []
  const runs = new Map<string, unknown>()
  const ends = new Map<string, RunEnd>()
  return {
    log,
    runs,
    ends,
    async recordToolRun(input) {
      log.push('recordToolRun')
      runs.set(input.runId, input)
    },
    async endToolRun({ runId, ...end }) {
      log.push('endToolRun')
      if (!runs.has(runId)) throw new Error(`No tool run ${runId}.`)
      ends.set(runId, end)
    },
  }
}

// A fake CLI that answers the SDK handshake and replays recorded messages (interrogate/sonnet/replay-cli.mjs).
// The locked env passes no variable of the test, so the script holds its file and patch. No model, no network.
export function replayCli(messages: readonly unknown[], o: { argvOut?: string } = {}): string {
  const dir = tmp('replay-cli')
  const file = join(dir, 'replay.ndjson')
  writeFileSync(file, messages.map(m => JSON.stringify(m)).join('\n') + '\n')
  const path = join(dir, 'claude')
  const argv = o.argvOut ? `REPLAY_ARGV_OUT='${o.argvOut}' ` : ''
  writeFileSync(path, `#!/bin/sh\nREPLAY_FILE='${file}' ${argv}exec node '${REPLAY_CLI}' "$@"\n`)
  chmodSync(path, 0o755)
  return path
}

// A fake CLI that exits 1 with no output, as sonnet/fake-cli.sh does. It records its argv and env.
export function recordingCli(): { path: string; record: () => string } {
  const dir = tmp('recording-cli')
  const out = join(dir, 'record.txt')
  const path = join(dir, 'claude')
  writeFileSync(path, `#!/bin/sh\n{ echo ARGV; for a in "$@"; do printf '%s\\n' "$a"; done; echo ENV; env; } > '${out}'\nexit 1\n`)
  chmodSync(path, 0o755)
  return { path, record: () => (existsSync(out) ? readFileSync(out, 'utf8') : '') }
}
