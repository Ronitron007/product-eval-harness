# Design index `design`

Status. Design of 2026-10-24. The Mastra scaffold exists (`plan.scaffold`), but no code implements this design yet.

| Doc | Name | What it holds |
|---|---|---|
| [rule-graph.md](rule-graph.md) | `graph` | The problem, the rule graph, the node levels, the stages, and the record system |
| [rule-enforcement.md](rule-enforcement.md) | `enforce` | The rule record, the compiler, the ruleset judge, the bindings, the repair loop, the verdict log, and rule changes |
| [self-improvement.md](self-improvement.md) | `improve` | The self-improvement loop, its boundaries, and its parts |
| [mastra-mapping.md](mastra-mapping.md) | `mastra` | Each part on Mastra 1.79.0, what we do not use, and what we build |
| [graph-store.md](graph-store.md) | `store` | Where the graph store lives, its safety on the live database, its tables, the tree walk, and its tests |
| [data-layers.md](data-layers.md) | `data` | What each layer of data holds, where it lives, and how the isolated steps hand off work |
| [compiler.md](compiler.md) | `compile` | The rule compiler of `plan.compiler`. Spec of 2026-11-02, not built yet. |

## Name map `harness.names`

Each name has one meaning. Add each new name here (`rules.naming`).

| Name | Meaning | Defined in |
|---|---|---|
| `graph` | The rule graph | [rule-graph.md](rule-graph.md) |
| `domain`, `inner`, `leaf` | The three node levels | `graph.shape` |
| `define_criteria` | The stage that creates the criteria of a domain node | `graph.stages` |
| `create_node` | The stage that fills an inner or leaf node: relevance, meaning, additions, attributes, records | `graph.stages` |
| `create_pack` | The stage that creates the evaluation pack of a leaf node | `graph.stages` |
| `create_layout` | The stage that creates the layout of a leaf node | `graph.stages` |
| `evaluate_product` | The product evaluation that reads a pack. It is not a stage of the graph. | `graph.stages` |
| `context`, `research`, `draft`, `judge`, `repair`, `person`, `assimilate` | The parts of one stage run | `graph.stage` |
| `stage_rule`, `derived_rule` | The two kinds of rules by origin | `graph.rule_kinds` |
| `shape`, `code_check`, `judgement` | The three kinds of rules by check | `enforce.rule_record` |
| `strict`, `soft`, `watch` | The three bindings | `enforce.binding` |
| `pass`, `fail`, `cannot_verify` | The three verdicts | `enforce.verdicts` |
| `RuleRecord`, `VerdictRow` | The record of a rule, and one row of the verdict log | `enforce.rule_record` |
| `improve` | The self-improvement loop | [self-improvement.md](self-improvement.md) |
| `rule_surface`, `rule_set_version`, `edit_proposal`, `proposal_validator`, `scoped_editor`, `stage_rollout`, `evidence_pack`, `measurement_firewall`, `composer`, `blind_selector`, `reflector`, `lesson_library`, `improvement_stream`, `budget_ledger`, `run_identity`, `held_out_measurement`, `promotion_gate` | The parts of the self-improvement loop | `improve.parts` |
| `mastra` | The Mastra mapping | [mastra-mapping.md](mastra-mapping.md) |
| `mastra_ref` | The sections of the Mastra reference | [../research/2026-10-24-mastra-primitives.md](../research/2026-10-24-mastra-primitives.md) |
| `lane` | One sequence of items of the improvement stream, one for each domain | `improve.parts` |
| `get_node_context`, `search_records`, `web_search`, `web_fetch` | The research tools | `mastra.research_tools` |
| `data` | The data layers | [data-layers.md](data-layers.md) |
| `data.authoring_graph`, `data.run_state`, `data.artifacts`, `data.bundles`, `data.evaluations` | The five data layers | `data.layers` |
| `publish` | The step that writes one hashed bundle for each leaf after the pack gate | `data.layers` |
| `plan.<unit>` | One unit of the plan, such as `plan.scaffold` | [../plans/2026-10-24-harness-plan.md](../plans/2026-10-24-harness-plan.md) |
| `compile` | The rule compiler | [compiler.md](compiler.md) |
| `compileStage`, `auditLibrary`, `StagePlan` | The two public calls of the compiler, and the plan of one stage run | `compile.api` |
| `admit`, `Admitted` | Admission, and the value that only admission makes | `compile.admit` |
| `owner`, `subtree`, `{ level }` | The three selectors of an anchored scope | `compile.scope` |
| `all` | The virtual owner of the rules for every domain | `compile.scope` |
| `slot`, `weaken`, `weakens` | What two rules check together, a child rule that restates an inherited slot more loosely, and its problem code | `compile.weaken` |
| `meet` | The strictest parameters that satisfy each shape rule on one path | `compile.shape` |
| `CheckTemplate`, `CHECKS`, `CheckRef`, `FactKind`, `CheckOutcome`, `RunEvidence` | The check registry and its types | `compile.checks` |
| `quote_in_source`, `key_in_registry`, `record_exists`, `unique_by` | The first check templates | `compile.checks` |
| `manifest`, `rule_set_hash`, `code.lock.json`, `RUNTIME_VERSION` | What the rule-set hash covers, the hash, and the versions of the compiler code | `compile.hash` |
| `decode` | The decode gate of a plan. It tests the whole output schema before the judges and the graph. | `compile.scorers` |
| `ledger`, `trial` | The record of what a compile did with each rule, and the compile of one candidate as watch | `compile.ledger` |
| `noop`, `drift`, `weaken`, `hash`, `status`, `admit`, `verify`, `params`, `shape`, `judge` | The hazards of the compiler. Each test name starts with one of them. | `compile.hazards` |
