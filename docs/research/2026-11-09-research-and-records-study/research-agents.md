# Prior art: one research engine for many domains and many research kinds `study.research_agents`

Source. An Opus subagent did this study on 2026-11-09. It read only and made no paid call. Labels: "verified (read X)", "inferred", "a guess". Repo facts (stars, licence, last push, last release) are verified (ran `gh api repos/<repo>`, 2026-11-09). The source of each row is in its last cell.

## Summary `study.research_agents.summary`

- No system makes a research kind a first-class object end to end. The Parallel `task_spec` (a reusable input and output schema), the column templates of Elicit and Covidence, and the criteria and enrichments of Exa Websets come closest. A kind can be data (`study.research_agents.kind_param`). Inferred.

- The best fit is the official Mastra template `template-lead-qualification`, pushed 2026-10-21. Verified (read the code):

  - An `EvidenceProvider` with `search`, `extract`, and `verify`.

  - Each piece of evidence keeps its exact excerpt and a SHA256 digest. Code checks that each quote is in that excerpt (`excerpt.includes(quote)`). Then an LLM checks that the quote supports the fact. The quote check is our `substring` fact kind.

  - Budget is reserved in the database before each outside call and settled after it.

  - A repeated run id returns the existing run. A new run can supersede an old assessment by id.

  - "Missing evidence must remain unknown."

- "Never buy the same research twice" has no prior art. No system keys bought research by kind, version, subject, and inputs across runs. PaperQA2 reuses its document index, and ScholarQA caches exact LLM calls. The harness must build this key itself. Inferred.

- Do not use engines that make a prose report (STORM, GPT-Researcher, open_deep_research, OpenAI and Gemini deep research). Gemini says that it "currently doesn't support structured outputs". open_deep_research is archived. Verified.

- Weak spots. Parallel publishes no calibration for its confidence values. One independent preprint found that Elicit quotes matched in only 46% of repeat runs, so store quotes once and never derive them again. The OpenAI deep research API model may have been removed. That rests on one third-party page and is a guess.

## Comparison `study.research_agents.table`

| System | Planning | Typed output | Citation / span | Reuse / cache | Budget | Evaluation | License, state | Basis |
|---|---|---|---|---|---|---|---|---|
| STORM / Co-STORM | Perspectives from similar articles; simulated writer-expert chats; outline. Co-STORM: moderator, human turns, mind map | No (wiki article) | Numbered refs to URLs | `do_research=False` reloads saved stage output | `max_conv_turn` 3, `max_perspective` 3, `search_top_k` 3 | FreshWiki, WildSeek, editors | MIT, 31.8k stars, last release 2025-01, quiet | verified (read README, `engine.py`, arXiv 2402.14207) |
| GPT-Researcher | `choose_agent` LLM picks a role prompt per query; sub-questions; deep mode = tree | No; `report_type` enum (research, resource, outline, custom, detailed, subtopic, deep) | Per-source tracking in prose | none found | breadth 4, depth 2, concurrency 4; ~$0.4/run claimed | 28-task context-filter benchmark | Apache-2.0, 30.6k, v3.7.0 2026-09, active | verified (read README, `agent_creator.py`, `enum.py`, deep_research.md) |
| PaperQA2 | Agent calls paper_search, gather_evidence, gen_answer in any order | Partly: per-chunk JSON summary with 0-10 score (`Context.score`) | Chunk citations; metadata + retraction check | Document index reused; all prior answers indexed | `evidence_k` 10, `answer_max_sources` 5, `max_timesteps` | LitQA2; "matches or exceeds" experts on 3 tasks | Apache-2.0, 9.6k, CalVer 2026-08, active | verified (read README, `types.py`, arXiv 2409.13740) |
| OpenScholar | 45M-paper store + S2 + web, rerank, self-feedback loop | No | Post-hoc attribution; `max_per_paper` | Released retrieval results | `top_n` | ScholarQABench (2,967 queries) | Apache-2.0, 1.7k, quiet since 2025-08 | verified (read README, arXiv 2411.14199) |
| Ai2 ScholarQA / Asta | Retrieve, rerank, extract exact quotes, plan sections, cluster quotes, write; list sections get tables | Tables: schema step, then value step (ArxivDIGESTables) | Quotes extracted before writing | litellm disk cache of LLM calls | `n_retrieval` 256 | AstaBench: 2,400+ problems, cost-accuracy Pareto, date-restricted retrieval | Apache-2.0, active 2026-10/11 | verified (read READMEs, allenai.org/blog/asta, arXiv 2410.22360) |
| LangChain open_deep_research | Clarify, brief, supervisor fans out `ConductResearch`, ReAct researchers, compress, report | Pydantic for control messages only; report is prose | Notes carried to report | none | 5 parallel units, 6 supervisor iterations, 10 tool calls | DeepResearch Bench RACE 0.4344 for $87.83 / 100 tasks | MIT, 12.7k, archived (last commit 2026-08-10) | verified (read README, `configuration.py`, `state.py`) |
| smolagents open DR | Manager CodeAgent over a web agent; replan every 4 steps | No | none | none | `max_steps` 12 / 20 | GAIA val 55.15% (OpenAI 67.36%) | Apache-2.0, 30.3k, v1.26.0 2026-05 | verified (read README, `run.py`, HF blog) |
| Mastra template-deep-research / template-deep-search | Queries, then follow-ups from learnings; deep-search: clarify, plan, search, judge, `dountil` | Zod `structuredOutput` | URL per learning | URL dedupe inside a run | `maxSteps` 15; stop at 4 rounds or "satisfactory"; Exa `numResults` 2 | none | No license file, 38 / 7 stars | verified (read workflow, agent, tool code) |
| Mastra template-lead-qualification | Branches; rounds keyed by missing attributes; `EvidenceProvider.search / extract / verify` | Strict zod union per attribute | Exact excerpt + SHA256 digest; each fact quotes it; code checks `excerpt.includes(quote)`, then LLM verify | Same event id returns the run; `supersedesAssessmentId`; `consultedUrls` | DB `reserve` / `settle` rows: search calls, pages, tokens, bytes, deadline | Verifier and evidence diagnostics modules | Official template (Mastra monorepo; license has an `ee/` carve-out), 2026-10-21 | verified (read README, `providers/evidence.ts`, `research/contracts.ts`, `research/evidence-validation.ts`, `persistence/qualification-store.ts`) |
| dzhng deep-research / Jina node-DeepResearch | Recursive queries + learnings / action loop with gap questions | Jina actions are JSON-schema | Jina requires references before an answer | In-run dedupe | breadth, depth / token budget, then "beast mode" | none | MIT 19.9k / Apache-2.0 5.2k, both TypeScript | verified (read READMEs) |
| OpenAI deep research API | Trained agent; docs advise a cheap model to clarify and rewrite the prompt first | Not in the page read | Annotations with `start_index`, `end_index`, url | none | `max_tool_calls`, `background` | GAIA 67.36% | Paid; one third-party page says the API model was removed 2026-07 (a guess) | verified (read archived cookbook, search results) |
| Gemini Deep Research | `collaborative_planning` returns a plan to edit first | "currently doesn't support structured outputs" | `citations` | `previous_interaction_id` follow-up without rerun | DR ~$1-3, Max ~$3-7; 60 min cap | none stated | Paid, preview ids | verified (read aistudio.google.com/docs/deep-research) |
| Anthropic multi-agent research | Lead saves plan to memory; subagent task = objective, output format, tools/sources, boundaries | Not public | Separate CitationAgent | Plan in memory | 1 agent / 3-10 calls for facts; 2-4 subagents for comparisons; 10+ for complex | ~20 real queries; LLM rubric judge (factual accuracy, citation accuracy, completeness, source quality, tool efficiency) + humans | Product | verified (read anthropic.com engineering post) |
| Elicit | Screening criteria, then extraction columns (predefined or custom instructions) | One column = one typed question per paper | Quote per cell; confidence flag (search snippets) | none found | Credits | 128-answer gold set; judge checks gold AND full text; 94% claimed; screening recall 93.6% | SaaS | verified (read elicit.com eval blog) |
| Consensus | Hybrid search; rerank 1,500 by recency, citations, journal; rerank top 20 | Snapshot fields; Meter Yes/No/Possibly/Mixed (secondhand) | "Every response includes citations" | none found | n/a | none published | SaaS | verified (read consensus.app how-it-works) |
| Undermind | Search; LLM classifies each paper (highly relevant, closely related, ignorable); adapt, follow citations | Labels | Explains each top paper | none | Stops when the "discovery curve" saturates | ~300 queries vs Google Scholar (vendor) | SaaS | verified (read whitepaper PDF, 2024-01-05) |
| Parallel Task API | Vendor-internal | `task_spec`: optional `input_schema`, required `output_schema` (json/text/auto); 100 properties, depth 5, 15k chars | `basis` per top-level field and list element: citations (url, excerpts), reasoning, confidence high/medium/low | `previous_interaction_id` | lite $5 to ultra8x $2,400 per 1,000 runs; ~2 to ~25 fields per tier | No confidence calibration published | Paid | verified (read specify-a-task, access-research-basis, choose-a-processor, pricing) |
| Exa deep search / Agent / Websets | Agent fans out searches, splits list building | `outputSchema` (deep search 10 properties, 2 levels; Agent advises nullable fields); Websets criteria + typed enrichments | `output.grounding` field-level | Websets monitors refresh | Agent `effort`, `budget.maxCostDollars` $1-100 | none | Paid | verified (read exa.ai docs) |
| Systematic-review tools: ASReview + SAFE, otto-SR, Covidence | Human-seeded active learning / LLM screen + extract / custom form | Include-exclude; extraction forms | Dual review; consensus marks conflicts | n/a | SAFE: stop after e.g. 50 irrelevant in a row | Simulation; otto-SR reproduced 12 Cochrane reviews (preprint) | ASReview Apache-2.0, v3.0.8 2026-06 | verified (read ASReview docs); rest from search summaries |
| RTINGS | Fixed test bench per category | Test results per bench | n/a | n/a | n/a | A major bench says scores "aren't directly comparable"; some products re-tested | n/a | search snippets only (pages render nav only) |

Benchmarks: DeepResearch Bench (100 tasks, 22 fields; RACE = criteria generated for each task, dynamic weights, a reference report; FACT = statement-URL pairs, a support check, citation accuracy, effective citations); ResearchQA (21K queries, 160K rubric items, 75 fields, mined from surveys; best system 75% coverage, under 11% of citation items); LitQA2; ScholarQABench; AstaBench; ArxivDIGESTables; GAIA. Verified (read READMEs, arXiv abstracts).

## Patterns that recur `study.research_agents.patterns`

| Pattern | Systems |
|---|---|
| Plan, fan out sub-questions, compress, synthesize | open_deep_research, GPT-Researcher, Anthropic, dzhng, Jina, STORM, Mastra |
| Budget = breadth x depth x iteration caps | GPT-Researcher, dzhng, open_deep_research, STORM, smolagents, Mastra, PaperQA2 |
| Budget = vendor tier or cost cap | Parallel, Exa, Gemini, OpenAI |
| Budget reserved durably before each call | Mastra lead-qualification |
| Output schema for each call, chosen by the caller | Parallel, Exa, Mastra, Elicit columns |
| Provenance for each field (citations, excerpts, reasoning, confidence) | Parallel, Exa, Elicit, lead-qualification |
| Quote first, write second | ScholarQA, PaperQA2, lead-qualification |
| Code checks that the quote is in the source | lead-qualification |
| A verifier apart from the extractor | lead-qualification, Consensus checker models, Anthropic CitationAgent, OpenScholar, FACT, Elicit, Covidence, otto-SR |
| Propose a schema, then fill values | ArxivDIGESTables, Elicit, Covidence, Exa Websets |
| "Not found" kept apart from "false" | lead-qualification, Undermind ("Confirming nothing exists"), Exa nullable fields, Consensus |
| Stop on saturation | Undermind, SAFE, Jina, Mastra `dountil` |
| A person gate on the plan or the result | Gemini, Mastra `suspend`, open_deep_research, OpenAI rewrite, Co-STORM, Elicit, Covidence |
| A role or task template for each query | GPT-Researcher, STORM, Anthropic |
| Reuse across runs | PaperQA2, ScholarQA cache, STORM reload, Gemini and Parallel chaining, lead-qualification ids, harness2 lesson library for each domain |
| A versioned method; compare only within a version | RTINGS, Covidence template changes, PaperQA2 CalVer, DeepResearch Bench judge swap |
| Eval = small real set + rubric judge + citation-support check + cost axis | Anthropic, RACE/FACT, ResearchQA, AstaBench, Elicit |

## Fit for the harness `study.research_agents.fit`

The harness has typed stage outputs, a ruleset judge, append-only records, and an injected `ResearchPort` that returns `RunEvidence` (`sources`, `attribute_keys`, `record_ids`). Verified (read `src/rules/checks/define.ts`, `stage.research_port` in `stage-workflow.md`).

Adopt as a package or a service:

| Item | Why | Caveat |
|---|---|---|
| Parallel Task API as one method behind `ResearchPort` | Schema for each call, `basis` for each field with excerpts, source policy, tiers; already in use | Paid for each run; schema limits; confidence not calibrated |
| Exa Agent / deep search as a second method | `outputSchema`, `grounding`, a hard cost cap | 10-property cap on deep search |
| Asta Scientific Corpus Tool (Semantic Scholar MCP) | Free index of 200M+ papers | Literature only; Mastra MCP client support inferred, not checked |
| PaperQA2 sidecar for literature kinds | The best open literature engine; scored evidence; LitQA2 | Python; CalVer drops compatibility promises |

Copy as an idea (all inferred):

- The `EvidenceProvider` of lead-qualification (`search`, `extract`, `verify`) and its evidence row (exact excerpt, SHA256, retrieved and published dates, provider id). The exact-quote check is our `substring` fact kind, so code may decide it. Semantic support stays with an LLM (RealDose invariant 11).

- Durable `reserve` and `settle` budget rows in Postgres. An idempotent run id, and `supersedes` for append-only records.

- The Parallel `basis` as the finding shape inside `RunEvidence`: field path, citations, excerpts, reasoning, confidence.

- Quote first (ScholarQA, PaperQA2): drafters cite quote ids only.

- Schema, then values (ArxivDIGESTables, Elicit, Covidence) for `define_criteria` and `create_node`.

- A saturation stop (Undermind, SAFE) for hazard and regulatory kinds, and as proof for "nothing found".

- The task fields of Anthropic, and its rules for effort by complexity.

- Date-restricted retrieval and a cost axis from AstaBench, for research evals that can run again.

- Bench versions from RTINGS: each record carries the version of its method.

- Plan approval and follow-up chaining (Gemini, Parallel), so that a refinement never buys the base run again.

Avoid:

| Item | Why |
|---|---|
| A prose report as the research product (STORM, GPT-Researcher, open_deep_research, OpenAI, Gemini) | The judge needs typed fields; Gemini has no structured output. Verified. |
| Python agent frameworks as the engine (LangGraph, smolagents) | Wrong runtime; open_deep_research is archived. Verified. |
| Vendor confidence as a gate | No calibration published; a signal for the judge only. Inferred. |
| Quotes derived again later | Independent preprint: Elicit quotes matched in 46% of repeat runs (values 90%). Store quotes once. Verified (search summary of EcoEvoRxiv 9909). |
| Vote counts as a verdict (Consensus Meter) | It counts papers, not quality. A count that decides a grade breaks invariant 11. Inferred. |
| A hard dependency on the OpenAI deep research model | Status unclear. A guess. |

## A research kind as a parameter `study.research_agents.kind_param`

RealDose builds a query and a schema for each kind in code (`buildGoalRunQuery`, `buildChunkOutputSchemaNode`, and others). Verified (read "Research runs" in RealDose `docs/practices/research.md`).

Systems that make the kind data: the Parallel `task_spec` ("a reusable template"), the column templates of Elicit and Covidence, the criteria and enrichments of Exa Websets, the `report_type` and role prompt of GPT-Researcher, the subagent task fields of Anthropic, the target attributes of lead-qualification (frozen in a config snapshot at admission), and the bench of RTINGS for each category. Verified (read the sources below).

A proposed shape. Inferred, not built:

```ts
const ResearchKind = z.object({
  id: z.string(), version: z.string(),
  subject: z.enum(['node', 'ingredient', 'product', 'brand']),
  question: z.string(),            // template: {node}, {market}, {attribute}
  output: z.unknown(),             // JSON Schema from zod; facts nullable
  sources: z.object({ include: z.array(z.string()), exclude: z.array(z.string()), after: z.string().nullable() }),
  method: z.object({ engine: z.enum(['parallel', 'exa', 'paperqa', 'label_ocr', 'person']), tier: z.string() }),
  budget: z.object({ maxUsd: z.number(), deadlineMs: z.number() }),
  evidence: z.object({ quoteRequired: z.boolean(), minSources: z.number().int() }),
  stop: z.enum(['single', 'saturation']),
  freshnessDays: z.number().int(),  // regulatory short, mechanism long
})
```

- The cache key is the hash of the id, the version, the subject id, the filled question, the sources, and the method. A hit inside `freshnessDays` returns the stored record and buys nothing.

- One rule set checks every kind, because the judge reads `output` and `evidence` from the kind.

- Label reading, CoAs, and prices are not web research. They are kinds whose engine is OCR, a document reader, or a price source, behind the same port.

- `create_node` may propose new kinds as data. A person approves them, as Kyaloon approves aliases that a model proposes.

## Sources `study.research_agents.sources`

Local: product-eval-harness `docs/design/rule-graph.md`, `docs/design/stage-workflow.md`, `docs/research/2026-10-24-kyaloon-patterns.md`, `docs/research/2026-10-24-harness2/concepts.md`, `src/rules/checks/define.ts`; RealDose `docs/practices/research.md` (record layers, research runs).

GitHub (`gh api`): stanford-oval/storm (README, `storm_wiki/engine.py`); assafelovic/gpt-researcher (README, `actions/agent_creator.py`, `utils/enum.py`, deep_research.md); Future-House/paper-qa (README, `types.py`, `prompts.py`); AkariAsai/OpenScholar; allenai/ai2-scholarqa-lib; allenai/asta-bench; langchain-ai/open_deep_research (README, `configuration.py`, `state.py`, commits); huggingface/smolagents (`examples/open_deep_research` README, `run.py`); mastra-ai/template-deep-research, template-deep-search, template-lead-qualification (files named above), mastra (LICENSE.md head); dzhng/deep-research; jina-ai/node-DeepResearch; Ayanami0730/deep_research_bench; metadata of asreview/asreview, google-research/harness2, langchain-ai/local-deep-researcher.

Web: anthropic.com/engineering/multi-agent-research-system; developers.openai.com cookbook introduction_to_deep_research_api (archived); aistudio.google.com/docs/deep-research; docs.parallel.ai (task-api/guides/specify-a-task, access-research-basis, choose-a-processor, getting-started/pricing); docs.exa.ai/reference/exa-research, exa.ai/docs/agent/quickstart.md, exa.ai/docs/websets/overview.md; huggingface.co/blog/open-deep-research; elicit.com/blog/how-we-evaluated-elicit-systematic-review; consensus.app/home/blog/how-consensus-works; undermind.ai/whitepaper.pdf; allenai.org/blog/asta; asreview.readthedocs.io; arXiv 2402.14207, 2409.13740, 2411.14199, 2410.22360, 2504.10861, 2506.11763, 2509.00496.

Search summaries only (weaker): Elicit columns and the EcoEvoRxiv study; Consensus Meter and Study Snapshot; Parallel source policy and interactions; otto-SR (medRxiv 2025.06.13.25329541); the SAFE procedure (PMC10908130); Covidence support; RTINGS changelogs; OpenAI `max_tool_calls` and model status.

Failed fetches: openai.com/index/introducing-deep-research (403); the developers.openai.com deep research guide (404); support.elicit.com article 597825 (404); the docs.parallel.ai source-policy guide (404); RTINGS changelog bodies (nav only).
