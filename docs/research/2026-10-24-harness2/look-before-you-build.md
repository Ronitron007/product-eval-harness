# Look Before You Build: self-improving harness prior art

Date: 2026-10-24. Scope: prior art for a loop that improves rules, prompts, and stages of the product evaluation harness. This note records the search. It does not choose a design.

## Method

- I searched the web for each named system.

- I read package registry records with HTTP GET only. I installed no package and ran no third-party code.

- I read the TypeScript declarations of `@ax-llm/ax@25.4.5` from unpkg to confirm class names.

- Labels: "verified (read X)" means that I read the named source. "inferred" means that I reasoned from read sources. "a guess" means that I did not check.

## Systems found

| System | What it improves | What decides keep or reject | Needs a numeric score | Package and language | Label |
|---|---|---|---|---|---|
| harness2 (Google Research) | The execution harness of one task (8 file components), plus a per-domain library | An LLM composer reads contrastive execution evidence. A blind LLM selector picks one output. No score in the loop. | No | Python, Apache 2.0, not on PyPI | verified (read repo at `1cfe254`) |
| GEPA (Agrawal et al. 2025) | Text components, such as prompts and code snippets | Pareto frontier over task subsets, after reflective mutation | Yes, plus optional textual feedback ("ASI") | `gepa` 0.1.4 on PyPI, MIT. `dspy.GEPA` in DSPy 3.4.1. `AxGEPA` in `@ax-llm/ax` 25.4.5 (TypeScript) | verified (read PyPI JSON, GitHub README via WebFetch, Ax `index.d.ts`) |
| MIPROv2 (DSPy) | Instructions and few-shot demonstrations | Bayesian search over a metric | Yes | DSPy (Python). Not in `@ax-llm/ax` 25.4.5 declarations | verified for Ax absence (grep of `index.d.ts`). DSPy detail: a guess |
| ACE, Agentic Context Engineering (ICLR 2026) | A "playbook" of strategy bullets | Generator, reflector, curator. Curator operations are ADD, UPDATE, REMOVE | No, it can use execution feedback | `AxACE` in `@ax-llm/ax` 25.4.5 | verified (read Ax `index.d.ts`: `AxACE`, `AxACEPlaybook`, `AxACECuratorOperationType`) |
| ReasoningBank (Google, ICLR 2026) | A memory of reasoning strategies from self-judged successes and failures | Self-judgment by the agent | No | Code at `github.com/google-research/reasoning-bank` (Python) | verified (web search result). Code not read |
| Meta-Harness (Lee et al. 2026, arXiv 2603.28052) | Harness code around an LLM | A coding-agent proposer reads code, scores, and traces of all prior candidates from a filesystem | Yes | Code release not checked | verified (web search result). Code: a guess |
| TextGrad | Text variables in a compound AI system, through "textual gradients" | A loss expressed as LLM feedback | Partly | `textgrad` 0.1.8 on PyPI | verified (PyPI JSON). Method detail: secondary source only |
| ADAS / Meta Agent Search (ICLR 2025) | Agent designs as code | A meta agent programs new agents from an archive of earlier designs. Benchmark score evaluates each design | Yes | Research code, not checked | verified (web search result) |
| OpenEvolve (open AlphaEvolve) | Programs, and optionally prompts | Evaluator score, MAP-Elites database, islands | Yes | `openevolve` 0.4.0 on PyPI, Apache 2.0 | verified (PyPI JSON, web search) |
| Darwin Goedel Machine (Sakana, ICLR 2026) | Its own coding-agent code | Benchmark score plus a novelty bonus over an archive of agents | Yes | `github.com/jennyzzt/dgm` (Python) | verified (web search result) |
| Mastra (`@mastra/core` 1.79.0) | No optimizer. It has datasets, experiments, scorers, gates, and versioned prompt blocks | Human or code compares experiments | Scorers return numbers | TypeScript, Apache 2.0 | verified (read `mastra.ai/llms.txt` and linked pages, npm registry) |
| promptfoo | No optimizer. Eval and test runner | Assertions and LLM rubrics | Yes | `promptfoo` 0.125.0 on npm, MIT | verified (npm registry). Features: a guess |
| dspy.ts | Claims DSPy-style optimizers in TypeScript | Not checked | Not checked | `dspy.ts` 2.2.0 on npm, MIT | verified (npm registry). Quality: a guess |

## What matters for our harness

- Most systems need a numeric metric on a labeled set. harness2 is the exception: it adapts without ground truth, from behavior contrasts. Our harness has explicit rulesets and judges, so we have both kinds of signal. Inferred.

- GEPA and ACE exist in TypeScript through `@ax-llm/ax`. They optimize `AxGen` programs, not Mastra agents. An adapter is necessary to point them at Mastra prompt blocks. Inferred from the declarations.

- No package found implements the harness2 loop (scoped proposers, probe, compose with KEEP_BASE, blind selector, evidence-gated library). Build it from Mastra primitives. Record: no maintained package fits the whole loop. Parts fit (see `abstractions.md`).

- Mastra gives the measurement half: versioned datasets, experiments, `compareExperiments`, `runEvals` gates and verdicts, `notScorable`. It also gives draft and published versions of prompt blocks. verified (read Mastra docs).

## Sources

- harness2 repo, commit `1cfe254e8d25b15f37048c3730134686abe60335`: https://github.com/google-research/harness2

- harness2 paper: https://arxiv.org/abs/2610.14224

- GEPA: https://github.com/gepa-ai/gepa and https://dspy.ai/api/optimizers/GEPA/overview/

- Ax: https://github.com/ax-llm/ax

- Meta-Harness: https://arxiv.org/abs/2603.28052

- ACE: https://arxiv.org/abs/2510.04618

- ReasoningBank: https://arxiv.org/abs/2509.25140

- ADAS: https://arxiv.org/abs/2408.08435

- Darwin Goedel Machine: https://arxiv.org/abs/2505.22954

- OpenEvolve: https://pypi.org/project/openevolve/

- Mastra docs index: https://mastra.ai/llms.txt
