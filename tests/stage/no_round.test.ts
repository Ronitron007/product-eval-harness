import { describe, expect, it } from 'vitest'
import { GOOD_OUTPUT } from '../compiler/rules'
import { planOf } from '../compiler/library'
import { planRefs, rowRefs } from '../judge/helpers'
import { BAD_OUTPUT, start, useDb } from './helpers'

// no_round (stage.round_rows): a verdict row does not name its round.

const db = useDb()

describe('no_round', () => {
  it('no_round.rows_name_round: after two rounds, each verdict row has round 1 or 2, and the rows of each round cover the rules of the plan', async () => {
    const env = db.env({ replies: [BAD_OUTPUT, GOOD_OUTPUT] })
    const { runId } = await start(env)
    const { rows } = await env.pool.query(`select distinct round from harness.verdicts where run_id = $1 order by round`, [runId])
    expect(rows.map(r => r.round)).toEqual([1, 2])
    for (const round of [1, 2]) expect(rowRefs(await env.graph.verdictsOf(runId, round))).toEqual(planRefs(planOf()))
  })

  it('no_round.output_finds_its_rows: the verdict rows of the run and the round of an output are the rows of the accepted draft', async () => {
    const env = db.env({ replies: [BAD_OUTPUT, GOOD_OUTPUT] })
    const { runId, result } = await start(env)
    expect(result.status === 'success' && result.result).toMatchObject({ end: 'accepted', round: 2 })
    const { rows } = await env.pool.query(`select o.round from harness.outputs o where o.run_id = $1`, [runId])
    expect(rows).toEqual([{ round: 2 }])
    const accepted = await env.graph.verdictsOf(runId, rows[0].round)
    expect(accepted.filter(r => r.binding === 'strict').every(r => r.verdict === 'pass')).toBe(true)
    expect((await env.graph.draftOf(runId, 2))?.reply).toEqual(GOOD_OUTPUT)
    expect((await env.graph.verdictsOf(runId, 1)).some(r => r.binding === 'strict' && r.verdict === 'fail')).toBe(true)
  })
})
