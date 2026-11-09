# RealDose research and records today `study.internal`

Source. An Opus subagent mapped RealDose on 2026-11-09. It read the working tree of the RealDose main checkout, which lags `origin/staging`. It ran read-only SQL on the live Kyaloon database. It made no paid call. Labels: **V** verified (read the file or ran the query), **I** inferred, **G** a guess.

## What the mapper read `study.internal.searched`

- Practice docs: `research.md`, `data-storage.md`, `glossary.md`, `url-to-label.md`, `pricing.md`, and the headings of `pipeline.md`.

- Specs: `2026-08-18-research-information-taxonomy.md`, `2026-08-16-layer-a-registries.md`, `2026-08-16-typed-research-output.md`, `2026-10-18-retrieval-facts-and-terms-strategy.md`, `2026-10-19-retrieval-c-and-d/README.md`, `2026-10-20-retrieval-c/README.md`, the facts part of the answer-engine `03-schema.md`, and the head of `2026-09-26-jev-module-design.md`.

- Research notes: `pack-eval-bridge/README.md`, and the tool belt and product class parts of `2026-09-23-v4-provisioning-stages.md`.

- Code: `pipeline/src/lib/record-{keys,schemas,ingest,union,accounting}.ts`, `research-output-schema.ts`, `goal-fan.ts`, `chunk-research.ts`, `outcome-instruments.ts`, `actives/goals.ts`, `excipients/{schema,taxonomy}.ts`, and the migrations for `active_families`, excipients, `product_verifications` and the price cache.

- Data: `data/reference/fssai-rules-corpus-2026-08-12.md` and the `data/v3/authoring/` listing.

- Harness: `rule-graph.md`, `data-layers.md`, `2026-10-24-kyaloon-patterns.md`, `src/store/schema.ts`, `0001_harness_tables.sql`, `src/stage/types.ts`, `src/stage/ports.ts`, `src/rules/checks/define.ts`.

- Not checked: the kyaloonAI RAG `facts` and `safety` indexes, Notion, and anything on `origin/staging` beyond the working tree.

## Live counts `study.internal.counts`

- Layer B: 43 actives, 10,879 record files. By kind: b2 7,817, b6 1,405, b4 1,309, b7 234, b3 87, b5 27 (V SQL).

- Layer C: 5 shelves, 220 records. Also 1,539 sidecar files, 1,083 research envelopes, 44 digests (V SQL).

- The low b3 and b5 counts match the documented trap: no run in the current research shape owns `forms` or `quality_risks` (V).

- Not live: the `facts` table and `listing_prices`. Live: `attributes` 61, `category_nodes` 44, `criterion_scores` 384 (V SQL).

## Inventory `study.internal.inventory`

| Name | Question | Record shape | Store | Id / version | Writer → reader | Status |
|---|---|---|---|---|---|---|
| `registry.instruments` (Layer A) | What does a scale mean? | `id, name, aliases, kind, construct, direction, range, mcid_min/max/unit, mcid_status, mcid_source` | git `data/v3/authoring/outcome-instruments.json` | kebab id; file v1.0.0 | operator → `typed-research.ts` enum, `renderInstrumentBlock` | live, 21 rows (V) |
| Other Layer A vocabularies | closed lists | per file | git (`canonical-ailments`, `canonical-supplements`, `safety-condition-vocabulary`, `safety-rail-triggers`); code (`goals.ts` `GOALS_VERSION 1.2.0`) | file version | operator → schemas, lints | live (V) |
| `research.envelope` | raw paid answer | `run`, `output.content`, `output.basis`, plus `.request-<runId>.json` | scratch; blob `research-envelopes/<slug>/<kind>/` | filename stamp = record version | `typed-research.ts` → `ingest-records.ts` | live, 1,083 blobs (V SQL) |
| Layer B records | one fact about one active | `{id, version, kind, subject, body, provenance{source_urls≥1, produced_by{run_id, schema_version, processor}}}`. Bodies: b2 `claim`/`absence`/`blend`, b3 form, b4 hazard, b5 quality risk, b6 `india-regulatory`/`upper-limit`, b7 cofactor | blob `records/b/<active>/<kind>/<facets>/<version>.json` | `b2:<active>:<goal>:<facet>`; version = source run stamp; head = newest | ingester → `project-union.ts`, digest, author | live, 43 subjects / 10,879 files (V SQL) |
| Layer C records | one fact about one shelf | same envelope. Bodies: `prevalence` (lane tag), `price-tiers`, `failure-modes` (`detectable_from`), `format-norms`, `excipient-norms`, `claim-patterns`, `component-interactions` | blob `records/c/<category>/...` | `c:<cat>:<family>:<topic>` | `ingest-records --kind category` → `author-category.ts` | live, 5 subjects / 220 (V SQL) |
| Sidecars | bibliography, conflicts, gaps | `sources[{url, title, year, kind, version_status, version_note, canonical_id}]`, `conflicts[{topic, statement_a/b, source_urls_a/b, resolution_hint}]`, `coverage_gaps[{question, why_unanswerable}]` | `records/<layer>/<subject>/meta/...` | per run | ingester → union merge | live, 1,539 (V SQL) |
| `goal.scout` | is there literature per goal? | `goals[{goal, found/nothing-found, facets, pointers}]` | envelope only | never ingested | scout → fan planner | live (V) |
| `union.projection` | current heads as prose | markdown with record ids | `.scratch/projections/` | regenerable | `project-union.ts` → author, `accountRecordIds` | live (V) |
| `goal.coverage` | union vs old doc per goal | report | stdout | — | `goal-coverage.ts` → operator | live, report-only (V) |
| `distillate` | B2 interpreted once | `entries[{outcome_goal, facet, scope shelf/clinical-reference, verdict, population, dose, statement, lead, counterweight_note, record_ids, forms_in_pool}]`, blends, conflicts, ledger | `data/v3/actives/digests/`; blob `digests/b/` | `DistillateSchema 1.1.0`; stamp | `digest-evidence.ts` (opus) → author | live, 44 blobs (V SQL) |
| `active.rubric` | how to grade one active | markdown, 7 sections + criteria JSON | blob `actives/<slug>/rubric-<v>.md`; `composer_artifacts`; pointer on `active_families` | publish instant | `publish-rubric.ts` → rulings, pack author | live, 158 blobs (V SQL) |
| `active_families` | identity (B1), forms, dose bands | `slug, aliases, alias_keys, forms[{elemental_factor...}], dose_bands, cofactor_edges, safety, quality_risks, review_status, blob_key` | Postgres | slug | seeders, publish → detect, lanes | live, 66 rows (V SQL) |
| `excipients` | is this additive safe? | 11 risk factors `{key, value, severity, confidence, rationale, citations}`, verdict, `function_tags`, INS/E | blob `excipients/<slug>/grade-<ISO>.json` + row | slug; `taxonomy_version`, `verdict_rule_version` | drain worker → web/eval | live, 144 rows (V SQL) |
| `pack` | how to grade a shelf | six universals, weights, checklist, clips, adjustments | blob `composer-packs/`; registry | stamp + sha256 | `author-pack.ts` + gate → eval | live, 81 blobs (V SQL) |
| `ruling` | per-active judgment in one product | `criterion, axis, needed, delivered, verdict, position, text, sources` | `data/v3/rulings/`; blob `composer-rulings/` | `<id8>-<active>-<stamp>` | active lane → grading | live, 54 blobs (V SQL) |
| `label.union` | what this product's label says | `LabelExtraction[]`; `Ingredients{items[name, type, amount, rdaPercent, rawText], servingSize, servingsPerPack, source, confidence, discrepancies, panels_read}` | scratch step files → `products.*` | per run | extract-label → writer A, eval | live (V doc) |
| `verification.report` | does an external lab page test THIS product? | `subject, perDomain, outcome, entries[{candidate, checks, sku_match, route, reason}], model, promptSha256` | `data/verifications/`; blob; `product_verifications` | `(run_slug, ran_at)` | verify-external → composer tail | live, 8 rows (V SQL) |
| CoA fetch | the certificate content | — | — | — | — | not built; Unbox S3 and Shopify CoA link patterns noted in memory |
| `price_observations` / `current_prices` | live price | observation per attempt; current row with `status`, `is_stale` | Postgres | serial / `(product, retailer)` | sweep → three pickers | live, 52,680 observations (V SQL) |
| `listing_prices`, `price_store_map` | price per listing (cache) | `marketplace, external_id, provider, result, price_inr, in_stock, source_date, fetched_at` | Postgres | `(marketplace, external_id)` | `get_prices` | migration in tree; tables absent live (V SQL) |
| `product_evals.pricing` | price the eval saw | `price_inr, servings_per_pack, per_serving_inr, per_unit_inr, unit, reason` | Postgres | eval id | composer tail → page | live (V doc) |
| `fssai.corpus` | regulatory calibration | bullets with `source:` = v2 rubric | git `data/reference/` | dated file, v0 | hand → pack author | live, 3,552 bytes, from v2 rubrics, not from the regulations (V) |
| `facts` (answer engine) | product attribute values | `value cols, substance_basis, scope, precision, state valid/conflict/stale/absent, absent_reason, claims[{source_kind, source_id, source_version, mapping_id, observed_at, tested_at, pointer}], decided_by` | Postgres | `(product_id, attribute_id)` | eval ingest → chat | spec; table absent live (V SQL) |
| `retrieval.evidence` | which product evidence answers a shopper question? | `build_id, id, product_id, eval_id, kind, source_ref{payload_hash, json_pointer}, body, support_refs, search_text` | Postgres (proposed) | owner + pointer + hash | projector → `find_products` | spec only (V) |
| v2 corpus | category research, efficacy, ailment and safety briefs | markdown | `data/v2/` | dated | frozen | retired (V ls) |
| `jev` questions | typed judgments | question file, 12-char code | `packages/shared/src/jev/` | code made from the words | steps → cost line | spec agreed 2026-09-26; build state not checked |
| `run_halts`, `FAILURES.md`, `claude-calls.ndjson` | why a run stopped, what it cost | blockers + cost / prose / per-call ledger | Postgres / git / disk | slug / append | pipeline → drain, operator | live (V glossary) |

## Supplement-only and general parts `study.internal.generality`

| System | Supplement-only | Generalizes |
|---|---|---|
| Record envelope | subject = active or shelf slug | `id/version/kind/subject/body/provenance`, immutable generations, version = source run stamp, head = newest, `putImmutable` |
| Key grammar | kinds b1-b7, `POPULATION_VOCABULARY`, `C_FAMILIES` | semantic id from closed vocab or a slug of a source-stated label; bijective id ↔ key; `contentDiscriminator`; 200-char segment gate |
| B2 | `outcome_goal` (15 `CORE_GOALS` + `unparented`), `instrument_id`/`vs_mcid`, `dose.basis elemental`, `forms_in_pool`, GRADE `certainty` | variants claim/absence/blend; verdicts `supported/refuted/untested/unverifiable` + `tested_up_to`; `counterweights`; verbatim `result_as_stated` |
| B3 | elemental conversion, per-goal standings | variant with a stated conversion factor: fits skincare actives and fortificants (I) |
| B4 | `drug-interaction` | contraindication, special-population, monitoring for ingested or applied goods; electronics need other kinds (I) |
| B5 | assay wording | `risk_class, why_this_ingredient, detection_method` is general (I) |
| B6 | authority enum FSSAI/CDSCO/AYUSH/ICMR-NIN; rda/ul | `authority, kind (permitted-form/cap/floor/label-rule/schedule), value_text, population_key` once the authority is data (I) |
| B7 | cofactor | a relation between two subjects (I) |
| Layer C | per-serving price tiers, capsule-focused format norms | prevalence with a denominator and a lane, failure modes with `detectable_from`, claim patterns, additive norms (I) |
| Sidecars | — | `canonical_id` (`pmid/pmc/doi/nct/url`), `version_status`, conflicts that are never resolved, four gap reasons. Other domains need standard, patent and BIS ids (I) |
| Research shape | scout + 15-goal fan; chunks safety/cofactors/regulatory | triage scout with found/nothing-found, then aimed runs with seeds; schema nodes lifted from one builder; 100-property ceiling |
| Layer A | MCID instruments | honesty rule: a value needs a source, else a pointer or null; registries are config in git and give coverage denominators |
| Distillate | goal scope, `shelf/clinical-reference` | merge, resolve and scope once; id accounting closes; an enricher joins sources by id |
| Label union | active/nutrient typing, `rdaPercent`, servings | whole-label OCR, `[unclear]`, `panels_read`, two-reader reconcile, blind re-read |
| Verification | the three lab domains | candidate pool → checks annotate → model rules `sku_match` (6 values) → route; `empty-pool` ≠ `retrieval-failed` |
| Pricing | per-serving divisor | observation log + current row + freshness; the price on an eval is provenance |
| `facts` spec | `elemental/compound` basis | four states, claims with source version, `tested_at` ≠ `observed_at`, `decided_by` (V) |

The six universals are constants in 5 places: the pack schema, the caps, the eval prompt, the layout schema and the page (V v4 note). The `product class` file of the v4 note (`supplement@1` vs `packaged-food@1`) is the only prior design for a second product kind. It is not built (V).

## Lessons learned the hard way `study.internal.lessons`

Research transport:

- Inferred schemas collapse lists. Three runs came back with zero arrays, and l-theanine's `form_name` got one slot (V).

- The API returns 422 above 100 schema properties. v1 had 199, 84 of them from a source object repeated at 12 sites. The fix was one bibliography that items cite by URL, with a headroom of 3 (V).

- A field description that contradicts its type gets objects back. Thiamine and biotin did this for `forms_in_pool` (V).

- `poll` refuses to overwrite after the charge, so the paid run is lost. Two ultra4x runs lost their first poll. The rule now: archive first, `--force`, and success means the file is on disk (V).

- Only 401, 402, 403 and 429 rotate the key (V).

Research cost and shape:

- Per run: core $0.025 (6-8 min), ultra $0.30, ultra2x $0.60, ultra4x $1.20. The digest costs $2.8-3.3 and the author $5.9-8.6. One active costs about $10 end to end (V).

- No monolith covered more than 8 of 15 goals. `skin_hair_nails` was 0 in 7 draws. An ask with no denominator has unmeasurable recall (V).

- Per-run variance dominates every tier, so "attention crowding" is not the cause. The union across runs is the insurance (V).

- The regulatory chunk went from 22 to 55 rows after a prompt rewrite with definitions: "definitions buy enumeration" (V).

- Small safety chunks beat ultra4x monoliths: 46 rules vs 9 (V).

- No run owns forms or quality risks. Live counts: b3 87, b5 27 (V).

Records:

- Position-based ids repointed 16 of 74 on a row reorder. Ids are now content-based (V).

- All 12 ordinal ids were distinct facts that differed only in prose. A collision is not a duplicate (V).

- A version taken from the whole path caused cross-run collisions (V).

- Reading only the first sources sidecar left 242 of 265 sources with no year (V).

- An unbounded `Promise.all` over 300 folders exhausted connections (V).

- 2 of 88 citations dangled. A PubMed address and a PMC address for one paper give two ids (V).

- A wrong women's RDA appeared in the first envelope, so extraction needs a verification pass (V).

- Monitoring protocols and CoA acceptance rules were the first content lost. MCIDs were dropped: 76 of 121 effect mentions bare (V + memory).

- A record inherits the frame of its source rubric. Out of frame means a data gap, never the nearest band (memory).

- The magnesium pack had 0 prevalence rows, and the probiotics pack invented 8 (V).

Judgment boundary:

- Deterministic matcher: 0 matches of 145. Deterministic grader: 7 of 8 forms wrong (V CLAUDE.md).

Label, verification, price:

- 48 of 68 listings named actives without doses. 15 of 19 exit-8 halts were caused by our own code. The picker takes other brands, sibling SKUs and CoAs (memory).

- A domain search never returns empty, so only a ruling removes wrong products (V).

- A CoA issuer can be the manufacturer, with no potency assay (memory).

- An eval price goes stale. The current price provider does not cover most D2C listings (368 of 407 non-Amazon listings) (V + memory).

- 98 of 530 quantity entries have a null number with a status: display slots posing as facts (V).

- The regulatory corpus is 3,552 bytes of v2 extracts (V).

## The harness today and the gap `study.internal.harness_gap`

- The table: `harness.records(id, version int, question, run_id → stage_runs, artifact_ref, artifact_hash)`. It is append-only, with 0 rows and 0 nodes live (V).

- The research port: `ResearchPort → RunEvidence{sources: name → full text, attribute_keys, record_ids}`. The only implementation is `unbuiltResearch`, which throws (V).

- What `graph.records` asks for: the question, method, tools, quoted spans, findings, model, run id, date and rule versions (V).

| RealDose | Harness | Gap |
|---|---|---|
| typed body per kind | untyped artifact | no kind, no body contract |
| semantic id; version = run stamp; head = newest | free id, integer version | no id grammar, head rule or collision rule |
| subject (active or shelf) | stage run at a node | no subject axis; Layer B research comes before any node |
| bibliography with `canonical_id`, per-record `source_urls` | full texts by name | no source identity or citation check |
| conflicts and gaps stored as data | only `cannot_verify` verdicts | absence and conflict are not records |
| union, distillate, id accounting | none | no projection or digest |
| `produced_by` of the provider run | FK to a stage run | Parallel runs are not stage runs |
| one record per fact | one per artifact (I) | granularity is open |
| lane tag; frame in prose only | none | frame gap already named in `kyaloon_patterns.gaps` |
| product evidence (label, verification, price) | an `evaluate_product` enum value only | no product subject |

## Open questions for Rohan `study.internal.open`

- `open.subject`: Outside supplements, what is the subject of a record: ingredient, node, product, brand, manufacturer, lab, or regulation clause? Is ingredient first-class for skincare and food?

- `open.layers`: Keep A/B/C as layers, or use one record kind with a subject type?

- `open.granularity`: One record per fact, or one per research artifact?

- `open.lab_results`: Lab results have entered the eval since 2026-09-26. How do they enter scoring, and are they product-scoped records?

- `open.vocab_owner`: Do domain vocabularies come from `define_criteria`, or stay as git registries under the MCID-style honesty rule?

- `open.head_gate`: Keep the human gate on hazard and regulatory heads in every domain?

- `open.migration`: Do the 10,879 B and 220 C records move into the harness, or stay behind an adapter?

- `open.providers`: Parallel only, or pluggable providers with per-node budgets?

- `open.public`: The harness repo is public. May verbatim quotes and source texts live in a public store?

- `open.pricing`: Is price a harness record, or an operational store outside it?

- `open.reg_corpus`: Who builds regulatory corpora from the regulations, for each class?

- `open.social`: Do reviews and brand reputation become records at all, given that they never become attributes?

