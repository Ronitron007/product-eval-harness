## goal_problem

What problem does this harness solve? Today, a model decides which rules make up a product evaluation. It reads a few general instructions. No code and no judge can check that its output follows them. Rohan stated this problem on the twenty-fourth of October, twenty twenty-six.

The goal of the harness is different. Each rule becomes an object in the system, with a name and a check. Each rule says where it applies in the category tree. For each rule, the design knows what it takes to enforce it. This video walks that design from the top down.

## goal_eval_words

Two words come first, because the rest of the video uses them. A product evaluation grades a product, such as a sunscreen. An eval is a different thing. An eval measures the output of a model again and again, over many inputs.

Think of an eval as a unit test for a program that answers in a new way each time. One run tells you little. So you run it on many inputs, and you count the results.

To count, you need an answer key. A golden set is that answer key. A trusted person wrote the expected result for each input before the test. A saved output of a model is not a golden example until a person checks it.

Here is a tiny example. A label says zinc oxide, two hundred milligrams. The golden example says that the unit is milligrams. The eval asks if the model wrote milligrams.

In this harness, each rule carries its own golden examples. So each rule can test itself.

## goal_outline

Here is the whole path on one picture. The video walks it box by box, and it comes back to this picture between parts.

On the left, people write rules as files in git. A program reads the rules for one node of the category tree. It turns them into a prompt, an output schema, and one checker for each rule.

A model writes a draft that fits the schema. Checks in plain code run first, because they are free. Model judges run next, and only on a clean draft. Each check writes a result row.

Then the draft goes one of three ways. It goes back to the model with the errors. Or a person decides. Or the harness accepts it and stores it with its results.

A rule changes only through a new version and Rohan's yes. This video does not walk that path.

Seven parts follow, and the screen names each part. Most of this path is a design today. The last part of the video shows which boxes exist in code.

## mastra_step_workflow

Back to the outline. This part covers the parts of Mastra that the design uses. Mastra is a TypeScript framework for agents and for the code around them.

The first part is the step. A step is a function with a typed contract, like a tool on an MCP server. It has a name, a Zod schema for its input, and a Zod schema for its output.

The second part is the workflow. A workflow is a chain of steps in an order that code fixes. The model never picks the next step. The output of each step is the input of the next step, so the schemas must agree.

Compare this with an agent. An agent picks its own next move. A workflow is a fixed path, and the model only fills the steps.

In this repo, one test runs a small workflow on Postgres. Its one step doubles a number, from twenty-one to forty-two. That test exists in code today. The real workflows of the harness are a design.

## mastra_suspend_resume

How does a workflow wait a day for a person? An await in memory cannot do it. The process can stop or restart, and the await does not survive.

So Mastra writes the state of each run to its database, as JSON. A step can suspend. Suspend means save the run, stop, and ask for input. Later, any process can resume the run with the answer.

Think of a video game. You save at a hard level, and you return tomorrow. The save file holds the run, not the live process.

Here is the example from the design. A person step suspends the run with the open results of a draft. A reviewer reads them, and then resumes the run with accept or reject. A reject ends the run cleanly, not as an error.

One trap exists. On resume, the step runs again from its top. So code before the suspend runs two times.

In this repo, Mastra storage on Postgres exists in code. The person step is a design.

## mastra_scorer

What is a Mastra scorer? Mastra keeps its scorers in a module named evals. A scorer takes one output of a run, and it gives a number, usually from zero to one.

A scorer is a pipeline, not one model call. Think of a form with four boxes.

The first box picks the items to check. The second box gives a result for each item. The third box turns the results into a number. The fourth box writes a reason. Only the third box must exist.

Each box is a plain function or a prompt. A plain function costs nothing. A prompt box calls a judge model. So a scorer of plain functions never calls a model.

In this repo, the code makes one Mastra scorer for each rule. Its name is the rule name, an at sign, and the version. A scorer for a rule that code can decide has function boxes only. That code exists today.

## mastra_gaps

What does Mastra not give? It has no place for a rule with a version and a place in a tree. Its prompt editor keeps versions of text only. So the harness keeps its rules in its own files.

A Mastra score is a number. The harness needs a result that says, no evidence either way. Mastra has a skip result, but it means that the rule does not apply. Mastra gates drop it. So a rule that must pass could pass in silence. The harness keeps its own result rows.

Mastra has no store for the category tree. The harness keeps its own tables. And nothing in Mastra turns rules into prompts and checks. The harness has its own program for that.

## tree_stages

Back to the outline. This part covers the category tree and its stages. The harness keeps one node for each node of the category tree.

Who makes the content of a node? A stage does. A stage is one kind of work at one node.

Think of one station on a production line. Each station runs the same cycle. Only the product changes.

The design has four stages. Define criteria runs at a domain node. A criterion is one aspect of a product that a grade looks at, such as ingredient safety. Only a domain node makes criteria, so each product of one domain gets the same criteria.

Create node runs at an inner node and at a leaf node. It says what each criterion means at that node. At a leaf, two more stages write the grading rules and the display rules.

The code already holds this table of stages and levels. It also lists evaluate product at a leaf. That entry is the product evaluation, which the design keeps outside the stages. It refuses a stage at a level where that stage never runs. The stages themselves are a design.

## tree_stage_cycle

What happens inside one stage run? Each stage runs the same cycle at one node.

Context reads the path to the root, the criteria and rules of this node, past research, and the sibling nodes. Research searches the web and past work. Draft makes one output in the shape that the rules give. In the worked example, the output is a list of attributes. An attribute is one measurable property of a product, such as the amount of zinc oxide on the label. Judge checks each rule.

If a rule fails, the model gets the exact errors and tries again, a fixed number of times. When the rules pass, the harness accepts the output. When the tries run out, a person decides.

To accept means to write into the graph store. The graph store is the set of harness tables in Postgres. It holds the nodes, the runs, the accepted outputs, the result rows, and the rules that stages write. Rows only grow, as in an append-only log.

The graph store exists in code today. The cycle is a design.

## tree_on_mastra

How does a stage sit on Mastra? Here is the map, on one table.

Each stage is one workflow in code. Context, research, draft, judge, and accept are its steps. The draft and the judge sit in an inner workflow. A Mastra loop step repeats that inner workflow until the rules pass, or until the tries run out.

The person step suspends the run, and a reviewer resumes it. The drafter is an agent with structured output. Each rule check is a Mastra scorer.

A new rule changes the data that the steps read. It never changes the shape of the workflow. This whole map is a design. A research run type-checked a sketch of it against the pinned Mastra version.

## rules_record

Back to the outline. This part covers rules written as data. Here is the main idea. A rule is a form, not a function.

A rule record is one rule, written as a YAML file in git. A person can read it, compare two versions of it, and review it in a PR. The harness reads the form. Rohan ruled that a rule and an instruction are the same thing.

Here is one rule record, units label unit. Its statement says, write the amount in the unit that the label prints. Its reason says, a grade must rest on what the label states. It allows three units, milligrams, micrograms, and grams. It carries two golden examples. Milligrams pass, and international units fail.

Each record also names its owner. The owner is the node where the rule starts to apply. The file sits in the folder of its owner, here skincare. One rule has one owner, so two nodes cannot hold two versions of it.

The loader is the code that reads and checks each rule file. The record schema and the loader exist in code. The rules folder of the repo holds no rule yet.

## rules_kinds

A rule record has one of three kinds. The kind tells the harness what to make from the rule.

A shape rule gives the type of one output field. Examples are text from a closed list, a number with limits, a flag, or a list. Units label unit is a shape rule.

A code check names a check function from a small registry, and gives its parameters. The registry has four checks today. One check tests that a quote stands word for word in a source text. The other checks test that a key exists, and that a record exists. The last check tests that no two list items share the value of one key, such as a name.

A judgement rule asks a judge model one question. An example is, does this attribute describe the product itself?

A code check decides facts only, never a grade and never a match. That is a project rule. The type of a check result has no field for a score. The three kinds and the four checks exist in code.

## rules_scope

Where does a rule apply? Its scope says so. A scope has three parts. They are the nodes, the stages, and the output fields.

The nodes part counts from the owner. It selects the owner only, or the owner and each node below it. It can also select each node of one level, such as each leaf, at or below the owner. A scope never names another node. So a sunscreen rule cannot reach skincare, and it cannot reach the sibling node moisturizer.

For units label unit, the scope is skincare and each node below it, the stage create node, and one field. That field is the unit of each attribute.

Why no node names? A name in a scope could point at a parent or at a sibling. A count from the owner makes that state impossible. This kind of scope exists in code.

## rules_inheritance

What happens when a parent and a child both have rules? Inheritance answers this. A rule can apply at each node below its owner. Then a child inherits that rule, and each inherited rule always applies.

Think of house rules in a building. The building says, no pets over ten kilograms. One flat may add, no pets at all. That rule is stricter, and it is fine. The flat may not say, pets up to thirty kilograms. That rule is looser, and the building refuses it.

CSS and ESLint do not work like this. There, the nearer rule wins, and it may loosen the parent. Here, a child rule may only add or tighten. To loosen a rule, change it at its owner, as a new version.

In the worked example, sunscreen adds units mass only, which allows milligrams only. That rule is stricter than its parent, so the harness accepts it.

## rules_binding

What does a failed rule do? Its binding says so. A binding is strict, soft, or watch.

Think of three road signs. Strict is a barrier, and the draft goes back to the model with the errors. Soft is a warning light, and the harness keeps the output with a warning. Watch is a camera. It records the result and does nothing else.

The rule text stays the same. Only the binding changes what a fail does.

Two details matter. Each shape rule is always strict, because the output schema enforces its shape. And a watch rule never prints in the prompt, so it cannot steer a draft.

The binding field exists in code. The judge part of a stage decides what a fail does at run time. That part is a design.

## rules_hash

How does the harness know that a rule changed? It computes a hash of the rule. A hash is a fingerprint of some content. The same content always gives the same hash, and one changed word gives a different hash.

The harness first writes the rule as JSON with sorted keys, so the order of keys does not matter. The hash covers what the rule asks, how a check tests it, and where it applies. It leaves out the id, the version, and the status. The rule hash exists in code.

## compiler_what

Back to the outline. This part covers the compiler. The compiler is the program that turns the rules for one stage run into the things that enforce them.

Think of a printed rulebook and an inspection checklist. One office makes both from the same source, at the same moment. So the two cannot disagree.

The compiler takes all the rule files, the rules that stages wrote, the tree, one node, and one stage. It gives four things. They are an output schema, the instruction text, one scorer for each rule, and a rule-set hash.

The compiler is plain code. It calls no model, and it never throws on bad rule data. It returns admission problems alone. After admission passes, it returns the problems of scope, weaken, and shape together, in one list.

The compiler exists in code today. It shipped on the fourth of November.

## compiler_one_source

Why make the prompt and the checks from one source? Two copies drift apart. A person edits the prompt and forgets the check.

So each value of a rule lives in one place, its parameters. The prompt line and the check both read that place. A test proves it. Change the allowed units, and the instruction and the result of the check both change.

The loader also refuses a statement that repeats a parameter. Units label unit may not hold the unit code m g in its statement, or any other allowed value. Its statement may not hold a number either. The compiler prints each value once, from the parameters.

These guards exist in code.

## compiler_admit_scope

What does the compiler do first? It admits the rules. It refuses a rule set with any loader problem, such as a rule with new words under an old version.

Then it applies the scope of each rule at one node and one stage. It writes one line for each rule version. The line says applied, or left out with a reason.

Here is the real result at moisturizer. Units mass only stays out, because its owner, sunscreen, is not on the path to the root. So at moisturizer, the unit can still be milligrams, micrograms, or grams.

The compile at moisturizer also gives a different hash from the compile at sunscreen. This part exists in code.

## compiler_narrow

What happens when a child rule and an inherited rule cover one field? The compiler takes the strictest values that satisfy both rules. Two rules of one owner that give other values for one field are a conflict, and the compiler refuses them.

At sunscreen, units label unit allows milligrams, micrograms, and grams. Units mass only allows milligrams. Both rules apply, so the result is milligrams only.

Here is the real schema. The unit field is an enum with one value, milligrams. The instruction text shows the same shape line. Both rules also print, each with its statement and its examples.

If two rules share no value, the compiler refuses the stage and names both rules. This part exists in code.

## compiler_weaken

What if the sunscreen rule makes the list wider? Take a child rule, units allow I U. It allows milligrams and international units.

The parent still applies, so international units would fail anyway. But the child prints an instruction that tells the model that international units are fine. A reader could think that the child overrides the parent. Then the instruction says one thing, and the check does another.

So the compiler refuses it. Here is the real message. Sunscreen units allow I U allows I U, which skincare units label unit forbids. Change the skincare rule, or drop the value.

One limit applies. The CI check runs with no tree, so it cannot see this problem. The real CI result here shows no problem. The compile at run time refuses the rule.

## compiler_instructions

What does the model read? It reads the instruction text. The compiler lists each field in path order. Under each field, it prints the shape line, then each strict rule, then each soft rule.

Each rule prints its name and version, its statement, and its reason. A code check also prints its own line. An example is, copy each quote word for word from the label text, with the same letter case. The golden examples come next.

Two things never print. A watch rule never prints. A judgement rule never prints its judge question either. The judge gets that question in its own prompt.

The text on the screen is the real output for sunscreen.

## compiler_schema_scorers

What does the drafter decode into? It decodes into the output schema. Each object in it refuses an extra key. Each object also requires each of its keys.

Next come the scorers. At sunscreen, the compiler made seven code scorers, one for each shape rule and one for the code check. The judgement rule gets a judge scorer.

The compiler makes a judge scorer only when a caller gives it a judge model. So the compile itself never touches a model. Tests make no model call either. A test setup makes each network call throw.

## compiler_rule_set_hash

Which rules made this output? The rule-set hash answers that. The compiler takes the hash of the list of everything that it made. That list holds the schema, the instruction text, each scorer, each rule hash, and the code versions of the compiler.

So each input that changes an output also changes the hash. Here is the real result. Compile at sunscreen two times, with the tree in another order. The hash stays the same. Compile at moisturizer, and the hash changes.

The store writes this hash on each stage run and on each accepted output. The design also compiles again in each step and compares the hash. A rule change in the middle of a run stops that run.

## run_decode_gate

Back to the outline. This part follows one stage run at sunscreen, with three drafts. The label text says, zinc oxide two hundred milligrams in each gram. Free gift sachet five hundred milligrams with each order. The scorer rows are real, and the judge answers come from a mock model.

What stops a broken draft at the door? The decode gate does. It parses the reply as JSON, and then it tests the reply against the whole output schema.

Why does the harness need it? Each shape scorer checks only its own field. So an extra key gets no fail from any scorer. The design also sets Mastra to keep a raw reply that breaks the schema, with no error. With no gate, that draft could reach the graph store.

Here is draft A. Its unit is micrograms. Its quote is zinc oxide two hundred milligrams, in lower case, with no space before the unit. It also has an extra key, grade.

The real gate result says no. The unit must be milligrams. No rule defines the key grade, so remove it.

The decode gate exists in code. In the design, a draft that fails the gate never reaches the judges or the graph store. It counts as a strict failure of the run.

## run_code_rows

What do the code scorers say about draft A? Each scorer writes one row for each item.

Units label unit passes, because the skincare rule allows micrograms. Units mass only fails, because the sunscreen rule allows milligrams only. So the parent and the child each give their own row.

Quotes from label fails, because the quote is not word for word on the label. The row carries the fix. Copy the quote word for word from the label text, with the same letter case, or drop the claim.

Each row also keeps the value that it saw. These rows are real, and they cost nothing. The decode gate failed, but the shape scorers still ran on the raw draft. So each broken rule has its own row.

## run_judge_step

When do the judges run? The judge step decides. The judge step is the part of a stage that runs each rule check on a draft.

It runs the code scorers first. It calls the judges only when the draft passed the decode gate, and each strict code check passed. A code check is free, and a judge call costs money.

Draft A failed, so no judge ran. But each rule still needs a row. So each skipped judgement rule gets a row, with no model call. The next part explains the result in that row.

Each judge call answers one rule, for many items. The judge reads the full source text, never a summary. The design uses a judge model from another provider than the drafter.

The judge step is a design. The rows for skipped judges exist in code.

## run_judge_mock

What does a judge say? Take draft C. It fixes the unit and the quote, and it adds a second attribute, a free gift sachet. Each code scorer passes, so the judges run.

The judgement rule asks, does this attribute describe a property of the product itself? Zinc oxide gets yes, so it passes. The gift sachet gets no, so it fails. A gift with an order is a promotion, not the product.

These answers come from a mock model, so they are illustrative. The mapping is real code. Yes gives pass, and no gives fail. Each judge row also keeps the judge model and the hash of its prompt.

## run_repair_loop

What happens after a strict fail? The repair loop runs. The repair loop sends the exact errors back to the model, and the model fixes its draft.

Think of a writer and an editor with a checklist. The editor does not rewrite. The editor lists each error with its fix. The writer drafts again from that list.

Here is the illustrative run. The first round is draft A, and it gets three errors in one message. The second round is draft C, and the judge fails the gift sachet. The third round is draft B, and each rule passes.

The design has four rules for this loop. Send all the errors in one round. Name the fix and the allowed values. Keep each failed reply, because it cost money. Stop after three rounds, which are one draft and two repairs.

A Mastra loop step repeats the inner draft and judge workflow. It stops when no strict rule fails, or when the budget ends. The repair loop is a design.

## run_person_accept

What happens when the budget ends? The person step suspends the run with the open results. A reviewer reads them, and then resumes the run with accept or reject.

What happens when each strict rule passes? The harness accepts the draft. It writes the output, its research records, and its result rows into the graph store. Each row names the rule, its version, and its hash.

In the worked example, draft B passes each code scorer, and the mock judge says yes. So the illustrative run ends with an accept.

The graph store refuses each later update of an accepted output. A new run writes new rows. The person step and the accept step are a design. The tables and their refusals exist in code.

## run_states

Rohan asked about all the states. Here they are for one stage run, in the design.

A run starts at context, then goes to research and to draft. After the draft, the run sits in the judge step. From there, it goes one of three ways. It goes back to draft for a repair round. It suspends at the person step. Or it ends as accepted.

A reviewer turns a suspended run into an accepted run or a rejected run.

Mastra keeps its own status for each run. A Mastra run has a status, such as success, failed, or suspended. Mastra has more statuses, such as canceled and paused, but the stage run uses these three. A suspended stage run is a suspended Mastra run.

Rules have states too. A rule is draft, active, or retired. Only an active rule applies in a normal run. A new version of a rule starts as a draft. Rohan makes it active through a PR.

## verdict_three_way

Back to the outline. This part covers the three-way verdict and the bindings. Each check gives pass, fail, or cannot verify. That is the three-way verdict.

Pass means that the output follows the rule. Fail means that the output breaks the rule, and the check gives the fix. Cannot verify means that the check has no evidence either way.

Think of a lab test of water. The result is clean, dirty, or sample spoiled, so test again. The third result is not a pass, and it is not a fail.

Here is a real result. Take draft B, and give the run no label text. The quote check cannot run, so its row says cannot verify. Its reason says, the run gave no sources, so quote in source did not run.

The harness never counts cannot verify as a pass or as a fail. An empty search result gives cannot verify. It is not proof that a thing is absent.

## verdict_policy

Who decides each verdict? One policy in code decides, and no check can go around it.

Missing evidence gives cannot verify, and so does a check that throws. For a judge, yes gives pass, no gives fail, and unknown gives cannot verify. A judge error also gives cannot verify.

The Mastra skip result means that the rule does not apply. So the harness keeps its own rows.

## verdict_bindings_table

Now the bindings, with all three verdicts. Here is the full table.

A strict fail goes to the repair loop. A strict cannot verify goes to a person. A soft fail keeps the output and adds a warning. A soft cannot verify keeps the output and adds a note. A watch rule only logs its row.

The harness accepts an output only when each strict rule gives pass. It never turns cannot verify into a silent accept or a silent reject.

This table is the design of the judge step. No code applies it yet.

## verdict_rows

What does one row hold? It holds the rule, its version and hash, the binding, the item, the verdict, and the decider. It also holds a reason and the evidence.

So a later reader can ask why the graph store accepted an output. The table exists in code, and it only grows.

## design_rules_table

Rohan also asked for the rules of the whole design. Here they are on one table.

Code never decides a grade or a match. Cannot verify is never a pass and never a fail. A child rule never loosens an inherited rule. One version number always means the same words. Rows only grow.

Judges run only after the code checks pass. A watch rule never steers a draft. A paid run needs a yes for its prompt, its model, and its cost. Rohan approves each rule change.

## built_status

What exists today? Four units of the plan exist in code on main. They are the starter project, the rule record, the graph store, and the compiler.

Everything else is a design. That includes the judge step, the stage workflow, the repair loop, and the person step. It also includes the tool server, the research tools, and the four stages. It also includes the golden set sync, the change process, and the loop that improves the rules.

Two more facts matter. The rules folder holds no rule yet.

The harness docs still say that nobody applied its migration. That is out of date. The migration is on the live Kyaloon database, with forty-five tables in the parts harness and mastra. Each table has row level security. A read-only check confirmed this on the second of November.
