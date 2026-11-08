// The reader's words for HarnessRun.tla.
type Value = any

export const title = 'One stage run of the harness, in the design'

function checked(v: Value): string {
  if (v.judged && (v.judgeRow === 'pass' || v.judgeRow === 'fail') && !v.quoteFound) return 'Judge answer quotes text not in the sources'
  if (!v.fits && v.shapeOk) return 'Draft breaks the schema, no rule fails'
  if (v.errors) return 'A strict rule fails'
  const strictOpen = v.shapeRow !== 'pass' || (v.judgeBinding === 'strict' && v.judgeRow !== 'pass')
  if (strictOpen) return 'A strict rule cannot be verified'
  return 'Every strict rule passes'
}

function run(v: Value): string {
  switch (v.phase) {
    case 'context': return 'Run starts'
    case 'draft': return 'Drafting'
    case 'judge': return 'Checking the draft'
    case 'decide': return checked(v)
    case 'suspended': return 'Waiting for a reviewer'
    case 'accepted': return v.fits ? 'Accepted' : 'Accepted, draft breaks the schema'
    case 'accepted_by_reviewer': return v.fits ? 'Accepted by the reviewer' : 'Accepted by the reviewer, draft breaks the schema'
    case 'rejected': return 'Rejected by the reviewer'
    case 'refused': return 'Stopped: the rules changed'
    case 'rules_refused': return 'Stopped: the compiler refuses the rules'
  }
  return v.phase
}

export function state(v: Value) {
  return { Run: run(v), Rules: v.rulesChanged ? 'Rules changed since the run started' : 'Rules as the run recorded them' }
}

export function step(action: string, from: Value, to: Value): string | null {
  switch (action) {
    case 'RecordRun': return 'the compiler accepts the rules, and the run records their hash'
    case 'Draft': return 'the drafter replies'
    case 'CompileRefused': return 'the compiler finds a problem in the rules'
    case 'DraftRefused': return 'the step compiles again and finds another hash'
    case 'JudgeRefused': return null
    case 'Check':
      if (!to.fits) return 'the draft fails the decode gate, so no judge runs'
      if (to.shapeRow !== 'pass') return 'a strict code check fails, so no judge runs'
      if (!to.quoteFound) return 'the judge answers with a quote not in the sources'
      if (to.judgeRow === 'pass') return 'the judge says yes'
      if (to.judgeBinding === 'soft') return 'the soft judge says no or cannot tell'
      if (to.judgeRow === 'fail') return 'the strict judge says no'
      return 'the strict judge says unknown, or its call fails'
    case 'Repair': return 'the errors go back for a repair [budget left]'
    case 'Suspend': return from.errors ? 'the budget ends, the run suspends' : 'the run suspends'
    case 'Accept': return from.errors ? 'the budget ends, the harness accepts' : 'the harness accepts'
    case 'ReviewerAccepts': return 'the reviewer accepts'
    case 'ReviewerRejects': return 'the reviewer rejects'
    case 'ChangeRules': return 'Rohan merges a rule change'
    case 'Done': return null
  }
  return action
}

export function group(v: Value): string {
  if (['accepted', 'accepted_by_reviewer'].includes(v.phase)) return 'landed'
  if (['rejected', 'refused', 'rules_refused'].includes(v.phase)) return 'stopped'
  if (v.phase === 'suspended') return 'person'
  return 'working'
}

export const colors = { working: 'teal', person: 'yellow', landed: 'blue', stopped: 'tan' }
