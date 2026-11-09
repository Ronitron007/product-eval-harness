# Prior art: claim, evidence, source, provenance, version, conflict `study.record_models`

Source. An Opus subagent did this study on 2026-11-09, with web search and page reads. It made no paid call. Context that it read: `graph.records`, `graph.node_contents`, `data.layers`, `0001_harness_tables.sql`, and the RealDose section "The record layers".

Labels. Each table row is verified from the pages in its source cell, unless a cell says (inf) for inferred or (guess). "search" means verified only from a search-result excerpt, not from a page that the agent read.

## Summary `study.record_models.summary`

- The most useful models for the shape are nanopublications, Wikidata, SEPIO with VA-Spec, and W3C Web Annotation.

- Nanopublications keep the claim, its provenance, and the information about the record in three separate parts.

- Wikidata lets conflicting values sit side by side. A rank (preferred, normal, deprecated) with a reason picks the default. Wikidata also has explicit "some value" and "no value" forms. So "cannot verify" stays apart from "does not match".

- SEPIO and VA-Spec separate a possible fact (a proposition) from the statement of an agent about it. Evidence is grouped into lines, and each line supports, disputes, or is neutral.

- Web Annotation anchors a quote with the exact text, the text around it, a position, and a pointer to an archived copy.

- Source capture is necessary. Over 75% of the links that papers cite lead to content that changed later (verified, PLOS ONE pone.0167475). A URL with a retrieval date cannot back a quote later. Store the captured bytes (WARC, through `warcio`), their hash, and an archive URL.

- Certainty: use the GRADE levels and domains, with the codes of the FHIR value sets. Quote the source behind each judgment, as RoB 2 does. Do not use bare numeric scores.

## Comparison `study.record_models.table`

| Model | Claim unit | Evidence / source link | Quote anchoring | Versions, supersession, retraction | Conflicts | Certainty | Domain generality | TS + Postgres use | Source |
|---|---|---|---|---|---|---|---|---|---|
| PROV-O | none; Entity | `used`, `wasDerivedFrom`, `hadPrimarySource`, `wasQuotedFrom`, `wasAttributedTo` | none | `wasRevisionOf`, `invalidatedAtTime`, `wasInvalidatedBy`; Bundle = provenance of provenance | no terms | no terms | full | vocabulary only (inf) | read w3.org/TR/prov-o |
| Nanopublications | assertion graph | provenance graph must name the assertion; pubinfo graph | none | immutable; trusty URI hash in id; retraction = new nanopub `npx:retracts`, same key signs, hidden from search; `npx:supersedes` used, semantics not found | others publish a disputing nanopub | none | full; Nanodash templates | `@nanopub/sign` WASM npm 0.2.0, little use (search); needs RDF | read nanopub.net guidelines, nanopub.readthedocs retraction |
| Micropublications | one Claim, root of a support DAG | `supports` to Statement, Data, Method, Material, Reference; minimal = Attribution | stand-off Open Annotation selectors | asserts vs quotes | `directlyChallenges`; `indirectlyChallenges` = undercut a supporter | none | full; OWL purl.org/mp | no live tooling (inf) | read arXiv 1305.3506 PDF |
| SEPIO / VA-Spec | Proposition vs Statement (agent, occasion) | `hasEvidenceLines` → `hasEvidenceItems`; `specifiedBy` Method; `contributions`; `reportedIn` | none | Contribution covers deprecation; no supersede field | `supports / disputes / neutral` per line and statement | `strength` (open scale), `score`, `classification` | core + profiles (ClinGen) | VA-Spec YAML → JSON Schema; SEPIO OWL repo says out of date, moved to LinkML | read SEPIO repo, sepio-linkml, VA-Spec pages, ga4gh/va-spec |
| Wikidata | Statement = main snak + qualifiers + references + rank | reference snaks: `stated in`, `reference URL`, `retrieved` | `quotation` P1683, `page(s)`, `archive URL` P1065, `archive date` P2960 | deprecate, never delete; start/end qualifiers for once-true values | many values coexist; `preferred / normal / deprecated`, `reason for deprecated rank`, `statement disputed by`; queries use best rank | rank; snak `value / somevalue / novalue` | full; fixed datatypes | JSON shape copyable; Wikibase is PHP (inf) | read Wikibase DataModel, Help:Ranking, Help:Sources, Wikibase JSON |
| FHIR R5 Evidence (+ EvidenceVariable) | evidence concept: variables, statistics, certainty | `relatedArtifact`, `citeAs`; PICO-style variables | none | `version`, `status` draft/active/retired/unknown | none | `certainty[]`: type, rating, rater, subcomponent; GRADE domain + rating codes | clinical; maturity 1 | Medplum lists Evidence, not Citation or ArtifactAssessment | read hl7 R5 evidence, evidencevariable, value sets, medplum |
| FHIR R5 Citation | cited work apart from the record | identifiers, webLocation, contributorship | none | `relatesTo`: `retracted-by`, `replaced-with`, `correction-in`; 36 RelatedArtifactType codes | none | none | any artifact; maturity 1 | `@smile-cdr/fhirts` R5 types (search) | read hl7 R5 citation, related-artifact-type |
| FHIR R5 ArtifactAssessment | rating or comment on an artifact | `artifact[x]`, `relatedArtifact` | `path` | `workflowStatus` incl. `entered-in-error`; `disposition` | many authors coexist | `type`, `classifier` (certainty codes), `quantity` | any; maturity 1 | as above | read hl7 R5 artifactassessment |
| GRADE | one outcome, across studies | Evidence Profile: per-domain judgments, footnotes | footnotes | none | inconsistency rates down | high/moderate/low/very low; RCT starts high, observational low; 5 down, 3 up; "not a numerical scoring system" | clinical; method transfers (inf) | via FHIR codes | read gdt.gradepro.org handbook |
| Cochrane RoB 2 | one result of one trial | 5 domains, answers Y/PY/PN/N/NI | free-text support, ideally short quotes | none | none | low / some concerns / high; overall = worst; algorithm proposes, reviewer overrides with reasons | trials; pattern transfers (inf) | none | read Cochrane Handbook ch. 8 |
| ORKG | contribution = statements | `created_by`, `created_at` per statement | none | publish = immutable DOI snapshot; versions linked | comparisons side by side | none | templates: target class, cardinality, range, datatype | REST, Python client | read academy, orkg client docs, arXiv 2209.08789; search templates |
| Web Annotation + Hypothesis | body + target | SpecificResource: source, selector, state | TextQuote (exact/prefix/suffix), TextPosition (brittle), Fragment, Range, `refinedBy`; TimeState `cached` (Memento); Hypothesis re-anchors in 4 steps, last a fuzzy quote match | none | n/a | none | any resource | `approx-string-match` (search); Apache Annotator retired 2025-08-11 | read w3.org/TR/annotation-model, hypothes.is fuzzy-anchoring, incubator.apache.org |
| ClaimReview | Claim reviewed by ClaimReview | `itemReviewed`, `appearance` | none | none | many reviews | `ratingValue`, `alternateName` | fact-check | Google phased out rich result 2025-06-12 | read schema.org, Search Central blog |
| CiTO | citation act | `supports`, `disputes`, `refutes`, `citesAsEvidence`, `usesDataFrom` | none | `corrects`, `retracts` | `disputes`, `refutes` | none | full | vocabulary | read CiTO (property list only) |
| Datomic | datom (e, a, v, tx, op) | tx is an entity; app adds e.g. `:correction/for` | none | immutable; retraction = op false; as-of | none | none | typed attrs | JVM; idea only | read docs.datomic.com |
| XTDB v2 | row version | none | none | `_valid_from/_to` + `_system_from/_to`; SQL:2011 AS OF | none | none | SQL | Postgres wire (search); own engine | read docs.xtdb.com |
| Graphiti / Zep | fact edge | episode linked both ways to facts | none | `valid_at`, `invalid_at`, `created_at`, `expired_at`; old edge kept | LLM finds contradiction; old `invalid_at` = new `valid_at`; new wins | none | full | Python, Neo4j (search) | read arXiv 2501.13956v1 |
| Postgres 18 temporal | row with range | n/a | n/a | `WITHOUT OVERLAPS` PK, `PERIOD` FK, GiST | forbids two rows per key per period | n/a | full | native | read PG18 CREATE TABLE |
| Content ids: Trusty URI, SWHID, RFC 8785 | content object | n/a | SWHID `lines=`, `bytes=` | id = hash of bytes; trusty = SHA-256 base64url; JCS = canonical JSON | n/a | n/a | full | SWHID ISO/IEC 18670:2025 (search) | read trustyuri.net, RFC 8785 |
| Capture: Memento, Robust Links, WARC | archived URL state | URI-R, URI-M, TimeGate; `data-versionurl`, `data-versiondate` | n/a | `Memento-Datetime` = state will not change | n/a | n/a | full | `warcio` npm, TS (search) | read RFC 7089, PLOS ONE pone.0167475 |
| Open Food Facts | product field | images = "primary source and proof" | none | numbered revisions, `rev`, revert; per-field userid, t, rev | none | none | FMCG | REST, ODbL dumps | search OFF docs |

## Patterns that recur `study.record_models.patterns`

| Pattern | Users |
|---|---|
| `pattern.three_parts`: claim, provenance and record metadata in separate blocks | nanopub, Wikidata, FHIR Citation, micropub |
| `pattern.proposition_vs_statement`: a possible fact apart from the assertion of an agent | SEPIO, VA-Spec, ClaimReview, micropub asserts/quotes |
| `pattern.unknown_is_a_value`: "some value" and "no value" are explicit | Wikidata, RoB 2 "No information", Kyaloon coverage gaps (inf) |
| `pattern.qualifiers`: context (time, population, dose, region) beside the value | Wikidata, FHIR EvidenceVariable, micropub Qualifier |
| `pattern.content_hash_id` | trusty URI, SWHID, harness `artifact_hash`, JCS |
| `pattern.append_and_point_back`: never edit; a new record names what it replaces or retracts | nanopub, FHIR relatesTo, ORKG, Datomic, XTDB, Graphiti, PROV, Open Food Facts |
| `pattern.rank_not_delete`: conflicts coexist; a rank with a reason picks the default | Wikidata, Graphiti, micropub challenge graph |
| `pattern.bitemporal`: world time apart from system time | XTDB, Graphiti, Postgres ranges, Wikidata start/end |
| `pattern.evidence_line`: items grouped, with one direction and a strength | SEPIO, VA-Spec, GRADE, micropub |
| `pattern.domain_rated_certainty`: an overall judgment and a judgment per domain, each with a reason | GRADE, RoB 2, FHIR certainty |
| `pattern.anchor_with_capture`: quote + position + archived copy | Web Annotation, Hypothesis, Wikidata P1683 + P1065, Robust Links |
| `pattern.templates`: a versioned typed schema for each kind | ORKG, Nanodash, FHIR profiles, SEPIO profiles |
| `pattern.separate_assessment`: a rating is its own record | FHIR ArtifactAssessment, ClaimReview, RoB 2 |

## A sketch of a record shape `study.record_models.shape`

Field names only. The source of each block is in brackets. This is an inferred design. Nobody tested it.

`record.envelope` [nanopub pubinfo, `harness.records`]: `record_id` (sha256 of JCS bytes) [trusty URI, RFC 8785], `record_key` (lineage, today `b2:<active>:<goal>:<facet>`) [Wikidata statement id], `version`, `kind` (efficacy_claim, regulatory_fact, label_reading, lab_result, price_observation, brand_fact, hazard, test_method, category_fact, conflict, assessment), `template_id`, `template_version` [ORKG, Nanodash], `status` (active, retracted, entered_in_error) [FHIR], `recorded_at` (system time) [XTDB, Datomic].

`record.claim` [VA-Spec Proposition, Wikidata snak]: `subject_type` (product, pack, ingredient, active, brand, category_node, regulation, test_method), `subject_id`, `predicate`, `value_status` (value, some_value, no_value), `value_type` (quantity, range, code, text, boolean, entity_ref), `value`, `unit`, `qualifiers[]` (`property`, `value`) [Wikidata, FHIR EvidenceVariable], `valid_from`, `valid_to` [XTDB, Graphiti], `statement_direction` [VA-Spec].

`record.evidence` [SEPIO, micropub]: `evidence_lines[]` (`direction`, `strength`, `method_ref`, `items[]`); `items[]` (`item_kind`: study_result, label_image, lab_report, regulation_text, web_page, price_listing; `source_id`, `anchors[]`, `extracted_value`); `certainty` (`overall`, `domains[]`: `domain`, `judgment`, `reason`, `anchors[]`) [GRADE, RoB 2, FHIR codes].

`record.source` [FHIR Citation, Wikidata reference]: `source_id`, `identifiers[]` (DOI, PMID, FSSAI notification, ASIN, URL), `source_type`, `title`, `publisher`, `published_at`, `retrieved_at`; `capture` (`capture_hash`, `capture_ref` WARC or object key, `archive_url`, `archive_datetime`) [SWHID, WARC, Memento, Robust Links]; `cited_status[]` (retracted_by, corrected_in, replaced_with) [FHIR relatesTo].

`record.anchor` [Web Annotation, Hypothesis]: `source_id`, `capture_hash`, `selectors[]` (TextQuoteSelector exact/prefix/suffix, TextPositionSelector start/end, FragmentSelector page or image xywh), `state` (`source_date`, `cached`), `anchor_status` (exact, fuzzy, orphaned), `last_checked_at`.

`record.provenance` [PROV-O, nanopub, `graph.records`]: `run_id`, `stage`, `question`, `method`, `tools[]`, `model`, `prompt_hash`, `started_at`, `ended_at`, `agents[]` (`role`, `agent_id`), `used[]`, `derived_from[]`, `rule_versions[]` (`rule_id`, `rule_version`, `rule_hash`).

`record.lineage` [nanopub, FHIR codes, Wikidata]: `supersedes[]`, `retracts[]`, `corrects[]`, `rank`, `rank_reason`, `ranked_by`.

`record.conflict` (a kind) [micropub, Wikidata P1310, Graphiti]: `claims[]` (one subject + predicate), `conflict_type` (direct, undercut, scope_difference), `status` (open, resolved), `resolution` (`preferred_record`, `reason`, `decided_by`, `decided_at`).

`record.assessment` (a kind) [ArtifactAssessment, RoB 2]: `target_record`, `aspect`, `classifier`, `quantity`, `summary`, `author`, `anchors[]`.

Postgres fit (inf):

- `harness.records` gets index columns: `record_key`, `kind`, `subject_type`, `subject_id`, `predicate`, `status`, `rank`.

- The body stays a hashed artifact.

- One append-only `record_links` table (from, to, rel) records the links between records.

- The default view is a best-rank projection: preferred, else normal, never deprecated or retracted. This is the query rule of Wikidata.

## Adopt, copy, or avoid `study.record_models.verdicts`

Adopt as it is:

- The selector JSON of Web Annotation. It is a W3C Recommendation and fits JSONB (inf).

- `approx-string-match` to anchor a quote again. Hypothesis uses it (search). Apache Annotator was retired on 2025-08-11.

- The ranks and snak types of Wikidata. They give "cannot verify" its own value (RealDose invariant 11).

- The direction enum of VA-Spec. One shared word list for evidence lines and statements.

- The GRADE levels and domain codes, as the FHIR value sets spell them. They are stable published codes.

- A subset of FHIR RelatedArtifactType (`supports`, `derived-from`, `replaces`, `retracts`, `corrects`). It is a ready link vocabulary.

- sha256 over RFC 8785 canonical JSON for `record_id`. The hash repeats, and the harness already stores sha256.

- WARC captures through `warcio`, with `archive_url`. Over 75% of cited pages drift.

Copy as an idea:

- The three-part split of nanopublications, retraction by the same authority, and `supersedes`. They fit the append-only triggers of the harness.

- The proposition and statement of SEPIO, and its evidence lines. Conflicts become data.

- The minimal-to-maximal form of micropublications, and the undercut. A price and an efficacy claim can share one shape.

- The LLM contradiction check of Graphiti, which keeps the old fact. The LLM judges and code only records.

- Valid time and system time from XTDB. Prices and regulations need world time.

- The templates of ORKG and Nanodash: a Zod schema with a version for each kind.

- The quoted support of RoB 2 for each judgment.

- ArtifactAssessment as a separate record with its own author.

- The image-as-proof rule of Open Food Facts. A label fact cites a region of a pack image.

Avoid:

- An RDF store, SPARQL, and nanopub servers. They cost work and have no reader in a TypeScript and Postgres team (inf).

- The full qualified pattern of PROV-O. It is too verbose.

- FHIR Evidence as the storage format. It is clinical only, at maturity 1, and Medplum lacks Citation and ArtifactAssessment.

- ClaimReview. It is fact-check markup, and Google dropped its rich result in 2025.

- XTDB, Datomic, or Graphiti as a new database. Postgres ranges and append-only tables are sufficient (inf).

- `WITHOUT OVERLAPS` on the claims table. It refuses two rows for one key in one period, so conflicting claims could not coexist (verified, PG18 docs). Use it only on a derived table of current beliefs.

- TextPositionSelector alone. The spec calls it brittle.

- "Newest wins" as the only rule. A rank with a reason, and a conflict record, keep the losing claim visible.

- A numeric confidence with no label. GRADE is not numeric, and the scales of SEPIO are open.

## Gaps `study.record_models.gaps`

- The semantics of nanopub `npx:supersedes` are not documented. The agent only saw it in use.

- The agent could not read the Software Heritage docs (a bot wall), robustlinks.mementoweb.org (DNS), or the PMC and Springer copies of the micropublications paper.

- Several tooling claims come from search excerpts, and the table marks them "search".

## Sources `study.record_models.sources`

Read: w3.org/TR/prov-o; nanopub.net/guidelines/working_draft; nanopub.readthedocs.io retraction; arXiv 1305.3506; github.com/monarch-initiative/SEPIO-ontology; sepio-framework.github.io/sepio-linkml; va-spec.ga4gh.org evidence-line and statement; github.com/ga4gh/va-spec; mediawiki.org Wikibase/DataModel; wikidata.org Help:Ranking and Help:Sources; doc.wikimedia.org Wikibase JSON; hl7.org/fhir/R5 evidence, evidencevariable, citation, artifactassessment, certainty-type, certainty-rating, related-artifact-type; medplum.com FHIR resources; gdt.gradepro.org handbook; Cochrane Handbook chapter 8; riskofbias.info; academy.orkg.org; orkg.readthedocs.io statements; arXiv 2209.08789; w3.org/TR/annotation-model; web.hypothes.is fuzzy-anchoring; incubator.apache.org annotator; schema.org ClaimReview and Claim; Google Search Central blog 2025-06; sparontologies CiTO; docs.datomic.com data model; docs.xtdb.com time; arXiv 2501.13956; postgresql.org/docs/18 CREATE TABLE; RFC 7089; RFC 8785; PLOS ONE pone.0167475; trustyuri.net; swhid.org v1.2 (front matter only).

Search excerpts only: nanopub `supersedes` and npm packages; trustyuri-spec; SWHID syntax and ISO status; Robust Links; warcio; Postgres 18 posts; XTDB Postgres wire; Graphiti fields and Neo4j; ORKG templates; Open Food Facts; approx-string-match and dom-anchor-text-quote; ClaimReview press coverage.
