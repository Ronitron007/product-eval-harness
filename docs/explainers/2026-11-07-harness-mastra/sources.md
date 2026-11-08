# Sources of the narration

Each claim of `narration.md`, by scene, with its source at `main` `cacc262` of this repo. `WE` is `worked-example/output-2026-11-07.txt`, the captured output of `worked-example/run.ts`.

Labels:

- **verified (read)**: the cited line says it.
- **verified (ran)**: `run.ts` printed it, at the cited line of `WE`.
- **inferred**: it follows from the cited lines, but no line says it in these words.

The fact-check of `stage.factcheck` ran on 2026-11-07 (288 claims, 1 wrong, 8 partly wrong). Its corrections are in, each checked against the code cited below. On 2026-11-08 Rohan chose a shorter cut. The sections of the cut scenes left this file, and `cuts.md` holds their narration.

## `goal_problem`

| Claim | Source | Label |
|---|---|---|
| Today a model decides the rules of an evaluation from general instructions that no code or judge can check | `docs/decisions.tsv:7`, `docs/design/rule-graph.md:9-11` | verified (read) |
| Rohan stated it on 2026-10-24 | `docs/decisions.tsv:7` | verified (read) |
| Goal: each rule an object with a check, scoped to the category tree, with a known enforcement | `docs/design/rule-graph.md:15-19` | verified (read) |

## `goal_eval_words`

| Claim | Source | Label |
|---|---|---|
| An eval measures model output over many inputs, like a test for nondeterministic output | teaching ladder `ladder-evals-judges.md` (Anthropic, Hamel Husain, Mastra docs), outside this repo | inferred (sources read through a small model) |
| A golden example is an input with the verdict that a person expects | `docs/glossary.md:32` | verified (read) |
| Each rule carries its own golden examples | `src/rules/schema.ts:147` (`examples` min 1) | verified (read) |

## `goal_outline`

| Claim | Source | Label |
|---|---|---|
| Rules as files in git | `docs/decisions.tsv:33`, `rules/README.md:3` | verified (read) |
| A program turns rules into prompt, schema, one checker per rule | `src/compiler/index.ts:274-298` | verified (read) |
| Plain-code checks first, judges only on a clean draft | `docs/design/rule-enforcement.md:130`, `docs/design/compiler.md:153-161` | verified (read) |
| Three exits: back to the model, a person, accept | `docs/design/rule-graph.md:117-127` | verified (read) |
| A rule changes through a new version and Rohan's yes | `docs/design/rule-enforcement.md:172-182` | verified (read) |

## `mastra_step_workflow`

| Claim | Source | Label |
|---|---|---|
| A step has a name, an input schema, an output schema | `docs/research/2026-10-24-mastra-primitives.md:51` | verified (read) |
| A workflow chains steps in a code-fixed order | `docs/research/2026-10-24-mastra-primitives.md:77`, `tests/harness.test.ts:16` | verified (read) |
| One repo test runs a one-step workflow that doubles 21 to 42 on Postgres | `tests/harness.test.ts:9-34` | verified (read) |
| The harness workflows are a design | `src/mastra/index.ts:7-9` (no workflow registered), `docs/plans/2026-10-24-harness-plan.md:40` | verified (read) |

## `mastra_suspend_resume`

| Claim | Source | Label |
|---|---|---|
| Mastra writes run state to storage when a step suspends | `docs/research/2026-10-24-mastra-primitives.md:177` | verified (read) |
| Any process can resume the run with resume data | `docs/research/2026-10-24-mastra-primitives.md:198` | verified (read) |
| A reject ends cleanly through `bail()` | `docs/research/2026-10-24-mastra-primitives.md:198` | verified (read) |
| The person step suspends with open verdicts, a reviewer resumes | `docs/design/mastra-mapping.md:53` | verified (read) |
| On resume the step body runs again from its top | teaching ladder `ladder-workflows-repair.md` (Mastra HITL example, LangGraph) | inferred |
| Mastra storage on Postgres exists in code | `src/mastra/harness.ts:19-21` | verified (read) |

## `mastra_scorer`

| Claim | Source | Label |
|---|---|---|
| Scorers live in `@mastra/core/evals` | `src/compiler/scorers.ts:2` | verified (read) |
| Four boxes; only `generateScore` is required; prompt boxes call the judge | `docs/research/2026-10-24-mastra-primitives.md:390` | verified (read) |
| The score is usually 0 to 1 | teaching ladder `ladder-evals-judges.md` (Mastra overview) | inferred |
| One scorer per rule, id `rule@version` | `src/compiler/scorers.ts:52`, `src/compiler/scorers.ts:117` | verified (read) |
| A code scorer has function steps only | `src/compiler/scorers.ts:117-120` | verified (read) |

## `mastra_gaps`

| Claim | Source | Label |
|---|---|---|
| The Mastra editor versions prompt text only | `docs/design/mastra-mapping.md:71` | verified (read) |
| `notScorable` means "does not apply", gates drop it | `docs/research/2026-10-24-mastra-primitives.md:418-432` | verified (read) |
| The three-way verdict lives in our own rows | `docs/decisions.tsv:31` | verified (read) |
| No graph store, no compiler in Mastra | `docs/design/mastra-mapping.md:70-71`, `docs/design/mastra-mapping.md:219-231` | verified (read) |

## `tree_stages`

| Claim | Source | Label |
|---|---|---|
| One node for each category node | `docs/design/rule-graph.md:37-67` | verified (read) |
| Criterion definition | `docs/glossary.md:22` | verified (read) |
| Only a domain node makes criteria, so products stay comparable | `docs/design/rule-graph.md:71`, `docs/decisions.tsv:16` | verified (read) |
| Create node says what each criterion means at its node | `docs/design/rule-graph.md:65` | verified (read) |
| Only a leaf gets the pack and the layout | `docs/design/rule-graph.md:66-69` | verified (read) |
| Four stages and their levels | `docs/design/rule-graph.md:147-152`, `src/rules/schema.ts:34-40` | verified (read) |
| The code also lists `evaluate_product` at a leaf; the design keeps the product evaluation outside the stages | `src/rules/schema.ts:39`, `docs/design/rule-graph.md:154` | verified (read) |
| The code refuses a stage at a level where it never runs | `src/rules/schema.ts:211-216`, `src/compiler/scope.ts:201-203` | verified (read) |

## `tree_stage_cycle`

| Claim | Source | Label |
|---|---|---|
| Context reads the path with the criteria of each node, the rules, records, siblings | `docs/design/rule-graph.md:182-190` | verified (read) |
| Attribute definition | `docs/glossary.md:12` | verified (read) |
| The worked-example output is a list of attributes | `worked-example/rules/skincare/attributes.list.yaml` | verified (read) |
| The cycle: context, research, draft, judge, repair, person, assimilate | `docs/design/rule-graph.md:115-141` | verified (read) |
| The graph store tables | `src/store/schema.ts:15-107` | verified (read) |
| Append-only | `db/migrations/0001_harness_tables.sql:166-175` | verified (read) |

## `tree_on_mastra`

| Claim | Source | Label |
|---|---|---|
| Stage = workflow; parts = steps; nested draft-and-judge; `.dountil`; person = suspend/resume; drafter = agent; checks = scorers | `docs/design/mastra-mapping.md:51-60`, `docs/design/mastra-mapping.md:88-102` | verified (read) |
| A ruleset changes data, not the workflow shape | `docs/decisions.tsv:29` | verified (read) |
| The sketch type-checks against the pinned Mastra | `docs/design/mastra-mapping.md:76` | verified (read) |

## `rules_record`

| Claim | Source | Label |
|---|---|---|
| Rule = instruction | `docs/decisions.tsv:9` | verified (read) |
| One YAML file per rule in `rules/<owner>/` | `rules/README.md:3`, `src/rules/load.ts:96-101` | verified (read) |
| Fixture `units.label_unit` fields and examples | `worked-example/rules/skincare/units.label_unit.yaml` | verified (read) |
| One owner per rule | `docs/design/rule-enforcement.md:46` | verified (read) |
| The owner is where the scope starts | `src/rules/schema.ts:57-58`, `src/compiler/scope.ts:168-174` | verified (read) |
| `rules/` holds no rule yet | `rules/rules.lock.json` (empty), `ls rules` gives `README.md` and the lock only | verified (ran `ls`) |

## `rules_kinds`

| Claim | Source | Label |
|---|---|---|
| Three kinds | `src/rules/schema.ts:10` | verified (read) |
| Shape types text, number, flag, list | `src/rules/schema.ts:72-95` | verified (read) |
| Four check templates | `src/rules/checks/index.ts:9` | verified (read) |
| `unique_by` takes any key of the list items | `src/rules/checks/unique_by.ts:14-24` | verified (read) |
| Facts only; outcome has no score field | `src/rules/checks/define.ts:20-30`, `docs/design/rule-enforcement.md:138` | verified (read) |

## `rules_scope`

| Claim | Source | Label |
|---|---|---|
| Scope = nodes, stages, fields; selectors owner, subtree, level | `src/rules/schema.ts:57-69` | verified (read) |
| A level selector selects each node of that level at or below the owner | `src/compiler/scope.ts:169-173` | verified (read) |
| A scope names no node, so it cannot reach a parent or sibling | `docs/design/compiler.md:448`, `docs/decisions.tsv:73` | verified (read) |

## `rules_inheritance`

| Claim | Source | Label |
|---|---|---|
| Each inherited rule always applies; a child only adds or tightens | `docs/decisions.tsv:76`, `docs/design/rule-graph.md:111` | verified (read) |
| CSS and ESLint override cascades rejected | `docs/design/compiler.md:1018` | verified (read) |
| Loosen = new version at the owner | `docs/design/rule-graph.md:111` | verified (read) |
| The narrowing child compiles | `WE:85`, `WE:139-147` | verified (ran) |

## `rules_binding`

| Claim | Source | Label |
|---|---|---|
| strict, soft, watch and what a fail does | `docs/design/rule-enforcement.md:140-150` | verified (read) |
| A shape rule is always strict | `src/rules/schema.ts:159-161`, `docs/decisions.tsv:90` | verified (read) |
| Watch never prints | `src/compiler/index.ts:181`, `docs/decisions.tsv:87` | verified (read) |
| Run-time effect is the judge step, not built | `docs/plans/2026-10-24-harness-plan.md:39`, `docs/canvas/judge.canvas` (note node) | verified (read) |

## `rules_hash`

| Claim | Source | Label |
|---|---|---|
| sha256 of canonical JSON (RFC 8785) | `src/rules/hash.ts:21-23` | verified (read) |
| Covered and left-out fields (id, version, status, provenance, supersedes) | `src/rules/hash.ts:5-20` | verified (read) |
| Key order does not change the hash | `canonicalize` sorts keys (RFC 8785) | inferred |
| Git names objects by content | teaching ladder `ladder-rules-as-data.md` (git book) | inferred |

## `compiler_what`

| Claim | Source | Label |
|---|---|---|
| Inputs and four outputs | `src/compiler/index.ts:28-55` | verified (read) |
| Pure, no model, never throws on rule data; admission problems come back alone, then scope, weaken and shape problems in one list | `src/compiler/index.ts:256-272`, `docs/design/compiler.md:1036`, `recheck.md` probe | verified (read) |
| Shipped 2026-11-04 | `docs/design/compiler.md:3` | verified (read) |

## `compiler_one_source`

| Claim | Source | Label |
|---|---|---|
| One copy of each parameter; the drift test | `docs/design/compiler.md:761`, `docs/design/compiler.md:795` | verified (read) |
| Literal lint and numeral lint: whole-word allowed values (such as `mg`) and number tokens; the word milligrams passes | `src/rules/schema.ts:169-189`, `src/rules/schema.ts:236-255` | verified (read) |

## `compiler_admit_scope`

| Claim | Source | Label |
|---|---|---|
| Admission refuses a library with a problem, such as new words under a locked version | `src/compiler/scope.ts:47-51`, `src/rules/load.ts:117` | verified (read) |
| One ledger line per rule version | `src/compiler/scope.ts:194-229` | verified (read) |
| At moisturizer, `units.mass_only` is `owner_not_on_path`, units stay g, mcg, mg | `WE:217-220` | verified (ran) |
| Different hash at moisturizer | `WE:218` | verified (ran) |

## `compiler_narrow`

| Claim | Source | Label |
|---|---|---|
| Meet = strictest values that satisfy both | `src/rules/strictness.ts:73-119`, `src/compiler/shape.ts:75-88` | verified (read) |
| Two rules of one owner with other values on one slot give `slot_conflict` | `src/compiler/scope.ts:299-327`, `docs/decisions.tsv:119` | verified (read) |
| Schema enum `mg` only; instruction line `text, one of: mg`; both rules print | `WE:85-91`, `WE:112-121` | verified (ran) |
| No shared value gives `shape_conflict` naming both rules | `src/compiler/shape.ts:79-82` | verified (read) |

## `compiler_weaken`

| Claim | Source | Label |
|---|---|---|
| The `weakens` message | `WE:531-545` | verified (ran) |
| A looser child would contradict the parent in the instruction | `docs/design/compiler.md:462` | verified (read) |
| The CI audit with no tree has no weaken test; it returns no problem here | `docs/design/compiler.md:1064`, `WE:547-549` | verified (ran) |

## `compiler_instructions`

| Claim | Source | Label |
|---|---|---|
| Field order, shape line, strict then soft, statement, reason, check line, examples | `src/compiler/index.ts:180-201`, `WE:47-91` | verified (ran) |
| Judge question never prints; it sits in the judge prompt | `src/compiler/scorers.ts:147-165`, `tests/compiler/judge.test.ts:61-72` | verified (read) |

## `compiler_schema_scorers`

| Claim | Source | Label |
|---|---|---|
| Strict objects requiring each key | `src/compiler/shape.ts:224-239`, `WE:93-137` | verified (ran) |
| Seven code scorers and one judge rule at sunscreen | `WE:149-151` | verified (ran) |
| Judge scorers only through `judges(model)` | `src/compiler/index.ts:291`, `docs/decisions.tsv:83` | verified (read) |
| Tests stub fetch to throw | `tests/setup/no-network.ts:2-4` | verified (read) |

## `compiler_rule_set_hash`

| Claim | Source | Label |
|---|---|---|
| Hash of the manifest of artifacts | `src/compiler/index.ts:228-252`, `docs/design/compiler.md:692-717` | verified (read) |
| Same hash with the tree reversed; another hash at moisturizer | `WE:214-218` | verified (ran) |
| Stored on stage runs and outputs | `src/store/schema.ts:30`, `src/store/schema.ts:42`, `src/store/store.ts:120-122` | verified (read) |
| Re-compile each step, stop on mismatch: design | `docs/decisions.tsv:89` | verified (read) |

## `run_decode_gate`

| Claim | Source | Label |
|---|---|---|
| Label text and three drafts at sunscreen | `worked-example/run.ts` (`LABEL`, `DRAFT_A`, `DRAFT_B`, `DRAFT_C`) | verified (read) |
| The design keeps a raw reply that breaks the schema, with no error (`errorStrategy: 'warn'`) | `docs/design/compiler.md:143-146` | verified (read) |
| Parse JSON, then the whole schema | `src/compiler/index.ts:206-226` | verified (read) |
| Shape scorers miss an extra key; warn gives no error | `docs/design/compiler.md:654` | verified (read) |
| Draft A gate issues | `WE:225-237` | verified (ran) |
| A failed decode never reaches judges or the graph; strict failure | `docs/decisions.tsv:110` | verified (read) |

## `run_code_rows`

| Claim | Source | Label |
|---|---|---|
| Draft A rows: label_unit pass, mass_only fail, quote fail with fix | `WE:240-333` | verified (ran) |
| Rows keep the observed value | `src/compiler/scorers.ts:54-57`, `WE:302-305` | verified (ran) |
| Shape scorers run on the raw value after a failed decode | `docs/design/compiler.md:662` | verified (read) |

## `run_judge_step`

| Claim | Source | Label |
|---|---|---|
| Judges only after decode ok and strict code pass | `docs/design/compiler.md:157-161`, `docs/design/rule-enforcement.md:130` | verified (read) |
| Skipped judgement rules get rows with no model | `src/compiler/scorers.ts:246-252`, `WE:335-347` | verified (ran) |
| One call per rule, many items | `docs/decisions.tsv:21`, `tests/compiler/judge.test.ts:38` | verified (read) |
| Full source text | `src/compiler/scorers.ts:173-183`, `docs/design/rule-enforcement.md:134` | verified (read) |
| Judge provider differs from drafter | `docs/design/mastra-mapping.md:147` | verified (read) |
| The judge step is not built | `docs/plans/2026-10-24-harness-plan.md:3`, `docs/canvas/judge.canvas` (note node) | verified (read) |

## `run_judge_mock`

| Claim | Source | Label |
|---|---|---|
| Draft C passes each code scorer | `WE:349-363` | verified (ran) |
| Judge rows yes/pass, no/fail | `WE:365-397` | verified (ran with a mock model; the answers are illustrative) |
| yes, no, unknown mapping | `src/compiler/scorers.ts:171` | verified (read) |
| Row keeps model id and prompt hash | `src/compiler/scorers.ts:191`, `WE:372-376` | verified (ran) |

## `run_repair_loop`

| Claim | Source | Label |
|---|---|---|
| Repair rules: all problems in one round, name the fix, keep replies | `docs/design/rule-enforcement.md:154-160` | verified (read) |
| Budget three rounds, one draft and two repairs | `docs/design/mastra-mapping.md:119`, `docs/decisions.tsv:30` | verified (read) |
| `.dountil` over the nested workflow | `docs/design/mastra-mapping.md:98-99` | verified (read) |
| The three-round story A, C, B | `worked-example/run.ts` | illustrative (no loop exists) |

## `run_person_accept`

| Claim | Source | Label |
|---|---|---|
| Person step suspends; reviewer resumes | `docs/design/mastra-mapping.md:53` | verified (read) |
| Accept writes output, records, verdicts | `docs/design/rule-graph.md:139` | verified (read) |
| Accepted outputs refuse updates | `db/migrations/0001_harness_tables.sql:175` | verified (read) |

## `run_states`

| Claim | Source | Label |
|---|---|---|
| Stage run states | `docs/design/rule-graph.md:117-127`, `docs/canvas/judge.canvas` | inferred (the docs draw the flow; no state list exists) |
| Mastra run statuses include success, failed, suspended, canceled, paused, and more | `docs/research/2026-10-24-mastra-primitives.md:158`; `@mastra/core` 1.79.0 `dist/workflows/types.d.ts` (status literals) | verified (read) |
| Rule statuses draft, active, retired | `src/rules/schema.ts:12` | verified (read) |
| A new version starts as a draft; Rohan makes it active through a PR | `docs/design/rule-enforcement.md:174`, `docs/design/rule-enforcement.md:180` | verified (read) |

## `verdict_three_way`

| Claim | Source | Label |
|---|---|---|
| pass, fail, cannot verify meanings | `docs/design/rule-enforcement.md:111-121` | verified (read) |
| Real cannot verify row | `WE:514-528` | verified (ran) |
| Never counted as pass or fail; empty research = cannot verify | `docs/design/rule-enforcement.md:121` | verified (read) |

## `verdict_policy`

| Claim | Source | Label |
|---|---|---|
| Outcome policy table | `src/compiler/scorers.ts:59-97`, `src/compiler/scorers.ts:208-241`, `docs/design/compiler.md:666-676` | verified (read) |
| `notScorable` not used for cannot verify | `docs/decisions.tsv:31`, `docs/design/mastra-mapping.md:61` | verified (read) |

## `verdict_bindings_table`

| Claim | Source | Label |
|---|---|---|
| Binding table, accept only on all strict pass | `docs/design/rule-enforcement.md:144-150` | verified (read) |
| Never a silent accept or reject | `docs/design/rule-graph.md:141` | verified (read) |

## `verdict_rows`

| Claim | Source | Label |
|---|---|---|
| Row columns | `src/store/schema.ts:56-71` | verified (read) |
| Two questions | `docs/design/rule-enforcement.md:170` | verified (read) |

## `design_rules_table`

| Claim | Source | Label |
|---|---|---|
| Code never grades or matches | `docs/design/rule-enforcement.md:138` | verified (read) |
| Cannot verify never pass or fail | `docs/design/rule-enforcement.md:121` | verified (read) |
| A child never loosens | `docs/decisions.tsv:76` | verified (read) |
| One version, one set of words | `rules/README.md:67` | verified (read) |
| Rows only grow | `docs/design/graph-store.md:47` | verified (read) |
| Judges after code | `docs/design/rule-enforcement.md:130` | verified (read) |
| Watch never steers | `docs/decisions.tsv:87` | verified (read) |
| Paid-run yes | `docs/plans/2026-10-24-harness-plan.md:61` | verified (read) |
| Rohan approves rule changes | `docs/design/rule-enforcement.md:109`, `rules/README.md:65` | verified (read) |

## `built_status`

| Claim | Source | Label |
|---|---|---|
| Four units shipped | `docs/plans/2026-10-24-harness-plan.md:3` | verified (read) |
| The rest is design | `docs/plans/2026-10-24-harness-plan.md:39-55`, `src/mastra/index.ts:7-9` | verified (read) |
| Harness docs: migration not applied to the Kyaloon database | `docs/design/graph-store.md:5` | verified (read) |
| The Kyaloon PR of the migration merged | RealDose `git log`: merge commit `4e866d6d`, "Merge pull request #470" | verified (ran `git log` in the RealDose clone) |
| Migration applied live: 45 tables in `harness` and `mastra`, row level security on each, `harness_app` logs in | fact-check `factcheck.md` (orchestrator, read-only SQL, 2026-11-02); 45 = 6 tables in `db/migrations/0001` + 39 in `0002`; `docs/decisions.tsv:69` (Rohan's yes) | verified by the orchestrator, not re-run here |

