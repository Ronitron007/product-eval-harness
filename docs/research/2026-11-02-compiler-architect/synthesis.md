# plan.compiler synthesis decision (orchestrator, 2026-11-02)

Base: **runner-opus** (`runner-opus/design.md`, `runner-opus/sketch.ts`). Grafts from **runner-sonnet** (`runner-sonnet/design.md`, `runner-sonnet/sketch.ts`) are listed below. Each line is a decision that Claude took in Rohan's style; each one becomes a row in `docs/decisions.tsv` (who: Claude, 2026-11-02, from the architect synthesis).

## Kept from opus (the base)
- O1. Public surface: `compileStage(input) -> {ok, plan} | {ok:false, problems}` and `auditLibrary(...)`. One call per compile. Internals unreachable from outside `src/compiler/` (a boundary test).
- O2. `RuleRecord` becomes a Zod discriminated union on `kind`: `shape` carries `shape: Shape`, `code_check` carries `check: {name, params}`, `judgement` carries `judge`. The superRefine kind checks become unrepresentable states.
- O3. Anchored scopes: `scope.nodes` is `'owner' | 'subtree' | {level}`, relative to the owner. No node id in a scope, so a rule cannot reach a parent or a sibling. Reserved virtual owner `all` for cross-domain stage rules (`rules/all/`); the store refuses a node with id `all`.
- O4. Closed shape IR: `text {values?, min_length?, max_length?}`, `number {min?, max?, integer?}`, `flag`, `list {min_items?, max_items?, unique?}`. Containers come from the path syntax. No refinement escape hatch. `printSchema` emits only constructs that `z.toJSONSchema` represents in full.
- O5. One strictness order table per parameter (`identity`, `higher_is_stricter`, `lower_is_stricter`, `subset_is_stricter`, `superset_is_stricter`, `true_is_stricter`) drives both the meet (schema composition) and the looser test (weaken).
- O6. Conjunction: every inherited rule always applies; a child never overrides. Weaken = a child (deeper owner) restates an inherited slot more loosely on a dimension both set, or with a lower binding. A dimension only the child sets is an addition. Same slot = same shape type on the same field, or same check name with equal identity params on the same field.
- O7. Shape composition is the meet per path of the strict shape rules, over a trie. Conflicts (two leaf types, leaf vs container, empty meet, list with no item rule) fail at compile time, naming both rules. A stage with no shape rule is refused.
- O8. Check registry, Gatekeeper style: `CheckTemplate {name, version, fact, target, params, order, needs, render, literals, requires, check}`. `order` typed per param key so params and order cannot disagree. `CheckOutcome`: `pass` must carry `observed`, `fail` must carry `fix`; no number, grade or match is expressible. Closed `FactKind`: substring, membership (exact only), reference, uniqueness. First templates: `quote_in_source`, `key_in_registry`, `record_exists`, `unique_by`.
- O9. Typed `RunEvidence {sources?, attribute_keys?, record_ids?}`, also the type of `Example.input`.
- O10. Admission: `admit()` makes a branded `Admitted` value; a library with any problem is refused; derived rows are re-parsed and re-hashed, compared with their columns; derived `kind: shape` is refused (decisions row: only Rohan changes an output shape); a derived id equal to a stage rule id is refused.
- O11. Total ledger: one entry per input rule version with a disposition (`applied`, `draft`, `retired`, `superseded`, `owner_not_on_path`, `stage_not_named`, `selector_misses_node`, ...).
- O12. Scorer policy no template can bypass: absent field -> shape rule `fail`, other rules `cannot_verify`; existing empty list -> `pass` with `observed: []`; missing `needs` evidence -> `cannot_verify` before the check runs; a throw -> `cannot_verify`. Judge: yes/no/unknown -> pass/fail/cannot_verify; missing target or model error -> `cannot_verify`.
- O13. Judge scorers exist only through `plan.scorers.judges(model)`; compile takes no model. Vitest `setupFiles` stubs `fetch` to throw; judge tests use `createMockModel` from `@mastra/core/test-utils/llm-mock`.
- O14. Rule-set hash = sha256(RFC 8785(manifest)); the manifest is the compiled artifacts: format, `code.runtime` + `code.checks` versions, exact `zod` and `@mastra/core` pins, stage, applied rules (id, version, ruleHash, effective binding, origin), `z.toJSONSchema(schema)`, the full instruction text, the scorer specs (with the judge prompt hash). Node id is NOT in the hash (two nodes with the same artifacts share a hash; `stage_runs.node_id` keeps them apart).
- O15. Code versions pinned by `src/compiler/code.lock.json` (grows only): each declared version maps to a fingerprint of its source; a test fails when a fingerprint moved under an unchanged version. Template files may import only `zod` and `./define` (a test greps).
- O16. Literal lint: a statement or reason that contains a parameter literal as a whole word is a loader problem, so the only copy of a parameter is the params object.
- O17. Watch rules never print and never shape the schema. Judge questions never print.
- O18. Trial: `compileStage({..., trial: candidate})` compiles the candidate as watch (scorer only). Its hash differs from the live plan's.
- O19. The workflow recompiles per step and compares the hash with the run's hash; a mismatch refuses (detects a rule change mid-run; nothing non-serializable in a snapshot).

## Grafted from sonnet
- S1. **Shape rules must be `strict`.** The decoder enforces a shape, so a soft or watch shape rule is a lie. This replaces opus's "only strict shape rules shape the schema; soft/watch shape rules compile to checks". One way to do one task. Binding-weaken therefore only applies to check rules.
- S2. **`check.implies` soundness test over vectors**: each template ships test vectors (pass, fail, and cannot_verify when `needs` is not empty); a conformance test runs over `CHECKS`: for every pair of vector params where the order table says a is stricter than b, every item that passes a also passes b. Vectors are tests, not hash inputs (opus's code.lock fingerprint is the hash mechanism).
- S3. **Unknown owner blocks compile**: an `active` rule whose owner node is not in the tree (and is not `all`) is a compile problem everywhere, not a silent dormant rule. The author keeps it `draft` until the node exists. `auditLibrary` reports it too.
- S4. **A draft may not shadow an active rule in git**: the library keeps one file per id, so a `draft` file with `version > 1` would silently drop the active version. `admit()` refuses a draft with version > 1 in `rules/`. A candidate version enters only as `trial` input to `compileStage` (from the PR branch), never as a file on main.
- S5. **`fits`**: a check whose target kind does not fit the field kind at its path (e.g. `unique_by` on a text field) fails at compile time (`check_on_wrong_kind`).
- S6. Ledger is a partition: applied + trial + excluded equals the input, each ref once (a generated-pool test).
- S7. Test names start with the hazard name (`noop`, `drift`, `weaken`, `hash`, `status`, `admit`, `verify`, `params`, `shape`, `judge`), so a reader maps each test to its hazard.
- S8. Check `params` have no defaults: authored equals parsed (tested), so one meaning has one hash.

## Rejected
- Sonnet's one-owner-per-field shape composition: a child could only narrow via checks, so the decoder schema and the instruction would show the wide shape while a check enforces the narrow one (drift between prompt and check). The meet keeps one composed shape that prints and decodes.
- Sonnet's behaviour digest in the hash: covers only what vectors reach; the source fingerprint lock covers all code of a template.
- JSON Schema as the shape language (both runners rejected it; sonnet's probe showed `z.fromJSONSchema` of `allOf` of two closed objects accepts `{a,b}`).
- Override cascades (ESLint/CSS) (both rejected).

## Known limits (stay in the spec as risks)
- A child judgement rule cannot be compared with a parent judgement rule; Rohan's PR approval is the guard.
- Types limit what a check returns, not what it does inside; a fuzzy `membership` is a matcher. Closed `FactKind` + review under `rules.harness` + RealDose invariant are the guards.
- Providers may reject `minItems > 1` or numeric limits in structured output; the code scorers re-check every constraint after decoding.
