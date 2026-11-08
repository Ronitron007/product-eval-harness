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
  const passed = (round: number) => verdicts.some(x => x.round === round) && verdicts.every(x => x.round !== round || x.result === 'pass')
  if (levelOf[v.run.node] !== stageLevel[v.run.stage]) marks.push('at a node of another level')
  if (new Set(verdicts.map(x => x.hash)).size > 1) marks.push('one rule version with two hashes')
  if (verdicts.length > 1 && new Set(verdicts.map(x => x.round)).size < verdicts.length) marks.push('two verdicts for one target in one round')
  for (const o of outputs) {
    const person = v.decision.choice === 'accept' && v.decision.round === o.round
    if (!passed(o.round) && !person) marks.push(`output of round ${o.round} with no pass and no person`)
  }
  if (outputs.length > 1) marks.push('two outputs')
  const phase =
    outputs.length > 0 ? 'Output accepted' : v.ended.kind !== 'none' ? `Run ended ${v.ended.kind}` : v.decision.choice !== 'none' ? `Person chose ${v.decision.choice}` : verdicts.length > 0 ? 'Verdicts written' : (v.drafts ?? []).length > 0 ? 'Drafts written' : 'Run recorded'
  return marks.length ? `${phase}: ${marks.join(', ')}` : phase
}

export function step(action: string, from: Value, to: Value): string {
  if (action === 'RecordStageRun') {
    const ok = levelOf[to.run.node] === stageLevel[to.run.stage]
    return ok ? 'the stage records its run' : 'the stage records its run [at a node of another level]'
  }
  if (action === 'AddDraft') return 'the drafter writes a draft'
  if (action === 'WriteVerdict') {
    const added = (to.verdicts as Value[]).find(x => !(from.verdicts as Value[]).some(y => y.row === x.row))
    return added ? `the judge writes a ${added.result} verdict in round ${added.round}` : 'the judge writes a verdict'
  }
  if (action === 'AddDecision') return `a person chooses ${to.decision.choice}`
  if (action === 'EndRun') return `the run ends ${to.ended.kind}`
  if (action === 'AcceptOutput') return 'the stage accepts its output'
  return action
}

export function group(v: Value): string {
  return state(v).includes(':') ? 'broken' : 'ok'
}

export const colors = { ok: 'teal', broken: 'orange' }
