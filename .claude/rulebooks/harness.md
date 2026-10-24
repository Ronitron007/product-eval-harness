# Harness design `rules.harness`

- A rule is an instruction. The harness makes no difference between rules and instructions. Each rule has an id, a version, a statement, a reason, a kind, a scope, a binding, golden examples, and a provenance record.

- Rules form a graph that projects the category tree. A domain node creates the criteria. An inner or leaf node creates the product attributes, the additions, and the research records behind them. A leaf node also creates the evaluation pack and its layout.

- Each stage writes an output whose shape its rules define. A ruleset judge checks the output before the graph accepts it. Nothing enters the graph without a recorded result for each rule in its scope.

- Each check gives one of three results: pass, fail, or cannot verify. Never count "cannot verify" as "fail" or as "pass". An empty research result is "cannot verify", not proof that a thing is absent.

- Deterministic code may narrow, gate, and verify. It never gives the final match, the final grade, or the final reject. An LLM makes each judgement. To change this, get a yes from Rohan, every time. In Kyaloon, a deterministic grader mis-graded real data, and a deterministic matcher refused real matches.

- If no LLM call is possible, give a short list of options for a person to choose. Never give a silent single answer or a silent reject.

- An attribute describes the product, not the category or the market. Its value is a number with a unit, a word from a closed list, a list of words, or a flag with details. Each attribute keeps a reference to the record that justified it.

- Social signals, such as reviews, ratings, and public sentiment, never enter a grade. Public sentiment can swing for emotional reasons.

- Each stored output keeps the ids and versions of the rules that it passed.

- A new rule version starts as watch only. It runs on its golden examples and on recent outputs. Only Rohan promotes a rule version out of watch, to its real binding.

- A self-improvement loop never scores its own change with a judge that the same change edits. A change to a rule or a prompt must pass a held-out golden set.

- Give each judge the full source text, such as the whole product label. Never give it a short summary of the source.
