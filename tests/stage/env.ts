import { Agent } from '@mastra/core/agent'
import { createMockModel } from '@mastra/core/test-utils/llm-mock'
import pg from 'pg'
import type { JudgeModel } from '../../src/compiler'
import { createHarness } from '../../src/mastra/harness'
import { agentDrafter, compilingPlanFor, stageWorkflows, type Drafter, type ResearchPort, type StageDeps, type StageStore, type Timing } from '../../src/stage'
import { createGraphStore, type GraphStore } from '../../src/store/store'
import { withUser } from '../db'
import { library } from '../compiler/library'
import { FIXTURE, GOOD_EVIDENCE, GOOD_OUTPUT, type RuleInput } from '../compiler/rules'
import { ans, mockModel, type Spy } from '../judge/helpers'

// The stage test environment, with no vitest import, so that a child process can use it too
// (tests/stage/child.ts). Each model is a createMockModel. No part calls fetch.

export const LABELS: Record<string, string> = { skincare: 'Skincare', sunscreen: 'Sunscreen', moisturizer: 'Moisturizer', mineral_sunscreen: 'Mineral sunscreen' }

// Short times for the tests (stage.claim_lease): the lease is longer than the deadline.
export const FAST: Timing = { claimLeaseMs: 5_000, judgeDeadlineMs: 4_000, pollMs: 100 }

// A bad draft: GOOD_OUTPUT with a quote that the strict code check quotes.from_label fails.
export const BAD_OUTPUT = { criteria: [{ name: 'spf', attributes: [{ ...GOOD_OUTPUT.criteria[0]!.attributes[0]!, quote: '600 mg' }] }] }
// A draft that breaks the output schema: an extra key.
export const EXTRA_KEY_OUTPUT = { criteria: [{ name: 'spf', attributes: [{ ...GOOD_OUTPUT.criteria[0]!.attributes[0]!, color: 'red' }] }] }
export const PASS = [ans('yes', '500 mg')]
export const FAIL = [ans('no', '500 mg')]
export const UNKNOWN = [ans('unknown', '')]

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// The fixture tree of tests/compiler/rules.ts in harness.nodes, written by the table owner.
export async function seedTree(url: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: url })
  try {
    const store = createGraphStore(pool)
    await store.addNode({ id: 'skincare', level: 'domain', label: LABELS.skincare! })
    await store.addNode({ id: 'sunscreen', parentId: 'skincare', level: 'inner', label: LABELS.sunscreen! })
    await store.addNode({ id: 'moisturizer', parentId: 'skincare', level: 'inner', label: LABELS.moisturizer! })
    await store.addNode({ id: 'mineral_sunscreen', parentId: 'sunscreen', level: 'leaf', label: LABELS.mineral_sunscreen! })
  } finally {
    await pool.end()
  }
}

// A drafter on an Agent with createMockModel (stage.models_injected). Call n gets replies[n], and
// the last reply repeats. A reply that breaks the schema comes back as text (errorStrategy warn).
export function mockDrafter(replies: readonly unknown[], spy: Spy, id = 'drafter/mock'): Drafter {
  return {
    id,
    async draft(input) {
      const reply = replies[Math.min(spy.calls, replies.length - 1)]
      spy.calls++
      const model = createMockModel({ version: 'v2', objectGenerationMode: 'json', mockText: reply as never })
      const agent = new Agent({ id: 'test-drafter', name: 'test-drafter', instructions: 'Write the output.', model: model as never })
      return agentDrafter(agent, id).draft(input)
    },
  }
}

// A drafter with no model, for replies that a mock model cannot carry, such as a NUL character.
export function rawDrafter(replies: readonly unknown[], spy: Spy, id = 'drafter/raw'): Drafter {
  return {
    id,
    async draft() {
      const reply = replies[Math.min(spy.calls, replies.length - 1)]
      spy.calls++
      return reply
    },
  }
}

// A judge model whose calls each wait delayMs before the mock answers.
export function slowJudge(items: unknown[], spy: Spy, delayMs: number): JudgeModel {
  const judge = mockModel({ items }, spy)
  const model = judge.model as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>
  for (const key of ['doGenerate', 'doStream'] as const) {
    const original = model[key]!.bind(model)
    model[key] = async (...a: unknown[]) => (await sleep(delayMs), original(...a))
  }
  return judge
}

// stage.research_port: a stub that returns its evidence, makes no network call, and counts its calls.
export function stubResearch(evidence: unknown = GOOD_EVIDENCE): ResearchPort & { calls: number; inputs: unknown[] } {
  const port = Object.assign(
    async (input: unknown) => {
      port.calls++
      port.inputs.push(input)
      return evidence as never
    },
    { calls: 0, inputs: [] as unknown[] },
  )
  return port
}

export interface EnvOptions {
  readonly replies?: readonly unknown[] // the agent drafter, by call
  readonly drafter?: (spy: Spy) => Drafter
  readonly judgeItems?: unknown[]
  readonly judgeDelayMs?: number
  readonly judgeModel?: JudgeModel
  readonly research?: ResearchPort
  readonly evidence?: unknown
  readonly rules?: readonly RuleInput[]
  readonly timing?: Timing
  readonly wrap?: (store: StageStore) => StageStore // a spy or a fault around the store
}

export function makeEnv(url: string, o: EnvOptions = {}) {
  const pool = new pg.Pool({ connectionString: withUser(url, 'harness_app') })
  const graph: GraphStore = createGraphStore(pool)
  const lib = { current: library(o.rules ?? FIXTURE) }
  const stub = stubResearch(o.evidence ?? GOOD_EVIDENCE)
  const spies = { drafter: { calls: 0 } as Spy, judge: { calls: 0 } as Spy, research: stub }
  const research: ResearchPort = o.research ?? stub
  const judgeModel =
    o.judgeModel ?? (o.judgeDelayMs !== undefined ? slowJudge(o.judgeItems ?? PASS, spies.judge, o.judgeDelayMs) : mockModel({ items: o.judgeItems ?? PASS }, spies.judge))
  const deps: StageDeps = {
    store: o.wrap ? o.wrap(graph) : graph,
    planFor: compilingPlanFor({ library: () => lib.current, store: graph }),
    research,
    drafter: o.drafter ? o.drafter(spies.drafter) : mockDrafter(o.replies ?? [GOOD_OUTPUT], spies.drafter),
    judgeModel,
    timing: o.timing ?? FAST,
  }
  const mastra = createHarness({ pool, workflows: stageWorkflows(deps) })
  return {
    pool,
    graph,
    deps,
    lib,
    spies,
    mastra,
    workflow: (stage: 'define_criteria' | 'create_node' | 'create_pack' | 'create_layout' = 'create_node') => mastra.getWorkflow(stage),
    count: async (table: string, runId: string) => Number((await pool.query(`select count(*)::int as n from harness.${table} where run_id = $1`, [runId])).rows[0].n),
    close: () => pool.end(),
  }
}
export type Env = ReturnType<typeof makeEnv>

// Runs tests/stage/child.ts in its own process, and gives its output and exit code.
export async function child(args: { url: string; hook: string; mode: 'start' | 'resume'; runId: string; plan: 'accept' | 'budget' }): Promise<{ code: number | null; out: string }> {
  const { execFile } = await import('node:child_process')
  const { join } = await import('node:path')
  const repo = join(import.meta.dirname, '..', '..')
  return new Promise(resolve => {
    execFile(
      process.execPath,
      ['--import', 'tsx', join(repo, 'tests', 'stage', 'child.ts'), args.url, args.hook, args.mode, args.runId, args.plan],
      { cwd: repo, env: { ...process.env, MASTRA_TELEMETRY_DISABLED: '1' } },
      (error, stdout, stderr) => resolve({ code: error ? ((error as { code?: number }).code ?? 1) : 0, out: `${stdout}${stderr}` }),
    )
  })
}

// Mastra keeps a run-ownership lease of 15 seconds (WORKFLOW_RUN_LEASE_TTL_MS of @mastra/core
// 1.79.0, not configurable). A restart or the boot sweep takes a crashed run only after it lapses.
export const MASTRA_LEASE_MS = 15_000

// Polls the stored status of a run until it is not running, or until the time is up.
export async function settled(env: { workflow(): { getWorkflowRunById(id: string): Promise<{ status: string } | null> } }, runId: string, ms = 10_000): Promise<string | undefined> {
  let status: string | undefined
  for (const until = Date.now() + ms; Date.now() < until; await sleep(200)) {
    status = (await env.workflow().getWorkflowRunById(runId))?.status
    if (status !== 'running') return status
  }
  return status
}
