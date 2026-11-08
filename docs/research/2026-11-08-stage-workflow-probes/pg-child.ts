// Probe: a child process that dies at a named hook. Adapted from the verify repro child.ts.
import { makeEnv, script } from './pg-env'
const [url, hook, mode, runId, plan] = process.argv.slice(2) as string[]
const repair = { kind: 'repair' as const, errors: [{ from: 'r.x@1', target: 't', fix: 'f' }], warnings: [] }
const accept = { kind: 'accept' as const, output: { reply: 1 }, warnings: [] }
script.length = 0; script.push(...(plan === 'accept' ? [accept] : [repair, repair, repair]))
const die = () => { console.log(`child dies at ${hook}`); process.exit(9) }
const e = makeEnv(url!, { [hook!]: die })
const run = await e.w.createRun({ runId })
const r: any = mode === 'start' ? await run.start({ inputData: { nodeId: 'sunscreen' } }) : await run.resume({ step: 'person', resumeData: { decision: 'accept', reviewer: 'op' } })
console.log('child', mode, '->', r.status); process.exit(0)
