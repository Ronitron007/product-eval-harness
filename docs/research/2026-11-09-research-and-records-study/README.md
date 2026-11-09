# Research and records study `study`

Status. A study of 2026-11-09. It is the look before the design of two modules: a researcher and a record system. Nobody decided anything from it yet. Each claim keeps the label of its source file: verified, inferred, or a guess.

## The question `study.question`

Rohan said on 2026-11-09 that the Kyaloon research and record system moves into this harness. The modules must extend to each product kind and to each kind of research. First, the team studies what exists.

Today, the RealDose research is shaped for supplements. It researches one active ingredient at a time, in kinds `b2` to `b7`, around 15 outcome goals ([realdose-today.md](realdose-today.md)). The harness has one untyped `harness.records` table with 0 rows, and a research port that throws (`unbuiltResearch`).

## The files `study.files`

| File | What it holds |
|---|---|
| [realdose-today.md](realdose-today.md) | The research and record systems of RealDose: live counts, parts for supplements only, hard lessons |
| [research-agents.md](research-agents.md) | Deep-research systems and research APIs: how they plan, type, cite, reuse, and budget |
| [record-models.md](record-models.md) | Standards for a claim, its evidence, its source, its version, and its conflicts |
| [knowledge-stores.md](knowledge-stores.md) | Stores that let agents find and reuse past research, with time and provenance |
| [product-models.md](product-models.md) | Product taxonomies, attribute vocabularies, and product test methods |

## What the study found `study.findings`

### A research kind is data `study.findings.kind`

- No system treats a research kind as a separate object of its own. The Parallel `task_spec`, the column templates of Elicit, and the criteria of Exa Websets come closest ([research-agents.md](research-agents.md)).

- So a kind can be one record of data, not code for each kind (`study.research_agents.kind_param`). Inferred. The record holds these fields:

  - A subject type, a question template, and an output schema.

  - A source policy, an engine, and a budget.

  - Evidence rules, a stop rule, and a freshness limit.

- A label read, a CoA read, and a price check are kinds too. Their engine is OCR, a document reader, or a price source, behind the same port. Inferred.

- The product-models study lists 14 kinds of product research, from label reads to durability tests (`study.product_models.research_kinds`).

### The closest prior art to the researcher `study.findings.template`

The official Mastra template `template-lead-qualification` (pushed 2026-10-21) is the best fit. Verified (read its code). It has these parts:

- An `EvidenceProvider` with `search`, `extract`, and `verify`.

- An evidence row with the exact excerpt and its SHA256 digest. Code checks that each quote is in the excerpt. Then an LLM checks that the quote supports the fact.

- Budget rows that the store reserves before each outside call and settles after it.

- A run id that returns the existing run when it comes again.

- An assessment that a new run can supersede.

- The rule "Missing evidence must remain unknown."

### A record is one claim `study.findings.claim`

The record-models study proposes one shape for all kinds (`study.record_models.shape`). Inferred, not tested. Its parts:

- A claim: a subject type and id, a predicate, a typed value, a unit, and qualifiers such as dose. A subject type is, for example, a product, an ingredient, a brand, or a regulation.

- A value status: `value`, `some_value`, or `no_value`. This keeps "cannot verify" apart from "does not match", as RealDose invariant 11 requires.

- Two times: the time in the world when the claim is valid, and the time when the store recorded it. Prices and regulations need world time.

- Evidence lines. Each line supports, disputes, or is neutral. Each item cites a captured source and an anchored quote.

- Certainty as GRADE levels and domains, each with a quoted reason. Never a bare number.

- Lineage: `supersedes`, `retracts`, `corrects`, and a rank with a reason. Conflicting claims stay side by side. "Newest wins" is not the only rule.

### Capture each source `study.findings.capture`

- More than 75% of the links that papers cite lead to content that changed later (verified, PLOS ONE pone.0167475). A URL and a date cannot back a quote later.

- Store the captured bytes under their SHA-256 hash.

- Anchor each quote with its exact text, the text around it, and a position. W3C Web Annotation does this ([record-models.md](record-models.md)).

- Write each capture to object storage once, with `If-None-Match: *` ([knowledge-stores.md](knowledge-stores.md)).

### Reuse needs a key of our own `study.findings.reuse`

- No system keys bought research by kind, version, subject, and inputs across runs. The harness must build this key. Inferred ([research-agents.md](research-agents.md)).

- The key is the SHA-256 of the canonical JSON of the request. A hit inside the freshness limit of the kind buys nothing.

- A near question is never a silent hit. Code makes a shortlist, and an LLM judge says covers, does not cover, or cannot verify (`study.knowledge_stores.reuse`).

- A retirement is a new append-only row, not an update.

### The store stays on Postgres `study.findings.store`

- No knowledge-store package fits whole. Graphiti, GraphRAG, LightRAG, Cognee, and LlamaIndex need Python or a graph database that we do not run. Mem0 never resolves contradictions ([knowledge-stores.md](knowledge-stores.md)).

- The smallest option is Postgres full text search with filters that code sets, and a node path in `ltree`. Add `pgvector` later, only after a measured miss rate. To enable it is a migration that needs Rohan's yes.

- Mastra Knowledge has a close scope model, but it is alpha and needs `@mastra/core` 1.82. The harness pins 1.79.

- The Supabase database looks like Postgres 17, but the harness spike ran on 18. Test on 17. Inferred.

### Attributes attach to nodes, rules inherit `study.findings.attributes`

- No product-data system in the study inherits attributes down a tree. Each node picks its attributes from one shared registry. Only rules and permissions inherit ([product-models.md](product-models.md)). This matches `graph.shape`.

- The Shopify Standard Product Taxonomy has an MIT licence and covers each FMCG vertical with attributes. It is the seed with the cleanest licence. Open Food Facts covers food, under ODbL.

- RTINGS versions the whole test method of a category, and it prints the version on each review. A pack can do the same.

- GS1 GPC gives two typed reasons for a missing value. Either the value is not in the list, or nobody can get the information.

## What to keep from RealDose `study.keep`

These lessons come from real runs ([realdose-today.md](realdose-today.md), `study.internal.lessons`):

- Content-based ids. Position-based ids pointed 16 of 74 records to the wrong row after a reorder.

- A collision is not a duplicate. All 12 ordinal ids were distinct facts.

- Ask for each item in a known list, so that recall has a denominator. No single broad run covered more than 8 of 15 goals.

- Small aimed runs beat one large run. Safety chunks gave 46 rules, against 9 from the largest tier.

- Definitions in the prompt buy enumeration. The regulatory chunk went from 22 to 55 rows.

- Conflicts and coverage gaps are data, not prose.

- The judge stays with an LLM. Deterministic matchers and graders failed on real data.

## Open calls for Rohan `study.open`

These are product calls. No experiment can settle them.

| Name | Question |
|---|---|
| `open.subject` | Outside supplements, what is the subject of a record: product, ingredient, brand, manufacturer, lab, regulation clause, or category node? |
| `open.granularity` | One record for each fact, or one for each research artifact? |
| `open.migration` | Do the 10,879 layer B and 220 layer C records move into the harness, or stay behind an adapter? |
| `open.public` | The harness repo is public. Can verbatim quotes and source captures live in a public store? |
| `open.freshness` | What is the maximum age of a stored finding for each kind? |
| `open.providers` | Parallel only, or more engines (Exa, PaperQA2, OCR, a person) behind the port? |
| `open.seed_tree` | Which tree seeds the category tree: Shopify (MIT), Open Food Facts (ODbL, food only), or none? |
| `open.reliability` | Can an owner-survey failure rate become a research record? It is a market statistic. |
