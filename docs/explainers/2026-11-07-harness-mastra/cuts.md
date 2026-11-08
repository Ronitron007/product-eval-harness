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

## Round 3: whole scenes cut (Rohan's shorter cut, 2026-11-08)

Each scene below left the video whole. Its narration, as it stood at `357f999`, follows. Its sources stay in `sources.md` of that commit.

### `mastra_agent_output`

> Who writes the draft? An agent writes it, with structured output. The design gives the output schema to the agent, and the agent fills only those fields.
>
> What happens when the reply breaks the schema? By default, Mastra throws, and the code loses the draft. A reply costs money, so the design never throws a reply away. It sets a mode that Mastra calls warn. In warn mode, Mastra keeps the raw reply and gives no error. The harness then checks the reply itself.
>
> The agents run on the Claude command line tool, through Mastra. The harness tools reach them through one MCP server.
>
> A design spec of this repo records a test of warn mode with a mock model. The agents and the tool server are a design.

### `mastra_storage`

> Where does the state live? In this repo, Mastra storage runs on Postgres, in its own part of the database, named mastra. The harness stops Mastra from making tables at run time. The Mastra tables come from a migration that a person reviews.
>
> The tables of the harness sit beside them, in a part named harness, on the same connection pool. Each write to these tables adds a row. The harness role cannot update or delete a row. For five of the six tables, a trigger also refuses each update and each delete, for every role.
>
> Mastra can also keep a golden set and run each scorer over it, with a gate that must pass. The design uses this in CI, for the golden examples of each rule. That part is a design. Today, a repo command runs the golden examples of each rule that code can decide. It uses the real scorers, and no model.

### `tree_nodes`

> Back to the outline. This part covers the tree that the rules live in. The harness keeps one node for each node of the category tree. Each level of the tree makes its own things.
>
> Two words first. A criterion is one aspect of a product that a grade looks at, such as ingredient safety. An attribute is one measurable property of a product, such as the amount of zinc oxide on the label. Its value is a number with a unit, a word, a list of words, or a flag.
>
> A domain node, such as skincare, makes the criteria. Only a domain node makes criteria. So each product of one domain gets the same criteria, and two products stay comparable.
>
> An inner node, such as sunscreen, receives the criteria of its parent. It says how relevant each criterion is at this node, and what it means here. It also makes the attributes that measure each criterion.
>
> A leaf node gets the grading rules and the display rules, because only a leaf has products to grade.

### `rules_lock_file`

> How does one version number always mean the same words? A lock file holds the answer. The rules lock file maps each rule id and version to its hash.
>
> Think of a ledger signed in ink. You can add lines. You cannot change the words of an old line.
>
> Here is a real result. Change the words of units label unit, and keep version one. The loader refuses it with the message, the words changed under version one. The message tells you to raise the version and lock again.
>
> This lock file is not like a package lock file, which a tool can write again. It only grows. CI compares it with the lock file of the base branch. CI refuses a lost line or a changed line.
>
> The lock file, the loader check, and the CI check exist in code.

### `run_zoom`

> Back to the outline. This part zooms into one stage run. It goes from the draft to the judge, then to a repair or a person.
>
> The draft goes through a gate first. Then the code scorers run. Then the judges run, but only on a clean draft. Each scorer writes rows. Then the bindings decide where the draft goes.
>
> The worked example has three drafts at sunscreen. The label text says, zinc oxide two hundred milligrams in each gram. Free gift sachet five hundred milligrams with each order.
>
> The scorer rows on the screen are real. The judge answers come from a mock model, so they are illustrative. The loop itself is a design.

### `change_new_version`

> Back to the outline. This part covers how a rule changes. A rule never changes in place. It gets a new version.
>
> Here is the real run. Units label unit gets new words and version two, which replaces version one. The lock file gains a line, and the line for version one stays. The loader reports no problem. The rule-set hash at sunscreen changes.
>
> New outputs use the new version. Old outputs keep the versions that they passed. A reader of an old output applies those versions.
>
> A rule file never leaves the repo. To stop a rule, set its status to retired.

### `change_trial`

> How do you test a new version before it binds? You run a trial. A trial compiles one candidate version as watch, next to the live rules.
>
> The candidate gets a scorer only. It gets no part of the schema and no line in the prompt. So it does not change the drafts that it measures. Its hash differs from the live hash, so nobody can mix the two.
>
> The trial runs on the golden examples and on recent outputs. Its report shows where the verdicts change. A trial calls models, so it is a paid run, and it needs a yes.
>
> A shape rule cannot run as a trial, because a shape rule is always strict. The trial input of the compiler exists in code. The trial run and its report are a design.

### `change_promotion`

> Who makes the new version live after a good trial? Rohan does. He promotes it to its real binding through a PR that changes the rule file. The version becomes active when the PR merges.
>
> The improvement loop of the design can draft rule changes by itself. Its editors may add a watch rule, or change a statement, a reason, or the examples. Only Rohan deletes a rule, or changes its binding, its scope, its judge question, its check, or an output shape.
>
> So the loop cannot make its outputs pass through a weaker rule. That loop is a design, and no code exists for it.

### `limits_compiler`

> What are the known limits of the compiler? The CI check runs with no tree, so it cannot test a child rule that widens its parent. Only a compile at run time refuses it.
>
> A child judgement rule has no parameters, so the compiler cannot compare it with its parent. Rohan's review of the PR is the guard.
>
> A text shape with a list of values cannot also limit the length. A list shape cannot require unique items, so the unique by check does that. The shape language has no optional field yet.
>
> A spelled-out number, such as five hundred, passes the number check of the loader. Each upgrade of Zod or Mastra changes each rule-set hash. Types limit what a check returns, not what it does inside.

### `limits_open`

> What is still open in the design? Most of it waits for the judge step and the stage workflow.
>
> The design does not say yet how a stage proposes a new node. For now, an operator names each node. The object storage for large research files is open. It is also open whether Mastra writes can join a harness database transaction.
>
> Claude made each compiler decision for Rohan. Rohan reviews them in the decisions trail. That trail outranks the specs.

## Round 3: text removed from shortened scenes

These scenes kept one idea at about half their words. The full text before the cut follows.

### `rules_hash`

> How does the harness know that a rule changed? It computes a hash of the rule. A hash is a fingerprint of some content. The same content always gives the same hash. One changed word gives a different hash.
>
> Git names each version of a file in the same way. The name comes from the content.
>
> The harness first writes the rule as JSON with sorted keys. So the order of keys and the spacing do not matter. Then it takes the hash.
>
> The hash covers the statement, the reason, the kind, the scope, the binding, and the owner. It also covers the shape, the check, the judge question, and the golden examples. It leaves out the id, the version, the status, the provenance, and the version that the rule replaces.
>
> In the worked example, each rule shows its own hash on the screen. Two people can write the same rule with keys in another order, and they get the same hash. The rule hash exists in code.

### `verdict_policy`

> Who decides each verdict? One policy in code decides, and no check can go around it.
>
> An absent field gives fail for its shape rule, and cannot verify for its other rules. An empty list gives pass, with the empty list as the evidence. Missing evidence gives cannot verify. A check that throws gives cannot verify.
>
> For a judge, yes gives pass, no gives fail, and unknown gives cannot verify. A judge error, or no answer for an item, also gives cannot verify.
>
> Why not use the Mastra skip result? It means that the rule does not apply, and Mastra gates drop it. So the harness keeps its own rows. This policy exists in code.

### `verdict_rows`

> What does one row hold? It holds the rule id, the version, the hash, and the binding. It holds the item, the verdict, and the decider, which is code or a judge model. It also holds a reason and the evidence.
>
> The rows answer two questions. Why did the graph store accept this output? Which outputs passed an old version of a rule?
>
> The table for these rows exists in code, and it only grows.
