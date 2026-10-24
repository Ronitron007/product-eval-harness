# What the Kyaloon v3 pipeline teaches `kyaloon_patterns`

Status. Research summary of 2026-10-24. It changes nothing and decides nothing. Kyaloon is the first user of this harness. Its v3 evaluation pipeline makes evaluation knowledge for supplements today, so it is the nearest prior art.

Sources. Two research maps by Claude, with code references, read the private Kyaloon RealDose repo. The first maps each mechanism that enforces a rule on model output (commit `e95ead79`). The second maps how v3 makes criteria, records, packs, layouts, and scores (`staging` at `0a2dd32c`). The full maps stay in the private repo. This summary keeps the patterns and the gaps.

Labels. "Verified" means that the research read the code. "Inferred" means a conclusion that nobody tested.

## How v3 makes evaluation knowledge `kyaloon_patterns.v3`

Paid web research lands as immutable research records. A model digests the records of one ingredient, and a second model call writes the rubric of that ingredient. For each set of ingredients, a model writes a pack and a layout. A person gates each pack and layout. For each product, a model writes one level for each criterion and a list of adjustments. Code then does the score arithmetic. Verified.

| Stage | Where its rules live | Output | What checks the output |
|---|---|---|---|
| Research | Query builders with a JSON output schema | Research result | The schema of the research service |
| Ingest records | Record schemas in code | Immutable records with provenance | Code |
| Digest | A prompt | A digest of the records of one ingredient | Schema and a check that each input record is cited (code) |
| Write the rubric | A prompt | The rubric of one ingredient | Schema, three lints, a length floor (code), then a person |
| Write the pack | A prompt | The pack | Schema and checks (code), then a person gates it |
| Write the layout | A prompt | The layout | Schema and checks (code), then a person gates it |
| Grade a product | A prompt that prints the pack | One level for each criterion, adjustments, facts | Schema, completeness, and key checks (code), with a retry |
| Score | Code | The score | Code |

Verified. No authoring stage has an LLM judge. Each one uses code checks, then a person.

## How the harness concepts map to v3 `kyaloon_patterns.mapping`

| Harness concept | The v3 thing | Difference |
|---|---|---|
| Criteria of a domain node | Six fixed criteria for all supplements, named in code: `dosage`, `form`, `formulation_cofactors`, `additive_profile`, `safety_interactions`, `communication` | v3 fixes the criteria in code. The harness makes them in `define_criteria`, under rules. |
| Meaning of a criterion at a node | The calibration prose of each criterion in a pack: what a level 3, 6, and 9 product looks like in this category | v3 keeps it as prose that only a person checks. The harness keeps it as a derived rule that the ruleset judge checks. |
| Additions | One pack-wide adjustment guidance text. It names the label practices that earn +1, the faults that cost -1, and the rule "one fault, one charge". Code clamps the net adjustment to the range -2 to +2. | v3 has no structure for each addition. The harness gives each addition a sign, an attribute, and a reason. |
| Attributes | The tables `attributes` and `node_attributes` of a category tree | Verified: no evaluation step of v3 reads the category tree. A layout invents its own number keys, and the grading prompt says that it is "not limited to these keys". |
| Research records | Immutable record files in three layers, each with source URLs and the id of the research run | The harness keeps this design. |
| Pack | A pack for one set of ingredients | Verified: a v3 pack has no link to a leaf of the category tree. In the harness, a pack belongs to one leaf node. |
| Ruleset judge | None. Code checks and a human gate. | The harness adds LLM judges for each rule that code cannot check. |
| Rule versions | The sha256 of a pack, a hash of the words of each Jev question, a fingerprint of a prompt | The harness gives each rule a version and a hash, and logs both with each verdict. |

The model gives each level and each adjustment. Code only does the arithmetic: a weighted mean of the levels, caps that can only lower a level, and the clamp of the net adjustment. Verified.

## Patterns that the harness keeps `kyaloon_patterns.keep`

- **One source for the instruction and the check.** The grading prompt prints the layout keys from one function, and the check reads the same function. So the two cannot drift. Verified.

- **A repair sentence in each error.** The checks name the fix and the allowed values. A bare schema message made a model try the same wrong fix three times. Verified.

- **All problems in one round.** After a schema failure, a lenient read lets each other check report its problems in the same round. Verified.

- **A bounded retry, then a safe outcome.** The grading call stops after a fixed number of tries. A chat gate sends a fallback answer. A judge sends unclear items to `unsure`. Verified.

- **"Cannot check" is its own state.** Unknown values, `unknown` verdicts, and `unclear` decisions stay apart from "fails". Verified.

- **Rule versions bound to their tests.** A Jev question keeps a hash of its words and the hash that its test used. A changed word stops the old limit. Verified.

- **New rules bind new output only.** A reader of a stored pack first checks its hash. Then it applies each rule except the rules that came after the pack. Verified.

- **Lifecycle status on rule rows.** `draft`, `active`, `retired`, and readers that see `active` only. Verified.

- **A model proposes, a person reviews, a reader filters.** Model-proposed search aliases stay invisible until a person reviews them. Verified.

- **A golden exam for a judge.** One lane tests its judge on a golden set, then applies acceptance gates to frozen products. Verified.

- **Code owns the numbers.** Code strips each number that the model must not set, such as the final score, and does the score arithmetic. Verified.

- **The full label for each judge.** Each judge reads the whole label, never a short list made from it.

## Gaps that the harness closes `kyaloon_patterns.gaps`

| Gap in v3 | What the harness does |
|---|---|
| The content of calibration prose, adjustment guidance, and record citations is prose that only a person checks at the gate. Verified. | Each instruction is a rule with a check. An LLM judge checks each rule that code cannot check. |
| A layout invents its number keys, and the grading call may add more. Only 1 of 24 keys of one layout matched an attribute of its category node. Verified. | Attributes belong to nodes, and each output names attributes from its node only. |
| The category tree links to no rubric, pack, or layout. Verified. | The rule graph is the category tree. A pack belongs to a leaf node. |
| The pack prompt still gives +1 for a third-party test, against Rohan's ruling of 2026-09-26 that being tested is never a bonus. Verified. | A ruling becomes a rule with a check. A prompt cannot keep an old instruction that a rule forbids. |
| The field list in the pack prompt is a hand copy of the schema, and it drifted (160 characters against 240). Verified. | The compiler makes the instruction and the check from one rule record. |
| A retry asks the model to keep its other answers, and no code checks it. Verified. | The repair loop checks that the fields outside the errors did not change. |
| The "frame" of a record (the context it was written in) is a rule in prose with no field. Verified. | The provenance of each record is a field. |
| The version number of a pack does not identify it. Two packs can share one. Verified. | Each rule and each output has a version and a content hash. |
