import { ClaudeSDKAgent } from '@mastra/claude'
import { execSync } from 'node:child_process'
const a = new ClaudeSDKAgent({ id: 'fd', description: 'd', sdkOptions: {
  mcpServers: { harness: { type: 'stdio', command: 'node', args: ['s.js'], env: { HARNESS_DATABASE_URL: 'postgres://harness_app:PLACEHOLDER-PW@db.example:5432/postgres', JEV_API_KEY: 'PLACEHOLDER-KEY' } } },
  pathToClaudeCodeExecutable: `${process.cwd()}/fake-cli-sleep.sh`, tools: [], strictMcpConfig: true, settingSources: [] } as any })
const p = a.generate('hi').catch(() => {})
await new Promise(r => setTimeout(r, 1500))
console.log(execSync(`ps -axo args | grep -F fake-cli-sleep | grep -v grep | grep -oE 'postgres://[^"]*|PLACEHOLDER-KEY' || true`).toString())
process.exit(0)
