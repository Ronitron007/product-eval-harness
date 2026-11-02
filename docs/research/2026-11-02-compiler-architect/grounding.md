# plan.compiler grounding (Phase A)

Repo: product-eval-harness, main at 803301a. Read-only for runners.

## What exists (verified, read)
- `src/rules/schema.ts`: Zod `RuleRecord` (id, version, statement, reason, kind shape|code_check|judgement, scope {nodes: {node, descendants} | {level}, stages[], fields[] FieldPath like `criteria[].attributes[]`}, binding strict|soft|watch, judge {question, policy?} (judgement only), check (code_check only, a snake_case function name), examples[] {input?, output, expected verdict, note?}, provenance, owner NodeId, status draft|active|retired, supersedes = version-1).
- `src/rules/hash.ts`: `ruleHash(rule)` = sha256 of RFC 8785 canonical JSON of statement, reason, kind, scope, binding, judge, check, examples.
- `src/rules/load.ts`: `loadRuleLibrary(root, {baseLock?})` -> {rules: LoadedRule{rule, hash, file}[], problems: RuleProblem{file, field, message}[], lock}. Files live at `rules/<owner node>/<rule id>.yaml`. Problems never throw; the CLI exits 1 on any problem. `rules/` is EMPTY today (only README + empty lock), so the RuleRecord schema can still change without migrating any rule.
- `src/store/store.ts` `createGraphStore(pool)`: nodes (id, parent_id, level domain|inner|leaf, ltree path), `pathToRoot`, `subtree`, `siblings`, `recordStageRun({runId, stage, nodeId, ruleSetHash})`, `acceptOutput`, `writeVerdicts`, `addDerivedRule({rule: RuleRecord, runId})` (derived rules live in `harness.derived_rules`, append-only, with id, version, hash, owner, record JSON). `stage_runs.rule_set_hash` and `outputs.rule_set_hash` are text columns that the compiler's hash must fill.
- Mastra 1.79.0 (`@mastra/core`): `createScorer` (scorers with function steps or a judge model + prompt steps), `structuredOutput: { schema }` on agents (Zod), `RequestContext`.
- zod 4.6.7 (has `z.toJSONSchema`, `z.fromJSONSchema`), canonicalize 5.1.0, yaml 2.9.1, vitest 4.1.12, TypeScript 6.

## The design text the compiler must satisfy (read these files)
- `docs/design/rule-enforcement.md` sections `enforce.compile`, `enforce.verdicts`, `enforce.deciders`, `enforce.binding`.
- `docs/design/rule-graph.md` section `graph.scope` (a child node can add rules, never remove or weaken an inherited one; one owner per rule), `graph.stage`, `graph.traversal`.
- `docs/design/mastra-mapping.md` sections `mastra.compiler`, `mastra.models`, the table of primitives.
- `docs/decisions.tsv` (outranks everything; read rows about rules, scope, compiler, verdicts).
- `docs/plans/2026-10-24-harness-plan.md` row `plan.compiler`.

## The unit (plan.compiler)
Adds: scope resolution with inheritance, the hash of a resolved rule set, the output schema from the `shape` rules, the instruction text, and one scorer for each check rule.
Its failing checks (tests):
- A child rule that weakens an inherited rule must be refused.
- A change to a shared parameter of a rule record, such as an allowed unit, must change both its instruction and its check.
- A compiled schema must reject a bad output.

## Gaps the current code leaves (verified)
- `RuleRecord` has NO machine-readable parameters. A `shape` rule cannot say what shape it imposes, and a `code_check` rule cannot pass parameters (e.g. min 1, allowed units) to its check function. The compiler unit must add this, inside the version hash.
- No code-check function registry exists.
- No definition of "weaken" exists beyond the prose in `graph.scope`.

## Hazards ("leaks") the spec must close. Each needs a mechanism, and a test that fails if the mechanism breaks.
1. Silent no-op scope: a rule whose `scope.fields` path matches no field of the compiled output schema, or whose node selector matches no node, applies nowhere in silence.
2. Prompt/check drift: the instruction text and the check read different copies of a parameter.
3. Weakening by a child: a descendant's rule that widens an inherited constraint (bigger enum, lower min, binding watch over an inherited strict on the same field+check), or a rule owned by a node that is not an ancestor-or-self of its scope node.
4. Hash leak: two compiles that produce different instructions/schemas/scorers but the same rule-set hash (e.g. a compiler code change, rule order, node path, stage, status filter), or the same compiled artefacts with different hashes (non-determinism).
5. Status leak: a draft or retired rule enforced, or an active rule dropped, without trace.
6. Unlocked or invalid rules compiled: the compiler must only compile a library with zero problems, and derived rules from the store must pass the same validation and hash check.
7. Determinism: deterministic code may verify, never grade or match (RealDose invariant: judgement belongs to an LLM). A `code_check` must not be able to issue a grade or a match; a check with no evidence returns `cannot_verify`, never pass.
8. Unknown check name, or params that do not fit the check's parameter schema: must fail at compile time, not at run time.
9. Conflicting shape rules on one field (two rules define the field with incompatible types) must fail at compile time.
10. Judge scorers need a model; tests must make no model call.

## Prior art to check (Look Before You Build)
OPA Gatekeeper ConstraintTemplate + Constraint (code template with a parameter schema; instances supply params), Kyverno policy inheritance, ESLint flat-config cascade, CSS cascade/!important, JSON Schema `allOf` composition, zod `fromJSONSchema`, json-schema-to-zod, AJV, Mastra `createScorer`.
