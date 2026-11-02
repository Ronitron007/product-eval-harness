# The compiler architect run `compiler_architect`

Status. Research record of 2026-11-02 for `plan.compiler`. Two runners designed the rule compiler at the same time, from one grounding file. One runner ran on Opus and one on Sonnet. A synthesis then took the Opus design as the base and grafted parts of the Sonnet design onto it.

The spec that came from this run is [compiler.md](../../design/compiler.md). Each decision of the synthesis is a row in [decisions.tsv](../../decisions.tsv).

The files are the outputs of the run, with one change. Local absolute paths in the probes and in `grounding.md` became relative paths. The copy leaves out the `node_modules` folders and the repo copy of the Sonnet runner.

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

## Run a probe `compiler_architect.run`

The probes import packages from the `node_modules` folder at the repo root, by relative paths.

1. Install the packages at the repo root with `npm ci`.

2. Run a `.mjs` probe with `node`, such as `node docs/research/2026-11-02-compiler-architect/runner-sonnet/probe/probe2.mjs`.

3. Type-check the Opus sketch with `npx tsc -p docs/research/2026-11-02-compiler-architect/runner-opus/probes/tsconfig.json`.
