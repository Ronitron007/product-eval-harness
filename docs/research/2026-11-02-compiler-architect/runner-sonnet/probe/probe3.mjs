import { createScorer } from '../../../../../node_modules/@mastra/core/dist/evals/index.js'
import { z } from '../../../../../node_modules/zod/index.js'
const s = createScorer({ id: 'code:x@1', description: 'd', type: { input: z.object({ source: z.string().optional() }), output: z.unknown() } })
  .analyze(({ run }) => [{ target: 'a[0]', verdict: run.input?.source ? 'pass' : 'cannot_verify' }])
  .generateScore(({ results }) => results.analyzeStepResult.every(f => f.verdict === 'pass') ? 1 : 0)
console.log('judge:', s.judge, 'id:', s.id)
const r1 = await s.run({ input: { source: 'x' }, output: {} })
console.log(JSON.stringify({ score: r1.score, analyze: r1.analyzeStepResult }))
const r2 = await s.run({ input: {}, output: {} })
console.log(JSON.stringify({ score: r2.score, analyze: r2.analyzeStepResult }))
