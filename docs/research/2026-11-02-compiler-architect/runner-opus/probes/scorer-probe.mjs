import { createScorer } from '../../../../../node_modules/@mastra/core/dist/evals/index.js'
globalThis.fetch = () => { throw new Error('network call in probe') }
const s = createScorer({ id: 'units.allowed@1', description: 'unit allowed' })
  .preprocess(({ run }) => (run.output.items ?? []).map((v, i) => ({ target: `items[${i}]`, value: v })))
  .analyze(({ results }) => results.preprocessStepResult.map(t => ({ target: t.target, verdict: ['mg','mcg'].includes(t.value) ? 'pass' : 'fail' })))
  .generateScore(({ results }) => results.analyzeStepResult.every(v => v.verdict === 'pass') ? 1 : 0)
const r = await s.run({ input: { sources: {} }, output: { items: ['mg', 'IU'] } })
console.log('score', r.score, 'analyze', JSON.stringify(r.analyzeStepResult), 'id', s.id)
