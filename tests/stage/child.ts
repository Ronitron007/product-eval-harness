import { GOOD_OUTPUT } from '../compiler/rules'
import { BAD_OUTPUT, makeEnv } from './env'

// A child process of the crash tests (double_write, stuck_claim). It runs one start or one resume,
// and it dies at a named hook, after the store call commits, as a killed process would:
//   afterEndRun  after endRun commits      afterClaim  after claimJudge takes a claim
// Usage: tsx tests/stage/child.ts <url> <hook> <start|resume> <runId> <accept|budget>
const [url, hook, mode, runId, plan] = process.argv.slice(2) as [string, string, string, string, string]
const die = () => {
  console.log(`child dies at ${hook}`)
  process.exit(9)
}
const env = makeEnv(url, {
  replies: plan === 'accept' ? [GOOD_OUTPUT] : [BAD_OUTPUT],
  wrap: store => ({
    ...store,
    endRun: async input => {
      const end = await store.endRun(input)
      if (hook === 'afterEndRun') die()
      return end
    },
    claimJudge: async (...a) => {
      const attempt = await store.claimJudge(...a)
      if (hook === 'afterClaim' && attempt !== null) die()
      return attempt
    },
  }),
})
const run = await env.workflow().createRun({ runId })
const result = mode === 'start' ? await run.start({ inputData: { nodeId: 'sunscreen' } }) : await run.resume({ step: 'person', resumeData: { decision: 'accept', reviewer: 'operator' } })
console.log(`child ${mode} -> ${result.status}`)
process.exit(0)
