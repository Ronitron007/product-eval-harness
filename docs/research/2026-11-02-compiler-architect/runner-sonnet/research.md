# plan.compiler, runner sonnet: Look Before You Build record

Date 2026-11-02. Repo `product-eval-harness` at `803301a`, read only. Labels: verified (ran or read), inferred, not checked.

## Question

What already does "rules with typed parameters, composed down a tree, compiled into a schema, an instruction text, a check, and a hash"? What do we adopt?

## What I read and ran

| Source | Finding | Label | Verdict |
|---|---|---|---|
| OPA Gatekeeper, [howto](https://open-policy-agent.github.io/gatekeeper/website/docs/howto) | A ConstraintTemplate holds the logic and the parameter schema (`openAPIV3Schema`). A Constraint is an instance and supplies `parameters`. The API server rejects an instance whose parameters do not fit the schema. `enforcementAction` is `deny`, `dryrun` or `warn`. | verified (read) | **Adopt** the split: the check definition owns the parameter schema, the rule supplies the values, and a misfit is refused before any run. Our `CheckDef.params` and `RuleRecord.params`. **Reject** two record kinds and Rego: our templates are TypeScript in a registry, so one YAML record kind is enough. The binding already equals `enforcementAction`. |
| Kyverno, [validate rules](https://kyverno.io/docs/policy-types/cluster-policy/validate/) | `Enforce` blocks, `Audit` records. Policies apply independently. The page names no inheritance, no precedence, and no admission check of policy correctness. | verified (read) | **Nothing to copy for scope.** Kyverno gives no model for "a child cannot weaken". Binding names already match. |
| ESLint, [flat config](https://eslint.org/docs/latest/use/configure/configuration-files) | Matching config objects merge, and later ones override earlier ones. The page does not say what a later `"off"` does, and does not say if unknown rules fail at load. | verified (read), the rest not stated | **Reject the cascade.** A later object that overrides an earlier one is exactly the weakening that `graph.scope` forbids. Adopt only the idea of a fixed total order (we order by owner depth, then rule id). |
| CSS cascade and `!important` | Specificity and origin decide which declaration wins, so a more specific rule can override a general one. | not checked (known) | **Reject** for the same reason as ESLint. |
| JSON Schema `allOf`, [combining](https://json-schema.org/understanding-json-schema/reference/combining) | `allOf` is logical AND. The page says `allOf` cannot extend a closed schema like object inheritance. A subschema cannot relax another (inferred from AND). | verified (read), the last point inferred | **Adopt as the meaning of rule conjunction**: every rule in scope holds, so adding a rule can only restrict. **Reject as the composition mechanism for shapes**: see the probe below. |
| zod 4.6.7 `z.fromJSONSchema` (`node_modules/zod/v4/classic/from-json-schema.d.ts`) | Its own comment says "semi-experimental". `allOf` becomes `z.intersection`. | verified (read) | **Reject.** |
| Probe: `probe/probe2.mjs` | `fromJSONSchema` of `allOf` of two closed objects `{a}` and `{b}` accepts `{a, b}`. JSON Schema says reject, because each closed subschema rejects the other key. A single closed object rejects an extra key as expected. | verified (ran) | Strong reason to reject JSON Schema `allOf` for shape composition. Closed-object composition must be our code. |
| zod 4.6.7 `z.toJSONSchema` | `probe/probe1.mjs`: two calls on a nested strict schema give equal strings. `z.strictObject` gives `additionalProperties: false`. A nullable gives `type: ["string","null"]`. | verified (ran) | **Adopt** as the schema part of the rule set hash. It describes the real compiled Zod, so a change in `toZod` shows in the hash. |
| `json-schema-to-zod` (npm) | The npm page returned 403. A search shows a code generator (emits Zod source) from JSON Schema. It is not marked deprecated in the results. | not checked (npm 403), search only | **Reject.** We build Zod objects directly from our own field tree. No generated source is needed. |
| AJV, [strict mode](https://ajv.js.org/strict-mode.html) | Unknown keywords throw at compile time by default. Some other misfits only log. | verified (read) | **Adopt the stance**: an unknown check name or a misfit parameter is a compile error. **Reject AJV itself**: our schemas are Zod, and AJV adds a second validator. |
| Mastra `createScorer` (`@mastra/core` 1.79.0 `dist/evals/base.d.ts`) | Function steps need no judge. `analyze` result sits in `analyzeStepResult`. `generateScore` must return a number. | verified (read) | **Adopt** for shape and code check scorers. |
| Probe: `probe/probe3.mjs` | A scorer with an `analyze` function step and `generateScore` ran with no model. `scorer.judge` is `undefined`. `analyzeStepResult` kept the three-way finding. `score` is 1 or 0. | verified (ran) | Confirms the design: findings travel in `analyzeStepResult`, the numeric score is lossy by design. |
| Probe: `probe/probe4.mjs` | Building a judge scorer with the fake model id `fake/never-called` made zero `fetch` calls. | verified (ran) | A judge scorer can be built with no call. Still, `compile` never builds one (hazard: no model in tests). |
| Mastra `notScorable` | Means "does not apply". `runEvals` drops it. Decision row 2026-10-24 already says never use it for `cannot_verify`. | verified (read) | **Reject** for verdicts. |
| `src/rules/hash.ts`, `load.ts`, `schema.ts` | Canonical JSON with `canonicalize`. `RuleProblem` list that never throws. Strict Zod records. | verified (read) | **Adopt** the same style: `CompileProblem` list, report all in one round, `canonicalize` + sha256. |
| `src/store/store.ts` | `stage_runs.ruleSetHash` and `outputs.ruleSetHash` need a sha256 hex. `VerdictInput` has `target`, `ruleHash`, `binding`, `decider`, `reason`, `evidence`. The store has no read for all nodes and no read for derived rules. | verified (read) | The scorer `Finding` is shaped to fill `VerdictInput` without translation. Two read methods are a dependency. |
| `docs/design/rule-enforcement.md`, `layoutFills()` | The doc names the Kyaloon `layoutFills()` pattern: shared parameters feed both prompt and check. A grep of `docs/` finds the name only in `enforce.compile`. I did not read the Kyaloon source. | verified (grep), pattern itself not checked | **Adopt the principle**, and make it structural: one parsed `params` object reaches both. |

## Prior art for the "weaken" order

I found no tool that defines "child may not weaken" over typed parameters. Gatekeeper, Kyverno and ESLint all treat rules as independent or as overridable. The closest idea is language inclusion: a constraint A is at least as strong as B when every value that passes A passes B. I adopt that, one `implies` function for each check, and I test that `implies` is sound on the check vectors. This is inferred design, not copied.

## Build from scratch: reason

Nothing found gives (1) a parameter-typed, tree-scoped rule with a refusal of weakening, (2) one definition that renders, verifies and hashes, and (3) a closed-object shape composition with a conflict report. Gatekeeper gives the parameter split, zod gives the schema and JSON Schema emission, Mastra gives the scorer shell. The tree rule, the order, the composition and the hash are ours.

## Not checked

- CSS cascade details, Kyverno internals beyond the page, and the Kyaloon `layoutFills()` source.
- `json-schema-to-zod` current status (npm 403).
- Whether a Mastra judge scorer with a real model id resolves lazily on all providers. The probe used a fake id and made no call.
