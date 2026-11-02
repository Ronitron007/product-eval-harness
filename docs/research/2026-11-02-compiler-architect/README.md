# The compiler architect run `compiler_architect`

Status. Research record of 2026-11-02 for `plan.compiler`. Two runners designed the rule compiler at the same time, from one grounding file. One runner ran on Opus and one on Sonnet. A synthesis then took the Opus design as the base and grafted parts of the Sonnet design onto it.

The spec that came from this run is [compiler.md](../../design/compiler.md). Each decision of the synthesis is a row in [decisions.tsv](../../decisions.tsv).

Two adversaries then interrogated the spec, one on Opus and one on Sonnet. Their repros are in `interrogate/`. The spec folds in the eight fixes, and each fix is a row in the decisions trail. The verify round of the fixes found one more fault, with its repro in `interrogate/verify/`.

The files are the outputs of the runs, with one change. Local absolute paths in the probes, the repros, and `grounding.md` became relative paths. The copy leaves out the `node_modules` folders and the repo copy of the Sonnet runner. It also leaves out `interrogate-sonnet/opusprobes/`, a byte-equal copy of `runner-opus/probes/`.

## Files `compiler_architect.files`

| File | What it is |
|---|---|
| [grounding.md](grounding.md) | The brief of both runners. It lists what the code at `803301a` holds, the design text, the gaps, the hazards, and the prior art. |
| [synthesis.md](synthesis.md) | The decision set. It keeps parts of the Opus design and grafts parts of the Sonnet design. It also rejects some parts and names the known limits. The spec follows it. |
| [runner-opus/design.md](runner-opus/design.md) | The design of the Opus runner. It is the base of the spec. |
| [runner-opus/sketch.ts](runner-opus/sketch.ts) | The type sketch of the Opus design, with the call sites |
| [runner-opus/research.md](runner-opus/research.md) | The prior art that the Opus runner read and ran |
| `runner-opus/probes/` | The Opus probes. The probe `zod-probe.mjs` shows that `z.toJSONSchema` drops a refine. The probes `scorer-probe.mjs` and `judge-probe.mjs` run Mastra scorers with no network. The files `record-probe.ts` and `neg.ts` type-check the record and three illegal templates. |
| [runner-sonnet/design.md](runner-sonnet/design.md) | The design of the Sonnet runner. It is the source of the grafts. |
| [runner-sonnet/sketch.ts](runner-sonnet/sketch.ts) | The type sketch of the Sonnet design |
| [runner-sonnet/research.md](runner-sonnet/research.md) | The prior art that the Sonnet runner read and ran |
| `runner-sonnet/probe/` | The Sonnet probes. The probe `probe2.mjs` shows that `z.fromJSONSchema` accepts both keys of an `allOf` of two closed objects. The probes `probe3.mjs` and `probe4.mjs` make scorers with no model call. |

## Interrogate repros `compiler_architect.interrogate`

| File | What it shows | Fix in the spec |
|---|---|---|
| `interrogate/opus/owner-not-in-hash.ts`, `interrogate/sonnet/p3_owner.mts`, `interrogate/sonnet/p3b_owner_spec_shape.mts` | A move of the owner leaves the rule hash and the lock entry unchanged. | `record.owner_in_hash` |
| `interrogate/opus/meet-cross-dim.mjs`, `interrogate/sonnet/p9_values_len.mjs` | A meet of one dimension at a time accepts values that the joint rules refuse. | `shape.joint_meet` |
| `interrogate/opus/decode-bad-value.mjs` | Mastra `structuredOutput` throws on a bad value, so no fail row keeps the raw value. | `scorers.decode_failure_rows` |
| `interrogate/opus/zod-unique.mjs`, `interrogate/opus/zod-unique2.mjs`, `interrogate/sonnet/p1_zod.mjs`, `interrogate/sonnet/p7_unique.mjs` | Zod cannot print `unique`, so the hash cannot see it. | `shape.no_unique` |
| `interrogate/opus/round-trip-vacuous.mjs` | A golden value alone cannot find a refine that the hash misses. | `shape.no_unique` |
| `interrogate/opus/dormant.mjs`, `interrogate/sonnet/p8_scope.mjs` | A rule that applies nowhere, and a trial that applies nowhere, compile in silence. | `scope.inert_rule` |
| `interrogate/sonnet/p5_proto.mjs`, `interrogate/sonnet/p5b_proto.mjs` | A `__proto__` or `constructor` segment breaks the schema and the hash. | `record.reserved_names` |
| `interrogate/opus/outcome/outcome.ts` | The old `CheckOutcome` type lets `observed` carry a score and a best match. | `checks.outcome_type` |
| `interrogate/verify/warn-extra-key.mjs` | Under `errorStrategy: 'warn'`, a reply with extra keys gives no error, and each rule row passes. Found in the verify round. | `scorers.closed_output` |
| `interrogate/sonnet/p2_mastra.mjs`, `interrogate/sonnet/p4_loader.mjs`, `interrogate/sonnet/p6_canon.mjs` | Checks of the Mastra scorer ids, the loader messages, and canonical JSON | No fix of this list rests on them. |

No repro file holds the fix `scorers.skipped_judges`. It rests on the text of `mastra.stage_workflow`.

## Run a probe `compiler_architect.run`

The probes import packages from the `node_modules` folder at the repo root, by relative paths.

1. Install the packages at the repo root with `npm ci`.

2. Run a `.mjs` probe with `node`, such as `node docs/research/2026-11-02-compiler-architect/runner-sonnet/probe/probe2.mjs`.

3. Run a `.ts` or `.mts` repro with `npx tsx`.

4. Type-check the Opus sketch with `npx tsc -p docs/research/2026-11-02-compiler-architect/runner-opus/probes/tsconfig.json`.
