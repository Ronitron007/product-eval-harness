// Fixture rules of the compiler tests. The fixture tree is skincare (domain), sunscreen and
// moisturizer (inner, children of skincare), and mineral_sunscreen (leaf, child of sunscreen).
// Each rule is a plain record, as an author writes it. The words hold no parameter literal.

export type RuleInput = Record<string, unknown> & { id: string; owner: string }

export const TREE = [
  { id: 'skincare', parentId: null, level: 'domain' },
  { id: 'sunscreen', parentId: 'skincare', level: 'inner' },
  { id: 'moisturizer', parentId: 'skincare', level: 'inner' },
  { id: 'mineral_sunscreen', parentId: 'sunscreen', level: 'leaf' },
] as const

const base = {
  version: 1,
  reason: 'A grade must rest on what the product states.',
  binding: 'strict',
  provenance: { decision_row: '2026-11-02 compiler test fixture' },
  owner: 'skincare',
  status: 'active',
}

const scope = (field: string, extra: Record<string, unknown> = {}) => ({ nodes: 'subtree', stages: ['create_node'], fields: [field], ...extra })

export function shapeRule(id: string, field: string, shape: Record<string, unknown>, examples: unknown[], extra: Record<string, unknown> = {}): RuleInput {
  return { ...base, id, kind: 'shape', shape, statement: `Fill ${field} as its shape says.`, scope: scope(field), examples, ...extra }
}

export function checkRule(id: string, field: string, check: Record<string, unknown>, examples: unknown[], extra: Record<string, unknown> = {}): RuleInput {
  return { ...base, id, kind: 'code_check', check, statement: `Back ${field} with what the run holds.`, scope: scope(field), examples, ...extra }
}

export function judgementRule(id: string, field: string, question: string, examples: unknown[], extra: Record<string, unknown> = {}): RuleInput {
  return { ...base, id, kind: 'judgement', judge: { question }, statement: `Keep ${field} about the product itself.`, scope: scope(field), examples, ...extra }
}

const LABEL = { sources: { label: 'Each capsule has 500 mg.' } }

// The fixture library of create_node, owned by skincare for its whole subtree.
export const criteriaList = shapeRule('criteria.list', 'criteria', { type: 'list', min_items: 1 }, [
  { output: [{}], expected: 'pass' },
  { output: [], expected: 'fail', note: 'A node needs at least one criterion.' },
])
export const criteriaTitle = shapeRule('criteria.title', 'criteria[].name', { type: 'text', min_length: 1 }, [
  { output: 'spf', expected: 'pass' },
  { output: '', expected: 'fail' },
])
export const attributeKey = shapeRule('attributes.key', 'criteria[].attributes[].key', { type: 'text', min_length: 1 }, [{ output: 'spf', expected: 'pass' }])
export const attributeAmount = shapeRule('attributes.amount', 'criteria[].attributes[].amount', { type: 'number', min: 0 }, [
  { output: 500, expected: 'pass' },
  { output: -1, expected: 'fail' },
])
export const labelUnit = shapeRule(
  'units.label_unit',
  'criteria[].attributes[].unit',
  { type: 'text', values: ['mg', 'mcg', 'g'] },
  [
    { output: 'mg', expected: 'pass' },
    { output: 'IU', expected: 'fail', note: 'IU is not a unit of mass.' },
  ],
  { statement: 'Write the amount in the unit that the label prints.', reason: 'A grade must rest on what the label states.' },
)
export const attributeQuote = shapeRule('attributes.quote', 'criteria[].attributes[].quote', { type: 'text', min_length: 1 }, [{ output: '500 mg', expected: 'pass' }])
export const quotesFromLabel = checkRule(
  'quotes.from_label',
  'criteria[].attributes[].quote',
  { name: 'quote_in_source', params: { source: 'label', case_sensitive: true } },
  [
    { input: LABEL, output: '500 mg', expected: 'pass' },
    { input: LABEL, output: '600 mg', expected: 'fail' },
    { output: '500 mg', expected: 'cannot_verify', note: 'The run has no source text.' },
  ],
  { statement: 'Back each attribute value with a quote from the source text.', reason: 'A judge and a reader must find the words that the value rests on.' },
)
export const uniqueTitle = checkRule('criteria.unique_title', 'criteria', { name: 'unique_by', params: { by: 'name' } }, [
  { output: [{ name: 'spf' }, { name: 'zinc' }], expected: 'pass' },
  { output: [{ name: 'spf' }, { name: 'spf' }], expected: 'fail' },
], { statement: 'Each criterion appears once.' })
export const keyKnown = checkRule('attributes.key_known', 'criteria[].attributes[].key', { name: 'key_in_registry', params: {} }, [
  { input: { attribute_keys: ['spf'] }, output: 'spf', expected: 'pass' },
  { input: { attribute_keys: ['spf'] }, output: 'trending', expected: 'fail' },
])
export const attributeIsProduct = judgementRule(
  'criteria.attribute_is_product',
  'criteria[].attributes[]',
  'Does the attribute describe a property of the product itself? Answer yes, no, or unknown.',
  [{ output: { key: 'spf' }, expected: 'pass' }],
)

export const FIXTURE: readonly RuleInput[] = [
  criteriaList,
  criteriaTitle,
  attributeKey,
  attributeAmount,
  labelUnit,
  attributeQuote,
  quotesFromLabel,
  uniqueTitle,
  keyKnown,
  attributeIsProduct,
]

// A minimal output that the fixture schema accepts.
export const GOOD_OUTPUT = { criteria: [{ name: 'spf', attributes: [{ amount: 500, key: 'spf', quote: '500 mg', unit: 'mg' }] }] }
export const GOOD_EVIDENCE = { sources: { label: 'Each capsule has 500 mg.' }, attribute_keys: ['spf'] }

// A library whose shapes compose from a parent and a child rule, for shape.joint_meet_agrees
// and hash.schema_round_trip.
const sun = { owner: 'sunscreen' }
export const COMPOSED: readonly RuleInput[] = [
  ...FIXTURE,
  shapeRule('attributes.list', 'criteria[].attributes', { type: 'list', min_items: 1 }, [{ output: [{}], expected: 'pass' }]),
  shapeRule('attributes.list_cap', 'criteria[].attributes', { type: 'list', max_items: 3 }, [{ output: [{}], expected: 'pass' }], sun),
  shapeRule('attributes.amount_cap', 'criteria[].attributes[].amount', { type: 'number', max: 5000 }, [{ output: 5, expected: 'pass' }], sun),
  shapeRule('attributes.quote_cap', 'criteria[].attributes[].quote', { type: 'text', max_length: 12 }, [{ output: 'q', expected: 'pass' }], sun),
  shapeRule('attributes.count', 'criteria[].attributes[].count', { type: 'number', integer: true, min: 1 }, [{ output: 2, expected: 'pass' }]),
  shapeRule('attributes.count_cap', 'criteria[].attributes[].count', { type: 'number', max: 9.5 }, [{ output: 2, expected: 'pass' }], sun),
  shapeRule('attributes.tested', 'criteria[].attributes[].tested', { type: 'flag' }, [{ output: true, expected: 'pass' }]),
]
const ATTRIBUTE = { amount: 500, count: 2, key: 'spf', quote: '500 mg', tested: true, unit: 'mg' }
export const COMPOSED_OUTPUT = { criteria: [{ name: 'spf', attributes: [ATTRIBUTE] }] }
export const BOUNDARIES: Readonly<Record<string, readonly unknown[]>> = {
  'criteria[].attributes': [[], [ATTRIBUTE], [ATTRIBUTE, ATTRIBUTE, ATTRIBUTE], [ATTRIBUTE, ATTRIBUTE, ATTRIBUTE, ATTRIBUTE], 'x'],
  'criteria[].attributes[].amount': [-0.5, 0, 2500, 5000, 5000.5, '500', null],
  'criteria[].attributes[].count': [0, 1, 1.5, 9, 9.5, 10, '2'],
  'criteria[].attributes[].quote': ['', 'a', '123456789012', '1234567890123', 5],
  'criteria[].attributes[].unit': ['g', 'mcg', 'mg', 'IU', 'MG', '', 1],
  'criteria[].attributes[].tested': [true, false, 'true', 0],
  'criteria[].name': ['', 'spf', 7],
  criteria: [[], 'x'],
}
