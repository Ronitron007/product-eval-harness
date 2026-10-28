import { z } from 'zod'

// The rule record of enforce.rule_record (docs/design/rule-enforcement.md).

export const Verdict = z.enum(['pass', 'fail', 'cannot_verify'])
export const Binding = z.enum(['strict', 'soft', 'watch'])
export const RuleKind = z.enum(['shape', 'code_check', 'judgement'])
export const Stage = z.enum(['define_criteria', 'create_node', 'create_pack', 'create_layout', 'evaluate_product'])
export const RuleStatus = z.enum(['draft', 'active', 'retired'])
export const NodeLevel = z.enum(['domain', 'inner', 'leaf'])

// A dotted, snake_case id with at least two parts, such as criteria.reason_has_record.
export const RuleId = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, 'Use a dotted snake_case id with at least two parts, such as criteria.reason_has_record.')

// One node slug, such as skincare or mineral_sunscreen.
export const NodeId = z.string().regex(/^[a-z][a-z0-9_]*$/, 'Use one snake_case node slug, such as skincare.')

// A path into a stage output. `[]` means each item of a list: criteria[].attributes[].
export const FieldPath = z
  .string()
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*(\[\])?(\.[A-Za-z_][A-Za-z0-9_]*(\[\])?)*$/,
    'Write a path such as criteria[].attributes[]: names joined by dots, with [] after a list.',
  )

export const RuleScope = z
  .object({
    nodes: z.union([z.object({ node: NodeId, descendants: z.boolean() }).strict(), z.object({ level: NodeLevel }).strict()]),
    stages: z.array(Stage).min(1, 'Name at least one stage.'),
    fields: z.array(FieldPath).min(1, 'Name at least one output field.'),
  })
  .strict()

export const Example = z
  .object({
    input: z.unknown().optional(),
    output: z.unknown(),
    expected: Verdict,
    note: z.string().optional(),
  })
  .strict()

// The judge question of a judgement rule. Rohan owns it (improve.boundaries.surface).
export const Judge = z
  .object({
    question: z.string().min(1),
    policy: z.string().optional(),
  })
  .strict()

export const Provenance = z
  .object({
    record_id: z.string().min(1).optional(),
    decision_row: z.string().min(1).optional(),
  })
  .strict()
  .refine(p => p.record_id !== undefined || p.decision_row !== undefined, {
    message: 'Give a record_id or a decision_row, so that the rule says why it exists.',
  })

export const RuleRecord = z
  .object({
    id: RuleId,
    version: z.number().int().min(1),
    statement: z.string().min(1),
    reason: z.string().min(1),
    kind: RuleKind,
    scope: RuleScope,
    binding: Binding,
    judge: Judge.optional(),
    // The name of the check function in the code registry. code_check rules only.
    check: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Name the check function in snake_case, such as min_items.').optional(),
    examples: z.array(Example).min(1, 'Give at least one golden example.'),
    provenance: Provenance,
    owner: NodeId,
    status: RuleStatus,
    supersedes: z.number().int().min(1).optional(),
  })
  .strict()
  .superRefine((rule, ctx) => {
    const add = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
    if (rule.kind === 'judgement' && !rule.judge) add('judge', 'A judgement rule needs a judge field with its question.')
    if (rule.kind !== 'judgement' && rule.judge) add('judge', 'Only a judgement rule has a judge field. Remove it, or set kind to judgement.')
    if (rule.kind === 'code_check' && !rule.check) add('check', 'A code_check rule needs a check field that names its check function.')
    if (rule.kind !== 'code_check' && rule.check) add('check', 'Only a code_check rule has a check field. Remove it, or set kind to code_check.')
    if (rule.version > 1 && rule.supersedes === undefined) add('supersedes', `Version ${rule.version} must name the version it supersedes.`)
    if (rule.supersedes !== undefined && rule.supersedes !== rule.version - 1) {
      add('supersedes', `Version ${rule.version} must supersede version ${rule.version - 1}. Raise the version by one at a time.`)
    }
  })

export type RuleRecord = z.infer<typeof RuleRecord>
export type Verdict = z.infer<typeof Verdict>
