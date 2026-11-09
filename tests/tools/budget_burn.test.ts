import { beforeEach, describe, expect, it, vi } from 'vitest'
import { lockedClaudeAgent, lockedSdkOptions, MAX_BUDGET_USD_CEILING, MAX_TURNS_CEILING, tapSpawn } from '../../src/agent'
import { createPaidDoor, readSnapshot, toolFor, type StageOutcome } from '../../src/tools'
import { agentEnv, agentSnapshot, fenceMessages, markerCli, memoryRecorder, tmp } from '../agent/helpers'
import { resetSdk, sdkState } from '../agent/sdk-mock'
import { FIXTURE, fixtureHandles, ONLY_NODE, SUCCESS } from './fixture'
import { callText, connectFixture } from './helpers'

vi.mock('@anthropic-ai/claude-agent-sdk', async () => (await import('../agent/sdk-mock')).sdkModule())

// budget_burn: a run spends past its cap (tools.budget, tools.agent_run).

const cli = markerCli()
beforeEach(() => resetSdk(fenceMessages()))
const optionsWith = (budget: { maxTurns: number; maxBudgetUsd: number }) =>
  lockedSdkOptions({ snapshot: agentSnapshot(), systemPrompt: 'x', budget, cwd: tmp('cwd'), withSchema: false, spawn: tapSpawn(() => {}), env: agentEnv(cli.path) })

describe('budget_burn', () => {
  it('budget_burn.options_carry_caps: the options that query gets carry maxTurns and maxBudgetUsd', async () => {
    await lockedClaudeAgent({ id: 'caps', systemPrompt: 'x', snapshot: agentSnapshot(), budget: { maxTurns: 3, maxBudgetUsd: 0.02 }, store: memoryRecorder(), env: agentEnv(cli.path) }).run('hi')
    expect(sdkState.calls[0]!.options).toMatchObject({ maxTurns: 3, maxBudgetUsd: 0.02 })
  })

  it('budget_burn.cap_above_ceiling_refused: a budget above a ceiling, or not above zero, is refused', () => {
    expect(() => optionsWith({ maxTurns: MAX_TURNS_CEILING, maxBudgetUsd: MAX_BUDGET_USD_CEILING })).not.toThrow()
    expect(() => optionsWith({ maxTurns: MAX_TURNS_CEILING + 1, maxBudgetUsd: 0.1 })).toThrow(/MAX_TURNS_CEILING/)
    expect(() => optionsWith({ maxTurns: 2, maxBudgetUsd: MAX_BUDGET_USD_CEILING + 0.01 })).toThrow(/MAX_BUDGET_USD_CEILING/)
    for (const bad of [{ maxTurns: 0, maxBudgetUsd: 0.1 }, { maxTurns: 1.5, maxBudgetUsd: 0.1 }, { maxTurns: 2, maxBudgetUsd: 0 }, { maxTurns: 2, maxBudgetUsd: Number.NaN }]) expect(() => optionsWith(bad)).toThrow()
  })

  it('budget_burn.parallel_calls_one_runs (repro sonnet/p1.ts MODE=slow): of 4 parallel calls over MCP to a tool with a cap of 1 and a slow execute, exactly 1 runs', async () => {
    const snapshot = readSnapshot({ HARNESS_TOOLS: '{"allowEffects":["read","paid"]}' }, { runId: crypto.randomUUID(), consumer: 'agent' }, FIXTURE)
    const server = await connectFixture(snapshot)
    try {
      const results = await Promise.all([1, 2, 3, 4].map(() => callText(server, 'slow_paid', {})))
      expect(results.map(r => JSON.parse(r.text).ran).sort()).toEqual([false, false, false, true])
    } finally {
      await server.close()
    }
  }, 60_000)

  it('budget_burn.paid_door_counts_calls: a paid tool never runs past its maxCallsPerRun in sequence', async () => {
    const door = createPaidDoor(2)
    let runs = 0
    const results = []
    for (let i = 0; i < 4; i++) results.push(await door.call('x', 0.01, async () => ++runs))
    expect(runs).toBe(2)
    expect(results.slice(2)).toEqual([{ refused: true, name: 'x', cap: 2 }, { refused: true, name: 'x', cap: 2 }])
    const snapshot = readSnapshot({ HARNESS_TOOLS: '{"allowEffects":["read","paid"]}' }, { runId: 'r', consumer: 'step' }, FIXTURE)
    const tool = toolFor('slow_paid', snapshot, fixtureHandles(), FIXTURE)
    const outs = [await tool.execute!({}, {} as never), await tool.execute!({}, {} as never)]
    expect(outs).toEqual([{ ran: true }, { ran: false }])
    // The same snapshot and handles give the same tool and the same door: a second toolFor does not reset the count.
    expect(await toolFor('slow_paid', snapshot, fixtureHandles(), FIXTURE).execute!({}, {} as never)).toEqual({ ran: true })
  })

  it('budget_burn.failed_call_still_counts: a call that throws keeps its reservation', async () => {
    const door = createPaidDoor(1)
    await expect(door.call('x', 0, async () => Promise.reject(new Error('paid call failed')))).rejects.toThrow(/paid call failed/)
    expect(door.used()).toBe(1)
    expect(await door.call('x', 0, async () => 'ran')).toEqual({ refused: true, name: 'x', cap: 1 })
  })

  it('budget_burn.second_stage_call_refused: a second call of a stage wrapper in one run starts no second stage run', async () => {
    const starts: string[] = []
    const write = async ({ runId }: { runId: string }): Promise<StageOutcome> => (starts.push(runId), { ...SUCCESS })
    const handles = { ...fixtureHandles(), writes: { run_create_node: write } }
    const snapshot = readSnapshot({ HARNESS_TOOLS: ONLY_NODE }, { runId: 'r', consumer: 'step' })
    const tool = toolFor('run_create_node', snapshot, handles)
    const [a, b] = await Promise.all([tool.execute!({ nodeId: 'sunscreen' }, {} as never), tool.execute!({ nodeId: 'sunscreen' }, {} as never)])
    expect(starts).toHaveLength(1)
    expect([a, b].map(r => (r as { status: string }).status).sort()).toEqual(['ended', 'failed'])
    expect([a, b].find(r => (r as { status: string }).status === 'failed')).toMatchObject({ code: 'max_calls' })
  })
})
