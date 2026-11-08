import { spawnSync } from 'node:child_process'
import pg from 'pg'
import { freshDatabase } from './pgutil'
import { readFileSync } from 'node:fs'
import { setup, GOOD_OUTPUT } from './proto_env'
const env = { ...process.env, MASTRA_TELEMETRY_DISABLED: '1' }
const child = (url: string, hook: string, mode: string, runId: string, extra: Record<string, string> = {}) => { const r = spawnSync('npx', ['tsx', 'p9_child.ts', url, hook, mode, runId], { env: { ...env, ...extra }, encoding: 'utf8', cwd: import.meta.dirname }); return `${(r.stdout + r.stderr).trim().split('\n').slice(-1)[0] ?? ''} [signal=${r.signal} status=${r.status}]` }
const s = (r: any) => r.status + (r.status === 'failed' ? ':' + String(r.error?.message ?? r.error).slice(0, 140) : '')
async function main() {
  const db = await freshDatabase()
  const e = await setup({ existingUrl: db.url, drafts: () => ({}) }) // only for reading; schema is created below
  await e.pool.end().catch(() => {})
}
void main
async function scenario(name: string, hook: string, extra: Record<string, string>, mode1: string) {
  // fresh db with migrations + tree via setup(), then reuse its url
  const first = await setup({ drafts: () => ({ criteria: [{ name: 'spf', attributes: [{ ...GOOD_OUTPUT.criteria[0].attributes[0], key: 'trending' }] }] }) }); const url = first.db.url; const runId = 'crash-' + name
  console.log(`\n== ${name}`)
  if (mode1 === 'start') console.log('child start:', child(url, hook, 'start', runId, extra))
  else { console.log('child start:', child(url, 'none', 'start', runId)); console.log('child resume:', child(url, hook, 'resume', runId)) }
  const c = async (t: string) => Number((await first.q(`select count(*) from harness.${t}`)).rows[0].count)
  console.log('rows after crash: drafts', await c('drafts'), 'verdicts', await c('verdicts'), 'run_ends', await c('run_ends'), 'outputs', await c('outputs'))
  const w = first.mastra.getWorkflow('create_node')
  const st: any = await w.getWorkflowRunById(runId); console.log('mastra status:', st?.status)
  await new Promise(r => setTimeout(r, 3500)) // the lease of the dead process lapses
  for (let t = 0; t < 1; t++) {
    try { const r = await (await w.createRun({ runId })).restart(); console.log('restart ->', s(r), JSON.stringify((r as any).steps?.person?.suspendPayload ? { why: (r as any).steps.person.suspendPayload.why, round: (r as any).steps.person.suspendPayload.round } : (r as any).result ?? '')) } catch (er: any) { console.log('restart threw', er.id ?? '', String(er.message).slice(0, 110)) }
  }
  console.log('after recovery attempts: drafts', await c('drafts'), 'verdicts', await c('verdicts'), 'run_ends', await c('run_ends'), 'outputs', await c('outputs'), 'drafterCalls(parent)', first.state.drafterCalls)
  await first.db.drop()
}
async function main2() {
  await scenario('die_after_endRun_commit', 'afterEndRun', {}, 'resume')
  process.exit(0)
}
main2().catch(e => { console.error('ERR', e); process.exit(1) })
