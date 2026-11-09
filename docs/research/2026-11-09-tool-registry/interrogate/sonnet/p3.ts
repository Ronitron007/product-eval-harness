import { query } from '@anthropic-ai/claude-agent-sdk'
import fs from 'node:fs'
const S = process.cwd()
const B = `${S}/../proj`
const harness = { type: 'stdio', command: `${S}/node_modules/.bin/tsx`, args: [`${S}/p1-server.ts`], env: { PATH: process.env.PATH!, MASTRA_TELEMETRY_DISABLED: '1' } }
async function go(label: string, extra: any, cwd = `${B}/sub/run1`) {
  const never = (async function* () { await new Promise(() => {}) })()
  const q = query({ prompt: never as any, options: {
    settingSources: [], strictMcpConfig: true, tools: [], mcpServers: { harness }, allowedTools: ['mcp__harness__get_node_context'],
    permissionMode: 'dontAsk', persistSession: false, systemPrompt: 'x', maxTurns: 1,
    env: { PATH: process.env.PATH!, HOME: process.env.HOME!, MASTRA_TELEMETRY_DISABLED: '1' },
    cwd, pathToClaudeCodeExecutable: `${process.env.HOME}/.local/bin/claude`, ...extra } })
  try {
    const init = await Promise.race([q.initializationResult(), new Promise<any>((_, r) => setTimeout(() => r(new Error('init timeout')), 40000))])
    await new Promise(r => setTimeout(r, 4000))
    const st = await q.mcpServerStatus()
    console.log(`== ${label}`)
    console.log(' commands:', init.commands.map((c: any) => c.name).join(',') || '(none)')
    console.log(' agents:', init.agents.map((a: any) => a.name).join(',') || '(none)')
    console.log(' mcp status:', st.map((s: any) => `${s.name}:${s.status}${s.tools ? '[' + s.tools.map((t: any) => t.name).join('|') + ']' : ''}`).join('; '))
  } catch (e) { console.log(`== ${label} ERR`, String((e as Error).message).slice(0, 200)) }
  try { q.close() } catch {}
}
await go('CONTROL: settingSources project, strictMcpConfig false', { settingSources: ['project'], strictMcpConfig: false })
console.log('markers:', fs.existsSync(`${S}/../marks.txt`) ? fs.readFileSync(`${S}/../marks.txt`, 'utf8').trim().split('\n').join(',') : '(none)')
process.exit(0)
