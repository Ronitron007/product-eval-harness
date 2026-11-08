import { Agent } from '@mastra/core/agent'
import { compileStage, type CompileProblem } from '../compiler'
import type { PlanFor } from '../judge'
import { loadRuleLibrary, type RuleLibrary } from '../rules/load'
import type { GraphStore } from '../store/store'
import { agentDrafter } from './drafter'
import type { Drafter, ResearchPort, StageDeps } from './types'

// The ports of the stage workflow that src/mastra/index.ts gives it (stage.research_port,
// stage.models_injected). Tests give their own deps and never import this file's env path.

// The compile refused the rules. It holds every problem of the compile (compile.usage.calls).
export class RulesRefused extends Error {
  readonly problems: readonly CompileProblem[]

  constructor(problems: readonly CompileProblem[]) {
    super(`The rules refused the stage:\n${problems.map(p => `${p.code} ${p.rules.join(' ')}${p.field ? ` ${p.field}` : ''}: ${p.message}`).join('\n')}`)
    this.name = 'RulesRefused'
    this.problems = problems
  }
}

// planFor of compile.usage.calls: it compiles the stage on each call, from the rule library and the
// tree and derived rules of the store. It throws RulesRefused with all problems, and it refuses a
// hash that differs from the hash of the run (an empty hash means a run with no hash yet).
export function compilingPlanFor(source: { library: () => RuleLibrary; store: Pick<GraphStore, 'tree' | 'derivedRules'> }): PlanFor {
  return async run => {
    const [tree, derived] = await Promise.all([source.store.tree(), source.store.derivedRules()])
    const compiled = compileStage({ stage: run.stage, node: run.nodeId, library: source.library(), derived, tree })
    if (!compiled.ok) throw new RulesRefused(compiled.problems)
    if (run.ruleSetHash !== '' && run.ruleSetHash !== compiled.plan.ruleSetHash) throw new Error(`The rules changed during run ${run.runId}. Start a new run.`)
    return compiled.plan
  }
}

// Until plan.research_tools ships, a real run stops here, before the drafter.
export const unbuiltResearch: ResearchPort = async () => {
  throw new Error('The research tools are not built (plan.research_tools).')
}

// A drafter on the Mastra model router. The agent is made on the first draft, so an unset model
// id fails in the context step (checkModels), never at import.
function routerDrafter(id: string): Drafter {
  let agent: Agent | undefined
  const make = () =>
    (agent ??= new Agent({
      id: 'stage-drafter',
      name: 'stage-drafter',
      instructions: 'Write one output for the stage. The prompt holds the node context, the rules, the run evidence, and the errors of the last round.',
      model: id,
    }))
  return { id, draft: input => agentDrafter(make(), id).draft(input) }
}

// The deps of a real run, from the environment (stage.models_injected). A real run is a paid run:
// it needs Rohan's yes for its prompt, model, and cost (rules.gates).
export function stageDepsFromEnv(env: Record<string, string | undefined>, store: GraphStore): StageDeps {
  const drafterId = env.HARNESS_DRAFTER_MODEL ?? ''
  const judgeId = env.HARNESS_JUDGE_MODEL ?? ''
  return {
    store,
    planFor: compilingPlanFor({ library: () => loadRuleLibrary('rules'), store }),
    research: unbuiltResearch,
    drafter: routerDrafter(drafterId),
    judgeModel: { id: judgeId, model: judgeId },
  }
}
