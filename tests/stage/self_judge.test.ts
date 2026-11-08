import { describe, expect, it } from 'vitest'
import { checkModels, vendorOf } from '../../src/stage'
import { GOOD_OUTPUT } from '../compiler/rules'
import { mockModel } from '../judge/helpers'
import { errorOf, mockDrafter, PASS, start, useDb } from './helpers'

// self_judge (stage.models_injected, stage.models_by_vendor): the judge comes from the vendor of the drafter.

const db = useDb()

async function refused(drafterId: string, judgeId: string) {
  const judge = mockModel({ items: PASS })
  const env = db.env({ drafter: spy => mockDrafter([GOOD_OUTPUT], spy, drafterId), judgeModel: { ...judge, id: judgeId } })
  const { runId, result } = await start(env)
  expect(result.status).toBe('failed')
  expect(await env.count('stage_runs', runId)).toBe(0)
  expect(env.spies.drafter.calls).toBe(0)
  return errorOf(result)
}

describe('self_judge', () => {
  it('self_judge.same_provider_refused: a drafter anthropic/a and a judge anthropic/b give failed in the context step', async () => {
    expect(await refused('anthropic/a', 'anthropic/b')).toMatch(/have one vendor/)
  })

  it('self_judge.gateway_same_vendor_refused: a drafter anthropic/a and a judge openrouter/anthropic/b give failed in the context step', async () => {
    expect(vendorOf('openrouter/anthropic/b')).toBe('anthropic')
    expect(await refused('anthropic/a', 'openrouter/anthropic/b')).toMatch(/have one vendor/)
  })

  it('self_judge.unknown_id_refused: a judge id with no model part gives failed in the context step', async () => {
    expect(await refused('anthropic/a', 'judge')).toMatch(/is not provider\/model/)
    expect(() => checkModels('drafter/mock', 'mock/judge')).not.toThrow()
  })
})
