import { z } from 'zod'
import { CheckRef, checkTemplate } from './checks'
import { RunEvidence } from './checks/define'
import type { OrderTable } from './strictness'

// The rule record of enforce.rule_record (docs/design/rule-enforcement.md), by kind (compile.record).

export const Verdict = z.enum(['pass', 'fail', 'cannot_verify'])
export const Binding = z.enum(['strict', 'soft', 'watch'])
export const RuleKind = z.enum(['shape', 'code_check', 'judgement'])
export const Stage = z.enum(['define_criteria', 'create_node', 'create_pack', 'create_layout', 'evaluate_product'])
export const RuleStatus = z.enum(['draft', 'active', 'retired'])
export const NodeLevel = z.enum(['domain', 'inner', 'leaf'])

export type Verdict = z.infer<typeof Verdict>
export type Binding = z.infer<typeof Binding>
export type Stage = z.infer<typeof Stage>
export type NodeLevel = z.infer<typeof NodeLevel>

// A dotted, snake_case id with at least two parts, such as criteria.reason_has_record.
export const RuleId = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, 'Use a dotted snake_case id with at least two parts, such as criteria.reason_has_record.')

// One node slug, such as skincare or mineral_sunscreen.
export const NodeId = z.string().regex(/^[a-z][a-z0-9_]*$/, 'Use one snake_case node slug, such as skincare.')
export type NodeId = z.infer<typeof NodeId>

// The virtual owner above every domain node. rules/all/ holds the rules for every domain.
// store.addNode refuses a node with this id.
export const OWNER_ALL = 'all'

// The levels where each stage runs (graph.stages).
export const STAGE_LEVELS: Readonly<Record<Stage, readonly NodeLevel[]>> = {
  define_criteria: ['domain'],
  create_node: ['inner', 'leaf'],
  create_pack: ['leaf'],
  create_layout: ['leaf'],
  evaluate_product: ['leaf'], // inferred: the product evaluation reads the pack of a leaf
}

// A path into a stage output. `[]` means each item of a list: criteria[].attributes[].
export const FieldPath = z
  .string()
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*(\[\])?(\.[A-Za-z_][A-Za-z0-9_]*(\[\])?)*$/,
    'Write a path such as criteria[].attributes[]: names joined by dots, with [] after a list.',
  )

// A segment that an object prototype owns would make a key that a plain object drops (record.reserved_names).
const RESERVED = new Set(['__proto__', 'constructor', 'prototype'])
export const SafeFieldPath = FieldPath.refine(
  p => p.split('.').every(seg => { const name = seg.replace(/\[\]$/, ''); return !RESERVED.has(name) && !name.startsWith('__') }),
  'Rename the field. A path segment cannot be __proto__, constructor, prototype, or start with __.',
)

// Anchored at the owner. No node id, so a rule cannot reach a parent or a sibling.
export const NodeSelector = z.union([z.literal('owner'), z.literal('subtree'), z.object({ level: NodeLevel }).strict()], {
  error: 'Set nodes to owner, subtree, or { level: domain | inner | leaf }. Each one counts from the owner node, so a scope names no node.',
})
export type NodeSelector = z.infer<typeof NodeSelector>

export const RuleScope = z
  .object({
    nodes: NodeSelector,
    stages: z.array(Stage).min(1, 'Name at least one stage.'),
    fields: z.array(SafeFieldPath).min(1, 'Name at least one output field.'),
  })
  .strict()

// The shape language. Closed: no refine, no transform. Containers come from the path syntax.
export const TextShape = z
  .object({
    type: z.literal('text'),
    values: z.array(z.string().min(1)).min(1).optional(),
    min_length: z.number().int().min(1).optional(),
    max_length: z.number().int().min(1).optional(),
  })
  .strict()
export const NumberShape = z
  .object({ type: z.literal('number'), min: z.number().optional(), max: z.number().optional(), integer: z.literal(true).optional() })
  .strict()
export const FlagShape = z.object({ type: z.literal('flag') }).strict()
// At path `x`: the list itself. Rules on `x[]` give the shape of its items. No `unique`: Zod cannot
// print it, so uniqueness is the check template unique_by (shape.no_unique).
export const ListShape = z.strictObject(
  { type: z.literal('list'), min_items: z.number().int().min(0).optional(), max_items: z.number().int().min(1).optional() },
  {
    error: iss =>
      iss.code === 'unrecognized_keys' && iss.keys.includes('unique')
        ? 'A list shape has no unique. Add a code_check rule with the check unique_by on this list.'
        : undefined,
  },
)
export const Shape = z.discriminatedUnion('type', [TextShape, NumberShape, FlagShape, ListShape], {
  error: iss =>
    iss.input === undefined
      ? 'A shape rule needs a shape field, such as { type: text, values: [...] }.'
      : iss.code === 'invalid_union'
        ? 'Set the shape type to text, number, flag, or list.'
        : undefined,
})
export type Shape = z.infer<typeof Shape>
export type ShapeType = Shape['type']
export type ShapeParams<T extends ShapeType = ShapeType> = Omit<Extract<Shape, { type: T }>, 'type'>

// One order for each shape parameter (compile.weaken). The meet and the weaken test read it.
export const SHAPE_ORDERS: { readonly [T in ShapeType]: OrderTable<ShapeParams<T>> } = {
  text: { values: 'subset_is_stricter', min_length: 'higher_is_stricter', max_length: 'lower_is_stricter' },
  number: { min: 'higher_is_stricter', max: 'lower_is_stricter', integer: 'true_is_stricter' },
  flag: {},
  list: { min_items: 'higher_is_stricter', max_items: 'lower_is_stricter' },
}

export const Example = z
  .object({
    input: RunEvidence.optional(),
    output: z.unknown(),
    expected: Verdict,
    note: z.string().optional(),
  })
  .strict()

// The judge question of a judgement rule. Rohan owns it (improve.boundaries.surface).
export const Judge = z.strictObject(
  { question: z.string().min(1), policy: z.string().optional() },
  { error: iss => (iss.input === undefined ? 'A judgement rule needs a judge field with its question.' : undefined) },
)

export const Provenance = z
  .object({
    record_id: z.string().min(1).optional(),
    decision_row: z.string().min(1).optional(),
  })
  .strict()
  .refine(p => p.record_id !== undefined || p.decision_row !== undefined, {
    message: 'Give a record_id or a decision_row, so that the rule says why it exists.',
  })

const RuleBase = {
  id: RuleId,
  version: z.number().int().min(1),
  statement: z.string().min(1),
  reason: z.string().min(1),
  scope: RuleScope,
  binding: Binding,
  examples: z.array(Example).min(1, 'Give at least one golden example.'),
  provenance: Provenance,
  owner: NodeId, // a node id, or OWNER_ALL
  status: RuleStatus,
  supersedes: z.number().int().min(1).optional(),
}

const ShapeRuleSchema = z
  .object({
    ...RuleBase,
    kind: z.literal('shape'),
    shape: Shape,
    binding: z.literal('strict', {
      error: 'A shape rule is always strict, because the decoder enforces each shape rule. Set binding to strict, or write a code_check rule.',
    }),
  })
  .strict()
const CodeCheckRuleSchema = z.object({ ...RuleBase, kind: z.literal('code_check'), check: CheckRef }).strict()
const JudgementRuleSchema = z.object({ ...RuleBase, kind: z.literal('judgement'), judge: Judge }).strict()

type AnyRule = z.infer<typeof ShapeRuleSchema> | z.infer<typeof CodeCheckRuleSchema> | z.infer<typeof JudgementRuleSchema>

// Is word a whole word of text, in any letter case? No regex, so a literal needs no escaping.
const WORD_CHAR = /[A-Za-z0-9_]/
export function holdsWord(text: string, word: string): boolean {
  const t = text.toLowerCase()
  const w = word.toLowerCase()
  if (w.trim() === '') return false
  for (let i = t.indexOf(w); i >= 0; i = t.indexOf(w, i + 1)) {
    const before = i === 0 ? '' : t[i - 1]!
    const after = t[i + w.length] ?? ''
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return true
  }
  return false
}

// The parameter literals of a rule: the words that only its params object may hold (compile.record).
export function ruleLiterals(rule: AnyRule): readonly string[] {
  if (rule.kind === 'shape') return rule.shape.type === 'text' ? (rule.shape.values ?? []) : []
  if (rule.kind === 'code_check') return checkTemplate(rule.check.name).literals(rule.check.params)
  return []
}

// The loader problems of one record. Each names the field and the fix (compile.record).
function recordLint(rule: AnyRule, ctx: z.RefinementCtx): void {
  const add = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message })

  if (rule.version > 1 && rule.supersedes === undefined) add(['supersedes'], `Version ${rule.version} must name the version it supersedes.`)
  if (rule.supersedes !== undefined && rule.supersedes !== rule.version - 1) {
    add(['supersedes'], `Version ${rule.version} must supersede version ${rule.version - 1}. Raise the version by one at a time.`)
  }

  const nodes = rule.scope.nodes
  if (rule.owner === OWNER_ALL && nodes === 'owner') {
    add(['scope', 'nodes'], 'The owner all is no node, so the selector owner selects no node. Use subtree or { level }.')
  }
  if (typeof nodes === 'object') {
    rule.scope.stages.forEach((stage, i) => {
      if (!STAGE_LEVELS[stage].includes(nodes.level)) {
        add(['scope', 'stages', i], `The stage ${stage} never runs at level ${nodes.level}. It runs at ${STAGE_LEVELS[stage].join(', ')}. Change the stage or the level.`)
      }
    })
  }

  if (rule.kind === 'shape') {
    const s = rule.shape
    if (s.type === 'text') {
      if (s.min_length !== undefined && s.max_length !== undefined && s.min_length > s.max_length) {
        add(['shape', 'min_length'], `min_length ${s.min_length} is above max_length ${s.max_length}. No text fits. Lower min_length or raise max_length.`)
      }
      const twice = (s.values ?? []).filter((v, i, all) => all.indexOf(v) !== i)
      if (twice.length > 0) add(['shape', 'values'], `The values ${[...new Set(twice)].join(', ')} occur more than once. Write each value once.`)
    }
    if (s.type === 'number' && s.min !== undefined && s.max !== undefined && s.min > s.max) {
      add(['shape', 'min'], `min ${s.min} is above max ${s.max}. No number fits. Lower min or raise max.`)
    }
    if (s.type === 'list' && s.min_items !== undefined && s.max_items !== undefined && s.min_items > s.max_items) {
      add(['shape', 'min_items'], `min_items ${s.min_items} is above max_items ${s.max_items}. No list fits. Lower min_items or raise max_items.`)
    }
  }

  // The literal lint: one copy of each parameter, in the params object (drift).
  const from = rule.kind === 'shape' ? 'shape.values' : 'check.params'
  for (const literal of ruleLiterals(rule)) {
    for (const field of ['statement', 'reason'] as const) {
      if (holdsWord(rule[field], literal)) {
        add([field], `Remove "${literal}" from the ${field}. The compiler prints it from ${from}, so the ${field} must not hold a second copy.`)
      }
    }
  }
}

export const RuleRecord = z
  .discriminatedUnion('kind', [ShapeRuleSchema, CodeCheckRuleSchema, JudgementRuleSchema], {
    error: iss => (iss.code === 'invalid_union' ? 'Set kind to shape, code_check, or judgement.' : undefined),
  })
  .superRefine(recordLint)

export type RuleRecord = z.infer<typeof RuleRecord>
export type ShapeRule = Extract<RuleRecord, { kind: 'shape' }>
export type CodeCheckRule = Extract<RuleRecord, { kind: 'code_check' }>
export type JudgementRule = Extract<RuleRecord, { kind: 'judgement' }>
