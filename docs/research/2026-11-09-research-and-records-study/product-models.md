# Product data and product testing models `study.product_models`

Source. An Opus subagent did this study on 2026-11-09 for the rule graph (`graph`) and the criteria-to-attributes research. It read only and made no paid call. Labels: **V(src)** verified, the agent read that source. **Vs(src)** verified only from a search-engine excerpt of that page (the page was blocked or rendered only with JavaScript). **I** inferred. **G** a guess. Source names are in `study.product_models.sources`.

## Summary `study.product_models.summary`

- No product-data system in this study inherits attributes down a tree (V). Attributes attach where products sit: the GS1 GPC brick, ECLASS level 4, the Amazon product type, and each Shopify node, which lists its own set. Only rules and permissions inherit. FSSAI Appendix A is the example: an additive that a category allows is allowed in all its subcategories "unless otherwise stated". This matches `graph.shape`: criteria inherit, and each node picks its attributes from one shared registry.

- Seeds for the category tree:

  - GS1 GPC has the best FMCG coverage, and it groups products by what they are. Its attributes only classify, so they are not grading attributes. The reuse licence is not confirmed, because gs1.org returned 403. Use its brick codes as mapping keys.

  - ONDC is not a seed. It is a flat list of 96 grocery codes, with no licence in the repo. Take its statutory label fields.

  - Open Food Facts is a seed for food only. It is a graph with many parents, against the one-parent tree of `graph.shape`. It is ODbL, so a published derived database must also be ODbL.

  - The Shopify Standard Product Taxonomy (found during the search) has an MIT licence, dated releases, and each FMCG vertical with attributes and values. It is the seed with the cleanest licence.

- A ruling for Rohan: owner-survey reliability (Consumer Reports, Which?). It is a measured failure rate, but it comes from the market, which the rule graph keeps out of grading.

- Not verified: the GPC licence, the EWG and Consumer Reports methods first-hand (403 or paywall), whether Amazon attaches `marketplace_id` and `language_tag` to each value (a guess), and the coverage of Indian products in Open Food Facts.

- Access. A curl retry of the EWG pages with a browser user agent was blocked as bot-check circumvention, and the agent stopped there.

## Comparison `study.product_models.table`

| System | Tree shape | Attribute typing and inheritance | Evidence per value | Method / score versioning | Licence, reuse, upkeep |
|---|---|---|---|---|---|
| GS1 GPC | Segment > Family > Class > Brick. Hierarchy optional; a GTIN gets exactly one brick. 44 segments incl. Food/Beverage, Beauty/Personal Care/Hygiene, Cleaning/Hygiene. Groups by what a product *is*, not intended use. V(gpc_guide, gpc_nutshell) | Attributes on bricks only; upper levels carry none; no inheritance. Closed, mutually exclusive value list; one value per attribute; max 25 per brick; an attribute type is reused across bricks. Must be objective, not marketing, not legislation-dependent. Special values `UNCLASSIFIED` (value not in list) and `UNIDENTIFIED` (info not obtainable). V(gpc_guide) | None; supplier declares via GDSN. I | Two releases a year (May, Nov); delta file lists each change with its Work Request number; codes never reused. V(gpc_guide, gpc_nutshell) | Public download XML/XLSX/JSON V(gpc_guide). Explicit reuse licence not found (gs1.org 403). Active. |
| GS1 GDSN / Global Data Model | No tree; attribute layers Global Core, Global Category, Regional, Local. Vs(gdm) | Trade-item attributes are multi-valued, describe the commercial offer, may be marketing; GPC brick attributes only classify ("no functional overlap"). V(gpc_guide) | Supplier-asserted in data pools; pools add validation rules. Vs(gdm) | Attribute Implementation Guideline releases 1.0 (Dec 2020) to 1.17 (Aug 2026). Vs(gdm) | Docs public; pool data member/commercial. I |
| ECLASS | 4 levels; levels 1-3 are structure only. V(eclass_class) | Properties only on level 4 via a 1:1 "application class". Typed (BOOLEAN, STRING, INTEGER/REAL_MEASURE, DATE, URL); units grouped by quantity; closed value lists (STRING). IRDI with version number per class, property, value. V(eclass_property) | None | Numbered releases; IRDI versions. V | Paid licence via shop; some content free to registered users. Vs. Industrial. |
| UNSPSC | 4 levels, 8 digits (+ optional 5th). Vs | No attributes. Vs | None | Versioned code sets. I | Free use; UNDP owns IP (unspsc.org 403). Vs. Procurement. |
| schema.org Product | No product tree | `additionalProperty` → `PropertyValue`: `propertyID` (URI or code, e.g. eCl@ss), `value`, `unitCode` (UN/CEFACT), `minValue`/`maxValue`, `valueReference`, `measurementTechnique`/`measurementMethod`. V(schema_pv) | No source field; `measurementMethod` names the method. I | Vocabulary releases. I | CC BY-SA 3.0. V(schema_terms) |
| Google Product Taxonomy | Dated text file, version 2021-09-21, ~5,595 categories, up to 7 levels. Vs | No attributes in the file; some categories force extra feed fields. V(google_gpc) | None | One dated version; no change since 2021. I | No licence stated. V(google_gpc) |
| Amazon SP-API Product Type Definitions | Flat product types; only variation parentage (CHILD/PARENT/NONE). V(amz_api) | One JSON Schema (2019-09) per type + custom keywords `selectors`, `maxUniqueItems`, `$lifecycle`, `replacedBy`/`replaces`, `enumDeprecated`, `editable`, `hidden`. V(amz_meta). Values carry `marketplace_id`, `language_tag`. G | None | `productTypeVersion`; latest by default. V(amz_api) | Seller-API terms; not open. I |
| Shopify Standard Product Taxonomy | 26 vertical files; ids like `hb-3-2-9-15` (Sunscreen). V(shopify_data) | Global registry: `base_attributes` + `extended_attributes` reusing value lists (`values_from`). Each node lists its own attributes; no strict inheritance (Sunscreen adds `spf_level`, `pa_rating`, `sunscreen_filter_type`; drops the `scent` of Personal Care). V(shopify_data) | None | Dated releases `v2026-02` to `v2026-10` + `unstable`; mappings to Google taxonomy. V(shopify_repo) | MIT; pushed 2026-11-04. V |
| Open Food Facts | Taxonomies are text-file graphs with many parents (`< en:` parent lines). Categories: 9,466 entries. V(off_categories, off_readme) | Entry properties: `wikidata`, `ciqual_food_code`, `agribalyse_food_code`, `gpc_category_code` (216 entries), `google_product_taxonomy_id` (115), `expected_nutriscore_grade`. File comments show properties inherited from parents. V(off_categories). Product: tags + hierarchy fields; `nutriments` with `_100g`/`_serving`/`_unit`. V(off_schema) | Photos (CC BY-SA); each edit a numbered revision; moderator revert; edit comments. Vs(off_changelog). Additives carry `efsa_evaluation`, `efsa_evaluation_url`, `efsa_evaluation_date`, ADI. V(off_additives). Labels carry certifier `auth_name`/`auth_url`. V(off_labels) | `nutriscore` object keyed by algorithm version (`"2021"`); Nutri-Score V1/V2; `ecoscore_extended_data_version`; `schema_version`. Missing inputs as `states_tags` "to-be-completed". V(off_schema, off_nutriscore) | DB ODbL, contents DbCL, images CC BY-SA; public derived DBs must be ODbL; nightly JSONL/Parquet/CSV dumps. V(off_data). Active. |
| Open Beauty Facts | Same engine; categories 194 entries. V(obf_files) | Taxonomies: ingredients, `inci_functions`, `eu_lists`, `safety` (EU S-phrases, cites EUR-Lex), `warnings`. V(obf_files) | As OFF. I | As OFF. I | As OFF. I (not checked) |
| Open Products Facts | Categories 5,493 entries "Generated from Wikidata and the Google Product Taxonomy (filtered version)"; separate UNSPSC taxonomy (77,335). V(opf_files) | `carbon_impact_fr_impactco2` with source link. V | As OFF. I | As OFF. I | As OFF. I |
| RTINGS | One test bench per category | Box scores from measurements via scoring curves; some tests subjective; usage scores with own weights. Vs(rtings_scoring) | Each review names its test-bench version beside the ratings. V(rtings_versioned) | All test and weight changes ship together as a version with a changelog; TVs 1-2/yr, headphones 2-3/yr; in-lab products ported, scores converted, text not rewritten; old-bench scores greyed as approximations. V(rtings_versioned). TV 2.0: 12 sections not 6; longevity test dropped. Vs(rtings_tv2) | Proprietary. |
| Consumer Reports | Per category | 0-100 Overall Score from weighted sub-scores; cars add predicted reliability and owner satisfaction (member surveys); weights unpublished. Vs(cr) | Retail-bought samples. Vs | Scores updated as data arrives. Vs | Proprietary, paywalled. |
| Which? | Per category | Per-category weights (kitchens 40/40/10/10); Best Buy withheld on poor owner-survey reliability. Vs(which) | Lab + expert assessment. Vs | Dated per-category thresholds (laptop Best Buy 75%→79%, Jan 2024). Vs | Proprietary. |
| Stiftung Warentest | Per test | Weights per test (drills: function 50, handling 35, durability 15). Vs(sw_secondary) | Anonymous purchase, external lab; ~35,000 products, 210+ comparative tests/yr. V(sw_process) | Prüfprogramm per test. V | Proprietary. |
| EWG Skin Deep / Food Scores | Per ingredient, then product | Hazard 1-10 from >60 toxicity/regulatory DBs, 10 health endpoints + ecotox; separate data-availability rating (none…robust). Food: nutrition (Ofcom model) + 0.2 × ingredient concern + 0.1 × processing; never better than nutrition. Vs(ewg_faq, ewg_food) | Database-derived. Vs | Not found | Proprietary; ewg.org 403. |
| Yuka | Food, cosmetics | 60% Nutri-Score, 30% additives (4 risk levels, EFSA/IARC/studies), 10% organic; high-risk additive caps score at 49/100. V(yuka_food) | Sources in app. V | Not found | Proprietary. |
| INCIDecoder | Per ingredient | Own function list; defers to EU CosIng. Vs | Not found | Not found | Proprietary. |
| Wirecutter | Per guide | Pick tiers; "How it's held up" long-term notes; comparison sheets. I (mirror copies only) | Not verified | Guide updates. I | Proprietary. |
| Amazon AutoKnow (KDD 2020) | Product-type tree, >11K types. V(autoknow) | Relation Discovery decides per (type, attribute) applicability and importance (random forest on seller + customer-behaviour features; MTurk labels); then imputation, cleaning, synonyms. V | Later stages fix earlier errors. V | n/a | Paper. |
| OpenTag / MAVE | MAVE: 1,257 categories, 705 attributes. V(mave_repo) | OpenTag: BiLSTM-CRF tags values in title/description, open vocabulary. V(opentag) | MAVE: evidence = paragraph id + `begin`/`end` offsets per source. V | n/a | MAVE archived 2024-02-20; licence not confirmed. |
| Walmart Retail Graph / Alibaba AliCoCo | Walmart: seed (type, attribute, value) dictionary from top sellers. AliCoCo: user-need concepts ("outdoor barbecue"), primitive concepts, taxonomy, items. Vs | Walmart: LLM extraction separate from a QC model; governance module. Vs | Manual tagging. Vs | n/a | Papers/blogs. |
| FSSAI Appendix A (Food Category System) | Categories 1.0-16.0, to 4 levels (1.1.1.1). V(fssai_appA) | An additive allowed in a category is allowed in all subcategories "unless otherwise stated"; descriptors "not to be legal product designations". V. Codex GSFA-based. I | Regulation text | Amended often. Vs | PDF only; reuse terms not checked. |
| FSSAI Labelling 2020; CDSCO Cosmetics Rules 2020 (Rule 34); Legal Metrology (Packaged Commodities) Rules 2011 (Rule 6) | No tree | Mandatory declarations: ingredients, additives, nutrition, veg/non-veg logo (front), net quantity, MRP incl. taxes, dates, batch, licence numbers ("M" cosmetics), importer RC no.; e-commerce must show Rule 6 declarations. Vs(fssai_faq, cdsco_secondary, lm_secondary) | Regulation text | Amendments (Cosmetics 2025). Vs | PDF/gazette. |
| BIS | Indian Standards per product | Compulsory only under QCOs (187 QCOs, 769 products). Vs(bis) | Licence/certificate | IS revisions | Web list, not read. |
| ONDC retail | Domains (RET10 grocery…) with flat enum: 96 grocery codes (`RET10-1000` Diapers & Wipes … `Skin Care`, `Detergents & Dishwash`). V(ondc_category) | Item fields `@ondc/org/statutory_reqs_packaged_commodities` (`manufacturer_or_packer_name`, `common_or_generic_name_of_commodity`, `month_year_of_manufacture_packing_import`) and `statutory_reqs_prepackaged_food` (`nutritional_info` free text, `additives_info`, `brand_owner_FSSAI_license_no`). V(ondc_on_search). Per-category attribute matrix in Google Sheets. Vs | Seller-asserted. I | Spec versions (1.2.5, 2.0.2) as branches. V | YAML in GitHub; no licence in repo metadata. V(ondc_repo) |

Machine-readable trees: GPC (XML/JSON), OFF/OBF/OPF (text graph + dumps), Shopify (YAML/JSON), ONDC (YAML, flat). FSSAI, CDSCO, Legal Metrology, and BIS give PDF or web text only.

## Patterns that recur `study.product_models.patterns`

| Pattern | Who | Note |
|---|---|---|
| Attributes attach where products sit, and do not inherit | GPC brick, ECLASS level 4, Amazon type, Shopify per node | No product-data system studied inherits attributes. V |
| Rules and permissions inherit down | FSSAI additive permissions; GS1 GDM layers; OFF taxonomy properties | Matches `graph.scope`. I |
| One attribute registry; nodes assign | GPC attribute types; Shopify `values_from`; ECLASS IRDI | V |
| Typed reasons for "no value" | GPC `UNCLASSIFIED`/`UNIDENTIFIED`; OFF "to-be-completed"; EWG data availability | Same as "a value or a stated reason" in the criteria-to-attributes research. I |
| Dated releases with change reasons | GPC delta + Work Request no.; Shopify `vYYYY-MM`; Amazon `$lifecycle`; ECLASS IRDI version; OFF `schema_version` | Deprecation is data, not prose. V |
| A score stored with its method version | OFF `nutriscore{"2021":…}`; RTINGS version per review; Which? dated thresholds | V/Vs |
| A method for each category, one shared engine | RTINGS, Which?, Warentest, CR | = one pack per leaf. I |
| Caps and "never better than" | Yuka 49 cap; EWG Food; Green-Score bonus/malus | = v3 caps and adjustments. I |
| Reference knowledge on nodes, with source and date | OFF additives (EFSA URL, date), labels (certifier URL), categories (Agribalyse, Ciqual); OPF CO2 link | Node reference knowledge. I |
| Cross-taxonomy mapping keys on nodes | OFF (GPC, Google, Wikidata); Shopify (Google); OPF (Google, UNSPSC) | V |
| Value evidence as span offsets | MAVE; schema.org `measurementMethod` | V |
| Extractor separate from checker | Walmart QC model; AutoKnow; OFF/Shopify changes via PR | = drafter vs ruleset judge. I |
| Lab result separate from owner survey | CR, Which? | A survey is a market statistic. I |

## Adopt as data `study.product_models.adopt`

| Source | Use | Licence condition |
|---|---|---|
| Shopify taxonomy | Seed tree for every FMCG vertical (Health & Beauty, Food & Beverages, Baby & Toddler, Home & Garden, Electronics) + candidate attribute vocabulary (Sunscreen: `spf_level`, `pa_rating`, `sunscreen_filter_type`, `uva_protection_grade`); each must pass the product-only rule | MIT: keep the notice. V |
| OFF taxonomies (ingredients, additives, allergens, labels, nutrients, packaging) + OBF (`inci_functions`, `eu_lists`) | Node reference knowledge: additive EFSA evaluations with URL and date; certifier per label | ODbL share-alike for a published derived DB; attribution always. V |
| OFF categories | Food subtree seed + mapping table; codes centred on Europe. I. Indian coverage not checked | ODbL |
| FSSAI Appendix A | Regulatory reference on food nodes: additive permissions inherit down. Not consumer node names | Government PDF; reuse terms not checked |
| ONDC statutory fields + Legal Metrology Rule 6 + FSSAI labelling + CDSCO Rule 34 | One India label-declaration attribute set at domain nodes | ONDC has no licence: copy field names only. I |
| GPC brick codes, Google ids, ONDC codes | Mapping keys on our nodes, as OFF does | GPC licence not confirmed |

Can a tree seed ours?

- GS1 GPC. Technically the best global FMCG tree. It groups by identity. Its attributes only classify (single-valued, no numbers, no legal claims), so they are not grading attributes. The reuse licence is not confirmed. Check the GS1 terms (or GS1 India) before an open-source repo ships it. Use brick codes as keys.

- ONDC. No. It is flat and has no licence. Use its Indian names and statutory fields.

- Open Food Facts. Yes, for food only. It has many parents, against the one-parent `graph.shape`. ODbL share-alike applies.

- Shopify. The only MIT tree that covers all FMCG verticals with attributes. It takes the view of a US merchant, and some attributes are claims (`skin_care_effect`) that the judge must filter.

## Copy as an idea `study.product_models.copy`

| Idea | From | Harness place |
|---|---|---|
| Version the whole method of a leaf as one unit; put the version on each evaluation; port old results marked "converted"; flag prose that was not judged again | RTINGS | Pack version and hash; stale flag |
| Typed reasons for a missing value | GPC | Product fact rules |
| A registry with value lists that nodes reuse; each node assigns | Shopify, GPC, ECLASS IRDI + version | `create_node` |
| Attribute lifecycle (`replacedBy`, `enumDeprecated`) | Amazon | Derived-rule versions |
| Reference knowledge as node properties with URL and date | OFF additives | Node reference knowledge |
| A score keyed by method version | OFF `nutriscore` | Evaluation record |
| Data availability separate from hazard | EWG | Share of "cannot verify" for each criterion |
| A release delta that names the change request | GPC | Graph diff + a `decisions.tsv` row |
| Explicit (type, attribute) applicability and importance | AutoKnow | `create_node` relevance, from records, not behaviour logs |
| Evidence as paragraph id + offsets | MAVE | Quote spans in records |
| `PropertyValue` + `unitCode` + `measurementMethod` | schema.org | Fact export format |
| Inheritance "unless otherwise stated" | FSSAI | `graph.scope` (a recorded override only) |

## Avoid `study.product_models.avoid`

- GPC brick attributes as grading attributes. They are single-valued classification flags. V

- Importance from customer behaviour (AutoKnow) and owner satisfaction (CR). These are market signals, which `graph.node_contents` bars. The survey failure rate (Which?, CR reliability) is on the border: Rohan must rule on it.

- ECLASS and UNSPSC data. ECLASS is paid and industrial. UNSPSC is procurement codes with no attributes.

- The Google taxonomy as the source of record. It has no licence and has not changed since 2021. Keep only its ids.

- Ported scores with prose that did not change (the RTINGS gap).

- One overall score across uses. RTINGS left it for usage scores. Vs

## Kinds of research `study.product_models.research_kinds`

| Kind | Yields | Who |
|---|---|---|
| Label read | Facts with quotes (ingredients, doses, claims, declarations) | OFF/OBF, Yuka, INCIDecoder, EWG, Kyaloon; extraction: OpenTag, MAVE, Walmart, AutoKnow |
| Lab test / bench measurement | Values under a named method | RTINGS, CR, Which?, Warentest; batch CoA (Kyaloon) |
| Regulatory check | Allowed or not, limits, mandatory declarations | OFF (EFSA), OBF (`eu_lists`), EWG, FSSAI/CDSCO/Legal Metrology/BIS QCO |
| Toxicology / hazard literature | Ingredient hazard + data availability | EWG, Yuka, INCIDecoder |
| Clinical evidence | Dose bands, claim verdicts | Kyaloon only |
| Nutrition / composition model | Profile score | Nutri-Score (OFF, Yuka), EWG Food, NOVA (OFF) |
| Environmental LCA | Category footprint + bonus/malus | OFF Green-Score (Agribalyse), OPF (ImpactCO2) |
| Certification check | Certifier, scope, URL | OFF labels (`auth_url`) |
| Durability / longevity | Hours to failure, drop tests | Warentest (80 h endurance, drop test), RTINGS (longevity, dropped in TV 2.0), Wirecutter |
| Reliability survey | Failure rate | CR, Which? (market statistic) |
| Firmware retest | Values measured again | RTINGS |
| Expert use test | Handling, sensory | Warentest, Which?, RTINGS subjective tests, Wirecutter |
| Price observation | Unit price over time | Kyaloon (a price provider); no studied evaluator scores price |
| Teardown / repairability | Parts, repair score | Not studied (iFixit not read); OPF has no repair schema. Vs |

## Sources `study.product_models.sources`

- gpc_guide: https://gs1-germany.de/fileadmin/gs1/fachpublikationen/GPC_Development_and_Implementation_Guide_8.0.pdf

- gpc_nutshell: https://www.gs1.nl/media/sfpiaxye/gpc-in-a-nutshell_jun24-def.pdf, and GS1 support articles 43000734162, 43000734291, 43000734164 (support.gs1.org)

- gdm: https://gs1.org/services/gdsn/global-data-model, https://ref.gs1.org/guidelines/gdm-implementation/

- eclass: https://eclass.eu/support/technical-specification/structure-and-elements/property, the classification-class page, https://eclass.eu/shop/en/product/eclass-15-0

- unspsc: https://unspsc.org/faqs (403), https://undp.org/unspsc

- schema: https://schema.org/PropertyValue, https://schema.org/additionalProperty, https://schema.org/docs/terms.html

- google_gpc: https://support.google.com/merchants/answer/6324436

- amz: https://developer-docs.amazon/sp-api/docs/product-type-definition-meta-schema, the product-type-definitions-api page, retrieve-a-product-type-definition.md

- shopify: https://github.com/Shopify/product-taxonomy (README, data/attributes.yml, data/categories/hb_health_beauty.yml, releases)

- off, obf, opf taxonomies: https://github.com/openfoodfacts/openfoodfacts-server/tree/main/taxonomies (downloaded, counted); opf_wiki: https://wiki.openfoodfacts.org/Open_Products_Facts_taxonomies

- off_schema: https://openfoodfacts.github.io/documentation/docs/Product-Opener/schemas/schemas/product/ and the tutorials get-the-nutriscore, get-the-green-score, explain-knowledge-panels; off_data: https://world.openfoodfacts.org/data; off_changelog: https://openfoodfacts.github.io/openfoodfacts-server/api/ref-api-and-product-schema-change-log

- rtings: https://www.rtings.com/company/versioned-test-benches, https://rtings.com/company/test-benches-and-scoring-system, https://www.rtings.com/company/scoring-system-overhaul, https://www.rtings.com/tv/tests/changelogs/2-0

- cr: https://consumerreports.org/about-us/what-we-do/research-and-testing/electronics/

- which: https://www.which.co.uk/about-which/research-methods/testing and the how-we-test pages

- sw: https://www.test.de/unternehmen/testablauf-5017344-0/; galaxus.de test reports

- ewg: https://ewg.org/skindeep/contents/faq, https://ewg.org/foodscores/content/methodology-overall

- yuka: https://help.yuka.io/l/en/article/ijzgfvi1jq

- incidecoder: https://incidecoder.com/ingredient-functions

- autoknow: https://arxiv.org/abs/2006.13473 (PDF read); opentag: https://arxiv.org/abs/1806.01264; mave: https://github.com/google-research-datasets/MAVE, https://arxiv.org/abs/2112.08663

- walmart: https://medium.com/walmartlabs/retail-graph-walmarts-product-knowledge-graph-6ef7357963bc; alicoco: https://arxiv.org/abs/2003.13230

- fssai_appA: https://fssai.gov.in/upload/uploadfiles/files/Appendix%20A.pdf (PDF read); fssai_faq: https://fssai.gov.in/upload/uploadfiles/files/FAQ_Labelling_Display_23_06_2022.pdf

- cdsco and lm secondary: the artixio.com post on Cosmetics Rules labelling; the cn.lakshmisri.com article on Legal Metrology and e-commerce

- bis: https://www.bis.gov.in/wp-content/uploads/2021/08/Guidance-Document-on-Quality-Control-Orders-QCOs-1.pdf

- ondc: https://github.com/ONDC-Official/ONDC-RET-Specifications (branch draft-b2c-1.2.5: api/components/enums/category.yaml, api/components/attributes/B2C/search/on_search.yaml)

- Harness: docs/design/rule-graph.md, docs/research/2026-10-24-criteria-to-attributes.md, docs/research/2026-10-24-kyaloon-patterns.md
