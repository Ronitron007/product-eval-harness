# Cuts

Facts that the voice leaves out, by scene (`rules.keep_test`). Skim this before any recording. Each line names its source.

## `goal_eval_words`

- The size hints for a golden set: about 10 to 50 items to start, 100 or more for a full regression set (teaching ladder, Langfuse and Hamel Husain).
- The same golden set can test the product or test the judge (teaching ladder).

## `mastra_step_workflow`

- `createStep` also takes `stateSchema`, `suspendSchema`, `resumeSchema`, `requestContextSchema`, `retries`, `metadata`, and `scorers` (`docs/research/2026-10-24-mastra-primitives.md:51`).
- Mastra dynamic workflows from JSON exist, but they are beta. The design does not use them (`docs/design/mastra-mapping.md:115`).

## `mastra_suspend_resume`

- What a Mastra snapshot holds, the table `workflow_snapshots`, and time travel (`docs/research/2026-10-24-mastra-primitives.md:175-190`).
- `RequestContext` carries the node id, the stage, and the rule-set hash (`docs/design/mastra-mapping.md:57`).

## `mastra_agent_output`

- `errorStrategy: 'fallback'` hides a failure behind a stored value, so the design never uses it (`docs/design/mastra-mapping.md:212`).
- The MCP tool server pins `@mastra/mcp` 1.18.0, because the Cursor CLI cannot read the 2.x protocol (`docs/design/mastra-mapping.md:141`).
- Each CLI run isolates its settings with `settingSources: []` (`docs/design/mastra-mapping.md:143`).
- Agent output processors keep only cheap guards, with `maxProcessorRetries: 1` (`docs/design/mastra-mapping.md:65`).

## `mastra_scorer`

- The Mastra classifier needs a decision model and gives no reason, so judges are scorers (`docs/design/mastra-mapping.md:149`).
- Built-in "quick check" scorers of Mastra (teaching ladder).

## `mastra_storage`

- Row level security, the role `harness_app`, the revokes from `PUBLIC`, and the migration guard (`docs/design/graph-store.md:19-49`).
- `ltree` in schema `extensions` and the tree walk queries (`docs/design/graph-store.md:64-72`).
- `@mastra/pg` 1.33.0 needs core 1.80, so the repo pins core 1.79.0 and pg 1.32.0 (`docs/design/graph-store.md:88`).
- Experiments, `compareExperiments`, and schedules for rule trials (`docs/design/mastra-mapping.md:184-186`).

## `mastra_gaps`

- Mastra storage has 24 fixed domains and refuses a custom one (`docs/design/mastra-mapping.md:70`).
- GraphRAG edges come from embedding similarity, not from the tree (`docs/design/mastra-mapping.md:215`).
- `webSearchTool` changes with the model provider, so the design builds its own `web_search` (`docs/design/mastra-mapping.md:55`).

## `tree_nodes`

- Additions: items that earn or lose points at a node and that no inherited criterion prices (`docs/design/rule-graph.md:65`).
- The pack and the layout by name, and the Kyaloon v3 pack patterns (`docs/design/rule-graph.md:66`).
- Social signals never become attributes that a grade uses (`docs/design/rule-graph.md:86`).

## `tree_stages`

- `evaluate_product` is not a stage of the graph. It reads the pack of a leaf (`docs/design/rule-graph.md:154`).
- The skincare-from-zero walkthrough (`docs/design/rule-graph.md:156-178`).

## `tree_stage_cycle`

- The four research tools: `web_search`, `web_fetch`, `get_node_context`, `search_records` (`docs/design/mastra-mapping.md:165-174`).
- Research records hold the question, the sources with quotes, the findings, the model, and the run (`docs/design/rule-graph.md:194-204`).
- The data layers: object storage for artifacts and bundles, and the eval author in its own environment (`docs/design/data-layers.md:25-67`).

## `rules_record`

- Derived rules: rules that a stage writes into the graph store. Admission parses them again, checks their hash, and refuses a derived shape rule (`docs/design/compiler.md:414-432`).
- Fields `provenance`, `status`, `supersedes` in detail (`docs/design/rule-enforcement.md:45-48`).
- The virtual owner `all` and the folder `rules/all/` (`rules/README.md:5`).
- Reserved path segments such as `__proto__` (`docs/design/compiler.md:412`).

## `rules_kinds`

- `RunEvidence`: sources, attribute keys, record ids (`src/rules/checks/define.ts:10-16`).
- Test vectors of each check template, and the conformance test (`docs/design/compiler.md:618`, `docs/design/compiler.md:931`).
- `NoExtraOutcomeField`, the type guard that TypeScript 6.0.3 needed (`docs/design/compiler.md:1034`).

## `rules_scope`

- The problems `rule_inert`, `owner_unknown`, `trial_not_applied`, `node_unknown` (`docs/design/compiler.md:450-458`).

## `rules_inheritance`

- `slot_conflict` between two peers of one owner (`docs/design/compiler.md:486`).
- The order tables of each parameter (`docs/design/compiler.md:488-501`).
- A code check that lowers the binding of an inherited code check also weakens it (`docs/design/compiler.md:482`).

## `rules_hash`

- The rule hash uses sha256, and git uses SHA-1 (teaching ladder, `src/rules/hash.ts:23`).

## `rules_lock_file`

- The code lock `src/compiler/code.lock.json`, `RUNTIME_VERSION`, and the fingerprints of the check templates (`docs/design/compiler.md:721-731`).
- `rules:lock` never rewrites a lock that it cannot read (`src/rules/cli.ts:27`).

## `compiler_admit_scope`

- The full list of problem codes (`src/compiler/index.ts:98-105`).
- `draft_shadows_active` and `id_collision` (`docs/design/compiler.md:426-428`).
- The ledger is a partition, and `fast-check` tests it (`docs/design/compiler.md:737`, `docs/design/compiler.md:1070`).

## `compiler_narrow`

- The joint meet: a text shape with values and a length limit, and an integer range with no integer (`docs/design/compiler.md:516-522`).
- The trie of paths, and `list_without_items` (`docs/design/compiler.md:514`, `docs/design/compiler.md:534`).

## `compiler_weaken`

- The audit with the tree also gives `no_output_fields` for this fixture, because the fixture has no shape rule for `define_criteria` at skincare (`WE:551-552`).

## `compiler_instructions`

- A rule on two fields prints in full under its first field and as a pointer under the other (`docs/design/compiler.md:638`).
- The static and run parts of the judge prompt, and the prompt hash (`docs/design/compiler.md:678-684`).

## `compiler_schema_scorers`

- `hash.schema_round_trip`: `z.toJSONSchema` drops a `.refine()`, so the printer uses none (`docs/design/compiler.md:733`).

## `compiler_rule_set_hash`

- The node id is not in the hash, so two nodes with the same artifacts share a hash (`docs/design/compiler.md:719`).
- The exact pins of zod and `@mastra/core` sit in the manifest (`WE:212`).

## `run_decode_gate`

- A reply that is not JSON reaches the shape scorers as a string, and each shape rule gives fail (`docs/design/compiler.md:652`).

## `run_judge_step`

- A cheap first judge and a careful second judge, as a cost guard (`docs/design/rule-enforcement.md:209`).
- The judge does not get the reasoning of the drafter (`docs/design/rule-enforcement.md:136`).
- Judge drift after a model upgrade (`docs/design/rule-enforcement.md:207`).

## `run_repair_loop`

- After a repair, check that fields outside the errors did not change. No code checks it yet (`docs/design/rule-enforcement.md:162`).
- The Anthropic cookbook loop has no round cap (teaching ladder).

## `run_states`

- Mastra run statuses `paused` and `tripwire` (`docs/research/2026-10-24-mastra-primitives.md:158`).

## `change_trial`

- Two experiments on one pinned dataset version with `comparisonId` and `variantId` (`docs/design/mastra-mapping.md:184`).

## `change_promotion`

- The full improvement loop: reference runs, editors, validator, probes, composers, blind selector, reflector, lessons, held-out suite, promotion gate (`docs/design/self-improvement.md`).
- The held-out suite lives in a private Mastra storage, and its judges use another provider (`docs/design/self-improvement.md:64-74`).

## `built_status`

- The formal checks: TLA+ models and the migration sweep (`docs/design/formal-checks.md`).
- The plan units by name, with their checks (`docs/plans/2026-10-24-harness-plan.md:31-55`).

## `limits_compiler`

- Zod gives "Invalid input" for a bad union member, so the loader writes its own messages (`docs/design/compiler.md:980`).
- An edit to a template file that changes no behavior still needs a version raise (`docs/design/compiler.md:998`).
- A provider can reject some schema limits in structured output; the code scorers check them again (`docs/design/compiler.md:978`).
