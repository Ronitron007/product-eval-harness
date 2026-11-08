# Judge step interrogate run `judge_interrogate`

Status. Record of 2026-11-08. Two adversaries interrogated the judge step spec of [Ronitron007/product-eval-harness#23](https://github.com/Ronitron007/product-eval-harness/pull/23) at `a8f71fb`. The coordinator ran each repro again, and each repro reproduced. The spec [judge-step.md](../../design/judge-step.md) folds in seven fixes. Each fix is a row in [decisions.tsv](../../decisions.tsv).

## What this folder holds `judge_interrogate.files`

- `opus/` holds the repros of the Opus adversary. Each `.repro.ts` file has an `.out` file with its output.

- `sonnet/` holds the repros of the Sonnet adversary, its `README.txt`, a patch of `src/compiler/scorers.ts`, and a prototype of `src/judge/step.ts`.

- The copies keep the text of the repros. The file names end in `.repro.ts`, not `.test.ts`, so that Vitest does not run them in this folder.

## How to run a repro `judge_interrogate.run`

1. Check out `a8f71fb` in a worktree, and install the packages.

2. For a `sonnet/` repro, apply `scorers.patch`. Copy `step.ts.prototype` to `src/judge/step.ts`.

3. Copy each repro into a new folder `tests/interrogate/`. Rename each `.repro.ts` file to `.test.ts`. The imports expect that folder.

4. Run `npx vitest run tests/interrogate/<file>.test.ts`.

## Fix map `judge_interrogate.fixes`

| Fix | Repro |
|---|---|
| `judge.quote_rules` | `opus/probe.out`, `opus/probe3.out`, `sonnet/p1.repro.ts`, `sonnet/p5.repro.ts` |
| `judge.one_answer` | `sonnet/p1.repro.ts` (F2) |
| `judge.runtime_pinned` | `opus/probe2.repro.ts`, `opus/probe2.out` |
| `judge.no_network` | `sonnet/p7.repro.ts` |
| `judge.modules` | `tests/compiler/boundary.test.ts` at `f0bfed8` |
| `judge.evidence_parsed` | `sonnet/p4.repro.ts` |
| `judge.fail_fix` | `enforce.repair` |
