import { describe, expect, it } from 'vitest'
import { withRules } from '../compiler/library'
import { attributeIsProduct } from '../compiler/rules'
import { FAIL, start, UNKNOWN, useDb } from './helpers'

// watch_block (stage.loop_on_outcome): a watch rule blocks a run.

const db = useDb()
const rules = withRules({ ...attributeIsProduct, binding: 'watch' })

describe('watch_block', () => {
  it('watch_block.fail_accepts: a watch judgement rule that fails, with each strict row pass, gives accepted at round 1 with no suspend', async () => {
    const env = db.env({ rules, judgeItems: FAIL })
    const { runId, result } = await start(env)
    expect(result.status === 'success' && result.result).toMatchObject({ end: 'accepted', round: 1 })
    const rows = await env.graph.verdictsOf(runId, 1)
    expect(rows.filter(r => r.binding === 'watch').map(r => r.verdict)).toEqual(['fail'])
  })

  it('watch_block.cannot_verify_accepts: a watch rule with cannot_verify gives accepted', async () => {
    const env = db.env({ rules, judgeItems: UNKNOWN })
    const { runId, result } = await start(env)
    expect(result.status === 'success' && result.result).toMatchObject({ end: 'accepted', round: 1 })
    expect((await env.graph.verdictsOf(runId, 1)).filter(r => r.binding === 'watch').map(r => r.verdict)).toEqual(['cannot_verify'])
  })
})
