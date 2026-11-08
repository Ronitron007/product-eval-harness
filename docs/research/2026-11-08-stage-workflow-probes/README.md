# Stage workflow probes `stage_probes`

Status. Research evidence of 2026-11-08 for [the stage workflow spec](../../design/stage-workflow.md). These files are not harness code. They make no model call and no network call. They prove the Mastra claims of the spec on `@mastra/core` 1.79.0 and TypeScript 6.0.3.

| File | What it shows |
|---|---|
| `sketch.ts` | The types and the workflow sketch of `stage.types` and `stage.workflow`. It imports the real types from `src/`. |
| `sketch-run.ts` | A copy of `sketch.ts` that runs. Small fakes replace the two declared functions. |
| `run-sketch.ts` | Runs `sketch-run.ts` with fake ports: a pass on the first round, a pass after a repair, a spent budget, a strict `cannot_verify`, a resume with accept or reject, a blank note, and a resume after a rule change. It also runs the fixes of the interrogate run: a store error after a decision, `finishRun`, a second start on an ended run, two judge steps of one round, and the vendor check. |
| `0004_stage_runs.sql` | A prototype of the migration of `stage.store` |
| `migration.ts` | Applies 0001 to 0003 and the prototype twice, then 0003 again, on a fresh test database. Then it tests the rules of `stage.store` as `harness_app`. |
| `mastra-semantics.ts` | `.dountil` counts, the body of a suspended step on resume, a second suspend, two resumes at the same time, a second resume, and `bail` |
| `suspend-schemas.ts` | A suspend payload that breaks `suspendSchema`, and resume data that breaks `resumeSchema` |

## Run the probes `stage_probes.run`

1. Run `npm ci` at the repo root.

2. Run the type check from the repo root:

   ```bash
   npx tsc -p docs/research/2026-11-08-stage-workflow-probes/tsconfig.json
   ```

3. Make sure that the exit code is 0.

4. For `migration.ts`, start a local Postgres with `scripts/test-db.sh start`, and export the line that it prints.

5. Run each runtime probe from the repo root:

   ```bash
   MASTRA_TELEMETRY_DISABLED=1 npx tsx docs/research/2026-11-08-stage-workflow-probes/run-sketch.ts
   MASTRA_TELEMETRY_DISABLED=1 npx tsx docs/research/2026-11-08-stage-workflow-probes/mastra-semantics.ts
   MASTRA_TELEMETRY_DISABLED=1 npx tsx docs/research/2026-11-08-stage-workflow-probes/suspend-schemas.ts
   npx tsx docs/research/2026-11-08-stage-workflow-probes/migration.ts
   ```

On 2026-11-08, after the interrogate run, the type check gave exit code 0. Each runtime probe gave exit code 0, with the output that `stage.mastra_facts` quotes.
