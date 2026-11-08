import { spawnSync } from 'node:child_process'
import { makeDb, makeEnv, script } from './env'
const repair = { kind: 'repair' as const, errors: [{ from: 'r.x@1', target: 't', fix: 'f' }], warnings: [] }
const child = (url: string, hook: string, mode: string, runId: string, plan: string) => { const r = spawnSync('npx', ['tsx', 'child.ts', url, hook, mode, runId, plan], { env: { ...process.env, MASTRA_TELEMETRY_DISABLED: '1' }, encoding: 'utf8', cwd: import.meta.dirname }); return (r.stdout + r.stderr).trim().split('\n').filter(l => l.startsWith('child')).join(' / ') + ` [exit ${r.status}]` }
const st = (r: any) => r?.status + (r?.status === 'failed' ? ':' + String(r.error?.message ?? r.error).slice(0, 90) : '')
const db = await makeDb()
for (const [name, hook, mode, plan] of [['p9b die after endRun commit (resume)', 'afterEndRun', 'resume', 'budget'], ['die after judge claim (start)', 'afterClaim', 'start', 'accept'], ['die after decision row (resume)', 'afterDecision', 'resume', 'budget']] as const) {
  const runId = 'crash-' + hook
  const out = [mode === 'resume' ? child(db.url, 'none', 'start', runId, plan) : '', child(db.url, hook, mode, runId, plan)].filter(Boolean)
  script.length = 0; script.push(...(plan === 'accept' ? [{ kind: 'accept' as const, output: { reply: 1 }, warnings: [] }] : [repair, repair, repair]))
  const e = makeEnv(db.url); const w = e.w
  const before = (await w.getWorkflowRunById(runId))?.status
  await new Promise(r => setTimeout(r, 17000)) // lease TTL 15 s
  await e.mastra.restartAllActiveWorkflowRuns()
  let s: any; for (let i = 0; i < 40; i++) { s = await w.getWorkflowRunById(runId); if (s?.status !== 'running') break; await new Promise(r => setTimeout(r, 250)) }
  const pay = s?.steps?.person?.suspendPayload
  console.log(`== ${name}\n  ${out.join(' | ')}\n  status before sweep ${before} -> after sweep ${st(s)}${pay ? ' payload round ' + pay.round : ''} | decisions ${await e.count('person_decisions', runId)} claims ${await e.count('judge_claims', runId)} verdicts ${await e.count('verdicts', runId)} ends ${await e.count('run_ends', runId)} outputs ${await e.count('outputs', runId)}`)
  if (s?.status === 'suspended') { try { const r2 = await (await w.createRun({ runId })).resume({ step: 'person', resumeData: { decision: 'reject', reviewer: 'op', note: 'other' } }); console.log('  then a resume with reject ->', st(r2), '| ends', await e.count('run_ends', runId)) } catch (x: any) { console.log('  then resume threw', x.id) } }
  if (s?.status === 'failed') { const r3: any = await (await w.createRun({ runId })).start({ inputData: { nodeId: 'sunscreen' } }); console.log('  then a new start of the run id ->', st(r3)) }
}
await db.drop().catch(() => {}); process.exit(0)
