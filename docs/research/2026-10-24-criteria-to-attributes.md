# Criteria on measurable attributes `criteria_attributes`

Status. Research summary of 2026-10-24. It changes nothing and decides nothing. It summarizes a study that Claude made on 2026-10-22 for Kyaloon. The study split each criterion of four Kyaloon supplement packs into measurable product attributes. The full study, with each attribute and each condition, stays in the private Kyaloon RealDose repo (commit `b7fa08b4`, branch `rohan/eval-vocabulary-plan`).

## Why this matters for the harness `criteria_attributes.why`

Rohan ruled on 2026-10-22 that criteria rest on node attributes. A rating is a rational judgement on measurable things. So `create_node` must say which attributes measure each criterion at a node, and `create_pack` must write each level against attribute values. This study measured how much of a real criterion fits that shape.

## The value of an attribute `criteria_attributes.values`

Rohan ruled on 2026-10-22 that an attribute value is one of four types:

| Type | Example |
|---|---|
| Number, with a unit | Elemental magnesium per serving, in mg |
| Word, from a closed list | The form of an ingredient, such as `glycinate` |
| List of words | The excipients on the label |
| Flag, with details | `batch_test_published`, with the details lab, lot, and date |

Each attribute also carries a reference to why it exists: the research record or the rubric that needs it. This reference connects the attribute to the records, the product facts, the packs, and the rubrics.

## How much is measurable `criteria_attributes.share`

The study counted the level conditions of each criterion. A measurement condition is one that a reader can test on attribute values with no opinion. The study inferred the shares from those counts.

| Criterion | Magnesium | Ashwagandha | Whey protein | Omega-3 |
|---|---|---|---|---|
| `dosage` | 73% | 64% | 73% | 83% |
| `form` | 70% | 55% | 67% | 78% |
| `formulation_cofactors` | 56% | 67% | 58% | 89% |
| `additive_profile` | 75% | 71% | 78% | 88% |
| `safety_interactions` | 63% | 83% | 78% | 80% |
| `communication` | 58% | 38% | 54% | 50% |
| Weighted share | 67% | 64% | 69% | 79% |

- Most of each criterion is measurable. The four packs need 94 distinct attributes, of which 43 did not exist yet.

- `communication` is the least measurable criterion in three of the four categories, because its start level depends on claim verdicts. In magnesium, `formulation_cofactors` is lower (56% against 58%).

## What stays a judgement `criteria_attributes.judgement`

These parts did not split into attributes. An LLM judges them, and the rules must say how:

- **Claim verdicts.** Is a claim on the label tested, untested, or refuted?

- **Goal reading.** Which goal does vague copy, such as "for daily vitality", sell?

- **Fit to a trial.** Does the design of the product match the design of a trial?

- **Levels between anchors.** The packs describe levels 3, 6, 9, and 10. The levels between them stay a judgement.

- **Adequate cautions.** A flag says that a caution line exists. It does not say that the line covers the risk.

## Four kinds of data `criteria_attributes.kinds`

| Kind | What it is | Example | Where it lands |
|---|---|---|---|
| Product fact | One value of one attribute for one product, from its label, listing, or a document about it | 400 mg magnesium oxide per serving | The product facts store |
| Reference knowledge | A value that is the same for each product of a category | An upper limit, a dose band, a form ranking | The node, as typed data with a source and a version |
| Measurement | A value that code computes from product facts and reference knowledge | The share of the upper limit | Computed on read. Never stored as a product fact. |
| Evaluation | The levels, the reasons, and the verdicts that the model issues | `dosage` level 7, with its reason | The evaluation record |

Reference knowledge is never a product fact. A measurement is not a grade. The model issues each level, and code issues none.

## Draft rules for product facts `criteria_attributes.fact_rules`

The study drafted these rules for what lands in the product facts store. They are candidate stage rules for the harness:

1. Product data only. The value comes from the label, the listing, or a document about this product.

2. One attribute key. The key is an active attribute of the home node of the product.

3. One canonical unit. Code converts a claim to the unit of the attribute and keeps the printed text beside it.

4. A value or a stated reason. "Not printed on a panel that the reader saw" and "panel not read" are two different reasons.

5. A named source and a quote for each claim.

6. A conflict between two claims stays a conflict. Code never picks a winner. A model or a person resolves it.

7. A product value against a reference is evaluation data, not a product fact.

## Open findings `criteria_attributes.open`

- The four packs give +1 for a third-party test. Rohan ruled on 2026-09-26 that being tested is never a score bonus. The packs came before the ruling.

- No criterion of the four packs reads reviews, ratings, or public sentiment. Rohan ruled on 2026-10-22 that social cues stay out of grading.
