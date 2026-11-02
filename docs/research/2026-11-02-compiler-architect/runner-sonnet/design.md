# plan.compiler, candidate "sonnet"

One idea: **rules hold in conjunction, a check is one registry entry that renders, verifies and compares itself, and the rule set is a value whose hash comes from what it produced.**

Files in this folder: `sketch.ts` (types and signatures, type-checked, `tsc --noEmit` exit 0 in a copy of the repo at `803301a`), `research.md` (Look Before You Build record).

## Problem

`plan.compiler` turns the rules in scope of one stage run at one node into an output schema, an instruction text, a scorer for each check rule, and one hash. Three facts of the repo make the shape hard.

- `RuleRecord` has no machine-readable parameters. A `shape` rule cannot say its shape. A `code_check` rule cannot pass `min` or the allowed units. `rules/` is empty, so the record can still change (verified, read).
- `graph.scope` forbids a child to remove or weaken an inherited rule, but nothing defines "weaken".
- `stage_runs.rule_set_hash` and `outputs.rule_set_hash` wait for a hash, and `VerdictInput` already has the fields that a scorer must fill (verified, read `src/store/store.ts`).

Each hazard of the grounding gets a named mechanism and a failing test (table in Shape). RealDose invariant 11 binds: code verifies, never grades or matches.

## Usage (caller's view)

### A rule file

Two new fields on a rule: `shape` (kind `shape`) and `params` (kind `code_check`). Both are in `ruleHash`.

```yaml
# rules/skincare/criteria.attribute_unit.yaml
id: criteria.attribute_unit
version: 1
kind: shape
statement: Write the unit of an attribute as one of the allowed units.
reason: Prompt, schema and check read one list, so they cannot disagree.
scope: { nodes: { node: skincare, descendants: true }, stages: [define_criteria, create_node], fields: ['criteria[].attributes[].unit'] }
shape: { type: enum, values: [mg, g, mcg] }   # a list comes from [] in the path, never from the shape
binding: strict                               # a shape rule must be strict: the decoder enforces it

# rules/skincare/criteria.reason_has_record.yaml
id: criteria.reason_has_record
kind: code_check
check: min_items
params: { min: 1, max: null }                 # no defaults: authored equals parsed
scope: { ..., fields: ['criteria[].recordIds'] }   # the list itself. 'recordIds[]' would mean each item
binding: strict
```

A child rule that lowers the bound is refused with all problems in one round:

```yaml
# rules/sunscreen/criteria.sunscreen_records.yaml: same check, same field, params { min: 0, max: null }
```
```
weakens_inherited  criteria.sunscreen_records@1  field criteria[].recordIds (create_node)
  min_items {min:0} is weaker than {min:1} of criteria.reason_has_record@1 (owner skincare).
  A lower node may only add. Raise min to 1 or more, or make version 2 of the rule at skincare.
```

### Call site 1: the stage workflow (`plan.stage_workflow`, `plan.judge_step`)

```ts
import { admitRules, compile, treeOf, judgeScorers, readFindings } from '../compiler'

// context step. Pure, no model. Every refusal comes back as a list, nothing throws.
const tree = unwrap(treeOf(await store.allNodes()))
const pool = unwrap(admitRules({ library: loadRuleLibrary('rules'), derived: await store.derivedRuleRows() }))
const rs   = unwrap(compile(pool, tree, { stage: 'define_criteria', node: 'skincare' }))

await store.recordStageRun({ runId, stage: rs.stage, nodeId: 'skincare', ruleSetHash: rs.hash })
requestContext.set('ruleSetHash', rs.hash)

// draft step: the schema and the words come from the same rules
const drafter = new Agent({ id: 'drafter', model, instructions: () => rs.instructions.text })
const draft = await drafter.generate(prompt, { structuredOutput: { schema: rs.schema } })

// judge step: code first, then judges. One scorer for each enforced rule, found by its ref.
const code = rs.codeScorers()
const judges = judgeScorers(rs, judgeModel)          // the only place a model appears
for (const rule of rs.enforced) {
  const run = await (code.get(rule.ref) ?? judges.get(rule.ref)!).run({ input: { evidence }, output: draft.object })
  rows.push(...readFindings(run).map(f => verdictInput(runId, rule, f)))   // Finding already has target, verdict, reason, evidence
}
```

### Call site 2: the CI golden gate (`plan.golden_sync`)

```ts
// tests/compiler/golden.test.ts  (no model, no database, no network)
const pool = unwrap(admitRules({ library: loadRuleLibrary('tests/compiler/fixtures/rules') }))
const sets = unwrap(compileAll(pool, unwrap(treeOf(FIXTURE_NODES))))   // every (stage, node) that STAGE_LEVELS allows
for (const rs of sets) {
  expect(goldenCheck(rs, pool).failures).toEqual([])     // each shape/code example gets its expected verdict
  expect(rs.hash).toMatchSnapshot()                      // a compiler change shows as a hash diff in the PR
}
```
`npm run rules:check` also calls `admitRules` now, so an unknown check or a bad `params` exits 1 in CI.

### Call site 3: the change process trial (`plan.change_process`)

```ts
const trial = unwrap(compile(pool, tree, { stage, node, mode: { trial: ['criteria.reason_has_record@2'] } }))
// the draft is enforced as 'watch', whatever it says. A draft shape rule is refused. The ledger says so.
```

### What the drafter reads (one rule, `rs.instructions.text`)

```
Stage define_criteria. Follow every rule. [strict]: checked, sent back for repair. [soft]: warning.

criteria.attribute_unit@1 [strict]
Write the unit of an attribute as one of the allowed units.
Why: Prompt, schema and check read one list, so they cannot disagree.
Field criteria[].attributes[].unit: one of mg, g, mcg.
```

## Shape

### Data structures

| Type | Holds | Owner of the invariant |
|---|---|---|
| `Shape` | `text`, `number`, `flag`, `enum`, closed `object` of required fields, `nullable`. No facets, no list. | The type of a value. A bound is a check, a list is `[]` in a path. |
| `CheckDef<P>` | `params` schema, `on` node kinds, `needs` evidence, `render`, `verify`, `implies`, `fits`, `vectors` | One registry entry is the whole check: words, test, order. |
| `AdmittedRule` and `AdmittedPool` | A rule that passed every static test, with its parsed `spec` (`CheckCall` is typed per check) and recomputed hash | `admitRules` is the only constructor. `compile` takes nothing else. |
| `TreeSnapshot` | Nodes with parent and level, checked once | Ancestry. |
| `FieldTree` | The composed output shape of one (stage, node), one owner rule per path | Which rule owns which field. |
| `CompiledRuleSet` | `schema`, `instructions`, `enforced`, `judges`, `ledger`, `hash`, lazy `codeScorers()` | A value. Pure function of (pool, tree, request). |
| `Outcome` | `pass`, `fail` with error and fix, `cannot_verify` with why | A check can say nothing else. |

Dominant access patterns, traced. Rules for a node: `chain(node)` is an array root to node, and `owner in chain` is a set test. Weakening: rules grouped once by `check|stage|path`, each group sorted by owner depth. Field lookup: a path walks a `Map` tree in depth steps. Ledger: one pass over the pool. No index is added later.

### Flow

```
rules/*.yaml --loadRuleLibrary--> RuleLibrary --+
store derived rows --------------------------- +--admitRules--> AdmittedPool
                                                         |
tree rows --treeOf--> TreeSnapshot -----------+          v
                                              +--compile(pool, tree, {stage, node, mode})--> CompiledRuleSet
 1 reach     every ACTIVE rule reaches a real (stage,node) and has its owner in ancestry, else refuse (drafts are exempt)
 2 select    highest active version per id, status and mode -> enforced | excluded (ledger)
 3 apply     node in selector, stage in rule.stages
 4 compose   shape claims -> FieldTree -> strict Zod
 5 resolve   every target of every enforced rule resolves in the FieldTree, params fit the node kind
 6 weaken    group by (check, stage, path), compare deeper to shallower
 7 emit      instructions, check plans, judge specs, ledger
 8 hash      sha256 of canonical JSON of the artefacts
```
The steps run in this order because a later step reads only the output of an earlier one. Errors are collected from every step that does not depend on a failed one. The ledger reason has a fixed precedence: status first, then node, then stage.

### Weaken (the definition)

Two rules are **comparable** when they name the same check and share at least one identical `(stage, field path)` target. Within a comparable pair, the **child** is the rule whose owner sits deeper in the chain. All included rules have their owner in the chain of the node, so the chain gives a total order. Two rules of the same owner are peers and are not compared.

> The child **weakens** the inherited rule when `check.implies(child.params, inherited.params)` is false, or when the authored binding of the child ranks below the authored binding of the inherited rule (`strict` above `soft` above `watch`).

`implies(a, b)` means every value that passes `a` also passes `b`. Each check states its own: `min_items` is stronger with a higher `min` and a lower `max`. `one_of` is stronger with a subset of values. A bigger enum is never stronger. A child that equals the parent does not weaken it.

- **Conjunction is the meaning.** All rules in scope hold together, so a child cannot loosen anything in the checks. A looser child would be a rule that does nothing, and its instruction line would contradict the parent. That is a silent no-op, so it is refused, not ignored.
- **Authored binding, not effective binding.** A trial draft is clamped to `watch` after this test. It is not a weakening.
- **Ownership is a separate refusal.** A node rule whose owner is not an ancestor-or-self of the selector node gives `owner_not_ancestor`. A level rule counts only the nodes of that level inside the subtree of its owner.
- **Shape rules never reach `weakens`.** One owner per field path (next section).
- **Check against shape.** `fits` refuses a `one_of` whose values leave the enum of the shape at its target, so a child cannot widen a shape through a check.
- **Soundness of `implies` is tested.** For every check and every pair of vector params `(a, b)` with `implies(a, b)`: each vector item that passes `a` also passes `b`. A wrong `implies` fails the conformance test.
- **Not covered.** A judgement rule has no parameters. A child judgement rule cannot be compared with a parent judgement rule. Rohan's approval of the rule PR is the only guard (named in Open questions).

### Schema composition

A shape rule claims paths. Rule at `criteria[]` with an object shape means `criteria` is a list of that object. Rule at `criteria[].attributes[]` adds the property `attributes` to the item object.

1. Sort claims by (path depth, path, ref). A parent is placed before its children.
2. Walk to the parent through the tree built so far. A missing parent gives `shape_parent_missing`.
3. If the last name already exists in the parent, refuse. Two claims on one path give `shape_conflict`, and the message says "incompatible types" when the kinds differ. A property that the parent object declares itself gives `shape_overlap`.
4. The root is a strict object of the top-level names. A stage with no shape rule gives `stage_has_no_shape`, because `{}` would accept anything.
5. `toZod` builds `z.strictObject` with fields sorted by name. Enums keep the authored order.

One owner per field means a child can add a field (a new path) but cannot narrow an inherited field in the decoder schema. A child narrows with `one_of` or `min_items`. Only the check enforces that, and a repair round costs one model call. This is deliberate (Alternatives).

### Instruction rendering

`renderInstructions` is pure and sorted by (owner depth, rule id), so inherited rules come first. Each rule prints its ref, binding, statement, reason, a clause, and its `pass` and `fail` examples as canonical JSON.

- The clause of a `code_check` is `def.render(params, target)`. The clause of a `shape` rule is `describeNode(node, path)`. Both read the object that `verify` and `toZod` read.
- `watch` rules are checked but not printed. A printed rule steers the model, and `watch` means "nothing else happens" (`enforce.binding`).
- The `judge` question is never printed. Rohan owns it, and the drafter does not need the judge's policy.
- The header names the stage. It never names the node. The node enters only by choosing rules.
- `byRule` keeps the same words per rule for the repair message.

### Scorer creation

- **Code scorer** for each `shape` and `code_check` rule (`enforce.compile` table: code check from `code_check` and `shape`). `createScorer({ id: ref, ... })` with function steps only. Verified (ran): no judge, no model.
  - `analyze` walks each target to its concrete items (`criteria[2].attributes[0]`), calls `runCheck`, and returns `Finding[]`.
  - `generateScore` is 1 when every finding passes, else 0. `cannot_verify` is 0. The three-way result lives in `analyzeStepResult`. `readFindings(run)` is the one reader, so `plan.judge_step` never reads the score.
  - An empty list gives one `pass` finding with the reason "no items at target". A missing parent gives `cannot_verify`, never `pass`.
- **`runCheck`** is the only caller of `verify`. It answers `cannot_verify` when a key of `def.needs` is missing, before `verify` runs. It turns a throw into `cannot_verify`. `verify` receives `Required<Pick<Evidence, K>>`, so a missing key is not representable inside a check.
- **Judge scorers.** `compile` makes `JudgeSpec` data. `judgeScorers(set, model)` builds the Mastra scorers. A test builds them with a fake model and makes zero calls (verified by probe).

### The rule-set hash

`sha256` of the RFC 8785 canonical JSON of:

| Input | Why it is there |
|---|---|
| `format` | Changes only when this layout changes. |
| `stage` | A stage with the same rules still names its stage in the instruction. |
| `rules`: `[{ref, ruleHash, effective binding}]` sorted by ref | Which exact words ran. A new version gives a new hash on purpose, so stored outputs name versions (`enforce.audit`). |
| `instructions` text | A change in `render` shows with no hand-bumped version. |
| `schema` = `z.toJSONSchema(set.schema, {io: 'input'})` | The real compiled Zod, so a change in `toZod` shows. Verified (ran): two calls give equal text. |
| `checks`: `[{ref, check, parsed params, targets, behaviour}]` sorted by ref | `behaviour` = sha256 of what `verify` returns and `render` prints over the check's `vectors`. A change in `verify` that a vector exercises changes the hash. |
| `judges`: `[{ref, binding, question, policy, targets}]` and the judge prompt template | A new judge question or template changes the hash. |

Left out on purpose: node id, path, run id, time, file path, the ledger. The artefacts are a function of (stage, enforced rules), so two nodes with the same enforced rules share one hash and one set of artefacts, and that is correct. Every list has a total order. No `Map` or `Set` order reaches the hash. Check params have no defaults, so authored params equal parsed params (tested: `parse(p)` deep-equals `p`).

### Hazards: mechanism and the test that fails when it breaks

Tests live in `tests/compiler/`. Each test name starts with a short name of its hazard (`noop`, `drift`, `weaken`, `hash`, `status`, `admit`, `verify`, `params`, `shape`, `judge`). Fails when says what a mutation of the mechanism does.

| Hazard | Mechanism | Test and what breaks it |
|---|---|---|
| Silent no-op scope | `reach`: each active rule needs a real node, owner in ancestry, and a stage that runs at those levels. `resolvePath` on the `FieldTree` for every target of every enforced rule. A stage with no shape rule is refused. | `noop.field_typo` (`criteria[].attribute[]` gives `field_unresolved`), `noop.node_typo` (`skincar` gives `node_unknown`), `noop.stage_not_at_level` (`create_pack` on a domain gives `scope_reaches_nothing`), `noop.no_shape`. Fails when the `resolvePath` call or the reach test is removed. |
| Prompt and check drift | `params` is one parsed object. `render`, `verify`, `fits`, `implies`, the hash and the scorer take that object. A shape node feeds `toZod`, `describeNode` and the scorer. | `drift.unit_change_moves_all`: change the enum `[mg,g,mcg]` to `[mg,g,kg]`. The instruction loses `mcg` and gains `kg`, the check accepts `kg` and rejects `mcg`, the schema agrees, the hash changes. Same test for `one_of`. `drift.every_param_literal_is_rendered` runs over `CHECKS`. Fails when any consumer reads a copy. |
| Weakening by a child | `weakens` with `implies`, ownership test, `fits`. | `weaken.bigger_enum`, `weaken.lower_min`, `weaken.watch_over_strict`, `weaken.owner_not_ancestor`, `weaken.one_of_outside_shape_enum`, each refused. `weaken.stricter_child_accepted` (min 2 over min 1, `strict` over `soft`) proves it is not "refuse all". `weaken.implies_is_sound` over vectors. |
| Hash leak | Hash of the artefacts, not of the inputs. Total order everywhere. No node id. | `hash.library_order` (shuffle 20 times, same hash). `hash.key_order` (reverse key order in params and shape). `hash.two_nodes_same_rules_same_hash`. `hash.param_stage_status_change_the_hash`. `hash.render_change`: a cloned registry whose `render` adds a character gives another hash. `hash.verify_change`: a cloned registry whose `verify` flips on a vector gives another hash. `hash.fixture_hash_snapshot`. |
| Status leak | `selectVersions` and the `ledger`. Live mode takes active rules only. Trial mode adds named drafts clamped to `watch`. | `status.draft_retired_not_enforced`. `status.ledger_is_a_partition`: `enforced + trial + excluded` equals the pool, each ref once, over a generated pool. `status.trial_clamps_to_watch`. `status.trial_ref_unknown`. `status.trial_shape_draft_refused`. `status.highest_active_version_wins` (derived v1 active, v2 draft: v1 enforced, v2 in the ledger as `draft`). |
| Unlocked or invalid rules | `AdmittedPool` brand. `admitRules` refuses a library with any problem. A derived row is re-parsed, re-hashed, and compared with its own `id`, `version`, `owner`, `hash` columns. | `admit.library_problem_refused`, `admit.derived_hash_mismatch`, `admit.derived_column_mismatch`, `admit.derived_same_checks` (a derived rule with an unknown check is refused like a file), `admit.id_collision`. `tests/compiler/types.test.ts`: `compile(rawRules)` under `@ts-expect-error`. Fails when the brand is removed, because tsc reports the unused directive. |
| Determinism | `Outcome` has no number and no choice. `runCheck` withholds a call without evidence. Registry vectors must include pass and fail, and `cannot_verify` when `needs` is not empty. | `verify.outcome_has_no_grade` (`@ts-expect-error`). `verify.missing_evidence_cannot_verify` (the `verify` spy is not called). `verify.throw_is_cannot_verify`. `verify.score_zero_on_cannot_verify`. `verify.conformance` over `CHECKS`: a value of the wrong type never passes. |
| Unknown check or bad params | `admitRules` looks up the name and parses `params` with the check's strict schema. `fits` and `on` test the target at compile. `rules:check` runs `admitRules`. | `params.unknown_check`, `params.params_invalid`, `params.extra_param_key`, `params.check_on_wrong_kind` (`min_items` on a text field), `params.rules_check_exits_1`. |
| Conflicting shape rules | One claim per path in `composeFields`. | `shape.incompatible_types` (text and enum at one path), `shape.same_type_still_conflicts`, `shape.nested_over_declared_property`, `shape.parent_missing`. |
| Judge scorers need a model | `compile` has no model parameter and builds no judge scorer. `JudgeSpec` is data. | `judge.compile_with_fetch_stubbed_to_throw`. `judge.judges_are_json` (round-trips through `JSON.stringify`). `judge.code_scorers_have_no_judge`. `judge.judge_scorers_build_without_a_call` (fake model, stubbed fetch, zero calls). |

The three tests that `plan.compiler` names are in the table: weakening (`weaken.*`), a shared parameter moving both instruction and check (`drift.unit_change_moves_all`), and a compiled schema that rejects a bad output (`schema.rejects_bad_output`, in `golden.test.ts`: extra key, wrong enum value, missing field).

Two more tests guard the design itself. `boundary.test.ts` reads `src/**/*.ts` and fails when a file outside `src/compiler/` imports anything under it except `index.ts`. `registry.conformance.test.ts` runs the checks above for each entry of `CHECKS`.

### Module map

| File | Owns | Reads |
|---|---|---|
| `src/rules/shape.ts` (new) | `Shape` | none |
| `src/rules/schema.ts` (edit) | `params`, `shape`, three superRefine lines, `STAGE_LEVELS`, type aliases `Stage`, `Binding`, `NodeLevel`, `RuleKind` | `shape.ts` |
| `src/rules/hash.ts` (edit) | `params` and `shape` inside `ruleHash` | none |
| `src/rules/cli.ts` (edit) | `rules:check` calls `admitRules` | compiler |
| `src/store/store.ts` (edit, reads only) | `allNodes()`, `derivedRuleRows()` | none |
| `src/compiler/index.ts` | The public surface. Re-exports. Nothing else. | below |
| `src/compiler/compile.ts` | `createCompiler`: the pipeline above | all below |
| `src/compiler/admit.ts` | Admission, brands, parameter parse | `checks/` |
| `src/compiler/resolve.ts` | `TreeSnapshot`, reach, version select, ledger, `weakens` | `checks/` |
| `src/compiler/fields.ts` | `FieldTree`, `composeFields`, `resolvePath`, `toZod`, `describeNode` | `shape.ts` |
| `src/compiler/render.ts` | Instructions | `fields.ts` |
| `src/compiler/scorers.ts` | Code scorers, judge specs, judge scorers, `readFindings` | `checks/`, Mastra |
| `src/compiler/golden.ts` | `goldenCheck` | `checks/`, `fields.ts` |
| `src/compiler/hash.ts` | `ruleSetHash` | `canonicalize` |
| `src/compiler/checks/define.ts` | `Evidence`, `Outcome`, `CheckDef`, `defineCheck`, `runCheck` | none |
| `src/compiler/checks/registry.ts` | `CHECKS`, the one list. `CheckName` and `CheckCall` derive from it. | one file per check |

A caller reaches any leaf in three hops: caller, `index.ts`, `compile.ts`, leaf. Only `compile.ts` knows the order of the steps.

### Interface depth

The public surface is five functions (`admitRules`, `compile`, `compileAll`, `goldenCheck`, `judgeScorers`), `treeOf`, `readFindings`, `createCompiler`, and the read-only `CHECKS`. It hides reach, ancestry, version selection, weakening, shape composition, Zod and JSON Schema, rendering, evidence gating, hashing and Mastra scorer construction. A caller never sequences steps. The exposed parts are the ones that a caller needs: refs, bindings, `Finding`, and the ledger. No wire or storage type is public. `StoredRuleRow` is the three columns the compiler reads, not the Drizzle row.

Principles in play: encode-lessons-in-structure (brands, `Outcome`, `CheckCall`), boundary-discipline (four parse points: YAML file, store row, tree rows, model output), laziness-protocol (one list per fact: `CHECKS`, `STAGE_LEVELS`, `Shape`), make-operations-idempotent (all pure, `compileAll` twice gives equal sets).

## Synthesis decision

Filled in by arena.

## Tradeoffs accepted

- We accept one owner per shape field in exchange for no merge algorithm. A child cannot narrow the decoder schema. It narrows with a check, and a miss costs a repair round.
- We accept that an active rule naming a node that does not exist blocks every compile, in exchange for no silent no-op. The author uses `draft` until the node exists.
- We accept a whole-pool test on every `compile`, in exchange for one place where scope errors surface. The cost is small and pure.
- We accept `watch` rules that the drafter never reads, in exchange for a trial that does not change the behavior it measures.
- We accept no defaults in `params`, in exchange for authored equals parsed, so one meaning has one hash.
- We accept that Shape has no bounds and no list type, in exchange for one way to state each. A bound is a check.
- We accept a lossy numeric score, in exchange for Mastra tooling that works. The verdict is read from `analyzeStepResult`.
- We accept that the hash covers `verify` only as far as the check vectors reach. The conformance test requires vectors for every branch.
- We accept that a shape rule must be `strict`. A `watch` shape would be a lie, because the decoder enforces it.

## Alternatives considered

- **Shapes as JSON Schema fragments, composed with `allOf`, loaded with `z.fromJSONSchema`.** Gives a known authoring language. Hides complexity from nobody: the composition rules, the closed-object problem, and `implies` all stay ours. Probe (ran): `fromJSONSchema` of two closed objects joined by `allOf` accepts `{a, b}`, which JSON Schema rejects. Lost.
- **Cascade: the nearest node wins, as in ESLint or CSS.** Simplest to write. It makes weakening the feature, so it contradicts `graph.scope` and the decision of 2026-10-24. Lost.
- **Meet-merge of overlapping shapes.** A child could narrow an enum in the decoder. It needs a subtype test for every shape pair, and the prompt then describes a merge that no single rule states. The interface is the same, the callee is bigger. Lost for now, listed in Open questions.
- **`params: unknown` checked inside each scorer at run time.** Smallest compile step. The misfit surfaces late, in a paid run. Lost.
- **A hand-bumped `COMPILER_VERSION` in the hash.** Cheap. Forgotten on the first renderer edit. Lost to artefact-derived hashing plus the behaviour digest.
- **Hash of rule ids, versions and record hashes only.** Misses every compiler change. Lost.
- **Two record kinds, template and constraint, as in Gatekeeper.** Doubles the authoring surface. Our templates are code, so the registry is the template. Lost, but the parameter split is adopted.

## Implementation reconciliation

None yet. No implementation exists.

## Open questions and risks

- **`scope.future_node`.** Should an active rule that names a node not yet in the tree block every compile (my choice), or only `compileAll` in CI? Blocking forces `draft` first. Does Rohan accept that order for rule PRs and node creation?
- **`render.watch_hidden`.** Should `watch` rules be printed in the instruction? I chose no. A trial then measures a rule the drafter never saw.
- **`status.draft_shadows_active`.** A draft version 2 on `main` hides an active version 1, because the library keeps one file per id. The ledger traces it. Should `admitRules` refuse a draft with `version > 1` instead?
- **`shape.owner_exclusive`.** Is one owner per shape field acceptable, or does a child node need to narrow the decoder schema?
- **`weaken.judgement_rules`.** Weakening of judgement rules is not detectable. Is Rohan's PR approval enough, or must a child judgement rule name the inherited rule it refines?
- **`hash.vector_coverage`.** `vectors` cover `verify` only as far as they reach. Is the behaviour digest enough, or should a check also declare a hand-bumped `revision` that CI compares with the digest?
- **`evidence.owner`.** `Evidence` has two keys now (`source_text`, `registered_record_ids`). `plan.judge_step` and the stage units will add more. Who owns the list?
- **`store.reads`.** `allNodes` and `derivedRuleRows` belong to `plan.graph_store`. Do they go in this unit's PR?
- **`stage.levels`.** `STAGE_LEVELS.evaluate_product` is inferred (leaf). Confirm.
- **`decisions.rows`.** Needs rows in `decisions.tsv` for: `params` and `shape` on the record, shape rules must be strict, the definition of weaken, and the hash inputs.
- **Risk `paths.no_index`.** The field-path grammar cannot address one list element or a map key. A rule over `criteria[3]` is out of reach by design.

## Next implementation step

Add `Shape`, the `shape` and `params` fields, the three superRefine lines and `STAGE_LEVELS` to `src/rules/`, extend `ruleHash`, and write the red tests `params.*` and `shape.*` against fixtures, because every later part reads the record.
