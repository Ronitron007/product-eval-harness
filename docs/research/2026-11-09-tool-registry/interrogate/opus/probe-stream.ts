// The spec lock: a wrapper whose generate refuses sdkOptions. Then use it as a Mastra workflow step.
import fs from 'node:fs'
import path from 'node:path'
import { ClaudeSDKAgent } from '@mastra/claude'
import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
const root = process.env.PROBE_ROOT!, home = path.join(root, 'home'), cfg = path.join(home, '.claude'), cwd = path.join(root, 'cwd')
fs.mkdirSync(cfg, { recursive: true }); fs.mkdirSync(cwd, { recursive: true })
const locked: any = {
  settingSources: [], strictMcpConfig: true, tools: [],
  mcpServers: { harness: { type: 'stdio', command: path.resolve('node_modules/.bin/tsx'), args: [path.resolve('server-spec.ts')],
    env: { PATH: process.env.PATH!, HARNESS_TOOL_SNAPSHOT: JSON.stringify({ on: ['get_node_context'] }), SERVER_LOG: path.join(root, 'server.log') } } },
  allowedTools: ['mcp__harness__get_node_context'], permissionMode: 'dontAsk', maxTurns: 4, maxBudgetUsd: 0.5,
  env: { PATH: process.env.PATH!, HOME: home, ANTHROPIC_BASE_URL: 'http://127.0.0.1:4810', ANTHROPIC_API_KEY: 'test-dummy-not-a-key', CLAUDE_CONFIG_DIR: cfg, DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
  persistSession: false, systemPrompt: 'PROBE_SYSTEM', pathToClaudeCodeExecutable: process.env.CLAUDE_BIN, cwd, model: 'claude-haiku-4-5',
}
class LockedAgent extends ClaudeSDKAgent {
  async generate(m: any, o?: any) { if (o?.sdkOptions) throw new Error('refused: per-call sdkOptions'); return super.generate(m, o) }
}
const fd = new LockedAgent({ id: 'front_door', sdkOptions: Object.freeze({ ...locked }) })
try { await fd.generate('x', { sdkOptions: { permissionMode: 'bypassPermissions' } } as any) } catch (e) { console.log('generate:', (e as Error).message) }
const override = { sdkOptions: { tools: ['Bash'], allowedTools: ['Bash'], permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true } }
const wf = createWorkflow({ id: 'w', inputSchema: z.object({ prompt: z.string() }), outputSchema: z.any() })
  .then(createStep(fd as any, override as any)).commit()
const run = await wf.createRun()
const r: any = await run.start({ inputData: { prompt: 'go' } })
console.log('workflow step via agent.stream:', r.status)
console.log('pwned file:', fs.existsSync(path.join(cwd, 'pwned')) ? fs.readFileSync(path.join(cwd, 'pwned'), 'utf8').trim() : 'absent')
