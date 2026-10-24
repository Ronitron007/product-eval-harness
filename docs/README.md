# Docs hub `docs`

Start here. Each doc has one kind (`rules.documentation`). Evergreen docs change with the code. Dated docs keep the date of their research in the file name.

## Read in this order `docs.order`

1. [design/rule-graph.md](design/rule-graph.md): the problem, the rule graph, the node levels, and the stages.

2. [design/rule-enforcement.md](design/rule-enforcement.md): the rule record, the compiler, the ruleset judge, the bindings, and how a rule changes.

3. [glossary.md](glossary.md): one definition for each term.

4. [decisions.tsv](decisions.tsv): each ruling and each decision, with who made it and when. This trail outranks the other docs.

## Design `docs.design`

| Doc | What it holds |
|---|---|
| [design/README.md](design/README.md) | The index of the design, and the name map `harness.names` |
| [design/rule-graph.md](design/rule-graph.md) | `graph`: the rule graph and its stages |
| [design/rule-enforcement.md](design/rule-enforcement.md) | `enforce`: how the harness enforces each rule |

## Research `docs.research`

| Doc | What it holds |
|---|---|
| [research/2026-10-24-rule-enforcement-prior-art.md](research/2026-10-24-rule-enforcement-prior-art.md) | How other systems make a model follow rules: permission classifiers, structured output, validators, judges, policy as code, provenance |
| [research/2026-10-24-kyaloon-patterns.md](research/2026-10-24-kyaloon-patterns.md) | What the Kyaloon v3 pipeline teaches: the patterns to keep and the gaps to close |
| [research/2026-10-24-criteria-to-attributes.md](research/2026-10-24-criteria-to-attributes.md) | How much of a real criterion splits into measurable attributes |
