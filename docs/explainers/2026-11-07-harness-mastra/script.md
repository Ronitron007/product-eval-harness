# Script: the product eval harness, Mastra, and the design

Scene list of the video. Each scene has a snake_case name, a target length, the narration, and the visuals. The voice reads `narration.md` only. Target length assumes about 140 spoken words a minute.

Labels in the visuals: BUILT means code on `main` at `cacc262`. DESIGN means a design doc only. ILLUSTRATIVE means output of a mock model. OPEN means not decided or not checked.

Totals: 47 scenes, 6294 words, about 45 minutes.

## Part `part.goal`: the goal and the outline

### `goal_problem`

Target length: about 42 s (98 words).

Narration:

> What problem does this harness solve? Today, a model decides which rules make up a product evaluation. It reads a few general instructions. No code and no judge can check that its output follows them. Rohan stated this problem on the twenty-fourth of October, twenty twenty-six.
>
> The goal of the harness is different. Each rule becomes an object in the system, with a name and a check. Each rule says where it applies in the category tree. For each rule, the design knows what it takes to enforce it. This video walks that design from the top down.

Visuals:

- Title card: "The product eval harness: what Mastra gives us, and how the design uses it".
- Left: a cloud labelled "meta instructions" feeding an LLM box that emits "rules of an evaluation" (grey, dashed, no check mark).
- Right: the same output, but each rule is a card with a name and a check box. Caption: "each rule: an object with a check".
- Footer chip: "graph.problem, Rohan, 2026-10-24".

### `goal_eval_words`

Target length: about 72 s (167 words).

Narration:

> Two words come first, because the rest of the video uses them. A product evaluation grades a product, such as a sunscreen. An eval is a different thing. An eval measures the output of a model again and again, over many inputs.
>
> Think of an eval as a unit test for a program that answers in a new way each time. One run tells you little. So you run it on many inputs, and you count the results.
>
> To count, you need an answer key. A golden set is that answer key. A trusted person wrote the expected result for each input before the test. A saved output of a model is not a golden example until a person checks it.
>
> Here is a tiny example. A label says zinc oxide, two hundred milligrams. The golden example says that the unit is milligrams. The eval asks if the model wrote milligrams.
>
> In this harness, each rule carries its own golden examples. So each rule can test itself.

Visuals:

- Two boxes side by side: "product evaluation: grades a product" vs "eval: measures model output over many inputs".
- A tally strip: 40 runs, 38 ticks (picture only, no real numbers claimed).
- Answer-key table, two columns "input" / "answer a person confirmed": `label: Zinc oxide 200 mg` -> `unit: mg`. A person stamp in the middle.
- Strike-through card: "saved model output" is not golden until a person checks it.
- Last beat: a rule card with a small "examples" drawer.

### `goal_outline`

Target length: about 69 s (162 words).

Narration:

> Here is the whole path on one picture. The video walks it box by box, and it comes back to this picture between parts.
>
> On the left, people write rules as files in git. A program reads the rules for one node of the category tree. It turns them into a prompt, an output schema, and one checker for each rule.
>
> A model writes a draft that fits the schema. Checks in plain code run first, because they are free. Model judges run next, and only on a clean draft. Each check writes a result row.
>
> Then the draft goes one of three ways. It goes back to the model with the errors. Or a person decides. Or the harness accepts it and stores it with its results.
>
> At the bottom, a rule changes only through a new version and Rohan's yes. Most of this path is a design today. The last part of the video shows which boxes exist in code.

Visuals:

- THE OUTLINE (`OutlineDiagram` anchor), left to right:
  `rules/ (YAML in git)` -> `compiler` -> {`instructions`, `schema`, `scorers`, `rule-set hash`} -> `drafter (agent)` -> `decode gate` -> `code scorers` -> `judges` -> `verdict rows` -> `bindings` -> three exits: `repair` (arrow back to drafter), `person`, `accept -> graph store`.
  Bottom lane: `rule change: new version, trial, Rohan's yes` -> back to `rules/`.
- Box names appear on screen only. Voice uses plain words here.
- Colour key in the corner: green = code today, grey = design only. Colours stay hidden until `built_status`.

## Part `part.mastra`: the parts of Mastra

### `mastra_step_workflow`

Target length: about 73 s (171 words).

Narration:

> Back to the outline. This part covers the parts of Mastra that the design uses. Mastra is a TypeScript framework for agents and for the code around them.
>
> The first part is the step. A step is a function with a typed contract, like a tool on an MCP server. It has a name, a Zod schema for its input, and a Zod schema for its output.
>
> The second part is the workflow. A workflow is a chain of steps in an order that code fixes. The model never picks the next step. The output of each step is the input of the next step, so the schemas must agree.
>
> Compare this with an agent. An agent picks its own next move. A workflow is a fixed path, and the model only fills the steps.
>
> In this repo, one test runs a small workflow on Postgres. Its one step doubles a number, from twenty-one to forty-two. That test exists in code today. The real workflows of the harness are a design.

Visuals:

- Outline, the Mastra layer highlighted.
- One box "step": arrow in labelled `inputSchema (Zod)`, arrow out labelled `outputSchema (Zod)`, a name tag.
- Three steps chained with `.then()`: `get context -> draft -> check`.
- Beside it: an agent box with a loop arrow to itself, "model decides". Two pictures, side by side.
- Code card (real, tests/harness.test.ts): `createStep({ id: 'double' ... n * 2 })`, `createWorkflow({ id: 'smoke' }).then(double).commit()`, result `{ n: 42 }`. Chip: BUILT (test). Chip on "stage workflows": DESIGN.

### `mastra_suspend_resume`

Target length: about 73 s (170 words).

Narration:

> How does a workflow wait a day for a person? An await in memory cannot do it. The process can stop or restart, and the await does not survive.
>
> So Mastra writes the state of each run to its database, as JSON. A step can suspend. Suspend means save the run, stop, and ask for input. Later, any process can resume the run with the answer.
>
> Think of a video game. You save at a hard level, and you return tomorrow. The save file holds the run, not the live process.
>
> Here is the example from the design. A person step suspends the run with the open results of a draft. A reviewer reads them, and then resumes the run with accept or reject. A reject ends the run cleanly, not as an error.
>
> One trap exists. On resume, the step runs again from its top. So code before the suspend runs two times.
>
> In this repo, Mastra storage on Postgres exists in code. The person step is a design.

Visuals:

- The three-step chain, a database cylinder under it labelled "Mastra storage on Postgres (schema mastra)".
- Red X on the process; the cylinder still holds `{ runId, step, status, output }`.
- Pause bar on the `person` step. Arrow up to a reviewer card showing open results. Arrow down: `run.resume({ step, resumeData: { approved: true } })`. Reject path: `bail()` ends cleanly.
- Trap beat: the step body highlighted from its first line, "runs again from the top".
- Chips: storage BUILT, person step DESIGN.

### `mastra_agent_output`

Target length: about 55 s (129 words).

Narration:

> Who writes the draft? An agent writes it, with structured output. The design gives the output schema to the agent, and the agent fills only those fields.
>
> What happens when the reply breaks the schema? By default, Mastra throws, and the code loses the draft. A reply costs money, so the design never throws a reply away. It sets a mode that Mastra calls warn. In warn mode, Mastra keeps the raw reply and gives no error. The harness then checks the reply itself.
>
> The agents run on the Claude command line tool, through Mastra. The harness tools reach them through one MCP server.
>
> A design spec of this repo records a test of warn mode with a mock model. The agents and the tool server are a design.

Visuals:

- Agent box `drafter` with `structuredOutput: { schema }`.
- A reply that breaks the schema: default `errorStrategy: 'strict'` -> throw, draft gone (bin icon). `errorStrategy: 'warn'` -> raw reply kept, no error.
- Small row: Claude CLI via `ClaudeSDKAgent`, harness tools via one MCP server (`@mastra/mcp` 1.18.0).
- Chips: warn-mode test recorded in docs/design/compiler.md (verified with createMockModel); agents and tool server DESIGN.

### `mastra_scorer`

Target length: about 68 s (158 words).

Narration:

> What is a Mastra scorer? Mastra keeps its scorers in a module named evals. A scorer takes one output of a run, and it gives a number, usually from zero to one.
>
> A scorer is a pipeline, not one model call. Think of a form with four boxes.
>
> The first box picks the items to check. The second box gives a result for each item. The third box turns the results into a number. The fourth box writes a reason. Only the third box must exist.
>
> Each box is a plain function or a prompt. A plain function costs nothing. A prompt box calls a judge model. So a scorer of plain functions never calls a model.
>
> In this repo, the code makes one Mastra scorer for each rule. Its name is the rule name, an at sign, and the version. A scorer for a rule that code can decide has function boxes only. That code exists today.

Visuals:

- Four boxes left to right: `preprocess` (picks items), `analyze` (one result per item), `generateScore` (number), `generateReason` (optional). Under each a chip "function" or "prompt -> judge model".
- `generateScore` is the only required box.
- Real code card (src/compiler/scorers.ts): `createScorer({ id: 'quotes.from_label@1' }).preprocess(...).analyze(...).generateScore(... every pass ? 1 : 0)`.
- Chip: BUILT (the compiler makes one scorer per rule).

### `mastra_storage`

Target length: about 67 s (156 words).

Narration:

> Where does the state live? In this repo, Mastra storage runs on Postgres, in its own part of the database, named mastra. The harness stops Mastra from making tables at run time. The Mastra tables come from a migration that a person reviews.
>
> The tables of the harness sit beside them, in a part named harness, on the same connection pool. Each write to these tables adds a row. The harness role cannot update or delete a row. For five of the six tables, a trigger also refuses each update and each delete, for every role.
>
> Mastra can also keep a golden set and run each scorer over it, with a gate that must pass. The design uses this in CI, for the golden examples of each rule. That part is a design. Today, a repo command runs the golden examples of each rule that code can decide. It uses the real scorers, and no model.

Visuals:

- One Postgres cylinder split into two parts: `mastra` (workflow runs) and `harness` (our tables), one connection pool feeding both.
- `disableInit: true` stamp on the mastra part; "tables come from a reviewed migration".
- The harness part: an "append-only" padlock; UPDATE and DELETE arrows bounce off.
- Side panel: Mastra datasets + `runEvals` gate (DESIGN, `plan.golden_sync`) vs `npm run rules:check` golden gate today (BUILT).

### `mastra_gaps`

Target length: about 53 s (123 words).

Narration:

> What does Mastra not give? It has no place for a rule with a version and a place in a tree. Its prompt editor keeps versions of text only. So the harness keeps its rules in its own files.
>
> A Mastra score is a number. The harness needs a result that says, no evidence either way. Mastra has a skip result, but it means that the rule does not apply. Mastra gates drop it. So a rule that must pass could pass in silence. The harness keeps its own result rows.
>
> Mastra has no store for the category tree. The harness keeps its own tables. And nothing in Mastra turns rules into prompts and checks. The harness has its own program for that.

Visuals:

- Table, two columns "Mastra gives" / "the harness builds":
  | rules with version + tree place | Mastra editor: text versions only | own YAML files |
  | a three-state result | score is a number; `notScorable` = does not apply, gates drop it | own result rows |
  | the category tree | no store | own tables |
  | rules -> prompts and checks | nothing | own program |
- Fade the right column in row by row.

## Part `part.tree`: the category tree and its stages

### `tree_nodes`

Target length: about 75 s (176 words).

Narration:

> Back to the outline. This part covers the tree that the rules live in. The harness keeps one node for each node of the category tree. Each level of the tree makes its own things.
>
> Two words first. A criterion is one aspect of a product that a grade looks at, such as ingredient safety. An attribute is one measurable property of a product, such as the amount of zinc oxide on the label. Its value is a number with a unit, a word, a list of words, or a flag.
>
> A domain node, such as skincare, makes the criteria. Only a domain node makes criteria. So each product of one domain gets the same criteria, and two products stay comparable.
>
> An inner node, such as sunscreen, receives the criteria of its parent. It says how relevant each criterion is at this node, and what it means here. It also makes the attributes that measure each criterion.
>
> A leaf node gets the grading rules and the display rules, because only a leaf has products to grade.

Visuals:

- Outline, the node and stage area highlighted.
- Category tree: `skincare` (domain) -> `sunscreen`, `moisturizer` (inner) -> `mineral sunscreen` (leaf).
- Beside each level what it makes: domain = criteria; inner = relevance, meaning, attributes; leaf = grading rules and display rules (on screen: pack, layout).
- Definition cards: "criterion: one aspect a grade looks at (ingredient safety)", "attribute: one measurable property (zinc oxide amount on the label)". Attribute value types: number+unit, word, list of words, flag.

### `tree_stages`

Target length: about 52 s (122 words).

Narration:

> Who makes these things? A stage does. A stage is one kind of work at one node.
>
> Think of one station on a production line. Each station runs the same cycle. Only the product changes.
>
> The design has four stages. Define criteria runs at a domain node. Create node runs at an inner node and at a leaf node. At a leaf, two more stages write the grading rules and the display rules.
>
> The code already holds this table of stages and levels. It also lists evaluate product at a leaf. That entry is the product evaluation, which the design keeps outside the stages. It refuses a stage at a level where that stage never runs. The stages themselves are a design.

Visuals:

- A production line with four stations: `define_criteria` (domain), `create_node` (inner, leaf), `create_pack` (leaf), `create_layout` (leaf).
- Real code card (src/rules/schema.ts): `STAGE_LEVELS = { define_criteria: ['domain'], create_node: ['inner','leaf'], create_pack: ['leaf'], create_layout: ['leaf'], evaluate_product: ['leaf'] /* inferred */ }`, with the `evaluate_product` line greyed: "the product evaluation, outside the stages".
- Chips: table BUILT, stages DESIGN.

### `tree_stage_cycle`

Target length: about 63 s (148 words).

Narration:

> What happens inside one stage run? Each stage runs the same cycle at one node.
>
> Context reads the path to the root, the rules for this node, past research, and the sibling nodes. Research searches the web and past work. Draft makes one output in the shape that the rules give. Judge checks each rule.
>
> If a rule fails, the model gets the exact errors and tries again, a fixed number of times. When the rules pass, the harness accepts the output. When the tries run out, a person decides.
>
> To accept means to write into the graph store. The graph store is the set of harness tables in Postgres. It holds the nodes, the runs, the accepted outputs, the result rows, and the rules that stages write. Rows only grow, as in an append-only log.
>
> The graph store exists in code today. The cycle is a design.

Visuals:

- Six boxes: `context` -> `research` -> `draft` -> judge diamond -> `repair` (back arrow to draft, counter 1/3, 2/3, 3/3) / `person` / `assimilate`.
- `assimilate` writes into a cylinder `graph store`: `nodes`, `stage_runs`, `outputs`, `verdicts`, `records`, `derived_rules` (real table names, src/store/schema.ts).
- Chips: graph store BUILT, cycle DESIGN.

### `tree_on_mastra`

Target length: about 52 s (121 words).

Narration:

> How does a stage sit on Mastra? Here is the map, on one table.
>
> Each stage is one workflow in code. Context, research, draft, judge, and accept are its steps. The draft and the judge sit in an inner workflow. A Mastra loop step repeats that inner workflow until the rules pass, or until the tries run out.
>
> The person step suspends the run, and a reviewer resumes it. The drafter is an agent with structured output. Each rule check is a Mastra scorer.
>
> A new rule changes the data that the steps read. It never changes the shape of the workflow. This whole map is a design. A research run type-checked a sketch of it against the pinned Mastra version.

Visuals:

- Mapping table (mastra.table), row by row:
  | stage | `createWorkflow` |
  | context, research, accept | `createStep` |
  | draft + judge | nested workflow |
  | repair | `.dountil(draftAndJudge, errors.length === 0 || iterationCount >= 3)` |
  | person | `suspend` / `resume` / `bail` |
  | drafter | `Agent` + `structuredOutput` |
  | each rule check | `createScorer` |
- Footer: "sketch type-checked: docs/research/2026-10-24-mastra-probes/10-stage-workflow.ts, exit 0". Chip: DESIGN.

## Part `part.rules`: rules written as data

### `rules_record`

Target length: about 84 s (195 words).

Narration:

> Back to the outline. This part covers rules written as data. Here is the main idea. A rule is a form, not a function.
>
> A rule record is one rule, written as a YAML file in git. A person can read it, compare two versions of it, and review it in a PR. The harness reads the form. Rohan ruled that a rule and an instruction are the same thing.
>
> Here is one rule record, units label unit. Its statement says, write the amount in the unit that the label prints. Its reason says, a grade must rest on what the label states. It allows three units, milligrams, micrograms, and grams. It carries two golden examples. Milligrams pass, and international units fail.
>
> Each record also names its owner. The owner is the node where the rule starts to apply. The file sits in the folder of its owner, here skincare. One rule has one owner, so two nodes cannot hold two versions of it.
>
> The loader is the code that reads and checks each rule file. The record schema and the loader exist in code. The rules folder of the repo holds no rule yet.

Visuals:

- Outline, the `rules/` box highlighted.
- The real fixture file `rules/skincare/units.label_unit.yaml` (worked-example), revealed field by field: id, version, kind, shape `{ type: text, values: [mg, mcg, g] }`, statement, reason, scope, binding, examples (mg pass, IU fail), provenance, owner, status.
- Folder tree: `rules/skincare/units.label_unit.yaml`, owner = folder.
- Chip: schema + loader BUILT; "rules/ in the repo: 0 rule files" (verified).

### `rules_kinds`

Target length: about 76 s (178 words).

Narration:

> A rule record has one of three kinds. The kind tells the harness what to make from the rule.
>
> A shape rule gives the type of one output field. Examples are text from a closed list, a number with limits, a flag, or a list. Units label unit is a shape rule.
>
> A code check names a check function from a small registry, and gives its parameters. The registry has four checks today. One check tests that a quote stands word for word in a source text. The other checks test that a key exists, and that a record exists. The last check tests that no two list items share the value of one key, such as a name.
>
> A judgement rule asks a judge model one question. An example is, does this attribute describe the product itself?
>
> A code check decides facts only, never a grade and never a match. That is a project rule. The type of a check result has no field for a score. The three kinds and the four checks exist in code.

Visuals:

- Three cards from one `kind` field: `shape` (Zod type: text / number / flag / list), `code_check` (template + params), `judgement` (question for a judge).
- Registry strip: `quote_in_source`, `key_in_registry`, `record_exists`, `unique_by`.
- `FactKind = substring | membership | reference | uniqueness`. `CheckOutcome` = pass | fail+fix | cannot_verify+why. No score field.
- Chip: BUILT.

### `rules_scope`

Target length: about 62 s (145 words).

Narration:

> Where does a rule apply? Its scope says so. A scope has three parts. They are the nodes, the stages, and the output fields.
>
> The nodes part counts from the owner. It selects the owner only, or the owner and each node below it. It can also select each node of one level, such as each leaf, at or below the owner. A scope never names another node. So a sunscreen rule cannot reach skincare, and it cannot reach the sibling node moisturizer.
>
> For units label unit, the scope is skincare and each node below it, the stage create node, and one field. That field is the unit of each attribute.
>
> Why no node names? A name in a scope could point at a parent or at a sibling. A count from the owner makes that state impossible. This kind of scope exists in code.

Visuals:

- Scope card: `{ nodes: subtree, stages: [create_node], fields: ['attributes[].unit'] }`.
- Selector panel: `owner` (one node lit), `subtree` (owner and below lit), `{ level: leaf }` (one level lit).
- A sunscreen-owned rule: arrows up to skincare and across to moisturizer are crossed out.
- Chip: BUILT.

### `rules_inheritance`

Target length: about 65 s (152 words).

Narration:

> What happens when a parent and a child both have rules? Inheritance answers this. A rule can apply at each node below its owner. Then a child inherits that rule, and each inherited rule always applies.
>
> Think of house rules in a building. The building says, no pets over ten kilograms. One flat may add, no pets at all. That rule is stricter, and it is fine. The flat may not say, pets up to thirty kilograms. That rule is looser, and the building refuses it.
>
> CSS and ESLint do not work like this. There, the nearer rule wins, and it may loosen the parent. Here, a child rule may only add or tighten. To loosen a rule, change it at its owner, as a new version.
>
> In the worked example, sunscreen adds units mass only, which allows milligrams only. That rule is stricter than its parent, so the harness accepts it.

Visuals:

- Building picture: "no pets over 10 kg" on the building; flat A "no pets at all" (green tick), flat B "pets up to 30 kg" (red cross).
- Foil panel: CSS `.sunscreen { unit: IU }` wins in CSS / ESLint (nearer wins). Harness: AND of all rules in scope.
- Tree with unit strips: skincare `[mg, mcg, g]`, sunscreen adds `[mg]`, strip inside the parent strip.

### `rules_binding`

Target length: about 57 s (133 words).

Narration:

> What does a failed rule do? Its binding says so. A binding is strict, soft, or watch.
>
> Think of three road signs. Strict is a barrier, and the draft goes back to the model with the errors. Soft is a warning light, and the harness keeps the output with a warning. Watch is a camera. It records the result and does nothing else.
>
> The rule text stays the same. Only the binding changes what a fail does.
>
> Two details matter. Each shape rule is always strict, because the output schema enforces its shape. And a watch rule never prints in the prompt, so it cannot steer a draft.
>
> The binding field exists in code. The judge part of a stage decides what a fail does at run time. That part is a design.

Visuals:

- One failed check feeds a three-way switch: `strict` (barrier, arrow back to the drafter), `soft` (warning light, output kept + warning), `watch` (camera, log only).
- Notes: "shape rule: always strict (loader refuses another binding)", "watch: never printed, never in the schema".
- Chips: binding field BUILT, run-time effect DESIGN (`plan.judge_step`).

### `rules_hash`

Target length: about 72 s (168 words).

Narration:

> How does the harness know that a rule changed? It computes a hash of the rule. A hash is a fingerprint of some content. The same content always gives the same hash. One changed word gives a different hash.
>
> Git names each version of a file in the same way. The name comes from the content.
>
> The harness first writes the rule as JSON with sorted keys. So the order of keys and the spacing do not matter. Then it takes the hash.
>
> The hash covers the statement, the reason, the kind, the scope, the binding, and the owner. It also covers the shape, the check, the judge question, and the golden examples. It leaves out the id, the version, the status, the provenance, and the version that the rule replaces.
>
> In the worked example, each rule shows its own hash on the screen. Two people can write the same rule with keys in another order, and they get the same hash. The rule hash exists in code.

Visuals:

- Funnel: rule record -> "JSON with sorted keys (RFC 8785)" -> sha256 -> stamp on the card.
- Covered fields lit: statement, reason, kind, scope, binding, owner, shape, check, judge, examples. Dimmed: id, version, status, provenance, supersedes (src/rules/hash.ts).
- Real hash of `units.label_unit@1`: `68be9c64...a2a74cae` (worked-example output).

### `rules_lock_file`

Target length: about 60 s (141 words).

Narration:

> How does one version number always mean the same words? A lock file holds the answer. The rules lock file maps each rule id and version to its hash.
>
> Think of a ledger signed in ink. You can add lines. You cannot change the words of an old line.
>
> Here is a real result. Change the words of units label unit, and keep version one. The loader refuses it with the message, the words changed under version one. The message tells you to raise the version and lock again.
>
> This lock file is not like a package lock file, which a tool can write again. It only grows. CI compares it with the lock file of the base branch. CI refuses a lost line or a changed line.
>
> The lock file, the loader check, and the CI check exist in code.

Visuals:

- Ledger table `rules.lock.json`: rule id | version | hash; rows only added at the bottom.
- Real refusal (worked-example output): `skincare/units.label_unit.yaml version: The words changed under version 1. Raise the version, set supersedes to 1, and run npm run rules:lock.`
- CI strip (.github/workflows/ci.yml): `npm run rules:check -- --base <base lock>`.
- Contrast chip: package-lock.json is regenerated; this lock only grows.

## Part `part.compiler`: the compiler

### `compiler_what`

Target length: about 62 s (145 words).

Narration:

> Back to the outline. This part covers the compiler. The compiler is the program that turns the rules for one stage run into the things that enforce them.
>
> Think of a printed rulebook and an inspection checklist. One office makes both from the same source, at the same moment. So the two cannot disagree.
>
> The compiler takes all the rule files, the rules that stages wrote, the tree, one node, and one stage. It gives four things. They are an output schema, the instruction text, one scorer for each rule, and a rule-set hash.
>
> The compiler is plain code. It calls no model, and it never throws on bad rule data. It returns each problem of one check phase together. Admission problems come first, then the problems of scope, shape, and checks.
>
> The compiler exists in code today. It shipped on the fourth of November.

Visuals:

- Outline, the `compiler` box highlighted.
- Inputs on the left: rule files, derived rules, tree, node, stage. Box `compileStage`. Four outputs fanning right: schema, instructions, scorers, rule-set hash. Bracket: "one source".
- Stamps: "pure, sync, no model", "never throws on rule data", "all problems in one round".
- Chip: BUILT, shipped 2026-11-04 in Ronitron007/product-eval-harness#19.

### `compiler_one_source`

Target length: about 49 s (115 words).

Narration:

> Why make the prompt and the checks from one source? Two copies drift apart. A person edits the prompt and forgets the check.
>
> So each value of a rule lives in one place, its parameters. The prompt line and the check both read that place. A test proves it. Change the allowed units, and the instruction and the result of the check both change.
>
> The loader also refuses a statement that repeats a parameter. Units label unit may not hold the unit code m g in its statement, or any other allowed value. Its statement may not hold a number either. The compiler prints each value once, from the parameters.
>
> These guards exist in code.

Visuals:

- One params object `values: [mg, mcg, g]` with two arrows: to the shape line of the instructions and to the check.
- Test name card: `drift.values_move_both`.
- Loader refusals: a statement that holds `mg` (literal lint) and a statement that holds `12` (numeral lint).

### `compiler_admit_scope`

Target length: about 50 s (116 words).

Narration:

> What does the compiler do first? It admits the rules. It refuses a rule set with any loader problem, or a rule that the lock file does not hold.
>
> Then it applies the scope of each rule at one node and one stage. It writes one line for each rule version. The line says applied, or left out with a reason.
>
> Here is the real result at moisturizer. Units mass only stays out, because its owner, sunscreen, is not on the path to the root. So at moisturizer, the unit can still be milligrams, micrograms, or grams.
>
> The compile at moisturizer also gives a different hash from the compile at sunscreen. This part exists in code.

Visuals:

- Phases in order, each returning its problems together: admit, scope, weaken, shape, fit.
- `admit` gate: library with zero loader problems passes; a lock problem gives `library_invalid`.
- Real ledger at sunscreen: eight lines, each `applied strict`.
- Real ledger line at moisturizer: `units.mass_only@1 {"kind":"excluded","reason":"owner_not_on_path"}` and shape line `text, one of: g, mcg, mg`.
- Two real hashes side by side: sunscreen `f8d76e16...`, moisturizer `ec713b82...`.

### `compiler_narrow`

Target length: about 52 s (121 words).

Narration:

> What happens when a child rule and an inherited rule cover one field? The compiler takes the strictest values that satisfy both rules. Two rules of one owner that give other values for one field are a conflict, and the compiler refuses them.
>
> At sunscreen, units label unit allows milligrams, micrograms, and grams. Units mass only allows milligrams. Both rules apply, so the result is milligrams only.
>
> Here is the real schema. The unit field is an enum with one value, milligrams. The instruction text shows the same shape line. Both rules also print, each with its statement and its examples.
>
> If two rules share no value, the compiler refuses the stage and names both rules. This part exists in code.

Visuals:

- Two strips on the unit field: parent (skincare) `[mg, mcg, g]`, child (sunscreen) `[mg]` -> meet `[mg]`. Side chip: two rules of one owner with other values -> `slot_conflict`.
- Real schema excerpt: `"unit": { "type": "string", "enum": ["mg"] }`.
- Real instruction excerpt: `attributes[].unit / Shape: text, one of: mg`, then both rules printed.

### `compiler_weaken`

Target length: about 57 s (133 words).

Narration:

> What if the sunscreen rule makes the list wider? Take a child rule, units allow I U. It allows milligrams and international units.
>
> The parent still applies, so international units would fail anyway. But the child prints an instruction that tells the model that international units are fine. A reader could think that the child overrides the parent. Then the instruction says one thing, and the check does another.
>
> So the compiler refuses it. Here is the real message. Sunscreen units allow I U allows I U, which skincare units label unit forbids. Change the skincare rule, or drop the value.
>
> One limit applies. The CI check runs with no tree, so it cannot see this problem. The real CI result here shows no problem. The compile at run time refuses the rule.

Visuals:

- Child strip `[mg, IU]` pokes outside the parent strip; a red cut at the parent edge.
- Real problem (worked-example output): `weakens units.allow_iu@1 units.label_unit@1 attributes[].unit` / `sunscreen units.allow_iu@1 allows IU, which skincare units.label_unit@1 forbids. Change the skincare rule, or drop the value.`
- CI panel: `auditLibrary({ tree: 'unknown' })` -> `[]` (real). Run-time compile -> refused.

### `compiler_instructions`

Target length: about 49 s (115 words).

Narration:

> What does the model read? It reads the instruction text. The compiler lists each field in path order. Under each field, it prints the shape line, then each strict rule, then each soft rule.
>
> Each rule prints its name and version, its statement, and its reason. A code check also prints its own line. An example is, copy each quote word for word from the label text, with the same letter case. The golden examples come next.
>
> Two things never print. A watch rule never prints. A judgement rule never prints its judge question either. The judge gets that question in its own prompt.
>
> The text on the screen is the real output for sunscreen.

Visuals:

- The real instruction text for sunscreen, revealed field by field (worked-example output, section "instructions").
- Highlight the `Check:` line of `quotes.from_label@1`.
- Two ghost lines struck through: "watch rules" and "judge question".

### `compiler_schema_scorers`

Target length: about 41 s (95 words).

Narration:

> What does the drafter decode into? It decodes into the output schema. Each object in it refuses an extra key. Each object also requires each of its keys.
>
> Next come the scorers. At sunscreen, the compiler made seven code scorers, one for each shape rule and one for the code check. The judgement rule gets a judge scorer.
>
> The compiler makes a judge scorer only when a caller gives it a judge model. So the compile itself never touches a model. Tests make no model call either. A test setup makes each network call throw.

Visuals:

- Real JSON Schema (worked-example output) with `additionalProperties: false` and `required` highlighted.
- Scorer list: 7 code scorers (`attributes.amount@1`, `attributes.key@1`, `attributes.list@1`, `attributes.quote@1`, `quotes.from_label@1`, `units.label_unit@1`, `units.mass_only@1`) and 1 judge scorer `attributes.is_product@1` behind a door "judges(model)".
- Stamp: tests/setup/no-network.ts, fetch throws.

### `compiler_rule_set_hash`

Target length: about 51 s (120 words).

Narration:

> Which rules made this output? The rule-set hash answers that. The compiler takes the hash of the list of everything that it made. That list holds the schema, the instruction text, each scorer, each rule hash, and the code versions of the compiler.
>
> So each input that changes an output also changes the hash. Here is the real result. Compile at sunscreen two times, with the tree in another order. The hash stays the same. Compile at moisturizer, and the hash changes.
>
> The store writes this hash on each stage run and on each accepted output. The design also compiles again in each step and compares the hash. A rule change in the middle of a run stops that run.

Visuals:

- Manifest box: format, code {runtime 1, checks {quote_in_source: 1}, deps {zod 4.6.7, @mastra/core 1.79.0}}, stage, rules[], schema, instructions, scorers[] -> sha256.
- Real results: sunscreen `f8d76e16201616281414918b85528655fa9cced4c14bac055b8c9f8a415eaf9a`; again with the tree reversed: same; moisturizer `ec713b82...`: different.
- Columns `stage_runs.rule_set_hash`, `outputs.rule_set_hash` (BUILT). Re-compile per step (DESIGN, decisions row 2026-11-02).

## Part `part.run`: one stage run

### `run_zoom`

Target length: about 49 s (115 words).

Narration:

> Back to the outline. This part zooms into one stage run. It goes from the draft to the judge, then to a repair or a person.
>
> The draft goes through a gate first. Then the code scorers run. Then the judges run, but only on a clean draft. Each scorer writes rows. Then the bindings decide where the draft goes.
>
> The worked example has three drafts at sunscreen. The label text says, zinc oxide two hundred milligrams in each gram. Free gift sachet five hundred milligrams with each order.
>
> The scorer rows on the screen are real. The judge answers come from a mock model, so they are illustrative. The loop itself is a design.

Visuals:

- Outline, zoom into: `draft -> decode gate -> code scorers -> judges -> verdict rows -> bindings -> repair / person / accept`.
- Label text card: `Zinc oxide 200 mg in each gram. Free gift sachet 500 mg with each order.`
- Legend: rows REAL, judge answers ILLUSTRATIVE (mock model), loop DESIGN.

### `run_decode_gate`

Target length: about 68 s (159 words).

Narration:

> What stops a broken draft at the door? The decode gate does. It parses the reply as JSON, and then it tests the reply against the whole output schema.
>
> Why does the harness need it? Each shape scorer checks only its own field. So an extra key gets no fail from any scorer. In warn mode, Mastra gives no error for an extra key either. With no gate, that draft could reach the graph store.
>
> Here is draft A. Its unit is micrograms. Its quote is zinc oxide two hundred milligrams, in lower case, with no space before the unit. It also has an extra key, grade.
>
> The real gate result says no. The unit must be milligrams. No rule defines the key grade, so remove it.
>
> The decode gate exists in code. In the design, a draft that fails the gate never reaches the judges or the graph store. It counts as a strict failure of the run.

Visuals:

- Draft A JSON: `{"attributes":[{"key":"zinc_oxide","amount":200,"unit":"mcg","quote":"zinc oxide 200mg","grade":"A"}]}`.
- Gate result (real): `attributes[0].unit: Invalid input: expected "mg"`, `attributes[0].grade: No rule defines the key grade. Remove it.`
- Side note: shape scorers see only their own field, so `grade` gets no fail row; warn mode gives no error.
- Chip: BUILT (`plan.decode`).

### `run_code_rows`

Target length: about 54 s (127 words).

Narration:

> What do the code scorers say about draft A? Each scorer writes one row for each item.
>
> Units label unit passes, because the skincare rule allows micrograms. Units mass only fails, because the sunscreen rule allows milligrams only. So the parent and the child each give their own row.
>
> Quotes from label fails, because the quote is not word for word on the label. The row carries the fix. Copy the quote word for word from the label text, with the same letter case, or drop the claim.
>
> Each row also keeps the value that it saw. These rows are real, and they cost nothing. The decode gate failed, but the shape scorers still ran on the raw draft. So each broken rule has its own row.

Visuals:

- Real rows for draft A, one per line: amount pass, key pass, list pass, quote(shape) pass, `quotes.from_label@1` FAIL, `units.label_unit@1` pass (mcg), `units.mass_only@1` FAIL.
- Highlight the fix text of the quote row and the `evidence.quote` column (`"mcg"`, `"zinc oxide 200mg"`).

### `run_judge_step`

Target length: about 60 s (141 words).

Narration:

> When do the judges run? The judge step decides. The judge step is the part of a stage that runs each rule check on a draft.
>
> It runs the code scorers first. It calls the judges only when the draft passed the decode gate, and each strict code check passed. A code check is free, and a judge call costs money.
>
> Draft A failed, so no judge ran. But each rule still needs a row. So each skipped judgement rule gets a row, with no model call. The next part explains the result in that row.
>
> Each judge call answers one rule, for many items. The judge reads the full source text, never a summary. The design uses a judge model from another provider than the drafter.
>
> The judge step is a design. The rows for skipped judges exist in code.

Visuals:

- Gate diamond: "decode ok AND each strict code verdict pass?" Draft A: decode ok false, strict pass false.
- Real skipped row: `attributes.is_product@1 attributes[] cannot_verify decider code "The output broke the schema or a strict code check, so no judge ran."` (verdict word shown, not spoken).
- Notes: one call per rule for many items; full source text; judge provider differs from drafter.
- Chips: judge step DESIGN (`plan.judge_step`), `skippedJudges` BUILT.

### `run_judge_mock`

Target length: about 47 s (110 words).

Narration:

> What does a judge say? Take draft C. It fixes the unit and the quote, and it adds a second attribute, a free gift sachet. Each code scorer passes, so the judges run.
>
> The judgement rule asks, does this attribute describe a property of the product itself? Zinc oxide gets yes, so it passes. The gift sachet gets no, so it fails. A gift with an order is a promotion, not the product.
>
> These answers come from a mock model, so they are illustrative. The mapping is real code. Yes gives pass, and no gives fail. Each judge row also keeps the judge model and the hash of its prompt.

Visuals:

- Draft C: two attributes, zinc_oxide and gift_sachet; all 13 code verdicts pass (real list).
- Judge rows, stamped ILLUSTRATIVE: `attributes[0] pass`, `attributes[1] fail "A gift with an order is a promotion, not a property of the product."`, decider `{ by: judge, model: mock/judge, promptHash: d0a12d81... }`.
- Mapping card (real code): yes -> pass, no -> fail, unknown -> cannot_verify.

### `run_repair_loop`

Target length: about 72 s (169 words).

Narration:

> What happens after a strict fail? The repair loop runs. The repair loop sends the exact errors back to the model, and the model fixes its draft.
>
> Think of a writer and an editor with a checklist. The editor does not rewrite. The editor lists each error with its fix. The writer drafts again from that list.
>
> Here is the illustrative run. The first round is draft A, and it gets three errors in one message. The second round is draft C, and the judge fails the gift sachet. The third round is draft B, and each rule passes.
>
> The design has four rules for this loop. Send all the errors in one round. Name the fix and the allowed values. Keep each failed reply, because it cost money. Stop after three rounds, which are one draft and two repairs.
>
> A Mastra loop step repeats the inner draft and judge workflow. It stops when no strict rule fails, or when the budget ends. The repair loop is a design.

Visuals:

- Loop picture: drafter -> checks -> errors back to drafter, counter 1/3, 2/3, 3/3, exit down to a person after 3/3.
- Round 1 draft A: three errors (unit, quote, extra key). Round 2 draft C: judge fail gift_sachet. Round 3 draft B: all pass. Stamp ILLUSTRATIVE.
- Code card (design sketch): `.dountil(draftAndJudge, ({ inputData, iterationCount }) => inputData.errors.length === 0 || iterationCount >= REPAIR_BUDGET)`.
- Chip: DESIGN.

### `run_person_accept`

Target length: about 54 s (125 words).

Narration:

> What happens when the budget ends? The person step suspends the run with the open results. A reviewer reads them, and then resumes the run with accept or reject.
>
> What happens when each strict rule passes? The harness accepts the draft. It writes the output, its research records, and its result rows into the graph store. Each row names the rule, its version, and its hash.
>
> In the worked example, draft B passes each code scorer, and the mock judge says yes. So the illustrative run ends with an accept.
>
> The graph store refuses each later update of an accepted output. A new run writes new rows. The person step and the accept step are a design. The tables and their refusals exist in code.

Visuals:

- Person step: pause bar, reviewer card with open verdicts, `resume` accept / reject.
- Accept: arrows into graph store tables `outputs`, `records`, `verdicts`.
- Draft B rows (real code rows, mock judge yes).
- Padlock: trigger message `harness.outputs is append-only: update is refused` (db/migrations/0001_harness_tables.sql).

### `run_states`

Target length: about 68 s (158 words).

Narration:

> Rohan asked about all the states. Here they are for one stage run, in the design.
>
> A run starts at context, then goes to research and to draft. After the draft, the run sits in the judge step. From there, it goes one of three ways. It goes back to draft for a repair round. It suspends at the person step. Or it ends as accepted.
>
> A reviewer turns a suspended run into an accepted run or a rejected run.
>
> Mastra keeps its own status for each run. A Mastra run has a status, such as success, failed, or suspended. Mastra has more statuses, such as canceled and paused, but the stage run uses these three. A suspended stage run is a suspended Mastra run.
>
> Rules have states too. A rule is draft, active, or retired. Only an active rule applies in a normal run. The part on rule changes shows how a rule moves between these states.

Visuals:

- State diagram (design): `context -> research -> draft -> judging -> {draft (repair round), suspended (person), accepted}`, `suspended -> accepted | rejected`.
- Mastra run status chips: success, failed, suspended (also paused, tripwire).
- Rule status chips: draft, active, retired; trial shown greyed, "next part".

## Part `part.verdict`: the three-way verdict and the bindings

### `verdict_three_way`

Target length: about 69 s (160 words).

Narration:

> Back to the outline. This part covers the three-way verdict and the bindings. Each check gives pass, fail, or cannot verify. That is the three-way verdict.
>
> Pass means that the output follows the rule. Fail means that the output breaks the rule, and the check gives the fix. Cannot verify means that the check has no evidence either way.
>
> Think of a lab test of water. The result is clean, dirty, or sample spoiled, so test again. The third result is not a pass, and it is not a fail.
>
> Here is a real result. Take draft B, and give the run no label text. The quote check cannot run, so its row says cannot verify. Its reason says, the run gave no sources, so quote in source did not run.
>
> The harness never counts cannot verify as a pass or as a fail. An empty search result gives cannot verify. It is not proof that a thing is absent.

Visuals:

- Outline, the verdict rows highlighted.
- Three-lane road: green pass, red fail, grey cannot_verify. Under grey: "never pass, never fail".
- Lab picture: clean / dirty / sample spoiled.
- Real row: `quotes.from_label@1 attributes[0].quote cannot_verify "The run gave no sources, so quote_in_source did not run."`.

### `verdict_policy`

Target length: about 49 s (115 words).

Narration:

> Who decides each verdict? One policy in code decides, and no check can go around it.
>
> An absent field gives fail for its shape rule, and cannot verify for its other rules. An empty list gives pass, with the empty list as the evidence. Missing evidence gives cannot verify. A check that throws gives cannot verify.
>
> For a judge, yes gives pass, no gives fail, and unknown gives cannot verify. A judge error, or no answer for an item, also gives cannot verify.
>
> Why not use the Mastra skip result? It means that the rule does not apply, and Mastra gates drop it. So the harness keeps its own rows. This policy exists in code.

Visuals:

- Policy table (src/compiler/scorers.ts):
  | case | shape rule | code check | judge |
  | key absent | fail | cannot_verify | cannot_verify |
  | empty list | pass `[]` | pass `[]` | pass `[]` |
  | evidence missing | n/a | cannot_verify | n/a |
  | throws / model error | n/a | cannot_verify | cannot_verify |
  | yes / no / unknown | | | pass / fail / cannot_verify |
- Side card: Mastra `notScorable` = does not apply, dropped by gates.

### `verdict_bindings_table`

Target length: about 41 s (95 words).

Narration:

> Now the bindings, with all three verdicts. Here is the full table.
>
> A strict fail goes to the repair loop. A strict cannot verify goes to a person. A soft fail keeps the output and adds a warning. A soft cannot verify keeps the output and adds a note. A watch rule only logs its row.
>
> The harness accepts an output only when each strict rule gives pass. It never turns cannot verify into a silent accept or a silent reject.
>
> This table is the design of the judge step. No code applies it yet.

Visuals:

- Table (enforce.binding): rows strict / soft / watch, columns "on fail" / "on cannot verify":
  strict: repair / person; soft: keep + warning / keep + note; watch: log / log.
- Footer: "accept only when each strict rule gives pass". Chip: DESIGN.

### `verdict_rows`

Target length: about 32 s (75 words).

Narration:

> What does one row hold? It holds the rule id, the version, the hash, and the binding. It holds the item, the verdict, and the decider, which is code or a judge model. It also holds a reason and the evidence.
>
> The rows answer two questions. Why did the graph store accept this output? Which outputs passed an old version of a rule?
>
> The table for these rows exists in code, and it only grows.

Visuals:

- One `harness.verdicts` row as a card: run_id, rule_id, rule_version, rule_hash, binding, target, verdict, decider, reason, evidence, created_at.
- Two questions as captions. Padlock "append-only". Chip: table BUILT.

## Part `part.change`: how a rule changes

### `change_new_version`

Target length: about 44 s (103 words).

Narration:

> Back to the outline. This part covers how a rule changes. A rule never changes in place. It gets a new version.
>
> Here is the real run. Units label unit gets new words and version two, which replaces version one. The lock file gains a line, and the line for version one stays. The loader reports no problem. The rule-set hash at sunscreen changes.
>
> New outputs use the new version. Old outputs keep the versions that they passed. A reader of an old output applies those versions.
>
> A rule file never leaves the repo. To stop a rule, set its status to retired.

Visuals:

- Outline, the bottom change lane highlighted.
- Real lock entries (worked-example output): `units.label_unit: { "1": "68be9c64...", "2": "c6b4737a..." }`.
- Real: `added: units.label_unit@2`, `loader problems: 0`, new rule-set hash `32b78174...`, "same as before: false".
- Status chips: draft -> active -> retired.

### `change_trial`

Target length: about 58 s (135 words).

Narration:

> How do you test a new version before it binds? You run a trial. A trial compiles one candidate version as watch, next to the live rules.
>
> The candidate gets a scorer only. It gets no part of the schema and no line in the prompt. So it does not change the drafts that it measures. Its hash differs from the live hash, so nobody can mix the two.
>
> The trial runs on the golden examples and on recent outputs. Its report shows where the verdicts change. A trial calls models, so it is a paid run, and it needs a yes.
>
> A shape rule cannot run as a trial, because a shape rule is always strict. The trial input of the compiler exists in code. The trial run and its report are a design.

Visuals:

- Live plan with one extra scorer marked `trial (watch)`: no schema part, no instruction line.
- Hash card: trial hash differs from live hash.
- Report sketch: golden examples + recent outputs -> "verdicts that change". Paid-run gate icon.
- Refusal chip: `trial_shape_refused`. Chips: trial input BUILT, trial run and report DESIGN.

### `change_promotion`

Target length: about 45 s (106 words).

Narration:

> Who makes the new version live after a good trial? Rohan does. He promotes it to its real binding through a PR that changes the rule file. The version becomes active when the PR merges.
>
> The improvement loop of the design can draft rule changes by itself. Its editors may add a watch rule, or change a statement, a reason, or the examples. Only Rohan deletes a rule, or changes its binding, its scope, its judge question, its check, or an output shape.
>
> So the loop cannot make its outputs pass through a weaker rule. That loop is a design, and no code exists for it.

Visuals:

- PR card "promote rule to strict" with Rohan's approval.
- Surface table (improve.boundaries.surface): editors may: add watch rule, edit statement / reason / examples, stage prompt. Only Rohan: delete, binding, scope, judge field, check, output shape.
- Chip: improvement loop DESIGN.

## Part `part.status`: what is built today, and the limits

### `design_rules_table`

Target length: about 37 s (87 words).

Narration:

> Rohan also asked for the rules of the whole design. Here they are on one table.
>
> Code never decides a grade or a match. Cannot verify is never a pass and never a fail. A child rule never loosens an inherited rule. One version number always means the same words. Rows only grow.
>
> Judges run only after the code checks pass. A watch rule never steers a draft. A paid run needs a yes for its prompt, its model, and its cost. Rohan approves each rule change.

Visuals:

- One table, one row per rule, each with its source name: `rules.harness`, `enforce.verdicts`, `graph.scope`, `rule_record.lock`, `store.safety`, `enforce.deciders`, `compile.instructions`, `rules.gates`, `enforce.compile`.

### `built_status`

Target length: about 57 s (133 words).

Narration:

> What exists today? Four units of the plan exist in code on main. They are the starter project, the rule record, the graph store, and the compiler.
>
> Everything else is a design. That includes the judge step, the stage workflow, the repair loop, and the person step. It also includes the tool server, the research tools, and the four stages. It also includes the golden set sync, the change process, and the improvement loop.
>
> Two more facts matter. The rules folder holds no rule yet.
>
> The harness docs still say that nobody applied its migration. That is out of date. The migration is on the live Kyaloon database, with forty-five tables in the parts harness and mastra. Each table has row level security. A read-only check confirmed this on the second of November.

Visuals:

- The outline again, now coloured: green (BUILT on main `cacc262`): `plan.scaffold`, `plan.rule_record`, `plan.graph_store`, `plan.compiler`. Grey (DESIGN): judge step, stage workflow, repair, person, tool server, research tools, four stages, golden sync, change process, improvement loop.
- Two flags: "rules/: 0 rule files"; "live migration applied: 45 tables, RLS on each, harness_app logs in (verified 2026-11-02, read-only SQL)"; small note "harness docs still say not applied (stale)".

### `limits_compiler`

Target length: about 55 s (128 words).

Narration:

> What are the known limits of the compiler? The CI check runs with no tree, so it cannot test a child rule that widens its parent. Only a compile at run time refuses it.
>
> A child judgement rule has no parameters, so the compiler cannot compare it with its parent. Rohan's review of the PR is the guard.
>
> A text shape with a list of values cannot also limit the length. A list shape cannot require unique items, so the unique by check does that. The shape language has no optional field yet.
>
> A spelled-out number, such as five hundred, passes the number check of the loader. Each upgrade of Zod or Mastra changes each rule-set hash. Types limit what a check returns, not what it does inside.

Visuals:

- Limits list (compile.limits), one line each, with the test or doc name: no-tree CI audit has no weaken test; judgement child not comparable; text values + length = conflict; no unique in list; no optional field; spelled-out numbers pass the lint; each Zod or Mastra upgrade changes each hash; types bound outputs, not behaviour.

### `limits_open`

Target length: about 34 s (80 words).

Narration:

> What is still open in the design? Most of it waits for the judge step and the stage workflow.
>
> The design does not say yet how a stage proposes a new node. For now, an operator names each node. The object storage for large research files is open. It is also open whether Mastra writes can join a harness database transaction.
>
> Claude made each compiler decision for Rohan. Rohan reviews them in the decisions trail. That trail outranks the specs.

Visuals:

- Open items board: node proposal (`graph.not_decided`), object storage (`data.open`), Mastra writes in our transactions (`store.open`), decisions to review (`compile.open`, `decisions.tsv`).
- End card: the outline with green and grey boxes.
