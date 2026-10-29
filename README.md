# product-eval-harness

An evaluation harness for consumer products. LLM agents create the knowledge that evaluates a product. This knowledge is the criteria, the product attributes, the research records behind them, the evaluation packs, and the scores. A ruleset checks each output before the harness accepts it.

The harness uses the [Mastra](https://mastra.ai) TypeScript framework.

## Status

The design and the plan are in [docs/README.md](docs/README.md). The code is a Mastra scaffold (`plan.scaffold`). No harness stage exists yet.

## Develop

You need Node.js 22.13 or later.

1. Install the packages:

   ```bash
   npm ci
   ```

2. Start a throwaway local Postgres for the tests. The script and the tests need Postgres 18 with `pg_dump`, for example Homebrew `postgresql@18`. It prints a line. Export that line:

   ```bash
   scripts/test-db.sh start
   export HARNESS_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:<port>/postgres
   ```

3. Run the type check and the tests. The tests call no model and use no network. Each test file makes its own database, applies `db/migrations/`, and drops the database after. Without `HARNESS_TEST_DATABASE_URL`, the tests fail.

   ```bash
   npm run typecheck
   npm test
   ```

4. Stop the test database. This step deletes its data:

   ```bash
   scripts/test-db.sh stop
   ```

5. Check the stage rules in `rules/` and their lock:

   ```bash
   npm run rules:check
   ```

6. To open Mastra Studio, copy `.env.example` to `.env`. Set `HARNESS_DATABASE_URL` to a Postgres database that has the migrations of `db/migrations/`. Then run `npm run dev`. Studio opens at `http://localhost:4111`. The harness never creates tables (`db/README.md`).

The npm scripts turn off the usage telemetry of the Mastra CLI.

## Agent skills

The repo holds the `mastra` agent skill in `.agents/skills/`, with a link in `.claude/skills/`. `skills-lock.json` pins its version. To update it, run `npx skills update`. The skill comes from [mastra-ai/skills](https://github.com/mastra-ai/skills), copyright Kepler Software, Inc., under Apache-2.0.

## License

Apache-2.0. See [LICENSE](LICENSE).
