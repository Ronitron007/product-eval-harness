import { ClaudeSDKAgent } from '@mastra/claude'
const S = process.cwd()
const mk = () => new ClaudeSDKAgent({ id: 'fd', description: 'd', sdkOptions: { pathToClaudeCodeExecutable: `${S}/replay-cli.mjs`, executable: undefined, env: { PATH: process.env.PATH!, REPLAY_FILE: `${S}/../fence-2.ndjson`, ...(process.env.REPLAY_PATCH ? { REPLAY_PATCH: process.env.REPLAY_PATCH } : {}) }, persistSession: false } as any })
const out: any = await mk().generate('hi')
console.log('--- success replay (fence-2.ndjson: 3 turns, $0.00066, 1 permission denial)')
console.log('FullOutput keys:', Object.keys(out).join(','))
const flat = JSON.stringify(out, (k, v) => (k === 'messages' || k === 'request' ? undefined : v))
for (const k of ['permission_denials', 'terminal_reason', 'num_turns', 'save_record', 'denied']) console.log(` mentions "${k}":`, flat.includes(k))
console.log(' totalCostUsd via providerMetadata:', JSON.stringify(out.providerMetadata ?? out.response?.providerMetadata ?? null)?.slice(0, 160))
for (const [label, patch] of [['error_max_budget_usd', { subtype: 'error_max_budget_usd', is_error: true, errors: ['Reached maximum budget ($0.5)'], permission_denials: [{ tool_name: 'mcp__harness__save_record' }], total_cost_usd: 0.51, num_turns: 4 }]] as const) {
  process.env.REPLAY_PATCH = JSON.stringify(patch)
  try { await mk().generate('hi'); console.log(`--- ${label}: returned`) } catch (e) { console.log(`--- ${label}: generate THREW:`, (e as Error).message, '| error own keys:', Object.keys(e as any).join(',') || '(none)') }
}
process.exit(0)
