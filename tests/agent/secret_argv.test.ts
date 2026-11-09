import { execFile } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lockedClaudeAgent } from '../../src/agent'
import { harnessServerCommand, readSnapshot, SERVER_CONFIG_KEYS } from '../../src/tools'
import { agentEnv, agentSnapshot, BUDGET, memoryRecorder, recordingCli, tmp } from './helpers'

// secret_argv: a secret shows in the argv of a process (tools.secrets_off_argv). The fake secrets are
// placeholders, as in sonnet/p4.ts. These tests run the real Agent SDK against a fake CLI that
// records its argv and env and exits 1.

const SECRETS = { HARNESS_DATABASE_URL: 'postgresql://harness_app:PLACEHOLDER-PW@db.example:5432/postgres', JEV_API_KEY: 'PLACEHOLDER-KEY' }
const REPO = join(import.meta.dirname, '..', '..')

function envFile(extra: Record<string, string> = {}): string {
  const file = join(tmp('envfile'), '.env')
  writeFileSync(file, Object.entries({ ...SECRETS, OTHER_SERVICE_TOKEN: 'PLACEHOLDER-OTHER', ...extra }).map(([k, v]) => `${k}=${v}`).join('\n') + '\n')
  return file
}

describe('secret_argv', () => {
  it('secret_argv.child_argv_has_no_secret (repro sonnet/p4.ts): no test secret is in the argv or the env of the CLI', async () => {
    const cli = recordingCli()
    const env = { ...agentEnv(cli.path, { HARNESS_ENV_FILE: envFile() }), ...SECRETS, ANTHROPIC_API_KEY: 'PLACEHOLDER-ANTHROPIC' }
    const out = await lockedClaudeAgent({ id: 'secret', systemPrompt: 'You are a test agent.', snapshot: agentSnapshot(), budget: BUDGET, store: memoryRecorder(), env }).run('hi')
    expect(out.kind).toBe('failed')
    const record = cli.record()
    expect(record).toMatch(/^ARGV/)
    expect(record).toContain('--mcp-config')
    for (const secret of ['PLACEHOLDER-PW', 'PLACEHOLDER-KEY', 'PLACEHOLDER-OTHER', 'PLACEHOLDER-ANTHROPIC']) expect(record).not.toContain(secret)
    expect(record).not.toMatch(/^ANTHROPIC_API_KEY=/m)
    expect(record).not.toMatch(/^HARNESS_DATABASE_URL=/m)
  })

  it('secret_argv.server_config_keys_only: the server config holds only the five keys of tools.secrets_off_argv', async () => {
    const config = harnessServerCommand(agentSnapshot(), { path: '/usr/bin', envFile: '/x/.env' })
    expect(Object.keys(config.env).sort()).toEqual([...SERVER_CONFIG_KEYS].sort())
    // The config that reaches the argv of the CLI.
    const cli = recordingCli()
    await lockedClaudeAgent({ id: 'cfg', systemPrompt: 'x', snapshot: agentSnapshot(), budget: BUDGET, store: memoryRecorder(), env: agentEnv(cli.path) }).run('hi')
    const lines = cli.record().split('\n')
    const json = JSON.parse(lines[lines.indexOf('--mcp-config') + 1]!) as { mcpServers: Record<string, { env: Record<string, string> }> }
    expect(Object.keys(json.mcpServers)).toEqual(['harness'])
    expect(Object.keys(json.mcpServers.harness!.env).sort()).toEqual([...SERVER_CONFIG_KEYS].sort())
  })

  it('secret_argv.server_keeps_named_keys_only: after loadEnvFile, the server keeps PATH, the telemetry switch, and the keys that its tools that are on name', async () => {
    const run = (harnessTools: string | undefined, parentExtra: Record<string, string> = {}) => {
      const snapshot = readSnapshot(harnessTools === undefined ? {} : { HARNESS_TOOLS: harnessTools }, { runId: crypto.randomUUID(), consumer: 'agent' })
      const config = harnessServerCommand(snapshot, { path: process.env.PATH!, envFile: envFile() })
      return new Promise<{ runId: string; keys: string[] }>((resolve, reject) =>
        execFile(process.execPath, ['--import', 'tsx', join(REPO, 'tests', 'agent', 'server-env-child.ts')], { cwd: REPO, env: { ...config.env, ...parentExtra } }, (e, stdout, stderr) =>
          e ? reject(new Error(`${e.message}\n${stderr}`)) : resolve(JSON.parse(stdout)),
        ),
      )
    }
    expect((await run(undefined, { PARENT_TOKEN: 'PLACEHOLDER-PARENT' })).keys).toEqual(['HARNESS_DATABASE_URL', 'MASTRA_TELEMETRY_DISABLED', 'PATH'])
    expect((await run('{"toolsets":{"graph":false}}')).keys).toEqual(['MASTRA_TELEMETRY_DISABLED', 'PATH'])
  }, 30_000)
})
