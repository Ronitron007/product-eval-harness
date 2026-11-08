# Glossary of the video

Each term that the video teaches, with the scene that teaches it. The repo glossary, [docs/glossary.md](../../glossary.md), holds the project definitions. This file uses the words of the video.

| Term | Definition | Scene |
|---|---|---|
| Eval | A measurement of the output of a model over many inputs. It is a unit test for a program that answers in a new way each time. It is not a product evaluation, which grades a product. | `goal_eval_words` |
| Golden set | The answer key of an eval. A trusted person writes the expected result of each input before the test. One item is a golden example. In this harness, each rule carries its own golden examples. | `goal_eval_words` |
| Step | A Mastra function with a name and a Zod schema for its input and its output. | `mastra_step_workflow` |
| Workflow | A Mastra chain of steps in an order that code fixes. The model never picks the next step. | `mastra_step_workflow` |
| Suspend | A step saves the run to storage, stops, and asks for input. | `mastra_suspend_resume` |
| Resume | Any process continues a suspended run with the answer. The suspended step runs again from its top. | `mastra_suspend_resume` |
| Mastra scorer | A pipeline of up to four boxes (`preprocess`, `analyze`, `generateScore`, `generateReason`) that gives a number for one output. A function box costs nothing. A prompt box calls a judge model. | `mastra_scorer` |
| Criterion | One aspect of a product that a grade looks at, such as ingredient safety. Only a domain node makes criteria. | `tree_stages` |
| Attribute | One measurable property of a product. Its value is a number with a unit, a word, a list of words, or a flag. | `tree_stage_cycle` |
| Stage | One kind of work at one node: `define_criteria`, `create_node`, `create_pack`, or `create_layout`. Each stage runs the same cycle. | `tree_stages` |
| Graph store | The harness tables in the schema `harness` of Postgres. Rows only grow. | `tree_stage_cycle` |
| Drafter | The agent that writes the output of a stage, with structured output. | `tree_on_mastra` |
| Rule record | One rule as a YAML file in git. It has an id, a version, a kind, a statement, a reason, a scope, a binding, golden examples, provenance, an owner, and a status. | `rules_record` |
| Owner | The node where the scope of a rule starts. The rule file sits in the folder of its owner. | `rules_record` |
| Loader | The code that reads and checks each rule file (`loadRuleLibrary`). | `rules_record` |
| Shape rule | A rule that gives the type of one output field: text, number, flag, or list. It is always strict. | `rules_kinds` |
| Code check | A rule that names a check function of the registry and gives its parameters. It decides facts only. | `rules_kinds` |
| Judgement rule | A rule that asks a judge model one question. | `rules_kinds` |
| Scope | Where a rule applies: the nodes (counted from the owner), the stages, and the output fields. | `rules_scope` |
| Inheritance | A rule applies at the nodes below its owner. A child cannot loosen an inherited rule. It can only add or tighten. | `rules_inheritance` |
| Binding | What a failed rule does: `strict` (repair, or a person), `soft` (keep, with a warning), or `watch` (log only). | `rules_binding` |
| Hash | A fingerprint of content. The rule hash is the sha256 of the rule as JSON with sorted keys. | `rules_hash` |
| Compiler | `compileStage`: the code that turns the rules for one stage run into an output schema, an instruction text, one scorer for each rule, and a rule-set hash. | `compiler_what` |
| Rule-set hash | The hash of everything that one compile made. Stage runs and outputs keep it. | `compiler_rule_set_hash` |
| Decode gate | `plan.decode`: it parses the reply as JSON and tests it against the whole output schema. A draft that fails it never reaches the judges or the graph store. | `run_decode_gate` |
| Judge step | The part of a stage that runs each rule check on a draft: code scorers first, judges only on a clean draft. Not built yet. | `run_judge_step` |
| Repair loop | The rounds in which a stage sends the exact errors back to the model. The budget is three rounds. Not built yet. | `run_repair_loop` |
| Three-way verdict | Each check gives pass, fail, or cannot verify. Cannot verify means no evidence either way, and it is never a pass or a fail. | `verdict_three_way` |
