# Docs hub `docs`

Start here. Each doc has one kind (`rules.documentation`). Evergreen docs change with the code. Dated docs keep the date of their research in the file name.

## Read in this order `docs.order`

1. [design/rule-graph.md](design/rule-graph.md): the problem, the rule graph, the node levels, and the stages.

2. [design/rule-enforcement.md](design/rule-enforcement.md): the rule record, the compiler, the ruleset judge, the bindings, and how a rule changes.

3. [design/self-improvement.md](design/self-improvement.md): how the harness improves its own stage rules, from the ideas of harness2.

4. [design/mastra-mapping.md](design/mastra-mapping.md): how each part maps onto Mastra 1.79.0.

5. [design/data-layers.md](design/data-layers.md): what each layer of data holds, and where it lives.

6. [plans/2026-10-24-harness-plan.md](plans/2026-10-24-harness-plan.md): the units of work, one PR each.

7. [glossary.md](glossary.md): one definition for each term.

8. [decisions.tsv](decisions.tsv): each ruling and each decision, with who made it and when. This trail outranks the other docs.

The board [canvas/harness.canvas](canvas/harness.canvas) shows the parts and links them to these docs.

## Design `docs.design`

| Doc | What it holds |
|---|---|
| [design/README.md](design/README.md) | The index of the design, and the name map `harness.names` |
| [design/rule-graph.md](design/rule-graph.md) | `graph`: the rule graph and its stages |
| [design/rule-enforcement.md](design/rule-enforcement.md) | `enforce`: how the harness enforces each rule |
| [design/self-improvement.md](design/self-improvement.md) | `improve`: the self-improvement loop |
| [design/mastra-mapping.md](design/mastra-mapping.md) | `mastra`: the parts on Mastra |
| [design/data-layers.md](design/data-layers.md) | `data`: the data layers and their stores |

## Plan `docs.plan`

| Doc | What it holds |
|---|---|
| [plans/2026-10-24-harness-plan.md](plans/2026-10-24-harness-plan.md) | `plan`: the units, their order, their checks, and what needs Rohan |

## Research `docs.research`

| Doc | What it holds |
|---|---|
| [research/2026-10-24-rule-enforcement-prior-art.md](research/2026-10-24-rule-enforcement-prior-art.md) | How other systems make a model follow rules: permission classifiers, structured output, validators, judges, policy as code, provenance |
| [research/2026-10-24-kyaloon-patterns.md](research/2026-10-24-kyaloon-patterns.md) | What the Kyaloon v3 pipeline teaches: the patterns to keep and the gaps to close |
| [research/2026-10-24-criteria-to-attributes.md](research/2026-10-24-criteria-to-attributes.md) | How much of a real criterion splits into measurable attributes |
| [research/2026-10-24-harness2/concepts.md](research/2026-10-24-harness2/concepts.md) | The core concepts of google-research/harness2, with code references |
| [research/2026-10-24-harness2/abstractions.md](research/2026-10-24-harness2/abstractions.md) | The abstractions that bring harness2 into this harness |
| [research/2026-10-24-harness2/look-before-you-build.md](research/2026-10-24-harness2/look-before-you-build.md) | Prior art of self-improving loops |
| [research/2026-10-24-mastra-primitives.md](research/2026-10-24-mastra-primitives.md) | The Mastra primitives that the harness uses, verified against the installed packages |
| [research/2026-10-24-mastra-probes/README.md](research/2026-10-24-mastra-probes/README.md) | The type-check probes behind the Mastra claims |
| [research/2026-10-24-look-before-you-build.md](research/2026-10-24-look-before-you-build.md) | What exists, and why the harness builds the rest |
| [research/2026-10-25-scaffold-look-before-you-build.md](research/2026-10-25-scaffold-look-before-you-build.md) | The Mastra boilerplate that the scaffold starts from, and what it adds |
