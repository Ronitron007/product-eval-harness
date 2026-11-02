# Stage rules

Each stage rule is one YAML file in the folder of its owner node: `rules/<owner node>/<rule id>.yaml`. The fields are those of `RuleRecord` in `src/rules/schema.ts`. The design is in `docs/design/rule-enforcement.md` (`enforce.rule_record`) and `docs/design/compiler.md` (`compile.record`).

The folder `rules/all/` holds the rules for every domain. Its rules have the owner `all`.

`rules.lock.json` holds one hash for each rule id and version. One version number always means the same words. The hash also covers the owner, so a move to another folder needs a new version.

## Write the scope `rules.scope`

The scope counts from the owner node. It names no other node.

- `nodes: owner` selects the owner node only.

- `nodes: subtree` selects the owner node and each node below it.

- `nodes: { level: leaf }` selects each node of that level below the owner. Each named stage must run at that level.

## Write a shape rule `rules.shape`

A shape rule gives the shape of one or more output fields. Its kind is `shape`, and its binding is always `strict`, because the decoder enforces it.

```yaml
kind: shape
shape: { type: text, values: [mg, mcg, g] }
binding: strict
scope: { nodes: subtree, stages: [create_node], fields: ['criteria[].attributes[].unit'] }
```

The shape types are these:

- `text`, with `values`, or with `min_length` and `max_length`. A text shape cannot have both.

- `number`, with `min`, `max`, and `integer: true`.

- `flag`, with no parameters.

- `list`, with `min_items` and `max_items`. The rules on `x[]` give the shape of the items of `x`. A list shape has no `unique`. Use the check `unique_by`.

## Write a code check `rules.check`

A code check names a check of the registry in `src/rules/checks/` and gives its parameters.

```yaml
kind: code_check
check: { name: quote_in_source, params: { source: label, case_sensitive: true } }
```

The checks are `quote_in_source`, `key_in_registry`, `record_exists`, and `unique_by`. Each check file lists its parameters.

## Keep each parameter in one place `rules.literals`

Do not write a parameter value in the statement or the reason. An example is `mg` when `values` holds `mg`. The compiler prints each parameter from the `shape` or `check` field. The loader refuses a second copy.

## Change a rule

1. Edit the rule file on a branch.

2. If the rule is already in the lock, raise `version` by one and set `supersedes` to the old version.

3. Run `npm run rules:lock` to add the new version to the lock.

4. Run `npm run rules:check`. It must exit 0.

5. Open a PR. Rohan approves each rule change.

The lock refuses changed words under a version that it already holds.
