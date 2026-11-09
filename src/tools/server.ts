import { join } from 'node:path'
import { MCPServer } from '@mastra/mcp'
import { REGISTRY, type Registry } from './registry'
import { resolveTools } from './resolve'
import { snapshotFromServerEnv } from './toggles'
import type { HandleSet, ToolSnapshot } from './types'

// The stdio MCP server of one run (tools.consumers, tools.secrets_off_argv in
// docs/design/tool-registry.md). @mastra/mcp 1.18.0, reference-tools-mcp-server.md. The server
// gets only tools: never workflows or agents (workflow_listed.wrapper_only, tools.one_path).

export const SERVER_NAME = 'harness'
export const REPO = join(import.meta.dirname, '..', '..')
export const SERVER_SCRIPT = join(REPO, 'scripts', 'tool-server.ts')
export const DEFAULT_ENV_FILE = join(REPO, '.env')
// The five keys of the server config. Each other key is refused (secret_argv.server_config_keys_only).
export const SERVER_CONFIG_KEYS = ['PATH', 'MASTRA_TELEMETRY_DISABLED', 'HARNESS_TOOL_SNAPSHOT', 'HARNESS_TOOL_SNAPSHOT_HASH', 'HARNESS_ENV_FILE'] as const

export function buildToolServer(snapshot: ToolSnapshot, handles: HandleSet, registry: Registry = REGISTRY): MCPServer {
  if (snapshot.consumer === 'step') throw new Error('A step snapshot never reaches the tool server. Use toolFor().')
  return new MCPServer({ id: SERVER_NAME, name: SERVER_NAME, version: '0.0.0', tools: { ...resolveTools(snapshot, handles, registry) } })
}

export interface StdioServerConfig {
  readonly type: 'stdio'
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<(typeof SERVER_CONFIG_KEYS)[number], string>>
}

// The MCP config of the server for one run. It goes onto the argv of the CLI as JSON, so it holds no
// secret: the server reads its secrets from the env file, in its own process.
export function harnessServerCommand(snapshot: ToolSnapshot, place: { readonly path: string; readonly envFile?: string }): StdioServerConfig {
  return {
    type: 'stdio',
    command: join(REPO, 'node_modules', '.bin', 'tsx'),
    args: [SERVER_SCRIPT],
    env: {
      PATH: place.path,
      MASTRA_TELEMETRY_DISABLED: '1',
      HARNESS_TOOL_SNAPSHOT: JSON.stringify(snapshot),
      HARNESS_TOOL_SNAPSHOT_HASH: snapshot.hash,
      HARNESS_ENV_FILE: place.envFile ?? DEFAULT_ENV_FILE,
    },
  }
}

// The names of the environment variables that the tools of a snapshot need, PATH, and the
// telemetry switch of Mastra, which holds no secret.
export function keptEnvKeys(snapshot: ToolSnapshot, registry: Registry = REGISTRY): Set<string> {
  return new Set(['PATH', 'MASTRA_TELEMETRY_DISABLED', ...snapshot.manifest.flatMap(m => registry.byId(m.id)?.env ?? [])])
}

// The start of the server process: load the env file, check the snapshot, then delete each key
// that no tool that is on names, except PATH and MASTRA_TELEMETRY_DISABLED (secret_argv.server_keeps_named_keys_only).
export function prepareServerProcess(env: NodeJS.ProcessEnv = process.env, registry: Registry = REGISTRY): ToolSnapshot {
  const file = env.HARNESS_ENV_FILE
  if (file !== undefined && file !== '') {
    if (env !== process.env) throw new Error('prepareServerProcess loads the env file into process.env only.')
    process.loadEnvFile(file)
  }
  const snapshot = snapshotFromServerEnv(env, registry)
  const keep = keptEnvKeys(snapshot, registry)
  for (const key of Object.keys(env)) if (!keep.has(key)) delete env[key]
  return snapshot
}
