import { Agent } from '@mastra/core/agent'
import { createMockModel } from '@mastra/core/test-utils/llm-mock'
import { readSnapshot, readStoreOf, stageWriteDoors, toolFor, type HandleSet } from '../../src/tools'
import { agentDrafter, type StageStore } from '../../src/stage'
import { GOOD_OUTPUT } from '../compiler/rules'
import type { Env, EnvOptions } from '../stage/env'

// A stage wrapper over the real stage workflow of tests/stage/env.ts, with createMockModel for the
// drafter and the judge, and a spy on the store. No model call, no network.

export interface StageSpy {
  writes: string[] // the store calls of the stage code, in order
  drafterTools: string[][] // the tool names that the drafter model got, by call
}

const WRITES = new Set(['recordStageRun', 'addDraft', 'claimDraft', 'writeVerdicts', 'claimJudge', 'addDecision', 'endRun', 'recordToolRun'])

export function spyStore<T extends object>(store: T, spy: StageSpy): T {
  return new Proxy(store, {
    get(target, key, receiver) {
      const v = Reflect.get(target, key, receiver)
      if (typeof v !== 'function') return v
      return (...a: unknown[]) => {
        if (WRITES.has(String(key))) spy.writes.push(String(key))
        return (v as (...x: unknown[]) => unknown).apply(target, a)
      }
    },
  })
}

export function spyDrafterOptions(spy: StageSpy): EnvOptions['drafter'] {
  return s => ({
    id: 'drafter/mock',
    draft: input => {
      s.calls++
      const model = createMockModel({ version: 'v2', objectGenerationMode: 'json', mockText: GOOD_OUTPUT as never, spyGenerate: (o: { tools?: { name: string }[] }) => spy.drafterTools.push((o.tools ?? []).map(t => t.name)) } as never)
      return agentDrafter(new Agent({ id: 'd', name: 'd', instructions: 'Write the output.', model: model as never }), 'drafter/mock').draft(input)
    },
  })
}

// The wrapper run_create_node of the real registry, with the write doors of src/tools/handles.ts.
export function stageTool(env: Env, spy: StageSpy) {
  const handles: HandleSet = { store: readStoreOf(env.graph), writes: stageWriteDoors({ mastra: env.mastra, store: spyStore(env.graph, spy) }) }
  const snapshot = readSnapshot({ HARNESS_TOOLS: '{"allowEffects":["read","paid","db_write"]}' }, { runId: crypto.randomUUID(), consumer: 'agent' }) // the four wrappers, each with its door
  return { tool: toolFor('run_create_node', snapshot, handles), snapshot, handles }
}

export const wrapStore = (spy: StageSpy) => (store: StageStore) => spyStore(store, spy)
