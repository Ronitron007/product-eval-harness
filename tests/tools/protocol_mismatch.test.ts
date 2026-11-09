import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectServer, REPO, snapshotFor, toolNames } from './helpers'

// protocol_mismatch: a client cannot read the protocol of the server (tools.consumers). The Cursor
// CLI asks for MCP 2025-11-25, and @mastra/mcp 2.x serves only 2026-07-28 (the 2026-10-28 spike).

afterEach(() => vi.restoreAllMocks())

describe('protocol_mismatch', () => {
  it('protocol_mismatch.cursor_version_lists: a client of @modelcontextprotocol/sdk that asks for 2025-11-25 lists the tools', async () => {
    expect(LATEST_PROTOCOL_VERSION).toBe('2025-11-25')
    const versions: string[] = []
    const original = Client.prototype.request
    vi.spyOn(Client.prototype, 'request').mockImplementation(async function (this: Client, ...a: Parameters<Client['request']>) {
      const result = await (original as (...x: unknown[]) => Promise<unknown>).apply(this, a)
      const req = a[0] as unknown as { method: string; params?: { protocolVersion?: string } }
      if (req.method === 'initialize') versions.push(`${req.params?.protocolVersion} -> ${(result as { protocolVersion: string }).protocolVersion}`)
      return result as never
    })
    const server = await connectServer(snapshotFor(undefined))
    try {
      expect(versions).toEqual(['2025-11-25 -> 2025-11-25'])
      expect(await toolNames(server)).toEqual(['get_node_context'])
    } finally {
      await server.close()
    }
  }, 60_000)

  it('protocol_mismatch.exact_pin: package.json pins @mastra/mcp 1.18.0 exactly, and the lock file installs it', () => {
    const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> }
    expect(pkg.dependencies['@mastra/mcp']).toBe('1.18.0')
    expect(pkg.dependencies['@mastra/claude']).toBe('0.3.3')
    expect(pkg.dependencies['@anthropic-ai/claude-agent-sdk']).toBe('0.3.319')
    expect(pkg.devDependencies['@modelcontextprotocol/sdk']).toBe('1.32.2')
    const lock = JSON.parse(readFileSync(join(REPO, 'package-lock.json'), 'utf8')) as { packages: Record<string, { version: string }> }
    expect(lock.packages['node_modules/@mastra/mcp']!.version).toBe('1.18.0')
    const installed = JSON.parse(readFileSync(join(REPO, 'node_modules', '@mastra', 'mcp', 'package.json'), 'utf8')) as { version: string }
    expect(installed.version).toBe('1.18.0')
  })
})
