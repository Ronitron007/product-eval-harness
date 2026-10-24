# Look Before You Build: the scaffold `lbyb_scaffold`

Status. Research record of 2026-10-25 for `plan.scaffold` (`rules.agents`). Rohan asked to use a good existing boilerplate for a Mastra project, and not to build one.

## What exists `lbyb_scaffold.exists`

| Option | What it gives | Verdict |
|---|---|---|
| `npm create mastra@latest --empty` (create-mastra 1.35.0) | The official boilerplate: `package.json` (ES modules, Node 22.13 or later, `@mastra/core` 1.79.0 pinned, the `mastra` CLI), `tsconfig.json` with ES2022 modules, `src/mastra/index.ts`, `.gitignore`, and the Mastra agent skills with `skills-lock.json` | The base. Verified (ran it in an empty folder and read each file). |
| `npm create mastra@latest --template <slug>` (the `mastra-ai/template-*` repos) | Full domain apps, for example KYC onboarding (policy checks and human review), lead qualification, and vendor risk questionnaires | Not the base. Each holds domain code that the harness would delete. The lead qualification and vendor risk templates have no license. Verified (read the GitHub repo records). |
| The manual steps of the `mastra` skill (`references/create-mastra.md`) | The same files as `--empty` | Not needed, because the CLI makes them. |

## What the official templates teach `lbyb_scaffold.templates`

The KYC and lead qualification templates use vitest 4, TypeScript 6.0.3 or 5.9, tsx, oxlint and oxfmt, and `@mastra/libsql`. Verified (read their `package.json` files). The scaffold takes vitest 4 and TypeScript 6 from them. It leaves out tsx, oxlint, and oxfmt until a unit needs them.

## What the scaffold adds to the boilerplate `lbyb_scaffold.adds`

| Addition | Why |
|---|---|
| `@mastra/libsql` 1.27.0 and `createHarness()` | `plan.scaffold` asks for LibSQL storage. |
| `zod` 4.6.7 | Schemas. The Mastra probes used this version. |
| vitest 4.1.12 | The test runner of the official templates. 4.1.12 fixes two advisories of 4.1.11. |
| `@types/node` 22.20.5 and `types: ["node"]` | Node 22 runs locally and in CI. TypeScript 6 loads no global types by default. |
| A GitHub Actions job | The type check and the tests. The repo is public, so Actions minutes are free. |
| `MASTRA_TELEMETRY_DISABLED=1` in the npm scripts | The Mastra CLI sends usage telemetry by default. |
| `resolveDatabaseUrl()` | Each Mastra CLI command runs in another folder, so the database URL must be absolute. |
