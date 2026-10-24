# Design index `design`

Status. Design of 2026-10-24. No code implements it yet.

| Doc | Name | What it holds |
|---|---|---|
| [rule-graph.md](rule-graph.md) | `graph` | The problem, the rule graph, the node levels, the stages, and the record system |
| [rule-enforcement.md](rule-enforcement.md) | `enforce` | The rule record, the compiler, the ruleset judge, the bindings, the repair loop, the verdict log, and rule changes |

## Name map `harness.names`

Each name has one meaning. Add each new name here (`rules.naming`).

| Name | Meaning | Defined in |
|---|---|---|
| `graph` | The rule graph | [rule-graph.md](rule-graph.md) |
| `domain`, `inner`, `leaf` | The three node levels | `graph.shape` |
| `define_criteria` | The stage that creates the criteria of a domain node | `graph.stages` |
| `create_node` | The stage that fills an inner or leaf node: relevance, meaning, additions, attributes, records | `graph.stages` |
| `create_pack` | The stage that creates the evaluation pack of a leaf node | `graph.stages` |
| `create_layout` | The stage that creates the layout of a leaf node | `graph.stages` |
| `evaluate_product` | The product evaluation that reads a pack. It is not a stage of the graph. | `graph.stages` |
| `context`, `research`, `draft`, `judge`, `repair`, `assimilate` | The parts of one stage run | `graph.stage` |
| `stage_rule`, `derived_rule` | The two kinds of rules by origin | `graph.rule_kinds` |
| `shape`, `code_check`, `judgement` | The three kinds of rules by check | `enforce.rule_record` |
| `strict`, `soft`, `watch` | The three bindings | `enforce.binding` |
| `pass`, `fail`, `cannot_verify` | The three verdicts | `enforce.verdicts` |
| `RuleRecord`, `VerdictRow` | The record of a rule, and one row of the verdict log | `enforce.rule_record` |
