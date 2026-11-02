# The formal check of 2026-11-02 `formal_check`

Status. Research of 2026-11-02, on `main` at `803301a`, before [#17](https://github.com/Ronitron007/product-eval-harness/pull/17). The checks are in [design/formal-checks.md](../design/formal-checks.md). Rohan asked for an independent, formal check of the code before `plan.compiler` starts.

This doc records the method, the results, and the findings. It fixes nothing. Rohan rules on each fix, and each fix is its own plan unit.

## What already existed `formal_check.prior_art`

| Candidate | Result |
|---|---|
| TLA+ and TLC 1.7.4 | Used for the models. TLC is not on npm or on Maven Central, so the runner downloads the pinned release and checks its sha256. |
| Apalache | Not used. The models are small and finite, so TLC is enough. |
| Quint | Not used. Its `run` command samples at random, and its `verify` command needs Apalache. |
| fast-check | Not used. The pre-states of the migrations are few, so the sweep tries each of them. |
| pgTAP | Not used. It needs a system install, and Vitest with `pg` already makes the same assertions. |
| supabase/splinter | Read as prior art for the oracle. It checks the schemas that the API shows, not `harness` and `mastra`. |
| `has_table_privilege()` and `pg_has_role()` | Used for the oracle. They count owners and members, and the guard does not. |

## Results `formal_check.results`

Each row is one rule. "Verified (ran)" means that TLC found the result, and a replay or the sweep showed it on the real code.

| Model and config | Rule | Result | Finding |
|---|---|---|---|
| `NodeTree` | `DomainIsRoot`, `PathAgreesWithParent`, `NoChildUnderLeaf`, `WalkAgreesWithParents` | Holds, verified (ran) | none |
| `NodeTree_owner` | `DomainIsRoot` | Holds, verified (ran) | none |
| `NodeTree_owner` | `PathAgreesWithParent`, `NoChildUnderLeaf`, `WalkAgreesWithParents` | Breaks, verified (ran) | `nodes.owner_update` |
| `VerdictLog` | `OutputAgreesWithRun` | Holds, verified (ran) | none |
| `VerdictLog` | `StageFitsNodeLevel` | Breaks, verified (ran) | `verdicts.stage_level` |
| `VerdictLog` | `OneVersionOneHash` | Breaks, verified (ran) | `verdicts.hash_per_version` |
| `VerdictLog` | `AcceptedAfterPassOrPerson` | Breaks, verified (ran) | `verdicts.accept_without_pass` |
| `VerdictLog` | `OneVerdictPerTargetAndRound` | Breaks, verified (ran) | `verdicts.no_round` |
| `VerdictLog` | `OneOutputPerRun` | Breaks, verified (ran). The rule is inferred. | `verdicts.outputs_per_run` |
| `RuleVersions` | `FileMatchesLock`, `LockOnlyGrows` | Holds, verified (ran). `LockOnlyGrows` restates the CI `--base` check. | none |
| `RuleVersions` | `LockSkipsNoVersion` | Breaks, verified (ran) | `rules.lock_hand_entry` |
| `RuleVersions` | `NewVersionStartsWatch` | Breaks, verified (ran) | `rules.watch_first` |
| `RuleVersions_derived` | `DerivedSkipsNoVersion` | Breaks, verified (ran) | `derived_rules.skip_version` |
| `RuleVersions_derived` | `DerivedHasOneOwner` | Breaks, verified (ran) | `derived_rules.two_owners` |
| `RuleVersions_derived` | `DerivedHasOneActiveVersion` | Breaks, verified (ran) | `derived_rules.two_active` |
| `RuleVersions_derived` | `IdNamesOneRule` | Breaks, verified (ran) | `derived_rules.id_collision` |
| `MigrationApply` | `CommittedPassesTheGuard` | Holds, verified (ran) | none |
| `MigrationApply` | `CommittedIsSafe` | Breaks, verified (ran) | `migration.guard_gaps` |
| `MigrationApply` | `StopRollsBack` | Breaks, verified (ran) | `migration.per_file_stop` |

The sweep has 72 pre-states, and it runs each in 2 ways, so it has 144 cases. It also checked `SecondApplyChangesNothing` and `GuardStopsNamedCases` in each case. Both hold, verified (ran).

Some rules hold because the model copies a guard of the code, such as `OutputAgreesWithRun` and `LockOnlyGrows`. A code change does not change those TLC results. The sweep and the replays check the real code.

## The findings `formal_check.findings`

Each finding gives the rule, the shortest path, and the harm.

- `nodes.owner_update`. Rule: a node path agrees with its parent, and a leaf has no child (`store.safety`). Path: add `a`, add `b` under `a`, then the table owner sets the parent of `b` to `b`. The trigger fires on insert only, and `harness.nodes` has no append-only trigger. `harness_app` cannot update a node.

  Harm: `subtree()` walks the path, so a rule can miss a node with no error.

- `verdicts.stage_level`. Rule: each stage runs at a node of its level (`graph.stages`). Path: record a `create_pack` run at a domain node.

  Harm: a pack can exist outside a leaf.

- `verdicts.hash_per_version`. Rule: one version always means the same words (`enforce.rule_record`). Path: write a verdict of a rule version with one hash, then one with another hash. No check compares the hash with the lock or with `harness.derived_rules`.

  Harm: a query by rule version mixes two sets of words.

- `verdicts.accept_without_pass`. Rule: the graph accepts an output when each strict rule gives pass (`enforce.binding`). After a spent repair budget, a person decides. Path: record a run, then accept its output. `acceptOutput()` reads no verdict, and no table records the decision of a person.

  Harm: the store gives no last line of defense. `plan.judge_step` must hold this rule.

- `verdicts.no_round`. Rule: the log has one row for each output item and each rule (`enforce.audit`). Path: write a fail verdict, then a pass verdict for the same target, as a repair round does. No column names the round or the output.

  Harm: the log cannot say which verdict decided which draft, except by its time.

- `verdicts.outputs_per_run`. Rule, inferred: one run accepts one output. Path: accept two outputs for one run.

  Harm: the verdicts of the run cannot name their output.

- `rules.lock_hand_entry`. Rule: each new version supersedes the version before it (`enforce.rule_record`). Path: the lock holds version 1, and a PR adds an entry for version 3 by hand. `rules:check --base` passes, because the loader checks only the version of the file and its supersedes entry.

  Harm: the lock can hold a hash that no rule file ever had.

- `rules.watch_first`. Rule: a new rule version starts as watch only (`rules.harness`). Path: a PR adds version 1 with binding `strict`, and `rules:check` passes. The hash covers the binding. So a promotion out of watch is a new version too, and that version cannot start as watch.

  Harm: the code does not hold the rule, and the rule and the hash disagree.

- `derived_rules.skip_version`. Rule: each new version supersedes the version before it (`enforce.rule_record`). Path: add version 2 of a derived rule with no version 1. The loader refuses this for a stage rule.

- `derived_rules.two_owners`. Rule: one rule has one owner (`graph.scope`). Path: add version 1 at `skincare`, then version 2 at `sunscreen`.

- `derived_rules.two_active`. Rule: readers see the active rules only (`enforce.rule_record`). Path: add two versions with status `active`. Rows only grow, so version 1 can never retire.

  Harm: a reader that takes each active row applies two versions of one rule.

- `derived_rules.id_collision`. Rule: one id names one rule. Path: the lock holds version 1 of a stage rule. Then a stage run adds a derived rule with that id and version, and with other words.

- `migration.guard_gaps`. Rule: after the migration, no role but `harness_app` reaches the two schemas (`store.safety`). Also, `harness_app` has no right on a Kyaloon table. The guard reads ACL entries only.

  Path: the Supabase default privileges exist, and the migration commits. A table that a later migration makes in `harness` then opens to PUBLIC and `anon`. The existing migration test applies each file under these defaults. So it catches a later file that does not revoke again.

  The sweep found more unsafe pre-states that commit. In them, `anon` is a member of `harness_app`, or owns the schema or a harness table. In others, `harness_app` holds a right on a Kyaloon table, or schema `harness` has a default privilege for `anon`.

  Harm: each other gap needs an object from before the migration. The read-only pre-check in `db/audit-public-grants.sql` shows the role and the schemas, if a person reads it.

- `migration.per_file_stop`. Rule: the guard stops the migration "and rolls it back" (`0003_harness_role.sql`).

  Path: `harness_app` exists with a system attribute. Each file runs in its own transaction, as `applyMigrations()` of `tests/db.ts` runs them. The guard stops `0003`, but the tables of `0001` and `0002` stay. They have no row level security, and PUBLIC can execute their trigger functions.

  With the Supabase default privileges, `anon` can also use all 45 tables. In one transaction, the stop rolls back all.

  Harm: the live apply used one RealDose migration file. Whether the Supabase CLI runs a file in one transaction is a guess, not verified.

## The charts `formal_check.charts`

The pstack `/statechart` skill drew these charts from TLC. A chart above 500 states shows the bug paths only.

### `NodeTree_owner`

```mermaid
---
title: "The category tree in harness.nodes"
---
stateDiagram-v2
  state "Legend" as legend {
    lg0: ok
    lg1: broken
    lg2: Breaks NoChildUnderLeaf or PathAgreesWithParent or WalkAgreesWithParents
    lg3: Path to the NoChildUnderLeaf or PathAgreesWithParent or WalkAgreesWithParents bug
  }
  class lg0 teal
  class lg1 orange
  class lg2 breaks
  class lg3 bugPath
  s0: No node yet
  s1: Each path agrees with its parent
  s2: A path disagrees with its parent
  s3: A path disagrees with its parent, and a child sits under a leaf
  s4: A child sits under a leaf
  [*] --> s0
  s0 --> s1: harness_app adds a node
  s1 --> s1: harness_app adds a node
  s1 --> s2: the table owner moves a node to another parent
  s1 --> s3: the table owner moves a node to another parent
  s1 --> s4: the table owner changes the level of a node
  s2 --> s1: the table owner moves a node to another parent
  s2 --> s3: the table owner changes the level of a node or the table owner moves a node to another parent
  s3 --> s1: the table owner moves a node to another parent
  s3 --> s2: the table owner changes the level of a node or the table owner moves a node to another parent
  s4 --> s1: the table owner changes the level of a node
  s4 --> s2: the table owner moves a node to another parent
  s4 --> s3: the table owner moves a node to another parent
  s2 --> s4: the table owner moves a node to another parent
  s3 --> s4: the table owner moves a node to another parent
  classDef breaks fill:#ffecee,stroke:#e72e3b,stroke-width:2.5px,color:#cd2834
  class s0 teal
  class s0 bugPath
  class s1 teal
  class s1 bugPath
  class s2 orange
  class s2 breaks
  class s2 bugPath
  class s3 orange
  class s3 breaks
  class s3 bugPath
  class s4 orange
  class s4 breaks
```

### `VerdictLog`

```mermaid
---
title: "A stage run, its verdicts and its output in the graph store"
---
stateDiagram-v2
  state "Legend" as legend {
    lg0: ok
    lg1: broken
    lg2: Breaks AcceptedAfterPassOrPerson or OneOutputPerRun or OneVerdictPerTargetAndRound or OneVersionOneHash or StageFitsNodeLevel
    lg3: Path to the AcceptedAfterPassOrPerson or OneOutputPerRun or OneVerdictPerTargetAndRound or OneVersionOneHash or StageFitsNodeLevel bug
  }
  class lg0 teal
  class lg1 orange
  class lg2 breaks
  class lg3 bugPath
  s0: No stage run
  s1: Run recorded
  s2: Run recorded: at a node of another level
  s3: Output accepted: no verdict
  s4: Verdicts written
  s5: Output accepted: no verdict, two outputs
  s6: Verdicts written: two verdicts for one target in one round
  s7: Verdicts written: one rule version with two hashes, two verdicts for one target in one round
  [*] --> s0
  s0 --> s1: the stage records its run
  s0 --> s2: the stage records its run [at a node of another level]
  s1 --> s3: the stage accepts its output
  s1 --> s4: the judge writes a pass verdict
  s3 --> s5: the stage accepts its output
  s4 --> s6: the judge writes a pass verdict
  s4 --> s7: the judge writes a pass verdict
  classDef breaks fill:#ffecee,stroke:#e72e3b,stroke-width:2.5px,color:#cd2834
  class s0 teal
  class s0 bugPath
  class s1 teal
  class s1 bugPath
  class s2 orange
  class s2 breaks
  class s2 bugPath
  class s3 orange
  class s3 breaks
  class s3 bugPath
  class s4 teal
  class s4 bugPath
  class s5 orange
  class s5 breaks
  class s5 bugPath
  class s6 orange
  class s6 breaks
  class s6 bugPath
  class s7 orange
  class s7 breaks
  class s7 bugPath
```

### `RuleVersions`

```mermaid
---
title: "The versions of one rule: the lock in git and the derived rule rows"
---
stateDiagram-v2
  state "Legend" as legend {
    lg0: ok
    lg1: broken
    lg2: Breaks LockSkipsNoVersion or NewVersionStartsWatch
    lg3: Path to the LockSkipsNoVersion or NewVersionStartsWatch bug
  }
  class lg0 teal
  class lg1 orange
  class lg2 breaks
  class lg3 bugPath
  s0: no stage rule#59; no derived row
  s1: stage rule locked to v1, a version that never ran as watch#59; no derived row
  s2: stage rule locked to v1#59; no derived row
  s3: stage rule locked to v2, a version that never ran as watch#59; no derived row
  s4: stage rule locked to v3, with a version missing below it#59; no derived row
  s5: stage rule locked to v2#59; no derived row
  s6: stage rule locked to v3, a version that never ran as watch#59; no derived row
  s7: stage rule locked to v3#59; no derived row
  [*] --> s0
  s0 --> s1: a PR changes the rule file and passes rules:check
  s0 --> s2: a PR changes the rule file and passes rules:check
  s1 --> s3: a PR adds a lock entry by hand and passes rules:check or a PR changes the rule file and passes rules:check
  s1 --> s4: a PR adds a lock entry by hand and passes rules:check
  s2 --> s5: a PR adds a lock entry by hand and passes rules:check or a PR changes the rule file and passes rules:check
  s2 --> s3: a PR adds a lock entry by hand and passes rules:check or a PR changes the rule file and passes rules:check
  s2 --> s4: a PR adds a lock entry by hand and passes rules:check
  s3 --> s6: a PR adds a lock entry by hand and passes rules:check or a PR changes the rule file and passes rules:check
  s4 --> s6: a PR adds a lock entry by hand and passes rules:check or a PR changes the rule file and passes rules:check
  s5 --> s6: a PR adds a lock entry by hand and passes rules:check or a PR changes the rule file and passes rules:check
  s5 --> s7: a PR adds a lock entry by hand and passes rules:check or a PR changes the rule file and passes rules:check
  s4 --> s7: a PR adds a lock entry by hand and passes rules:check or a PR changes the rule file and passes rules:check
  classDef breaks fill:#ffecee,stroke:#e72e3b,stroke-width:2.5px,color:#cd2834
  class s0 teal
  class s0 bugPath
  class s1 orange
  class s1 breaks
  class s1 bugPath
  class s2 teal
  class s2 bugPath
  class s3 orange
  class s3 breaks
  class s4 orange
  class s4 breaks
  class s4 bugPath
  class s5 teal
  class s6 orange
  class s6 breaks
  class s7 teal
```

### `RuleVersions_derived`

```mermaid
---
title: "The versions of one rule: the lock in git and the derived rule rows"
---
stateDiagram-v2
  state "Legend" as legend {
    lg0: ok
    lg1: broken
    lg2: Breaks DerivedHasOneActiveVersion or DerivedHasOneOwner or DerivedSkipsNoVersion or IdNamesOneRule
    lg3: Path to the DerivedHasOneActiveVersion or DerivedHasOneOwner or DerivedSkipsNoVersion or IdNamesOneRule bug
  }
  class lg0 teal
  class lg1 orange
  class lg2 breaks
  class lg3 bugPath
  s0: no stage rule#59; no derived row
  s1: no stage rule#59; derived rows agree
  s2: stage rule locked to v1#59; no derived row
  s3: no stage rule#59; derived rows: a version skips one
  s4: no stage rule#59; derived rows: two active versions
  s5: no stage rule#59; derived rows: two owners
  s6: stage rule locked to v1#59; derived rows: one version with two hashes
  [*] --> s0
  s0 --> s1: a stage run adds a derived rule version
  s0 --> s2: a PR changes the rule file and passes rules:check
  s0 --> s3: a stage run adds a derived rule version
  s1 --> s4: a stage run adds a derived rule version
  s1 --> s5: a stage run adds a derived rule version
  s2 --> s6: a stage run adds a derived rule version
  classDef breaks fill:#ffecee,stroke:#e72e3b,stroke-width:2.5px,color:#cd2834
  class s0 teal
  class s0 bugPath
  class s1 teal
  class s1 bugPath
  class s2 teal
  class s2 bugPath
  class s3 orange
  class s3 breaks
  class s3 bugPath
  class s4 orange
  class s4 breaks
  class s4 bugPath
  class s5 orange
  class s5 breaks
  class s5 bugPath
  class s6 orange
  class s6 breaks
  class s6 bugPath
```

### `MigrationApply`

```mermaid
---
title: "Applying db/migrations/ to a database that can hold objects from before"
---
stateDiagram-v2
  state "Legend" as legend {
    lg0: running
    lg1: broken
    lg2: Breaks CommittedIsSafe or StopRollsBack
    lg3: Path to the CommittedIsSafe or StopRollsBack bug
  }
  class lg0 blue
  class lg1 orange
  class lg2 breaks
  class lg3 bugPath
  s0: Before: no harness_app, no schema harness, Supabase default privileges
  s1: Before: no harness_app, a harness table with no row level security
  s2: Harness tables made
  s3: Mastra tables made
  s4: Rights set, guard runs
  s5: Migration committed: new tables open to anon
  s6: Migration stopped: a table with no row level security, anon holds a right
  [*] --> s0
  [*] --> s1
  s0 --> s2: the tool runs 0001_harness_tables.sql
  s1 --> s2: the tool runs 0001_harness_tables.sql
  s2 --> s3: the tool runs 0002_mastra_schema.sql
  s3 --> s4: the tool runs 0003_harness_role.sql
  s4 --> s5: the guard finds nothing
  s4 --> s6: the guard stops 0003 [each file is its own transaction]
  classDef breaks fill:#ffecee,stroke:#e72e3b,stroke-width:2.5px,color:#cd2834
  class s0 blue
  class s0 bugPath
  class s1 blue
  class s1 bugPath
  class s2 blue
  class s2 bugPath
  class s3 blue
  class s3 bugPath
  class s4 blue
  class s4 bugPath
  class s5 orange
  class s5 breaks
  class s5 bugPath
  class s6 orange
  class s6 breaks
  class s6 bugPath
```

## What the check leaves out `formal_check.limits`

- The models are small, and TLC covers each order of steps within their bounds only ([design/formal-checks.md](../design/formal-checks.md), `formal.bounds`).

- No model covers two transactions at the same time. A fix of `nodes.owner_update` can add an update trigger. Then that trigger must lock the parent row. If not, two transactions can still put a child under a leaf. This is inferred, not checked.

- The sweep covers 72 pre-states, not each possible database.

- `main` has no branch protection. The models assume that each merge waits for its CI check.
