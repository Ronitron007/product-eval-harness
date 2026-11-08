import { describe, expect, it } from 'vitest'
import { unbuiltResearch } from '../../src/stage'
import { GOOD_OUTPUT } from '../compiler/rules'
import { takeFetchCalls } from '../setup/no-network'
import { BAD_OUTPUT, errorOf, mockDrafter, start, useDb } from './helpers'

// model_call (stage.models_injected, stage.research_port): a test calls a real model. The setup
// file fails each test of tests/stage/ that left a call of fetch (judge.no_network).

const db = useDb()

describe('model_call', () => {
  it('model_call.stage_zero_fetch: a run of the stage workflow ends with zero calls of fetch', async () => {
    takeFetchCalls()
    const env = db.env()
    expect((await start(env)).result.status).toBe('success')
    expect(takeFetchCalls()).toBe(0)
  })

  it('model_call.mock_drafter_only: a full run with mock models makes no call of fetch, and the spy of the drafter counts the rounds', async () => {
    takeFetchCalls()
    const env = db.env({ replies: [BAD_OUTPUT, GOOD_OUTPUT] })
    const { result } = await start(env)
    expect(result.status === 'success' && result.result).toMatchObject({ end: 'accepted', round: 2 })
    expect(env.spies.drafter.calls).toBe(2)
    expect(takeFetchCalls()).toBe(0)
  })

  it('model_call.unset_model_refuses: an empty drafter id gives failed in the context step, with no stage run row', async () => {
    const env = db.env({ drafter: spy => mockDrafter([GOOD_OUTPUT], spy, '') })
    const { runId, result } = await start(env)
    expect(result.status).toBe('failed')
    expect(errorOf(result)).toMatch(/is not provider\/model/)
    expect(await env.count('stage_runs', runId)).toBe(0)
    expect(env.spies.drafter.calls).toBe(0)
  })

  it('model_call.stub_research_only: the research stub gets one call for each run, and the judge gets its evidence', async () => {
    const env = db.env()
    const a = await start(env)
    const b = await start(env)
    expect(env.spies.research.calls).toBe(2)
    expect(env.spies.research.inputs.map(i => (i as { runId: string }).runId)).toEqual([a.runId, b.runId])
    const judged = (await env.graph.verdictsOf(a.runId, 1)).filter(r => r.decider.by === 'judge')
    expect(judged.map(r => [r.verdict, r.evidence])).toEqual([['pass', { quote: '500 mg', source: 'sources.label' }]])
  })

  it('model_call.unbuilt_research_stops: unbuiltResearch gives failed before any drafter call', async () => {
    const env = db.env({ research: unbuiltResearch })
    const { runId, result } = await start(env)
    expect(result.status).toBe('failed')
    expect(errorOf(result)).toMatch(/The research tools are not built \(plan.research_tools\)/)
    expect(env.spies.drafter.calls).toBe(0)
    expect(await env.count('drafts', runId)).toBe(0)
  })
})
