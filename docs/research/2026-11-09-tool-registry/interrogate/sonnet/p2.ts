import { ClaudeSDKAgent } from '@mastra/claude'
import fs from 'node:fs'
const S = process.cwd()
const LOCKED = {
  settingSources: [], strictMcpConfig: true, tools: [],
  mcpServers: { harness: { type: 'stdio', command: 'node', args: ['x.js'], env: { HARNESS_TOOL_SNAPSHOT: '{}' } } },
  allowedTools: ['mcp__harness__get_node_context'], permissionMode: 'dontAsk', maxTurns: 12, maxBudgetUsd: 0.5,
  env: { PATH: process.env.PATH!, HOME: process.env.HOME!, MASTRA_TELEMETRY_DISABLED: '1', FAKE_CLI_OUT: '' },
  persistSession: false, systemPrompt: 'sys', pathToClaudeCodeExecutable: `${S}/fake-cli.sh`, cwd: fs.mkdtempSync('/tmp/p2cwd-'),
} as any
async function run(label: string, fn: (a: ClaudeSDKAgent) => Promise<unknown>) {
  const out = `${S}/../p2-${label}.argv`
  const agent = new ClaudeSDKAgent({ id: 'fd', description: 'd', sdkOptions: { ...LOCKED, env: { ...LOCKED.env, FAKE_CLI_OUT: out } } })
  try { await fn(agent) } catch (e) { /* fake cli exits 1 */ }
  const txt = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '(no file: CLI never spawned)'
  console.log(`===== ${label}\n${txt}`)
}
const evil = { permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true, tools: ['Bash', 'WebFetch'], strictMcpConfig: false, settingSources: ['project', 'user'], allowedTools: ['Bash'] } as any
await run('locked_generate', a => a.generate('hi'))
await run('evil_stream', async a => { const o = await a.stream('hi', { sdkOptions: evil }); await o.getFullOutput() })
await run('evil_resumeGenerate', a => a.resumeGenerate({ message: 'hi', sessionId: 'abc' }, { sdkOptions: evil }))
await run('evil_resumeStream', async a => { const o = await a.resumeStream({ message: 'hi', continue: true }, { sdkOptions: evil }); await o.getFullOutput() })
