// p10 with a judge that takes 3 s (a real panel of judges): two concurrent re-starts of one round.
import { makeDb, makeEnv, script, judgeCalls } from './env'
const st = (r: any) => r.status + (r.status === 'failed' ? ':' + String(r.error?.message ?? r.error).slice(0, 80) : ' ' + r.result?.end)
const db = await makeDb()
script.length = 0; script.push({ kind: 'accept', output: { reply: 1 }, warnings: [] }); let boom = true; judgeCalls.n = 0
const e = makeEnv(db.url, { judgeMs: 3000, afterAddDraft: () => { if (boom) { boom = false; throw new Error('crash after the draft insert') } } } as any)
const run = await e.w.createRun(); await run.start({ inputData: { nodeId: 'sunscreen' } })
const res = await Promise.allSettled([1, 2].map(async () => (await e.w.createRun({ runId: run.runId })).start({ inputData: { nodeId: 'sunscreen' } })))
console.log('slow judge, two re-starts ->', res.map(x => x.status === 'fulfilled' ? st(x.value) : 'rej').join(' || '), '| judgeCalls', judgeCalls.n, '| stored', (await e.w.getWorkflowRunById(run.runId))?.status, '| ends', await e.count('run_ends', run.runId), 'outputs', await e.count('outputs', run.runId))
await db.drop().catch(() => {}); process.exit(0)
