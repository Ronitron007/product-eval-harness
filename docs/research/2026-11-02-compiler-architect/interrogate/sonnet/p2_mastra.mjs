const M = '../../../../../node_modules/@mastra/core/dist/'
const ev = await import('@mastra/core/evals').catch(e=>({err:e.message}))
console.log('evals exports', Object.keys(ev).filter(k=>/Scorer/i.test(k)))
const llm = await import('@mastra/core/llm')
console.log('llm MastraModelConfig is type only; runtime keys sample', Object.keys(llm).slice(0,5))
const mock = await import('@mastra/core/test-utils/llm-mock')
console.log('mock', Object.keys(mock))
const { createScorer } = ev
for (const id of ['units.label_unit@1', 'a b', 'x/y@2']) {
  try { const s = createScorer({ id, description: 'd' }).generateScore(()=>1); console.log('id ok', id, s.id ?? s.name) } catch (e) { console.log('id FAIL', id, e.message.slice(0,100)) }
}
