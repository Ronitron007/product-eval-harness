# Knowledge stores for research reuse `study.knowledge_stores`

Source. An Opus subagent did this study on 2026-11-09 for the harness record store and `search_records` (`plan.research_tools`, `graph.records`). It read only and made no paid call. It ran the read-only Supabase MCP `list_extensions` on the Kyaloon Supabase project. Labels are "verified (read X)", "inferred", or "a guess".

## Summary `study.knowledge_stores.summary`

- No package fits whole for `search_records` on TypeScript, Supabase Postgres, append-only rows, and filters that code sets. The smallest option needs no new npm package (`study.knowledge_stores.smallest`).

- Postgres full text search is built in, and `pg_trgm` is installed. `pgvector` 0.8.0 is offered on the Supabase project but is not installed. To enable it is a migration that needs Rohan's yes. Drizzle 0.45.4 already has `vector` and `cosineDistance`. Verified (ran `list_extensions`, read the drizzle types).

- Mastra Knowledge is alpha and arrives in core 1.82. The harness pins 1.79. `KnowledgePG` already ships in `@mastra/pg` 1.32.0. Its scope model is close to ours, so revisit it later.

- Inferred: the Supabase database is Postgres 17 (`pgaudit` 17.1), but the harness spike ran on 18. Postgres 18 `WITHOUT OVERLAPS` is not available, so use `btree_gist` exclusion constraints. Test on 17.

- A product call for Rohan: the maximum age of a stored finding for each kind.

## Sources `study.knowledge_stores.sources`

- Harness: `docs/design/{rule-graph,data-layers,mastra-mapping,graph-store}.md`, `docs/plans/2026-10-24-harness-plan.md`, `docs/research/2026-10-24-mastra-primitives.md`, `db/migrations/0001_harness_tables.sql`, `package.json`.

- Installed packages: `@mastra/core` 1.79.0 (`storage/domains/{knowledge,blobs}/base.d.ts`, the bundled docs `docs-sandbox-search`, `docs-memory-{semantic-recall,working-memory,observational-memory}`, `reference-tools-vector-query-tool`, `reference-processors-response-cache`); `@mastra/pg` 1.32.0 (`reference-vectors-pg`, `reference-rag-metadata-filters`, `storage/domains/knowledge/index.d.ts`); `drizzle-orm` 0.45.4 (`sql/functions/vector.d.ts`).

- RealDose: `docs/practices/research.md`, `docs/practices/data-storage.md`, and the specs `2026-10-19-retrieval-c-and-d/02-c-evidence-search.md`, `2026-10-20-retrieval-c/README.md`, `2026-10-18-retrieval-facts-and-terms-strategy.md`.

- npm view: `@mastra/{memory,rag,core}`, `mem0ai`, `@getzep/zep-cloud`, `@letta-ai/letta-client`, `llamaindex`, `pgvector`, `warcio`, `@webrecorder/wabac`, `@upstash/semantic-cache`, `lightrag`, `graphiti`, `graphrag-ts`.

- Web: mastra.ai (`llms.txt`, Knowledge overview, search and limits, rerank, semantic recall); the Graphiti repo, `graphiti_core/edges.py`, `search/search_filters.py`, pypi `graphiti-core`, the Zep paper arXiv 2501.13956; the GraphRAG repo and outputs page; the LightRAG repo and `postgres_impl.py`; the Mem0 OSS overview and v2-to-v3 migration doc; the Letta archival memory guide and repo; the Cognee repo; the LlamaIndex property graph guide and the LlamaIndexTS repo; the ParadeDB, Apache AGE and pgvector repos; the Supabase hybrid search guide and extensions page; the GPTCache and Upstash semantic-cache repos; WACZ spec 1.1.1, the `warcio.js` repo, the Browsertrix repo, RFC 7089; bazel.build remote caching; the Parallel Monitor API blog.

- Search results only: the Zep CE deprecation, the Letta passages search API, Cognee time awareness, `pg_textsearch`, Postgres 18 temporal constraints, R2 conditional PutObject, the Parallel Task API.

## Comparison `study.knowledge_stores.table`

"Filter" means a structural filter that code can set (subject, kind, node), not only similarity.

| System | Stored unit | Provenance | Time model | Contradiction | Filter | Stack fit | Licence, state | Label, link |
|---|---|---|---|---|---|---|---|---|
| Mastra RAG + `PgVector` (`@mastra/pg` 1.32.0, `@mastra/rag` 2.7.2) | Vector row with a JSONB `metadata` column | What you put in metadata | None | None | Mongo-style JSONB filter. The vector query tool takes `filter` from request context, or the agent writes it (`enableFilter`). No lexical search | TS, Postgres. The `rag` peer range fits core 1.79 | Apache-2.0, active | Verified (read `reference-vectors-pg`, `metadata-filters`, `vector-query-tool`, npm). [docs](https://mastra.ai/reference/vectors/pg) |
| Mastra memory: semantic recall, working memory, observational memory | Message embeddings; a working-memory block; an observation log | Thread and resource ids. OM retrieval mode links each observation to its raw messages | Message timestamps | Working memory is overwritten. OM compresses (lossy) | Thread or resource scope, plus a thread-metadata filter | TS. `@mastra/memory` 1.39.0 is the newest version that takes core 1.79 | Apache-2.0, active | Verified (read the three docs, npm peer ranges). [docs](https://mastra.ai/docs/memory/overview) |
| Mastra workspace search | Indexed text with metadata | Document id | None | None | Vector filter only. In hybrid mode, "doesn't filter BM25-only results". The BM25 index is process-local. No delete of one document | TS, in core | Apache-2.0 | Verified (read `docs-sandbox-search`) |
| Mastra Knowledge (alpha) | Versioned pages (nodes), records or notes, links, and scopes with parent addresses | Record `sourceThreadId`, `capturedAt`, `metadata`; an activity log | `capturedAt`, plus an optional `when` | Soft delete, restore, rescope, node merge, proposals with `expectedVersion` | Scope addresses. Keyword search by default, vector search opt-in, results rank-merged | `KnowledgePG` is in `@mastra/pg` 1.32.0. The docs say it arrived in core 1.82.0. Records max 1,000 characters (1.79 types). Isolation is "not guaranteed" | Apache-2.0, alpha | Verified (read `knowledge/base.d.ts`, the pg types, mastra.ai Knowledge pages) |
| Mastra `ResponseCache`, `BlobStore` | LLM response keyed by the hash of the resolved prompt; blob keyed by SHA-256 | Key: agent, scope, model, prompt, step | TTL, default 300 s | n/a | Scope string | In core. `ResponseCache` is beta and needs a server cache (Redis) | Apache-2.0 | Verified (read the response-cache doc, `blobs/base.d.ts`) |
| Graphiti; Zep Cloud hosts it | An episode (raw input), plus entity nodes and fact edges | The edge `episodes` list; `reference_time` | Bitemporal: `valid_at`, `invalid_at` (world time); `created_at`, `expired_at` (record time) | An LLM compares a new edge with related edges and sets `invalid_at` on the old one. History is kept | `group_ids`. `SearchFilters`: node labels, edge types, all four dates, property filters | Python. Neo4j, FalkorDB or Neptune; no Postgres. Zep CE is no longer maintained. `@getzep/zep-cloud` 4.1.0 is a hosted client | Apache-2.0, active (0.31.2, 2026-10-20) | Verified (read the repo, `edges.py`, `search_filters.py`, pypi, the paper). [repo](https://github.com/getzep/graphiti) |
| Microsoft GraphRAG | Parquet tables: documents, text units, entities, relationships, communities, reports, claims | `text_unit_ids` | Only claims carry `start_date` and `end_date` | None; you re-index | None | Python | MIT. The repo says maintenance mode, and that indexing "can be an expensive operation" | Verified (read the repo, the outputs page) |
| LightRAG | Entities, relations, chunks | Source chunks and files; citations | None found | Deletion rebuilds the affected entities | Workspace | Python. Its Postgres graph store needs Apache AGE | MIT, active | Verified (read the repo, `postgres_impl.py`) |
| Mem0 OSS v3 | A short memory fact, plus an entity collection | `user_id`, `agent_id`, `run_id`, metadata | None explicit | ADD-only: the new fact is stored beside the old one, and ranking is "expected to surface" the current one. OSS graph memory was removed | `filters` dict | TS SDK `mem0ai` 3.3.1. The server default is Postgres + pgvector | Apache-2.0, active | Verified (read the overview, the migration doc, npm) |
| Letta archival memory | A passage with tags | None documented | Created time; the search takes a start and end datetime | Agents cannot easily edit passages | `tags` with `tag_match_mode` | It is a whole agent server. TS client 1.12.1 | Apache-2.0, active | Verified (read the guide, the repo). Search parameters come from search results |
| Cognee | Datasets of chunks, plus a graph | Document `external_metadata` on each chunk | Optional `temporal_cognify` | Not found | `datasets` | Python, with a TS SDK. Its Postgres graph store is "a demo feature" | Apache-2.0, v1.6.1 | Verified (read the repo). Temporal mode comes from search results |
| LlamaIndex property graph index | Labeled nodes, relations, source text nodes | A manual `HAS_SOURCE` relation | None | None | Property match | Python only. LlamaIndex.TS was archived on 2026-04-30 | MIT | Verified (read the guide, the TS repo) |
| `pgvector` | `vector`, `halfvec` or `sparsevec` column | Your row | Your columns | n/a | Any SQL `WHERE`. An ANN index filters after its scan. Iterative scans exist since 0.8.0 | Offered on our Supabase project at 0.8.0, not installed. Drizzle has `vector` and `cosineDistance` | Open source, 0.8.7 | Verified (read the repo, `list_extensions`, the drizzle types) |
| Postgres full text search + the Supabase hybrid search guide | A `tsvector` column with a GIN index | Your row | Your columns | n/a | Any SQL `WHERE` | Built in. RRF is `1/(rrf_k + rank)` with `rrf_k` 50. `pg_trgm` is installed. `pgroonga`, `rum` and `btree_gist` are offered | PostgreSQL licence | Verified (read the guide, `list_extensions`) |
| `pg_search` (ParadeDB), `pg_textsearch` (Tiger Data), Apache AGE | A BM25 index; a Cypher graph | n/a | n/a | n/a | SQL or Cypher | None is offered on our project | AGPL-3.0; PostgreSQL licence; Apache-2.0 | Verified (read the repos, `list_extensions`). `pg_textsearch` comes from search results |
| GPTCache, Upstash semantic cache | A prompt embedding mapped to a cached answer | None | TTL | n/a | Upstash namespace | GPTCache is Python. The Upstash cache needs Upstash Vector | MIT; Upstash ISC on npm, MIT on GitHub | Verified (read the repos, npm) |
| WARC/WACZ, `warcio`, Browsertrix, Memento | A WARC record. A WACZ zip with a SHA-256 for each file in `datapackage.json`, and `pages.jsonl` with `url` and `ts` | Payload and block digests | Capture time; Memento-Datetime | n/a | CDXJ index by URL and time | `warcio` 2.4.12 is TS on Node. Browsertrix is a Docker crawler | `warcio` Apache-2.0 on npm, MIT in its README. Browsertrix and `wabac` are AGPL | Verified (read the WACZ spec, the READMEs, RFC 7089) |
| R2 conditional PutObject | Object | Key | n/a | n/a | n/a | `If-None-Match: *` is atomic: of several writers to a missing key, at most one wins | Cloudflare | Verified (search results that quote the R2 docs) |
| Kyaloon v3 record union | An immutable record file: `id`, `version`, `kind`, `subject`, `body`, `provenance` | Sidecars for sources, conflicts and gaps | `version` is the run stamp of the source | Newest wins; it "decides nothing" | Key prefix | Supabase Storage `putImmutable` | Ours | Verified (read `research.md`, `data-storage.md`) |
| Kyaloon chat retrieval C (spec) | An addressable evidence unit, with a separate search document | Owner ids, payload hash, JSON pointer | `embedding_revision`, `search_current` | Stale or contradictory evidence cannot prove a must | SQL eligibility filter applied inside retrieval; exact search per collection | `tsvector`, plus an optional 384-d vector | Ours, not deployed | Verified (read the C specs) |

## Patterns that recur `study.knowledge_stores.patterns`

| Pattern | Who uses it |
|---|---|
| Keep the raw input. Link each derived fact back to it | Graphiti episodes, GraphRAG `text_unit_ids`, LightRAG chunks, Kyaloon C (hash + pointer), Mastra Knowledge `sourceThreadId` |
| Two times: world validity, and when the system learned or retired a fact | Graphiti (four fields), Mastra Knowledge (`when`, `capturedAt`), GraphRAG claims, Letta (created time only) |
| Retire, never delete | Graphiti, Mem0 v3, Mastra Knowledge soft delete, Kyaloon append-only |
| An LLM decides contradiction or identity | Graphiti resolution prompts; old Mem0 UPDATE and DELETE |
| Scopes that code sets | Graphiti `group_id`, Mem0 filters, Letta tags, Mastra Knowledge scopes, LightRAG workspace, Cognee datasets |
| Lexical plus vector search, fused by rank | Graphiti (BM25, cosine, BFS, then RRF, MMR, cross-encoder), Mem0 v3 (BM25 boost), Supabase (RRF), Mastra workspace and Knowledge |
| Filter first, and run exact search in a small scope | pgvector docs, Kyaloon C |
| An action key to a result, plus a content-addressed store | Bazel action cache + CAS, Mastra `BlobStore`, the WACZ manifest, R2 `If-None-Match` |
| A similarity cache that answers a near question | GPTCache, Upstash |

## Adopt as a package `study.knowledge_stores.adopt`

| Part | Why |
|---|---|
| Postgres full text search (`tsvector`, `websearch_to_tsquery`, GIN), with `pg_trgm` for spellings | Built in or already installed. Code sets every filter in SQL. Verified (read `list_extensions`). |
| `pgvector` 0.8.0, later, through one reviewed migration | Offered, not installed. To enable it is a live-system change for Rohan. Drizzle needs no new package. Verified. Add it only after a measured lexical miss rate (inferred). |
| `canonicalize` 5.1.0 (already a dependency) + SHA-256 | A stable request key. Inferred. |
| `warcio`, only if full HTTP captures are necessary | TS, and it writes digests. A JSON capture (URL, status, headers, body, fetch time) under a SHA-256 key is smaller to start with. Inferred. |
| `@mastra/rag` `rerank`, optional | Its peer range fits core 1.79. Each rerank is a model call, so it needs the paid-run gate. Verified. |

## Copy as an idea `study.knowledge_stores.copy`

- The times of Graphiti. Give each record `valid_from` and `valid_to` (world time) and `created_at` (record time). A retirement is a new row in its own table, not an update. The fields are verified (read `edges.py`). The mapping is inferred.

- A contradiction judge. Code shortlists records with the same subject and kind. An LLM returns `contradicts`, `consistent`, or `cannot verify`. This follows RealDose invariant 11. Inferred.

- A raw capture and addressable findings. Each finding cites a capture hash and a quoted span, as retrieval C does with a payload hash and a JSON pointer. Inferred.

- The split of an action key and a content-addressed store. One table maps a request key to its record. Blobs go to `captures/sha256/<hash>`, written with `If-None-Match: *`. Inferred.

- The RRF function of the Supabase guide, with `rrf_k` 50 as a start. Verified.

- The tool input shape of Letta and Graphiti: tags, a time window, and namespace ids. Only code fills the namespace. Inferred.

## Avoid `study.knowledge_stores.avoid`

| Part | Why |
|---|---|
| `createVectorQueryTool` with `enableFilter` | The agent writes the filter. Not verified: how a request-context filter combines with an agent filter. |
| Mastra `PgVector` for records | It is a separate table with JSONB metadata. Our filters need `ltree` paths and joins to `harness.records`, so copies would drift. It has no lexical search. Inferred. |
| Mastra GraphRAG | Its edges come from similarity, not from our tree. Verified (`mastra.not_used`). |
| Mastra workspace search | A process-local BM25 index; the hybrid filter gap; no delete. Verified. |
| Mastra memory for research | Thread and user scope; OM is lossy; working memory is overwritten. It may fit chat later. Inferred. |
| Mastra Knowledge, for now | Alpha; needs core 1.82 (we pin 1.79); 1,000-character records; isolation not guaranteed; pages are editable. The limits are verified. The fit is inferred. |
| Graphiti, Zep, GraphRAG, LightRAG, Cognee, LlamaIndex | Python, a graph database we do not run, AGE (not offered), or hosted. GraphRAG is in maintenance mode. LlamaIndex.TS is archived. Verified. |
| Mem0 | Its unit is a short fact about a user, and contradictions stay unresolved by design. Verified. |
| Letta | To adopt it means to adopt its server. Inferred. |
| `pg_search`, `pg_textsearch`, AGE | Not offered on our project. `pg_search` is AGPL. Verified. |
| Semantic caches as the reuse gate | A near question gets a stored answer with no judge: a silent match, against invariant 11. The behavior is verified. The clash with the invariant is inferred. |
| Browsertrix, `wabac` | AGPL, and heavier than one capture for each fetch. Verified. |

## The smallest option on Postgres and Mastra `study.knowledge_stores.smallest`

No new npm package, and one RealDose migration that Rohan applies. This design is inferred.

- Extend `harness.records`. Its columns today are `id`, `version`, `question`, `run_id`, `artifact_ref`, `artifact_hash`, and `created_at` (verified, read `0001_harness_tables.sql`). Add these:

  - `subject` (a product kind or entity), `kind`, and `node_path` (`ltree`).

  - `valid_from`, `valid_to`, and `observed_at`.

  - `search_text` with a generated `tsvector`.

  - A GIN index on the `tsvector` and a GiST index on `node_path`.

- Add `harness.research_requests`: `request_key`, `record_id`, `record_version`, `cost_usd`, `refresh_of`, `created_at`. Append-only.

- Add `harness.record_retirements`: `record_id`, `record_version`, `reason` (`contradicted`, `stale`, `source_gone`, `rule_changed`), `by_record`, `judge_run_id`, `created_at`. Append-only. A record is current when it has no retirement row.

- Make `search_records` a `createTool`:

  - The model gives `query` and an optional `kind`. The node scope comes from request context.

  - The SQL filters first: the path to the root plus siblings, the kind, not retired, and valid at the as-of date. Then it ranks by `ts_rank_cd`. Later, it adds a vector rank, fused by RRF.

  - It returns `id@version`, `artifact_hash`, the quoted findings, `observed_at`, and a stale flag.

- Check valid-time overlaps on Postgres 17 with `btree_gist` exclusion constraints.

## Safe reuse `study.knowledge_stores.reuse`

### Cache keys `study.knowledge_stores.reuse.keys`

| Level | Key | On a hit |
|---|---|---|
| Exact request | SHA-256 of the canonical JSON of: tool id, provider, processor or model, normalized query, parameters, output schema hash, prompt template hash, source limits | Reuse the record, at no cost. Inferred. |
| Same question | `(subject, kind, facet)` from the id grammar, such as `b2:<active>:<goal>:<facet>` | A candidate. A judge returns covers, does not cover, or cannot verify. Inferred. |
| Near question | Lexical or vector neighbours inside the scope that code sets | Candidates for the same judge, never a silent hit. Inferred. |

Keep the run id, the clock, and the node id out of the request key, so that one answer serves sibling nodes. Inferred.

### When a stored finding is stale `study.knowledge_stores.reuse.stale`

- Age. Set a maximum age for each kind. For example, prices age in days, regulatory facts in months, and trial results in years. The numbers are a product call for Rohan. The examples are a guess.

- Contradiction. When the judge marks a newer record `contradicts`, write a retirement row for the older record. Inferred.

- Source change. A new fetch gives a new capture hash, or the URL fails. Inferred.

- Schema or rule change. The kind schema or the rule that shaped the question gets a new version. Inferred.

- Watch. The Parallel Monitor API emits change events on a schedule. Each monitor is a paid run with its own gate. The API is verified (read the blog). Its use here is inferred.

A stale record stays readable as history. It cannot be the only support for a strict rule. In that case, the stage returns "cannot verify" or asks for a paid refresh. Inferred.

### How an agent cites a reused record `study.knowledge_stores.reuse.cite`

Each citation carries:

- `record_id@version` and `artifact_hash`.

- The quoted span, the source URL, the capture hash, and `observed_at`.

- `reused: true`, the original `run_id`, and the request key or the judge run that accepted the reuse.

Cite the record, never the union projection or a digest. The verdict row stores the cited versions, so a later retirement shows which outputs relied on the record. Inferred.
