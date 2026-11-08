# Stage workflow interrogate run `stage_interrogate`

Status. Research evidence of 2026-11-08. Two adversaries, Opus and Sonnet, interrogated [the stage workflow spec](../../design/stage-workflow.md) at `7fb8f87`. These files are their repros, with relative paths. They are not harness code, and they make no model call. `stage.interrogate` in the spec gives the result of each repro.

| Folder | What it holds |
|---|---|
| `opus/` | `probe-a.ts` to `probe-c.ts`, `probe-d1.sql`, the 0004 prototype of the adversary, and its copy of `sketch-run.ts`. Claude added `run-d1.ts` and `make-db.ts`. |
| `sonnet/` | `p1_pg_resume.ts` to `p13_models.ts`, the prototype workflow `proto_workflow.ts`, its setup `proto_env.ts`, and the 0004 prototype of the adversary. Claude added `p14_registry.ts`, `p15_blank.ts`, `p9_lease.ts`, and `p9b_lease.ts`. |

## Run the repros `stage_interrogate.run`

1. Run `npm ci` at the repo root.

2. Run `scripts/test-db.sh start`, and export the line that it prints.

3. Go to the folder of the repro, and run it with `MASTRA_TELEMETRY_DISABLED=1 npx tsx <file>`.

4. For `opus/probe-b.ts` and `opus/probe-c.ts`, first run `npx tsx make-db.ts`. Give its URL as the argument. `probe-c.ts` takes a mode (`crash`, then `restart`), the URL, and a state file.

The repros of the old sketch show the findings. They do not include the fixes. The probe `run-sketch.ts` of [the probe folder](../2026-11-08-stage-workflow-probes/README.md) runs the fixes.
