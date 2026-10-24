# Mastra type-check probes `mastra_probes`

Status. Research evidence of 2026-10-24. These TypeScript files are not harness code. Nothing runs them. They prove that the Mastra APIs of two docs exist with the shapes that the docs say. The docs are [the Mastra reference](../2026-10-24-mastra-primitives.md) and [the Mastra mapping](../../design/mastra-mapping.md).

| File | What it checks |
|---|---|
| `00-negative.ts`, `04-negative.ts` | Negative controls. Each line with `@ts-expect-error` must fail to compile: a step that returns the wrong type, a classifier with a `provider/model` string, and a custom storage domain. |
| `01-workflows.ts` | Steps, state, suspend and resume, nested workflows, `.dountil`, `.parallel`, `.branch` |
| `02-agents-processors.ts` | Agents, request context, processors with `abort` and `retry`, `maxProcessorRetries`, tools, skills. One negative control: `structuredOutput` has no retry option. |
| `03-evals-data.ts` | Scorers, `notScorable`, the classifier, `runEvals` with gates, datasets, experiments, RAG tools, storage, predicates |
| `10-stage-workflow.ts` | The sketch of one harness stage in [the Mastra mapping](../../design/mastra-mapping.md) (`mastra.stage_workflow`) |

## Run the check `mastra_probes.run`

1. Copy this folder to an empty folder outside the repo.

2. In that folder, run `npm init -y` and `npm pkg set type=module`.

3. Install the exact versions:

   ```bash
   npm i @mastra/core@1.79.0 @mastra/evals@1.10.8 @mastra/memory@1.39.0 @mastra/libsql@1.27.0 @mastra/rag@2.7.0 @mastra/observability@1.21.0 zod@4.6.7 typescript@5.9.3
   ```

4. Run `npx tsc -p tsconfig.json`. The exit code must be 0.

On 2026-10-24 the check gave exit code 0 for all files together.
