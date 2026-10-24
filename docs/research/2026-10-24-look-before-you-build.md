# Look Before You Build `lbyb`

Status. Research record of 2026-10-24 (`rules.agents`). It lists what already does a part of the harness, and why the harness builds the rest.

## What exists `lbyb.exists`

| Thing | What it gives | How the harness uses it |
|---|---|---|
| Mastra 1.79.0 | Workflows, agents, tools, processors, scorers, `runEvals` with gates, datasets and experiments, storage, RAG, observability | The host framework, chosen by Rohan. See [the Mastra reference](2026-10-24-mastra-primitives.md). |
| The `mastra` agent skill (mastra-ai/skills, v2.4.0, Apache-2.0) | The method to verify Mastra APIs against the installed version | `rules.mastra`. Install with `npx skills add mastra-ai/skills --skill mastra`. |
| google-research/harness2 (Apache-2.0) | A self-improving loop for agent harness files | The source of `improve`. See [the harness2 research](2026-10-24-harness2/concepts.md). |
| GEPA, ACE (both in `@ax-llm/ax`), DSPy, TextGrad, OpenEvolve, Darwin Goedel Machine | Prompt and program optimizers | Not used now. Most need a numeric metric on a labeled set. See [the harness2 prior art](2026-10-24-harness2/look-before-you-build.md). |
| Zod | Schemas and refinements | Rule records and output shapes |
| Drizzle ORM | Typed tables and migrations for LibSQL and Postgres | The graph store (`mastra.storage`) |
| OPA, Cedar, Kubernetes admission policies | The split of a rule and its binding, decision logs, dry-run modes | The pattern of the rule record. See [the prior art](2026-10-24-rule-enforcement-prior-art.md). |
| Policy judges (gpt-oss-safeguard, Llama Guard, RBR propositions) | One rule for each judge call, with a written policy | The pattern of the judge questions |
| The Kyaloon v3 pipeline | Code checks with repair sentences, gated packs, hashed rule versions | Patterns. See [the Kyaloon patterns](2026-10-24-kyaloon-patterns.md). |

## What the harness builds, and why `lbyb.builds`

| Part | Why no package fits |
|---|---|
| The rule graph, with scope and inheritance | No package found scopes rules to the nodes of a category tree, to stages, and to output fields. |
| The three-way verdict | Mastra scores are numbers. `notScorable` means "does not apply", and gates drop it. |
| The rule compiler | It must make the instruction and the check from one record. No package found does this for our rule kinds. |
| The graph store | Mastra storage has fixed domains and refuses a custom one. |
| The improvement loop | No package gives the loop of harness2. Mastra gives the measurement half. |
