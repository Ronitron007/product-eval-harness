# plan.compiler: candidate design (runner-opus)

Base: product-eval-harness `803301a`. Sketch: `sketch.ts` (type-checks against the repo's `node_modules`: `tsc -p probes/tsconfig.json` exit 0; `probes/neg.ts` proves three illegal templates fail the build). Research: `research.md`.

Core idea in one line: **shape is data, checks are typed code, judgement is text — and one order table per parameter decides both how rules compose and what "weaken" means.** Scopes are anchored at their owner, every inherited rule always applies (conjunction, never override), and the rule-set hash is the hash of the compiled artifacts themselves.

## Problem

The compiler turns the rules in scope of one stage run into a Zod output schema, an instruction text, one scorer per rule, and a hash for `stage_runs.rule_set_hash`. Today `RuleRecord` cannot say what shape a `shape` rule imposes, a `code_check` names a function but cannot pass it parameters, no check registry exists, and "weaken" is prose (`graph.scope`). `rules/` and the lock are empty, so the record can change with no migration. Constraints that cross into this unit: `loadRuleLibrary` never throws and reports all problems in one round; `ruleHash` and `rules.lock.json` define rule identity; derived rules live append-only in `harness.derived_rules`; Mastra 1.79.0 binds a judge model when a scorer is created (`ScorerJudgeConfig.model`, no per-run function); `z.toJSONSchema` drops `.refine()` in silence (verified, `probes/zod-probe.mjs`); deterministic code may verify, never grade or match (`rules.harness`).

## Usage (caller's view)

```ts
import { compileStage, auditLibrary } from '../compiler'

const compiled = compileStage({ stage: 'create_node', node: 'sunscreen', library: loadRuleLibrary('rules'), derived: await store.derivedRules(), tree: await store.tree() })
if (!compiled.ok) return bail({ refused: compiled.problems })        // before any model call; all problems in one round
const { plan } = compiled
await store.recordStageRun({ runId, stage: plan.stage, nodeId: plan.node, ruleSetHash: plan.ruleSetHash })
await drafter.generate(prompt, { structuredOutput: { schema: plan.schema }, instructions: plan.instructions })
for (const s of plan.scorers.code) rows.push(...await s.verify(draft, evidence))            // free, offline
for (const s of plan.scorers.judges(judgeModel)) rows.push(...await s.verify(draft, evidence)) // the only door for a model
await store.writeVerdicts(rows.map(r => ({ ...r, runId })))          // ItemVerdict = VerdictInput minus runId
```

Three call sites, all type-checked in the usage section of `sketch.ts`:

| Call site | Call | Note |
|---|---|---|
| Stage workflow (`planFor`, `contextStep`, `judgeStep`) | `compileStage(...)` in each step that needs the plan | Compile is pure and cheap. A step recompiles and refuses a hash that differs from the run's, so nothing un-serializable sits in a workflow snapshot, and a resume after a rule change re-runs. |
| CI golden gate (`rulesCheck`, inside `npm run rules:check`) | `auditLibrary({ library, derived: [], tree: 'unknown' })` | Offline. Runs the golden examples of every shape and code_check rule through the real scorer path, plus tree-free scope checks. |
| Change trial (`trialPlan`, for `plan.change_process`) | `compileStage({ ..., trial: candidate })` | The candidate compiles as watch: a scorer only, no schema part, no instruction. Its hash differs from the live plan's. |

A rule file, as an author writes it:

```yaml
# rules/skincare/units.label_unit.yaml
id: units.label_unit
version: 1
kind: shape
shape: { type: text, values: [mg, mcg, g] }        # the compiler prints these; the statement must not
statement: Write the amount in the unit that the label prints.
reason: A grade must rest on what the label states.
scope: { nodes: subtree, stages: [create_node], fields: ['criteria[].attributes[].unit'] }
binding: strict
examples: [{ output: mg, expected: pass }, { output: IU, expected: fail, note: IU is not a mass unit. }]
provenance: { decision_row: '...' }
owner: skincare
status: active
```

A code check names a registry template with typed params: `kind: code_check`, `check: { name: quote_in_source, params: { source: label, case_sensitive: true } }`.

## Shape

### Data first

| Type | Where | Load-bearing decision |
|---|---|---|
| `RuleRecord` | `src/rules/schema.ts` | A Zod `discriminatedUnion` on `kind`: `shape` carries `shape: Shape`, `code_check` carries `check: CheckRef`, `judgement` carries `judge`. The old superRefine kind checks become unrepresentable states. |
| `RuleScope.nodes` | same | `'owner' \| 'subtree' \| { level }`, **relative to the owner**. No node id appears in a scope, so a rule cannot reach a parent or a sibling. `owner: all` is a reserved virtual root for cross-domain rules (`rules/all/`). |
| `Shape` | same | A closed IR: `text {values?, min_length?, max_length?}`, `number {min?, max?, integer?}`, `flag`, `list {min_items?, max_items?, unique?}`. No refinement escape hatch. Containers come from the path syntax (`a.b` → object, `a[]` → list). |
| `CheckRef` | `src/rules/checks/index.ts` | `discriminatedUnion('name', CHECKS.map(t => {name: literal, params: t.params}))`. Unknown name → loader problem at `check.name`; bad params → at `check.params.<key>` (verified, `probes/record-probe.ts`). |
| `CheckTemplate` | `src/rules/checks/define.ts` | `{ name, version, fact, target, params, order, needs, render, literals, requires, check }`. `order` is typed `{ [K in keyof Params]-?: DimensionOrder }`, so params and order cannot disagree (build fails). `check` returns `CheckOutcome`: `pass` must carry `observed`, `fail` must carry `fix`; no number, grade or match is expressible. `fact` is a closed enum: substring, membership, reference, uniqueness. |
| `DimensionOrder` | `src/rules/strictness.ts` | `identity`, `higher_is_stricter`, `lower_is_stricter`, `subset_is_stricter`, `superset_is_stricter`, `true_is_stricter`. **One table drives both** the meet (schema composition) and the looser test (weaken). |
| `RunEvidence` | `define.ts` | `{ sources?, attribute_keys?, record_ids? }`. Also the type of `Example.input`, so golden inputs are validated at load. |
| `Admitted` | `src/compiler/scope.ts` | A branded value that only `admit()` makes. Compile code cannot receive an unchecked rule. |
| `StagePlan` | `src/compiler/index.ts` | `{ stage, node, ruleSetHash, schema, instructions, scorers: { code, judges(model) }, ledger, manifest }`. |
| `Manifest` | same | Exactly what the hash covers (below). |

### Flow inside `compileStage` (pure, sync)

`admit` (library zero problems; derived rows re-parsed and re-hashed) → `resolve` (anchored scope, one ledger entry per input rule version) → `weakenings` → `composeShapes` (strict shape rules → trie, meet per path) → every applied field must resolve in the trie with a compatible kind → `printSchema`, `renderInstructions`, `codeScorer`s, `judgePrompt`s → `manifest` → `ruleSetHash = sha256(RFC 8785(manifest))`. Any problem returns `{ ok: false, problems }` with all problems.

### Scope resolution

A rule applies at (node N, stage S) when: its status is active (or it is the trial), its owner is on N's path to the root or is `all`, S is in `scope.stages`, and the selector matches (`owner`: N is the owner; `subtree`: always; `{level}`: N has that level). N's level must be in `STAGE_LEVELS[S]` (`define_criteria` at domain, `create_node` at inner and leaf, the rest at leaf). Every other rule gets a ledger reason: `draft`, `retired`, `superseded` (older derived versions), `owner_not_on_path`, `stage_not_named`, `selector_misses_node`.

### Definition of "weaken" (`compile.weaken`)

Every inherited rule keeps applying (conjunction), so a child can never relax enforcement by overriding. What a child can do is **restate an inherited slot more loosely**, which contradicts the prompt and invites the reader to think it overrides. That is the refused case.

Child rule B **weakens** inherited rule A when A's owner is a strict ancestor of B's owner (or `all`), both apply at the compiled (node, stage), they share a field, and they share a **slot**:

- shape slot: both `kind: shape` with the same `shape.type`;

- check slot: both `kind: code_check` with the same `check.name` and equal `identity` params;

and at least one holds:

- some dimension set in **both** is looser in B by the order table (bigger value set, lower `min`, higher `max`, `false` where A has `true`);

- B's binding is lower (strict > soft > watch).

A dimension that only B sets is an addition (allowed). A dimension that only A sets is inherited (still applies). Judgement rules never share a slot, so they can only add. A rule owned outside N's path cannot apply at N at all (anchored scopes), which closes the "foreign owner" half of the hazard by construction.

### Schema composition

Only **strict** shape rules shape the decoding schema: per path, the meet of their params (same table). Soft and watch shape rules compile to checks only, and their field must exist with the same type. Every key is required and every object strict ("the model fills only those fields"); keys and enum values are sorted by code unit. `printSchema` emits only constructs that `z.toJSONSchema` represents in full. Conflicts fail at compile time: two leaf types on one path, leaf vs object vs list on one path, empty meet (disjoint values, `min > max`), a list shape with no item rule. A stage with no strict shape rule is refused.

### Instruction rendering

Fields sorted by path. Per field: the composed shape line from the same trie that prints the schema (`describe`), then its strict and soft rules (strict first, then id): statement, reason, the template's `render(params)` line for a code check, `Should be: describe(shape)` for a soft shape rule, and the examples as canonical JSON. **Watch rules never print and never shape the schema** ("nothing else happens"; an editor's watch rule cannot steer drafts without the promotion gate). A load-time lint refuses a statement or reason that contains a parameter literal as a whole word (`shape.values`, `template.literals(params)`), so the only copy of a parameter is the params object.

### Scorers

One Mastra scorer per applied rule, id `rule.id@version` (verified that `.` and `@` are accepted). `codeScorer` (shape and code_check): function steps only; `preprocess` = `targets(output, field)`, `analyze` = per-target outcome under a fixed policy, `generateScore` = 1 when every item passes. The policy that no template can bypass: absent field → shape rule `fail`, other rules `cannot_verify`; an existing empty list → `pass` with `observed: []`; a missing `needs` evidence key → `cannot_verify`; a throwing check → `cannot_verify`. `judgeScorer`: prompt-object `analyze` with the static `judgePrompt` (hashed at compile time) plus the run part (targets and the full source texts); yes → pass, no → fail, unknown or missing target or a judge error → `cannot_verify`. `RuleScorer.verify(output, evidence)` returns `ItemVerdict[]` (store rows minus `runId`) and never throws; `RuleScorer.scorer` is the raw Mastra scorer for `runEvals` and experiments.

### The rule-set hash

`ruleSetHash = sha256(canonicalize(manifest))`, where `manifest` is:

| Field | Covers |
|---|---|
| `format: 1` | the manifest layout |
| `code.runtime` | `RUNTIME_VERSION` of `paths.ts` + `scorers.ts` + `checks/define.ts` (the walker, the outcome policy, the judge run part) |
| `code.checks` | `{ name: version }` of each template in use |
| `code.deps` | exact pins of `zod` and `@mastra/core` from `package.json` |
| `stage` | the stage |
| `rules` | applied rules, sorted by id: id, version, `ruleHash`, effective binding, origin (git, store, trial) |
| `schema` | `z.toJSONSchema(plan.schema)` |
| `instructions` | the full text |
| `scorers` | sorted by id: id, decider, fields, `shape` or `check {name, params}` or `judgePromptHash` |

The hash is computed **from the artifacts, not from a list of inputs**, so any input that changes an artifact (rule order, node, stage, status filter, a compiler data change) changes the hash, and identical artifacts give one hash. Two nodes with the same rule set share a hash; `stage_runs.node_id` keeps them apart. Code that is not data is pinned by declared versions, and `src/compiler/code.lock.json` (only grows, like `rules.lock.json`) maps each version to a fingerprint of its transpiled source; a test fails when a fingerprint moved under an unchanged version. Template files may import only `zod` and `./define` (a test greps), so the fingerprint covers all of their behavior. The runtime hash never reads source text, so `tsx` and a `mastra build` bundle compute the same hash.

### Interface depth

Public: `compileStage`, `auditLibrary`, `StagePlan`, `RuleScorer.verify`, `JudgeModel`, and their types. Hidden: admission and re-hashing of derived rules, the tree index, anchoring, weaken, the meet, the trie and printer, instruction layout, scorer wiring, the cannot-verify policy, the judge prompt, the manifest and hash. A caller never coordinates two calls for one compile. Internals sit beside `index.ts`; a test fails when any file outside `src/compiler/` imports one (`Importable internals`).

### Hazards, mechanisms, and the test that fails if the mechanism breaks

| Hazard | Mechanism | Test that fails if it breaks |
|---|---|---|
| `silent_scope` | Every field of every applied rule must resolve in the composed trie with a compatible kind; `requires()` paths too (`unique_by.by`); no strict shape rule → refused; never-zero `targets()`; ledger lists every rule's disposition; `auditLibrary` with a tree reports `dormant`; CI tree-free typo guard | `compileStage` refuses a code_check on `criteria[].atributes[]` with `field_unresolved`; refuses `unique_by {by: nmae}`; refuses a stage with no strict shape rule (`no_output_fields`); `auditLibrary` reports a rule owned by an absent node as `dormant`; `rules:check` refuses a field no strict shape rule of that stage defines |
| `drift` | Params live once; `render`, `describe`, `check`, `printShape` all read them; literal lint at load | Changing `shape.values` from `[mg, mcg]` to `[mg]` changes `plan.instructions` and flips `verify` on `mcg` from pass to fail; same for `quote_in_source.case_sensitive`; a statement containing `mg` with `values: [mg]` is a loader problem |
| `weaken` | `compile.weaken` above; anchored scopes | At `sunscreen`: child `values [mg, mcg, IU]` refused, child binding `watch` on the slot refused, child `number.min` lower refused, child adding `min_length` accepted; at `skincare` the same library compiles; a rule owned by `sunscreen` has ledger `owner_not_on_path` at `skincare` and at sibling `moisturizer` |
| `hash_leak` | Content-addressed manifest; sorted everything; declared code versions + `code.lock.json` | Same inputs twice and seeded shuffles of library, derived, and tree give one hash; binding, params, statement, stage, trial each change it; adding a draft does not; a pinned hash literal for a fixture library; the lock test; `z.fromJSONSchema(manifest.schema)` agrees with `plan.schema` on every golden example (catches a refine that the hash cannot see) |
| `status_leak` | Total ledger; the trial is the only door for a non-active rule, forced to watch | Ledger length equals the input rule-version count; applied ids = scorer ids = `manifest.rules` ids; draft and retired never applied; derived v1 is `superseded` by v2; a retired v3 drops the rule with ledger `retired` |
| `invalid_rules` | `admit()` and the `Admitted` brand; derived rows re-parsed and re-hashed | A library with a lock problem → `library_invalid`; an edited derived record → `derived_hash_mismatch`; bad derived params → `derived_invalid`; a derived id equal to a stage rule id → `id_collision` |
| `determinism` | `CheckOutcome` has no score or match and `pass` needs `observed`; closed `FactKind`; the outcome policy in `codeScorer` | `@ts-expect-error` lines in a test file (a template returning a score, a pass without `observed`, `fact: 'similarity'`) fail `npm run typecheck` if they start to compile; for every template in `CHECKS`: absent value and empty evidence never give pass; a non-string value to a text check gives `cannot_verify` |
| `unknown_check` | `CheckRef` discriminated union inside `RuleRecord` | Loader reports `check.name` for `min_itemz` and `check.params.by` for a bad key, so `rules:check` exits 1; a derived row with the same faults is `derived_invalid` |
| `shape_conflict` | The meet over `SHAPE_ORDERS`, the trie | text vs number on one path; `[mg]` ⊓ `[g]`; `criteria[]` as text with `criteria[].name`; a list at `x` with no `x[]` rule — each refused, naming both rules |
| `judge_model` | Judge scorers exist only through `plan.scorers.judges(model)`; `vitest.config.ts` `setupFiles` replaces `fetch` with a throwing stub | Compile and code scorers pass under the stub; `judges(createMockModel(...))` (`@mastra/core/test-utils/llm-mock`, verified offline in `probes/judge-probe.mjs`) maps yes/no/unknown, a missing target, and a thrown model error to pass/fail/cannot_verify/cannot_verify/cannot_verify |

### Module map

| File | Status | Owns |
|---|---|---|
| `src/rules/schema.ts` | changed | `RuleRecord` (by kind), anchored `RuleScope`, `Shape`, `SHAPE_ORDERS`, `STAGE_LEVELS`, `OWNER_ALL`, `Example.input`, record-local lint |
| `src/rules/hash.ts` | changed | `ruleHash` adds `shape` and the structured `check` |
| `src/rules/strictness.ts` | new | `DimensionOrder`, `looserDimensions`, `sameIdentity`, `meetParams`, `BINDING_STRENGTH` |
| `src/rules/checks/define.ts` | new | `CheckTemplate`, `defineCheck`, `CheckOutcome`, `FactKind`, `RunEvidence` |
| `src/rules/checks/index.ts` | new | `CHECKS`, `CheckRef`, `checkTemplate` |
| `src/rules/checks/<name>.ts` | new | `quote_in_source`, `key_in_registry`, `record_exists`, `unique_by` |
| `src/rules/cli.ts` | changed | `rules:check` also awaits `auditLibrary(tree: 'unknown')` |
| `src/compiler/index.ts` | new | `compileStage`, `auditLibrary`, public types, instructions, manifest, hash |
| `src/compiler/scope.ts` | new | `admit`, `indexTree`, `resolve`, ledger, `weakenings` |
| `src/compiler/shape.ts` | new | `composeShapes`, `lookup`, `printSchema`, `printShape`, `describe` |
| `src/compiler/paths.ts` | new | `parsePath`, `targets`, `embed` |
| `src/compiler/scorers.ts` | new | `codeScorer`, `judgeScorer`, `judgePrompt`, outcome policy, `RUNTIME_VERSION` |
| `src/compiler/code.lock.json` | new | runtime and template version fingerprints |
| `scripts/compiler-lock.ts` | new | `npm run compiler:lock` (adds new versions; never rewrites one) |
| `src/store/store.ts` | changed | `tree()`, `derivedRules()`, refuse node id `all` |
| `vitest.config.ts` | new | `setupFiles: tests/setup/no-network.ts` |

Longest chain: workflow → `compiler/index.ts` → `scope.ts` / `shape.ts` / `scorers.ts` → `rules/checks`.

## Synthesis decision

*Filled in by arena.*

## Tradeoffs accepted

- We accept that an existing empty list gives a vacuous `pass` (with `observed: []`) in exchange for not sending every run with no additions to a person. A list that must not be empty needs a `list { min_items: 1 }` shape rule.

- We accept that watch rules are invisible to the drafter in exchange for "watch changes nothing" holding literally, and for the improvement loop being unable to steer drafts with a watch rule.

- We accept a strict "only strict shape rules shape the schema" rule in exchange for decoding never turning a soft rule into a strict one.

- We accept that a Zod or Mastra version bump changes every rule-set hash in exchange for no silent behavior change under one hash.

- We accept that a non-behavioral edit to a template file can force a version bump in exchange for a fingerprint that needs no judgement.

- We accept a partial CI audit (no tree in CI) in exchange for no second copy of the node tree in git (split ownership). The full audit runs where the database is, and every run compile refuses its own problems.

- We accept that the plan is not serializable (Zod schema, scorers, a function) in exchange for recompiling per step and comparing hashes, which also detects a rule change mid-run.

- We accept a word-boundary literal lint that can refuse innocent prose in exchange for one copy of each parameter.

- We accept no optional fields in the shape IR v1 in exchange for a meet and a looser test with no special cases.

## Alternatives considered

- **JSON Schema as the shape language** (`shape: <JSON Schema>`, `allOf`, `z.fromJSONSchema`, `is-json-schema-subset` for weaken). Exposes the full JSON Schema surface to rule authors and hides nothing: refinements vanish from the hash, the converter is experimental, whole-schema subsumption is async (ajv), and it refuses legitimate additions because it compares the child alone against the parent.

- **One registry for shape and code checks** (shape templates flagged `decodable`). Smaller vocabulary, but meet and weaken become per-template code that each author writes, and a shape's schema part would need its own fingerprint. The closed IR makes both one table lookup.

- **Override semantics** (a child rule replaces the parent's on a slot when it is at least as strict). Lets the effective rule set shrink, splits ownership of one slot across nodes, and needs a winner-picking cascade (the ESLint and CSS model this design rejects).

- **Hash over inputs** (rule hashes + node path + stage + compiler version). Every artifact-relevant input must be listed by hand, a hand-synced list that misses the next new input. Hashing the artifacts makes completeness structural.

- **Scopes that name a node** (today's `{node, descendants}`) plus an ancestry check. Keeps a representable illegal state that a check must catch. Anchoring removes it.

## Implementation reconciliation

*Empty until implementation.*

## Open questions and risks

- Should watch rules print in the instructions? Rohan ruled "rules = instructions", and this design reads "watch: nothing else happens" as the stronger rule.

- Should an existing empty list give `pass` (this design) or `cannot_verify`?

- May a derived rule be `kind: shape`? Decisions row 27 says only Rohan changes an output shape, and a derived shape rule would change a later stage's schema from stage output. This design's default: `admit` refuses derived shape rules (`derived_invalid`). Is that right?

- Is `all` acceptable as a reserved node id for cross-domain stage rules?

- Risk, `determinism`: types close what a check can return, not what it does inside. A `membership` check with a fuzzy normalizer is a matcher. Only review under `rules.harness` and the closed `FactKind` stand there.

- Risk: Zod gives "Invalid input" for a bad union member (`scope.nodes` in `probes/record-probe.ts`). The implementation needs custom messages that name the fix.

- Risk: a provider that rejects `minItems > 1` or numeric limits in structured output. Mastra's schema-compat layer was not checked here; the per-rule code scorers re-check every constraint after decoding either way.

## Next implementation step

Change `RuleRecord` (kind union, anchored scope, `Shape`, `CheckRef`) with `strictness.ts`, the check registry, and their loader tests, because every other part of the compiler reads that record.
