import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { harnessServerCommand, readSnapshot, REGISTRY, type Consumer, type Registry, type ToolSnapshot } from '../../src/tools'

// MCP clients over stdio for the tool tests. Each client starts its own server process, as each
// agent run does. The client of @modelcontextprotocol/sdk 1.32.2 asks for the protocol 2025-11-25.

export const REPO = join(import.meta.dirname, '..', '..')
export const tmp = (label: string) => mkdtempSync(join(tmpdir(), `harness-${label}-`))

export function snapshotFor(harnessTools: string | undefined, consumer: Consumer = 'agent', registry: Registry = REGISTRY): ToolSnapshot {
  return readSnapshot(harnessTools === undefined ? {} : { HARNESS_TOOLS: harnessTools }, { runId: crypto.randomUUID(), consumer }, registry)
}

export function envFileWith(values: Record<string, string>): string {
  const file = join(tmp('envfile'), '.env')
  writeFileSync(file, Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n') + '\n')
  return file
}

export interface Connected {
  client: Client
  transport: StdioClientTransport
  close(): Promise<void>
}

export async function connect(env: Record<string, string>, script = join(REPO, 'scripts', 'tool-server.ts')): Promise<Connected> {
  const transport = new StdioClientTransport({ command: join(REPO, 'node_modules', '.bin', 'tsx'), args: [script], env, stderr: 'pipe', cwd: tmp('server-cwd') })
  const client = new Client({ name: 'harness-test', version: '0.0.0' }, { capabilities: {} })
  await client.connect(transport)
  return { client, transport, close: () => client.close() }
}

// The real tool server for one snapshot, with the env file of the test.
export function connectServer(snapshot: ToolSnapshot, envFile = envFileWith({})): Promise<Connected> {
  return connect({ ...harnessServerCommand(snapshot, { path: process.env.PATH!, envFile }).env })
}

// The fixture server of tests/tools/fixture-server.ts for one snapshot of the fixture registry.
export function connectFixture(snapshot: ToolSnapshot): Promise<Connected> {
  const env = harnessServerCommand(snapshot, { path: process.env.PATH!, envFile: envFileWith({}) }).env
  return connect({ ...env }, join(REPO, 'tests', 'tools', 'fixture-server.ts'))
}

export const toolNames = async (c: Connected) => (await c.client.listTools()).tools.map(t => t.name).sort()

// The text of a tool result, or of the error a call threw.
export async function callText(c: Connected, name: string, args: Record<string, unknown>): Promise<{ isError: boolean; text: string }> {
  try {
    const r = (await c.client.callTool({ name, arguments: args })) as { isError?: boolean; content?: { type: string; text?: string }[]; structuredContent?: unknown }
    return { isError: r.isError === true, text: r.content?.map(x => x.text ?? '').join('') ?? JSON.stringify(r.structuredContent) }
  } catch (e) {
    return { isError: true, text: (e as Error).message }
  }
}
