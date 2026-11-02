// TLC gives a set as an array, and a record as an object.
type Value = any

// The reader's words for formal/models/VerdictLog.tla.
export const title = 'A stage run, its verdicts and its output in the graph store'

const levelOf: Record<string, string> = { skincare: 'domain', mineral: 'leaf' }
const stageLevel: Record<string, string> = { define_criteria: 'domain', create_pack: 'leaf' }

export function state(v: Value): string {
  if (v.run.stage === 'none') return 'No stage run'
  const verdicts: Value[] = v.verdicts ?? []
  const outputs: Value[] = v.outputs ?? []
  const marks: string[] = []
  if (levelOf[v.run.node] !== stageLevel[v.run.stage]) marks.push('at a node of another level')
  if (new Set(verdicts.map(x => x.hash)).size > 1) marks.push('one rule version with two hashes')
  if (verdicts.length > 1) marks.push('two verdicts for one target')
  if (outputs.length > 0 && v.latest !== 'pass') marks.push(v.latest === 'none' ? 'no verdict' : `last verdict ${v.latest}`)
  if (outputs.length > 1) marks.push('two outputs')
  const phase = outputs.length > 0 ? 'Output accepted' : verdicts.length > 0 ? 'Verdicts written' : 'Run recorded'
  return marks.length ? `${phase}: ${marks.join(', ')}` : phase
}

export function step(action: string, from: Value, to: Value): string {
  if (action === 'RecordStageRun') {
    const ok = levelOf[to.run.node] === stageLevel[to.run.stage]
    return ok ? 'the stage records its run' : 'the stage records its run [at a node of another level]'
  }
  if (action === 'WriteVerdict') return `the judge writes a ${to.latest} verdict`
  if (action === 'AcceptOutput') return 'the stage accepts its output'
  return action
}

export function group(v: Value): string {
  return state(v).includes(':') ? 'broken' : 'ok'
}

export const colors = { ok: 'teal', broken: 'orange' }
