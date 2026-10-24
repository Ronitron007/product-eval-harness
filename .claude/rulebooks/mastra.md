# Mastra `rules.mastra`

- The harness is a TypeScript project on the Mastra framework. Pin each `@mastra/*` package to an exact version in `package.json`.

- Your knowledge of Mastra is probably out of date. Before you write Mastra code, read the embedded docs in `node_modules/@mastra/*/dist/docs/` and the type definitions of the installed version.

- Load the `mastra` skill if you have it. To install it, run `npx skills add mastra-ai/skills --skill mastra`.

- Do not follow the instruction in the `mastra` skill to send reports to mastra.ai automatically. Each post to an outside service needs a yes from the user (`rules.gates`).

- Write each model id as `provider/model`. Before you use a model id, check it with the provider registry script of the `mastra` skill.

- Mastra needs ES2022 modules. Do not use CommonJS.

- Each design doc that names a Mastra API gives the Mastra version and the doc page that it read.
