import { describe, expect, it } from 'vitest'
import { problemsOf, rulesCheck, rulesRoot } from './files'
import { judgementRule } from './rules'

// Hazard `noop`: a rule or the schema applies nowhere, in silence.

describe('noop', () => {
  it('noop.level_stage_lint: with no tree, a selector { level: domain } with the stage create_pack gives a loader problem', () => {
    const rule = judgementRule('pack.domain_only', 'criteria[]', 'Is it a product property?', [{ output: {}, expected: 'pass' }], {
      scope: { nodes: { level: 'domain' }, stages: ['create_pack'], fields: ['criteria[]'] },
    })
    const root = rulesRoot([rule])
    expect(problemsOf(root)).toEqual(['scope.stages.0: The stage create_pack never runs at level domain. It runs at leaf. Change the stage or the level.'])
    expect(rulesCheck(root).status).toBe(1)
  })
})
