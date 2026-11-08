import type { StageDeps } from './types'
import { stageWorkflow } from './workflow'

// stage.registered, stage.registry_no_db: one workflow for each stage of the graph, built from given
// deps. It reads no database and no environment variable. evaluate_product is not a stage of the
// graph (graph.stages), so it has no workflow.
export const STAGE_WORKFLOWS = ['define_criteria', 'create_node', 'create_pack', 'create_layout'] as const

export function stageWorkflows(deps: StageDeps) {
  return {
    define_criteria: stageWorkflow('define_criteria', deps),
    create_node: stageWorkflow('create_node', deps),
    create_pack: stageWorkflow('create_pack', deps),
    create_layout: stageWorkflow('create_layout', deps),
  }
}
