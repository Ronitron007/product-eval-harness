# Glossary `glossary`

Each term has one definition. Docs link here at the first use of a term.

| Term | Definition |
|---|---|
| Admission | The first step of each compile. It checks each input rule, and it refuses a rule library with a problem. |
| Addition | One item that earns or loses points at a node, and that no inherited criterion prices. It has a sign, an attribute, and a reason. A pack turns additions into its bonus and subtraction rules. |
| Anchored scope | A scope that starts at the node that owns the rule. It selects the owner, the subtree of the owner, or one level in that subtree. It holds no node id. |
| Blind selector | The part of the improvement loop that picks one of k anonymous final outputs, with no view of the rules that made them. |
| Assimilate | To accept a stage output into the graph, with its research records and the id, version, and verdict of each rule in scope. |
| Attribute | One measurable property of a product. Its value is a number with a unit, a word from a closed list, a list of words, or a flag with details. It describes the product, not the category, the market, or public opinion. |
| Authoring database | The one shared, persistent database of the authoring stages. It holds the authoring graph and the run state of Mastra. |
| Binding | The part of a rule that sets what a fail does: `strict`, `soft`, or `watch`. |
| Bundle | The published knowledge of one leaf node: the pack, the layout, the attributes, and their rule versions, with one hash. A consumer pins the hash. |
| Cannot verify | The check result that means "no evidence either way". It is never a fail and never a pass. |
| Category tree | The tree of product types, such as skincare, then sunscreen, then mineral sunscreen. |
| Check | A test of one output item against one rule. It gives pass, fail, or cannot verify. |
| Check template | The code of one code check in the check registry, with a strict parameter schema. A `code_check` rule names a template and gives the parameter values. |
| Code check | A check that code decides with no model. |
| Code lock | The file `src/compiler/code.lock.json`. It maps each declared version of the compiler code to a fingerprint of its source. It only grows. |
| Criterion | One aspect of a product that an evaluation grades. Only a domain node creates criteria. |
| Decode gate | The one test of a stage output against the whole output schema, `plan.decode`. An output that fails it never reaches the judges or the graph. |
| Derived rule | A rule that a stage creates as part of its output, such as the meaning of a criterion at a node. It lives in the graph store. |
| Domain node | A top node of the rule graph, such as skincare or supplements. |
| Editor | A session of the improvement loop that proposes changes to the stage rules of one node. A process editor owns how the stage works. A domain editor owns what a practitioner knows. |
| Evaluation pack | The rules that grade one product at a leaf node: the kept criteria and attributes, the levels, the adjustments, and the scoring. |
| Composer | The part of the improvement loop that merges candidate edits, adopts one, or keeps the base rules, from the evidence of the probes. |
| Compiler | The code that turns the rules in scope of one stage run into the things that enforce them. These are an output schema, an instruction text, one scorer for each rule, and a rule-set hash. Its name is `compile`. |
| Golden example | An input and an output with the verdict that a person expects. The change process tests each rule version on its golden examples. |
| Held-out suite | The cases and the judges that the promotion gate uses. No session of the improvement loop reads them. The cases and the judge prompts live in a private Mastra storage, outside this public repo. |
| Harness | The system that runs the stages of the rule graph and enforces the rules. |
| Improvement run | One run of the self-improvement loop for one node and one stage. It is a paid run. |
| Inner node | A node of the rule graph between a domain node and a leaf node. |
| Judge (LLM judge) | A model call that answers one rule question about one output, with an "unknown" answer. |
| Lane | One sequence of items in the improvement stream. Each domain has one lane, and its items run in a fixed order. |
| Layout | The rules for how an evaluation shows a product at a leaf node. |
| Manifest | The compiled artifacts of one stage run, as plain JSON. The rule-set hash covers exactly the manifest. |
| Meet | The strictest parameters that satisfy each shape rule on one output path. An empty meet is a conflict, and the compile fails. |
| Lesson | A record of the reflector: a cue, a lesson, its evidence, and a confidence. Editors at related nodes read it as a hypothesis. Stage runs never read it. |
| Ledger | The record of one compile. It has one entry for each input rule version. Each entry says applied, trial, or excluded with a reason. |
| Leaf node | A node of the rule graph with no child. Only a leaf node gets an evaluation pack. |
| Node criterion | A criterion as it applies at one node: its relevance, its meaning, and the attributes that measure it there. |
| Probe | One stage run of a candidate rule set in the improvement loop. |
| Promotion gate | The step that publishes a draft rule version only after the held-out suite passes over the subtree of the node that owns the rule, and Rohan says yes. |
| Product fact | One value of one attribute for one product, with its source and its quote. |
| Provenance | The research record or the decision that made a rule or an output. |
| Reference run | One stage run of the published rules in the improvement loop. The editors compare the probes with the reference runs. |
| Reflector | The part of the improvement loop that writes one verdict for each edit and at most one lesson. |
| Reference knowledge | A value that is the same for each product of a category, such as an upper limit. It is never a product fact. |
| Repair | A round in which a stage sends the exact errors back to the model, and the model fixes its output. |
| Research record | The research or thinking work behind an output: the question, the sources with quotes, the findings, and the run. Records are append-only. |
| Rule | One instruction, with an id, a version, a statement, a reason, a kind, a scope, a binding, golden examples, and provenance. A rule and an instruction are the same thing. |
| Rule library | Every rule that the loader read and checked, with its hash. The compiler takes the rules in scope of one stage run from it. |
| Rule-set hash | The sha256 of the manifest of one compile. The stage run and its output keep it. Equal artifacts give one hash. |
| Rule graph | The graph of nodes that projects the category tree. Each node holds its criteria, attributes, records, rules, and, at a leaf, its pack and layout. |
| Ruleset | The rules in scope of one stage run at one node. |
| Ruleset judge | The part of a stage that runs each rule in scope on the output, with code checks and LLM judges. |
| Scope | The nodes, the stages, and the output fields where a rule applies. |
| Slot | What two rules check together. Two shape rules share a slot when they have one type on one field. Two code checks share a slot when they have one template and equal identity parameters on one field. |
| Stage | One kind of work at one node: `define_criteria`, `create_node`, `create_pack`, or `create_layout`. |
| Stage rule | A rule that governs how a stage works and the shape of its output. Rohan approves it. It lives in git. |
| Test vector | A test case of a check template. It holds parameters, a value, evidence, and the expected verdict. Vectors are tests, not hash inputs. |
| Trial | A compile of one candidate rule version as watch, beside the active rules. The candidate gets a scorer only, so it does not change the drafts. Its hash differs from the live hash. |
| Verdict | The result of one check: pass, fail, or cannot verify. |
| Weaken | To restate an inherited slot more loosely. A child rule weakens when a dimension that both rules set is looser. A code check also weakens with a lower binding. The compiler refuses it. |
