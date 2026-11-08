# Design index `design`

Status. Design of 2026-10-24. The Mastra scaffold exists (`plan.scaffold`), but no code implements this design yet.

| Doc | Name | What it holds |
|---|---|---|
| [rule-graph.md](rule-graph.md) | `graph` | The problem, the rule graph, the node levels, the stages, and the record system |
| [rule-enforcement.md](rule-enforcement.md) | `enforce` | The rule record, the compiler, the ruleset judge, the bindings, the repair loop, the verdict log, and rule changes |
| [self-improvement.md](self-improvement.md) | `improve` | The self-improvement loop, its boundaries, and its parts |
| [mastra-mapping.md](mastra-mapping.md) | `mastra` | Each part on Mastra 1.79.0, what we do not use, and what we build |
| [graph-store.md](graph-store.md) | `store` | Where the graph store lives, its safety on the live database, its tables, the tree walk, and its tests |
| [formal-checks.md](formal-checks.md) | `formal` | What the formal checks cover, their parts, the models, and their bounds |
| [data-layers.md](data-layers.md) | `data` | What each layer of data holds, where it lives, and how the isolated steps hand off work |
| [compiler.md](compiler.md) | `compile` | The rule compiler of `plan.compiler`. Spec of 2026-11-02, shipped 2026-11-04 in [Ronitron007/product-eval-harness#19](https://github.com/Ronitron007/product-eval-harness/pull/19). |
| [judge-step.md](judge-step.md) | `judge` | The judge step of `plan.judge_step`: the order, the binding table, the outcome, and the quote check. Spec of 2026-11-07, not built. |

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
| `formal` | The formal checks of the code | [formal-checks.md](formal-checks.md) |
| `formal.models`, `formal.sweep`, `formal.oracle`, `formal.replays`, `formal.expectations` | The parts of the formal checks | `formal.parts` |
| `NodeTree`, `VerdictLog`, `RuleVersions`, `MigrationApply` | The TLA+ models in `formal/models/` | `formal.model_list` |
| `formal_check` | The formal check of 2026-11-02 and its findings | [../research/2026-11-02-formal-check.md](../research/2026-11-02-formal-check.md) |
| `nodes.owner_update`, `verdicts.stage_level`, `verdicts.hash_per_version`, `verdicts.accept_without_pass`, `verdicts.no_round`, `verdicts.outputs_per_run`, `rules.watch_first`, `rules.lock_hand_entry`, `derived_rules.skip_version`, `derived_rules.two_owners`, `derived_rules.two_active`, `derived_rules.id_collision`, `migration.guard_gaps`, `migration.per_file_stop` | The findings of 2026-11-02 | `formal_check.findings` |
| `plan.<unit>` | One unit of the plan, such as `plan.scaffold` | [../plans/2026-10-24-harness-plan.md](../plans/2026-10-24-harness-plan.md) |
| `compile` | The rule compiler | [compiler.md](compiler.md) |
| `compile.reconciliation` | Where the code of the compiler differs from its spec | `compile.reconciliation` |
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
| `judge.*` | The sections of the judge step spec. The doc name is the stage part `judge`. | [judge-step.md](judge-step.md) |
| `judgeDraft`, `decideOutcome`, `judgeStep`, `JudgeOutcome`, `RowsIncomplete` | The calls, the outcome type, and the row-total error of the judge step | `judge.types` |
| `accept`, `repair`, `person` | The three kinds of a judge outcome | `judge.bindings` |
| `RepairError`, `Warning` | One error for the next repair round, and one soft verdict that is not pass | `judge.types` |
| `missing_row`, `watch_leak`, `error_pass`, `fake_quote`, `soft_block`, `decode_bypass`, `model_call`, `decider_lost`, `outcome_table` | The hazards of the judge step. Each test name starts with one of them. | `judge.hazards` |
