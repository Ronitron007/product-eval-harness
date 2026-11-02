---
name: harness-invariants
description: Formal checks of the graph store, the rule lock and the migrations of product-eval-harness. TLA+ models checked with TLC, a sweep of db/migrations/ over 72 database pre-states in 2 apply modes on a real Postgres, and replays of each bug path on the real code. Use before you change db/migrations/, src/store/, src/rules/, the CI rule check, or a rule about nodes, verdicts, outputs, rule versions or the database role; and when a formal check fails.
---

# Harness invariants

This skill checks promises of the harness that tests reach least. A break costs most here: the migrations run on the live Kyaloon database, and the verdict log and the rule lock are the audit trail of each accepted output.

## What it checks

| Check | Tool | What it covers |
|---|---|---|
| `formal/models/*.tla` | TLA+, checked by TLC 1.7.4 | Each order of steps in a small model of the code |
| `formal/sql/migration-sweep.check.ts` | vitest and a real local Postgres | `db/migrations/` on 72 pre-states: 6 states of the role `harness_app` and 6 states of schema `harness`, each with and without the Supabase default privileges. Each pre-state runs in one transaction and with each file in its own transaction, so 144 cases. |
| `formal/sql/replays.check.ts` | vitest and a real local Postgres | Each bug path of the models, one call or statement for each step, on `src/store/store.ts`, `src/rules/` and the SQL |

The models are a design-level abstraction. The sweep and the replays run the real code. The sweep also compares each real end state with the end state that TLC dumps for `MigrationApply.tla` (rule `ModelAgrees`), so a wrong migration model shows as a failure.

Some "holds" rows of the models restate a guard that the model copies from the code, such as `LockOnlyGrows` with the CI `--base` check. A code change does not change a TLC result. Only the sweep and the replays see a change of the code.

## Coverage record

Sync commit: `803301a` on `main`. At that commit, the checks describe the code in this table. Move the sync commit forward only after you confirm that each model still describes its code at the new commit.

| Model or check | Code that it describes |
|---|---|
| `NodeTree.tla` | `harness.nodes`, its checks and `harness.check_node_path()` in `db/migrations/0001_harness_tables.sql`. `addNode()` and `subtree()` in `src/store/store.ts`. The grants of `harness_app` in `0003_harness_role.sql`. |
| `VerdictLog.tla` | `harness.stage_runs`, `harness.outputs`, `harness.verdicts` and the append-only triggers in `0001_harness_tables.sql`. `recordStageRun()`, `writeVerdicts()` and `acceptOutput()` in `src/store/store.ts`. |
| `RuleVersions.tla` | `RuleRecord` in `src/rules/schema.ts`, `ruleHash()` in `src/rules/hash.ts`, `loadRuleLibrary()`, `lockNewVersions()` and `lockGrowthProblems()` in `src/rules/load.ts`, `src/rules/cli.ts`, the rule step of `.github/workflows/ci.yml`. `harness.derived_rules` and `addDerivedRule()`. |
| `MigrationApply.tla`, `formal/sql/migration.ts`, the sweep | All of `db/migrations/`, `applyMigrations()` in `tests/db.ts`, the copy rule of `db/README.md`, `store.safety` in `docs/design/graph-store.md` |

If a change touches a file in this table, run the checks. If the change is intended, update the model in the same PR.

## Run the checks

1. Start a throwaway Postgres that no other test uses. The sweep drops and makes the cluster role `harness_app`:

   ```bash
   export HARNESS_TEST_DB_DIR="${TMPDIR:-/tmp}/harness-formal-db"
   export $(scripts/test-db.sh start)
   ```

   `scripts/test-db.sh` finds Postgres 18 in Homebrew, or `pg_ctl` on PATH. Set `PG_BIN` to the folder of the Postgres binaries if neither works. `pg_dump` must be version 18 or later.

2. Make sure that Java 11 or later runs. If `java` is not on PATH, set `JAVA` to a java binary.

3. Run all the checks:

   ```bash
   npm run formal
   ```

   `npm run formal:tla` runs only TLC. `npm run formal:sql` runs only the sweep and the replays. The first TLC run downloads the pinned `tla2tools.jar` into `node_modules/.cache` and checks its sha256. Set `TLA2TOOLS` to use a local jar.

4. Stop the server: `scripts/test-db.sh stop`, with the same `HARNESS_TEST_DB_DIR`.

The whole run takes about 2 minutes. CI runs `npm run formal` after the tests (`.github/workflows/ci.yml`).

## Read a result

Each check compares its result with an expected result:

- `formal/expectations.ts` gives "holds" or "breaks" for each rule of each model.

- `FINDINGS` in `formal/sql/migration-sweep.check.ts` gives the rules that break for each pre-state.

- Each `finding ...` test in `formal/sql/replays.check.ts` passes while its bug still happens.

A check fails in two cases:

- A rule that held now breaks. `formal/tlc.ts` prints the path that TLC found. To read it as a chart in plain words, use the pstack `/statechart` skill. Give it the model, its config, and the view in `formal/views/`. Then replay the path on the real code. If the path does not happen in the real code, the model is wrong. Fix the model, not the code.

- A finding no longer breaks. If a fix landed, set the rule to "holds" in `formal/expectations.ts`, remove it from `FINDINGS`, and change its replay to check that the code refuses the step.

A `ModelAgrees` failure in the sweep means that `MigrationApply.tla` no longer matches Postgres. Read the model and the real facts in the failure message. Fix the model, or the oracle in `formal/sql/migration.ts`.

`formal:tla` also fails when a rule of a `.cfg` file has no row in `formal/expectations.ts`.

## Findings of 2026-11-02

These rules break today. Rohan rules on each fix. Each fix is its own plan unit.

| Finding | Rule that breaks | What happens |
|---|---|---|
| `nodes.owner_update` | `NodeTree_owner`: `PathAgreesWithParent`, `NoChildUnderLeaf`, `WalkAgreesWithParents` | `harness.nodes` has no append-only trigger, and its path trigger fires on insert only. A plain UPDATE by the table owner breaks the tree. `harness_app` cannot update. |
| `verdicts.stage_level` | `StageFitsNodeLevel` | A `create_pack` run at a domain node is stored. |
| `verdicts.hash_per_version` | `OneVersionOneHash` | Two verdict rows of one rule version can name two hashes. |
| `verdicts.accept_without_pass` | `AcceptedAfterPassOrPerson` | `acceptOutput()` reads no verdict, and no table records the decision of a person. So an output with no verdict, or after a strict fail, is stored with no record of why. |
| `verdicts.no_round` | `OneVerdictPerTargetAndRound` | A repair round gives two rows for one target. No column names the round or the output. |
| `verdicts.outputs_per_run` | `OneOutputPerRun` (inferred rule) | One run can store two outputs. |
| `rules.watch_first` | `NewVersionStartsWatch` | `rules:lock` locks a new version with binding `strict`. |
| `rules.lock_hand_entry` | `LockSkipsNoVersion` | A PR can add a lock entry by hand for a version that no file had, such as version 3 with no version 2. `rules:check --base` passes. |
| `derived_rules.skip_version` | `DerivedSkipsNoVersion` | Version 2 of a derived rule is stored with no version 1. |
| `derived_rules.two_owners` | `DerivedHasOneOwner` | Two versions of one derived rule have two owner nodes. |
| `derived_rules.two_active` | `DerivedHasOneActiveVersion` | Two versions are active, and rows only grow, so the old version cannot retire. |
| `derived_rules.id_collision` | `IdNamesOneRule` | A derived rule takes the id and version of a stage rule with another hash. The lock holds no rule today, so its replay cannot see a fix that reads the lock. Such a fix must update the replay. |
| `migration.guard_gaps` | `CommittedIsSafe` | The guard reads ACL entries only. It misses anon as a member of `harness_app`, anon as the owner of schema `harness` or of a table, a right of `harness_app` on a Kyaloon table, and a default privilege that opens new harness tables. The Supabase default privileges open new harness tables too, so each later migration must revoke again. Each other gap needs an object from before the migration. `db/audit-public-grants.sql` shows the role and the schemas, if a person reads it. |
| `migration.per_file_stop` | `StopRollsBack` | With each file in its own transaction, as `applyMigrations()` of `tests/db.ts` runs them, a stop in `0003` keeps the tables of `0001` and `0002`: no row level security, and PUBLIC can execute the trigger functions. The live apply is one RealDose migration file. If the tool runs it in one transaction, the stop rolls back all. |

## What the checks leave out

- The models are small: 3 nodes, one run, one rule, 3 versions. TLC covers each order of steps within those bounds only.

- The models treat each SQL statement as one step. They do not model two transactions at the same time.

- The sweep covers the 72 pre-states above, not each possible database. It does not cover `service_role`, column grants, or event triggers.

- `main` has no branch protection. The models assume that each merge waits for its CI check.

- No check covers Mastra storage (`src/mastra/`) or the GitHub merge flow.

## Change a model

1. Edit the model in `formal/models/`, and its view in `formal/views/` if the words change.

2. Keep each action true to one statement or one call of the code. Name the code in the comment of the action.

3. Update `formal/expectations.ts`, `FINDINGS`, the oracle in `formal/sql/migration.ts`, and the replays to match.

4. Show that each new rule can fail: break the code or the model on purpose, run the check, and see it fail. Then undo the break.

5. Run `npm run formal`. It must exit 0.

6. Move the sync commit in this file forward.

For a check that drifted from the code, use the pstack `/maintain-formal-verification-skill` skill.
