// The expected TLC result of each rule of formal/models/. formal/tlc.ts checks each rule on its
// own and exits 1 when a result differs. A "breaks" row is a finding of 2026-11-02 that waits
// for Rohan's ruling. When its fix lands, the row must change to "holds" in the same PR.
// Some "holds" rows restate a guard of the code that the model copies, such as LockOnlyGrows
// with the CI --base check. The replays and the sweep check the real code.

export type Result = 'holds' | 'breaks'

export interface ModelRule {
  model: string // formal/models/<model>.tla
  config: string // formal/models/<config>.cfg: the constants, and the full rule list for /statechart
  rule: string
  kind: 'INVARIANT' | 'PROPERTY'
  expect: Result
  finding?: string // the name of the finding, for a rule that breaks
}

const rows = (model: string, config: string, kind: ModelRule['kind'], list: [string, Result, string?][]): ModelRule[] =>
  list.map(([rule, expect, finding]) => ({ model, config, rule, kind, expect, ...(finding ? { finding } : {}) }))

export const MODEL_RULES: ModelRule[] = [
  ...rows('NodeTree', 'NodeTree', 'INVARIANT', [
    ['DomainIsRoot', 'holds'],
    ['PathAgreesWithParent', 'holds'],
    ['NoChildUnderLeaf', 'holds'],
    ['WalkAgreesWithParents', 'holds'],
  ]),
  ...rows('NodeTree', 'NodeTree_owner', 'INVARIANT', [
    ['DomainIsRoot', 'holds'],
    ['PathAgreesWithParent', 'breaks', 'nodes.owner_update'],
    ['NoChildUnderLeaf', 'breaks', 'nodes.owner_update'],
    ['WalkAgreesWithParents', 'breaks', 'nodes.owner_update'],
  ]),
  ...rows('VerdictLog', 'VerdictLog', 'INVARIANT', [
    ['OutputAgreesWithRun', 'holds'],
    ['StageFitsNodeLevel', 'breaks', 'verdicts.stage_level'],
    ['OneVersionOneHash', 'breaks', 'verdicts.hash_per_version'],
    ['AcceptedAfterPassOrPerson', 'breaks', 'verdicts.accept_without_pass'],
    ['OneVerdictPerTargetAndRound', 'breaks', 'verdicts.no_round'],
    ['OneOutputPerRun', 'breaks', 'verdicts.outputs_per_run'],
  ]),
  ...rows('RuleVersions', 'RuleVersions', 'INVARIANT', [
    ['FileMatchesLock', 'holds'],
    ['LockSkipsNoVersion', 'breaks', 'rules.lock_hand_entry'],
    ['NewVersionStartsWatch', 'breaks', 'rules.watch_first'],
  ]),
  ...rows('RuleVersions', 'RuleVersions', 'PROPERTY', [['LockOnlyGrows', 'holds']]),
  ...rows('RuleVersions', 'RuleVersions_derived', 'INVARIANT', [
    ['DerivedSkipsNoVersion', 'breaks', 'derived_rules.skip_version'],
    ['DerivedHasOneOwner', 'breaks', 'derived_rules.two_owners'],
    ['DerivedHasOneActiveVersion', 'breaks', 'derived_rules.two_active'],
    ['IdNamesOneRule', 'breaks', 'derived_rules.id_collision'],
  ]),
  ...rows('MigrationApply', 'MigrationApply', 'INVARIANT', [
    ['CommittedPassesTheGuard', 'holds'],
    ['CommittedIsSafe', 'breaks', 'migration.guard_gaps'],
    ['StopRollsBack', 'breaks', 'migration.per_file_stop'],
  ]),
  ...rows('HarnessRun', 'HarnessRun', 'INVARIANT', [
    ['NoModelCallOnRefusedRules', 'holds'],
    ['RepairBudget', 'holds'],
    ['JudgeOnlyAfterCode', 'holds'],
    ['EveryRuleHasARow', 'holds'],
    ['SoftNeverBlocks', 'holds'],
    ['AutoAcceptOnlyWhenStrictPass', 'holds'],
    ['BrokenSchemaNeverAccepted', 'breaks', 'harness_run.extra_key_accepted'],
    ['BrokenSchemaNeverLandsByReviewer', 'breaks', 'harness_run.reviewer_lands_broken_schema'],
    ['JudgeVerdictRestsOnQuote', 'breaks', 'harness_run.quote_unchecked'],
    ['ResumeAfterRuleChangeRefuses', 'breaks', 'harness_run.resume_after_rule_change'],
  ]),
]
