# plan.compiler: Look Before You Build (runner-opus)

Date 2026-11-02. Repo `product-eval-harness` at `803301a`, read only. No model call, no paid service. Probes live in `probes/` next to this file and ran with plain `node` against the repo's `node_modules`.

Labels: "verified (ran X)", "verified (read X)", "inferred".

## Prior art

| Source | What it does | Adopt / reject | Why |
|---|---|---|---|
| OPA Gatekeeper ConstraintTemplate + Constraint | A template is code (Rego) plus a parameter schema (`spec.crd.spec.validation.openAPIV3Schema`). A Constraint is an instance that supplies `parameters`. The API server rejects bad parameters when the Constraint is created. Under `v1beta1`, a mismatched Constraint was accepted and its parameters were silently dropped. Verified (read gatekeeper docs, constrainttemplates page). | **Adopt the split.** A `code_check` rule = an instance of a check template from a code registry. The template owns a strict Zod params schema. | Matches `enforce.compile` ("one record makes both the instruction and the check"). The `v1beta1` silent-drop story is exactly hazard `unknown check / bad params`: validate params when the rule is *loaded*, not when it runs. |
| Kubernetes ValidatingAdmissionPolicy | Rule (CEL) separate from its binding (Deny/Warn/Audit) and its params resource. Verified (read via `docs/research/2026-10-24-rule-enforcement-prior-art.md`, `rule_prior_art.policy_code`). | Already adopted by the repo (binding field). | No change. |
| Kyverno PolicyException | A namespaced exception can bypass a cluster policy. "There is no correlation between the Namespace in which the PolicyException exists and the Namespace where resources may be excepted." Safeguards are RBAC and review only. Verified (read kyverno.io/docs/exceptions). | **Reject the model.** Use it as the anti-pattern. | It is the exact weakening leak of `graph.scope`: a lower scope that can reach out and relax a higher rule. Our answer: a scope is anchored at its owner, so a rule cannot reach outside its owner's subtree (unrepresentable), and a child never overrides, only adds. |
| ESLint flat config cascade | Later config objects override earlier ones, and a later object can lower a rule's severity (`error` to `warn`). Verified (read eslint.org configuration-files). | **Reject override semantics.** | Severity lowering by a later scope is the "binding watch over inherited strict" leak. We use conjunction (every inherited rule still applies) plus an explicit refusal when a child restates a slot more loosely. |
| CSS cascade and `!important` | Specificity and origin order pick one winning declaration per property. | **Reject.** | "One winner per property" is an override model. We never pick a winner. All rules in scope apply. |
| Claude Code permission precedence | Deny wins across scopes, specificity does not change the order. Verified (read via the repo's prior-art doc, `rule_prior_art.cc_rules`). | **Adopt the spirit.** | Strictness wins: composition is a meet (intersection), never a union. |
| JSON Schema `allOf` | Conjunction of subschemas: a value must satisfy all. | **Adopt the semantics, not the format.** | Our shape composition is `allOf` over a closed shape IR, computed eagerly into one schema (a meet) so that conflicts fail at compile time instead of yielding an unsatisfiable schema. |
| `is-json-schema-subset` (npm, forivall) | Async subset check between two JSON Schemas, built on ajv and json-schema-merge-allof. Verified (read search result + GitHub listing; did not check maintenance). | **Reject.** | Whole-schema subsumption is the wrong definition of "weaken" for us (it refuses legitimate additions, see `design.md` `weaken`). It also adds ajv and an async call to a sync, pure compiler. Our shape IR is closed and small, so a per-dimension order table is exact and decidable. |
| `jsonsubschema` (Python, IBM) | Formal JSON Schema subtype check. Verified (read search result). | Reject. | Python. Same definitional mismatch. |
| `json-schema-to-zod` (npm) | Generates Zod *source code* from JSON Schema. Its README says the output is not meant for runtime use. Verified (read yarn listing via search). | Reject. | Codegen, not runtime. |
| zod 4.6.7 `z.fromJSONSchema` | Exists in the installed version. Marked "semi-experimental. Its behavior is liable to change" in the `.d.ts`. Verified (read `node_modules/zod/v4/classic/from-json-schema.d.ts`; ran `probes/zod-probe.mjs`: enum + strict object round trip works). | **Reject as the main path.** | We do not need JSON Schema as the source format. A closed IR printed to Zod by ~40 lines of our code is exact, and does not ride on an experimental API. |
| zod 4.6.7 `z.toJSONSchema` | Converts Zod to draft 2020-12. **Silently drops `.refine()`** (a refined string prints as `{type: string}`); throws on transforms. `required` follows shape key order; `enum` follows input order. Verified (ran `probes/zod-probe.mjs`). | **Adopt for the hash, with a guard.** | The manifest hashes `z.toJSONSchema(plan.schema)`. Because refinements vanish from it, the shape IR has no refinement escape hatch, and the printer sorts keys and enum values. Otherwise two schemas that differ only in a refine would share one hash (hazard `hash leak`). |
| zod 4.6.7 `z.discriminatedUnion` | Bad discriminator gives `name: Invalid discriminator value. Expected 'a' \| 'b'`; bad params give `params.min: Too small...`. Verified (ran `probes/zod-probe.mjs`). | **Adopt.** | `CheckRef` = discriminated union over the registry. Unknown check names and bad params become ordinary loader problems with a field path, at `rules:check` time. |
| @mastra/core 1.79.0 `createScorer` (function steps) | `preprocess` / `analyze` / `generateScore` function steps run with no judge and no network; the id may hold `.` and `@` (`units.allowed@1`). `analyzeStepResult` carries any JSON. Verified (ran `probes/scorer-probe.mjs` with `fetch` replaced by a throwing stub). | **Adopt.** | Code scorers carry per-item verdicts in `analyzeStepResult`; the score number is only a summary. |
| @mastra/core 1.79.0 `createScorer` (prompt-object `analyze`) + `createMockModel` | `judge.model` is a `MastraModelConfig` (a model instance or a `provider/model` string), fixed when the scorer is created; there is no per-run model function. `@mastra/core/test-utils/llm-mock` exports `createMockModel({version:'v2', objectGenerationMode:'json', mockText})`; a judge scorer ran on it with zero `fetch` calls, and `analyzePrompt` holds the prompt text. Verified (read `dist/evals/base.d.ts`, `dist/llm/model/shared.types.d.ts`; ran `probes/judge-probe.mjs`). | **Adopt.** | Because the model binds at creation, the compiler cannot build judge scorers without a model. So judge scorers are built by `plan.scorers.judges(model)`, the only door for a model. Tests pass `createMockModel`. |
| @mastra/core 1.79.0 `notScorable` | Means "does not apply"; `runEvals` drops it from gates. Verified (read `reference-evals-not-scorable.md` and repo decision row 31). | Reject for "cannot verify". | Unchanged repo decision. Our scorers never return `notScorable`. |
| Kyaloon `layoutFills()` | One function prints the layout keys in the prompt and the check reads the same function. Verified (read `docs/research/2026-10-24-kyaloon-patterns.md`). | **Adopt and generalize.** | Each template has `render(params)` and `check(params, …)`; each shape has one describer and one printer, both fed from the same meet. |
| Repo `rules.lock.json` pattern | A committed derived file that only grows, plus a CI check that fails when it is stale. Verified (read `src/rules/lock.ts`, `load.ts`). | **Adopt for code identity.** | `src/compiler/code.lock.json` pins a fingerprint for each check template version and for the scorer runtime. The runtime hash uses the declared version (environment independent), CI proves the version moved with the code. |

## Our own code that the design reuses

- `loadRuleLibrary` never throws and reports every problem in one round. The compiler keeps that contract: `compileStage` returns `{ ok: false, problems }`, never throws on bad rules. Verified (read `src/rules/load.ts`).

- `ruleHash` already hashes `check`. Making `check` an object `{ name, params }` keeps decision row 56 ("the version hash covers the check field"). `shape` joins the hash. `rules/` is empty and the lock is empty, so no rule migrates. Verified (read `rules/`, `rules/rules.lock.json`).

- `store.addDerivedRule` stores `hash = ruleHash(rule)` and the record JSON. The compiler re-parses the JSON and recomputes the hash on read (hazard `invalid derived rule`). Verified (read `src/store/store.ts`).

- `stage_runs.rule_set_hash` and `outputs.rule_set_hash` are text; `StageRunInput` requires a lowercase sha256 hex. `plan.ruleSetHash` is that. Verified (read `src/store/store.ts`).

- `GraphStore` has no "all nodes" read and no derived-rule read. The design adds `tree()` and `derivedRules()`. Verified (read `src/store/store.ts`).

- There is no `vitest.config.*`; the no-network guard needs one with `setupFiles`. Verified (listed repo root).

## Build from scratch, with reasons

- **Scope resolver and weaken check.** No package models a tree-anchored, add-only rule cascade with per-dimension strictness. OPA/Kyverno/ESLint/CSS all have override or exception semantics that we must forbid.

- **Shape IR, meet, printer.** Four shape types with a handful of dimensions. JSON Schema as source would bring an experimental converter and an undecidable subsumption problem. Our IR is closed, so meet and "looser" are table lookups.

- **Check registry.** A plain TypeScript array with a Zod discriminated union. A plugin framework would add nothing.
