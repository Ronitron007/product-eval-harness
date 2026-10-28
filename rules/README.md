# Stage rules

Each stage rule is one YAML file in the folder of its owner node: `rules/<owner node>/<rule id>.yaml`. The fields are those of `RuleRecord` in `src/rules/schema.ts`, and the design is in `docs/design/rule-enforcement.md` (`enforce.rule_record`).

`rules.lock.json` holds one hash for each rule id and version. One version number always means the same words.

## Change a rule

1. Edit the rule file on a branch.

2. If the rule is already in the lock, raise `version` by one and set `supersedes` to the old version.

3. Run `npm run rules:lock` to add the new version to the lock.

4. Run `npm run rules:check`. It must exit 0.

5. Open a PR. Rohan approves each rule change.

The lock refuses changed words under a version that it already holds.
