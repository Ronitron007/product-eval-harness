// plan.compiler: type sketch (runner-opus).
//
// One file, cut into the modules of the module map by `// ===== <path> =====` banners.
// Unchanged repo types come from `@repo/*` (= src/* of product-eval-harness at 803301a).
// Bodies are `throw new Error('not implemented')`; tricky logic is `// TODO` pseudocode.
// The usage section at the bottom calls this API the way the call sites will, so the
// type checker proves that usage and sketch agree (probes/tsconfig.json, `tsc --noEmit`).

import { z } from 'zod'
import type { MastraScorer } from '@mastra/core/evals'
import type { MastraModelConfig } from '@mastra/core/llm'
import { Binding, FieldPath, Judge, NodeId, NodeLevel, Provenance, RuleId, RuleStatus, Stage } from '@repo/rules/schema'
import type { RuleLibrary } from '@repo/rules/load'
import type { DerivedRule, GraphNode, GraphStore, VerdictInput } from '@repo/store/store'

const notImplemented = (): never => {
  throw new Error('not implemented')
}

type Stage = z.infer<typeof Stage>
type Binding = z.infer<typeof Binding>
type NodeLevel = z.infer<typeof NodeLevel>
type NodeId = z.infer<typeof NodeId>

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type Sha256 = string & { readonly __brand: 'sha256' }

// =====================================================================================
// ===== src/rules/checks/define.ts  (new) — what a check template is ==================
// =====================================================================================

// The evidence that a stage run hands to its checks and judges. Golden examples carry it
// in `input`, so the loader validates it as well (Example.input below).
export const RunEvidence = z
  .object({
    sources: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), z.string()).optional(), // full texts by name: label, record_<id>
    attribute_keys: z.array(z.string()).optional(), // the attribute registry of the node
    record_ids: z.array(z.string()).optional(), // research records that exist
  })
  .strict()
export type RunEvidence = z.infer<typeof RunEvidence>
export type EvidenceKey = keyof RunEvidence

// The closed list of facts that code may decide (enforce.deciders). A template must name one.
// There is no `grade`, `score`, `match`, or `similarity` here, and adding a member is a code
// change under rules.harness (Rohan's yes).
export const FactKind = z.enum(['substring', 'membership', 'reference', 'uniqueness'])
export type FactKind = z.infer<typeof FactKind>

// What a check may return. `pass` must carry what it observed; `fail` must carry the fix.
// No number, no grade, no "best match" can be expressed (hazard `determinism`).
export type CheckOutcome =
  | { verdict: 'pass'; observed: Json }
  | { verdict: 'fail'; observed: Json; fix: string }
  | { verdict: 'cannot_verify'; why: string }

// The trie node kind that a check reads at its field (checked at compile time).
export type CheckTarget = 'text' | 'object' | 'list'

export interface CheckTemplate<N extends string = string, P extends z.ZodObject = z.ZodObject, E extends EvidenceKey = EvidenceKey> {
  readonly name: N
  // Raise it whenever check() or render() changes behavior; code.lock.json proves you did.
  readonly version: number
  readonly fact: FactKind
  readonly target: CheckTarget
  readonly params: P // a strict object; the loader validates rule params against it
  // One order for each param: the build fails when params and order disagree (hand-synced list).
  readonly order: OrderTable<z.infer<P>>
  readonly needs: readonly E[]
  // The line that the instruction prints. Same params object as check(): no drift.
  render(params: z.infer<P>): string
  // Values that must never appear word for word in the statement or reason (literal lint).
  literals(params: z.infer<P>): readonly string[]
  // Extra paths, relative to the rule field, that must resolve in the stage schema
  // (for example unique_by's `by` key). Empty for most templates.
  requires(params: z.infer<P>, field: string): readonly string[]
  // Only called with present values and with every evidence key of `needs` present.
  check(params: z.infer<P>, value: Json, evidence: { readonly [K in E]-?: NonNullable<RunEvidence[K]> }): CheckOutcome
}

export function defineCheck<N extends string, P extends z.ZodObject, E extends EvidenceKey>(t: CheckTemplate<N, P, E>): CheckTemplate<N, P, E> {
  return t
}

// =====================================================================================
// ===== src/rules/checks/quote_in_source.ts (new) — one template per file ============
// Template files import only zod and ./define, so code.lock.json fingerprints all of
// their behavior (a test fails on any other import).
// =====================================================================================

export const quoteInSource = defineCheck({
  name: 'quote_in_source',
  version: 1,
  fact: 'substring',
  target: 'text',
  params: z.object({ source: z.string().regex(/^[a-z][a-z0-9_]*$/), case_sensitive: z.boolean() }).strict(),
  order: { source: 'identity', case_sensitive: 'true_is_stricter' },
  needs: ['sources'],
  render: p => `Copy each quote word for word from the ${p.source} text${p.case_sensitive ? ', with the same letter case' : ''}.`,
  literals: () => [],
  requires: () => [],
  // TODO: sources[p.source] missing -> cannot_verify ("no <source> text in this run").
  //       found -> pass { observed: { quote, at: index } }; not found -> fail with the fix
  //       "Quote the exact words of the <source> text, or drop the claim."
  check: () => notImplemented(),
})

export const keyInRegistry = defineCheck({
  name: 'key_in_registry',
  version: 1,
  fact: 'membership',
  target: 'text',
  params: z.object({}).strict(),
  order: {},
  needs: ['attribute_keys'],
  render: () => 'Use only attribute keys of this node.',
  literals: () => [],
  requires: () => [],
  check: () => notImplemented(),
})

export const recordExists = defineCheck({
  name: 'record_exists',
  version: 1,
  fact: 'reference',
  target: 'text',
  params: z.object({}).strict(),
  order: {},
  needs: ['record_ids'],
  render: () => 'Cite only research records that exist.',
  literals: () => [],
  requires: () => [],
  check: () => notImplemented(),
})

export const uniqueBy = defineCheck({
  name: 'unique_by',
  version: 1,
  fact: 'uniqueness',
  target: 'list',
  params: z.object({ by: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/) }).strict(),
  order: { by: 'identity' },
  needs: [],
  render: p => `No two items share the same ${p.by}.`,
  literals: () => [],
  requires: (p, field) => [`${field}[].${p.by}`],
  check: () => notImplemented(),
})

// =====================================================================================
// ===== src/rules/checks/index.ts (new) — the registry =================================
// =====================================================================================

// The one list of check templates. CheckRef, the lock test, and the docs derive from it.
export const CHECKS = [quoteInSource, keyInRegistry, recordExists, uniqueBy] as const
export type CheckName = (typeof CHECKS)[number]['name']

const refOf = <N extends string, P extends z.ZodObject>(t: CheckTemplate<N, P, EvidenceKey>) =>
  z.object({ name: z.literal(t.name), params: t.params }).strict()

// An unknown name or bad params is a loader problem with a field path (`check.name`,
// `check.params.by`), so `rules:check` refuses it before any run (hazard `unknown_check`).
export const CheckRef = z.discriminatedUnion('name', [refOf(quoteInSource), refOf(keyInRegistry), refOf(recordExists), refOf(uniqueBy)])
export type CheckRef = z.infer<typeof CheckRef>

export function checkTemplate(name: CheckName): CheckTemplate {
  return notImplemented()
}

// =====================================================================================
// ===== src/rules/strictness.ts (new) — one order table drives meet and weaken =========
// =====================================================================================

export type DimensionOrder =
  | 'identity' // part of the slot key: two different values mean two different checks
  | 'higher_is_stricter' // min, min_items, min_length
  | 'lower_is_stricter' // max, max_items, max_length
  | 'subset_is_stricter' // allowed values
  | 'superset_is_stricter' // required keys, forbidden words
  | 'true_is_stricter' // integer, unique, case_sensitive

export type OrderTable<P> = { readonly [K in keyof P]-?: DimensionOrder }

export const BINDING_STRENGTH: Readonly<Record<Binding, 0 | 1 | 2>> = { watch: 0, soft: 1, strict: 2 }

// The dimensions where `child` is looser than `parent`. A dimension set on one side only is
// never looser: an unset child dimension inherits the parent's (conjunction).
export function looserDimensions<P extends object>(child: P, parent: P, order: OrderTable<P>): Array<keyof P> {
  return notImplemented()
}

// Identity dimensions of two param objects agree (same slot).
export function sameIdentity<P extends object>(a: P, b: P, order: OrderTable<P>): boolean {
  return notImplemented()
}

// The strictest params that satisfy both. Fails on an identity mismatch or an empty result
// (empty value set, min above max).
export function meetParams<P extends object>(a: P, b: P, order: OrderTable<P>): { ok: true; params: P } | { ok: false; dimension: keyof P } {
  return notImplemented()
}

// =====================================================================================
// ===== src/rules/schema.ts (changed) — the rule record ================================
// =====================================================================================

// The virtual root above every domain node. `rules/all/` holds rules for every domain.
// store.addNode refuses a node with this id.
export const OWNER_ALL = 'all'

// The stage levels of graph.stages. A rule that names a stage at a level where it never runs
// is a loader problem.
export const STAGE_LEVELS: Readonly<Record<Stage, readonly NodeLevel[]>> = {
  define_criteria: ['domain'],
  create_node: ['inner', 'leaf'],
  create_pack: ['leaf'],
  create_layout: ['leaf'],
  evaluate_product: ['leaf'],
}

// A scope is anchored at its owner. `owner`: the owner only. `subtree`: the owner and its
// descendants. `{ level }`: the nodes of that level inside the owner's subtree.
// There is no way to name another node, so a rule cannot reach a parent or a sibling
// (hazard `weaken`, foreign owner: unrepresentable).
export const NodeSelector = z.union([z.literal('owner'), z.literal('subtree'), z.object({ level: NodeLevel }).strict()])
export const RuleScope = z
  .object({ nodes: NodeSelector, stages: z.array(Stage).min(1), fields: z.array(FieldPath).min(1) })
  .strict()

// The shape language: a closed IR. It has no refinement escape hatch, because
// z.toJSONSchema drops .refine() in silence and the hash reads the JSON Schema.
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
// At path `x` (no trailing []): the list itself. Its item shape comes from rules on `x[]`.
export const ListShape = z
  .object({
    type: z.literal('list'),
    min_items: z.number().int().min(0).optional(),
    max_items: z.number().int().min(1).optional(),
    unique: z.literal(true).optional(),
  })
  .strict()
export const Shape = z.discriminatedUnion('type', [TextShape, NumberShape, FlagShape, ListShape])
export type Shape = z.infer<typeof Shape>

type ParamsOf<T extends Shape['type']> = Omit<Extract<Shape, { type: T }>, 'type'>
export const SHAPE_ORDERS: { readonly [T in Shape['type']]: OrderTable<ParamsOf<T>> } = {
  text: { values: 'subset_is_stricter', min_length: 'higher_is_stricter', max_length: 'lower_is_stricter' },
  number: { min: 'higher_is_stricter', max: 'lower_is_stricter', integer: 'true_is_stricter' },
  flag: {},
  list: { min_items: 'higher_is_stricter', max_items: 'lower_is_stricter', unique: 'true_is_stricter' },
}

export const Example = z
  .object({ input: RunEvidence.optional(), output: z.unknown(), expected: z.enum(['pass', 'fail', 'cannot_verify']), note: z.string().optional() })
  .strict()

const RuleBase = {
  id: RuleId,
  version: z.number().int().min(1),
  statement: z.string().min(1),
  reason: z.string().min(1),
  scope: RuleScope,
  binding: Binding,
  examples: z.array(Example).min(1),
  provenance: Provenance,
  owner: NodeId, // a node id, or OWNER_ALL
  status: RuleStatus,
  supersedes: z.number().int().min(1).optional(),
}

// The kind is the discriminator, so "a judge field on a code_check" cannot be written.
export const RuleRecord = z
  .discriminatedUnion('kind', [
    z.object({ ...RuleBase, kind: z.literal('shape'), shape: Shape }).strict(),
    z.object({ ...RuleBase, kind: z.literal('code_check'), check: CheckRef }).strict(),
    z.object({ ...RuleBase, kind: z.literal('judgement'), judge: Judge }).strict(),
  ])
  .superRefine((rule, ctx) => {
    // TODO record-local problems, each with a fix, so rules:check reports them:
    //  - version / supersedes (unchanged from today).
    //  - owner `all` with nodes `owner`: selects nothing.
    //  - nodes { level } with a stage not in STAGE_LEVELS[stage]: that stage never runs there.
    //  - shape params satisfiable on their own: min <= max, min_length <= max_length, unique values.
    //  - literal lint: no value of shape.values or checkTemplate(check.name).literals(params)
    //    appears as a whole word (case-insensitive) in statement or reason:
    //    "Remove 'mg' from the statement. The compiler prints the allowed values from shape.values."
    void rule
    void ctx
  })
export type RuleRecord = z.infer<typeof RuleRecord>
export type ShapeRule = Extract<RuleRecord, { kind: 'shape' }>
export type CodeCheckRule = Extract<RuleRecord, { kind: 'code_check' }>
export type JudgementRule = Extract<RuleRecord, { kind: 'judgement' }>

// ===== src/rules/hash.ts (changed) =====
// ruleHash covers statement, reason, kind, scope, binding, judge, check {name, params},
// shape, examples. rules/ and the lock are empty today, so no hash migrates.
export function ruleHash(rule: RuleRecord): Sha256 {
  return notImplemented()
}

// =====================================================================================
// ===== src/compiler/paths.ts (new, runtime code: fingerprinted) =======================
// =====================================================================================

export interface Segment {
  readonly key: string
  readonly each: boolean // `key[]`
}
export function parsePath(path: string): readonly Segment[] {
  return notImplemented()
}

// One concrete place in an output, such as criteria[2].attributes[0].unit.
export type Target =
  | { readonly path: string; readonly state: 'present'; readonly value: Json }
  | { readonly path: string; readonly state: 'absent' } // a key on the way is missing
  | { readonly path: string; readonly state: 'empty_list' } // a list on the way is [] (vacuous)

// Walks `output` along `path`. Never returns []: an empty walk yields one absent or
// empty_list target, so each rule gives at least one verdict row (rules.harness).
export function targets(output: unknown, path: string): readonly [Target, ...Target[]] {
  return notImplemented()
}

// The inverse of targets() for one item: embed('criteria[].unit', 'mg') = { criteria: [{ unit: 'mg' }] }.
// The golden gate uses it, so golden examples run through the real scorer path.
export function embed(path: string, value: Json): Json {
  return notImplemented()
}

// =====================================================================================
// ===== src/compiler/shape.ts (new) — schema composition ===============================
// =====================================================================================

export type RuleRef = { readonly id: string; readonly version: number }

export type TrieNode =
  | { readonly kind: 'object'; readonly keys: ReadonlyMap<string, TrieNode>; readonly from: readonly RuleRef[] }
  | { readonly kind: 'list'; readonly items: TrieNode | undefined; readonly shape: ParamsOf<'list'>; readonly from: readonly RuleRef[] }
  | { readonly kind: 'leaf'; readonly shape: Exclude<Shape, { type: 'list' }>; readonly from: readonly RuleRef[] }

export type ShapeTrie = Extract<TrieNode, { kind: 'object' }>

// Builds the output trie from the strict shape rules in scope. Containers come from the path
// syntax (`a.b` makes `a` an object, `a[]` makes `a` a list). Leaves are the meet of every
// strict shape rule on that path (SHAPE_ORDERS). Insertion is order-independent: inputs are
// sorted by rule id, keys and values by code unit.
// Problems: shape_conflict (object vs leaf vs list on one path, two leaf types, empty meet),
// list_without_items (a list shape at `x` with no rule on `x[]`), no_output_fields.
export function composeShapes(rules: readonly AdmittedRule[]): { ok: true; trie: ShapeTrie } | { ok: false; problems: CompileProblem[] } {
  return notImplemented()
}

export function lookup(trie: ShapeTrie, path: string): TrieNode | undefined {
  return notImplemented()
}

// The decoding schema: strict objects with sorted keys, every key required, sorted enums.
// Emits only constructs that z.toJSONSchema represents in full (no refine, no transform).
export function printSchema(trie: ShapeTrie): z.ZodType {
  return notImplemented()
}

// One rule's own shape, for its per-rule check (also soft and watch shape rules).
export function printShape(shape: Shape): z.ZodType {
  return notImplemented()
}

// The text the instruction prints for a field, from the same trie that printSchema reads:
// "text, one of: g, mcg, mg", "list of 1 or more items", "number, 0 or more".
export function describe(node: TrieNode | Shape): string {
  return notImplemented()
}

// =====================================================================================
// ===== src/compiler/scope.ts (new) — admission, anchored resolution, weaken ==========
// =====================================================================================

export type RuleOrigin = 'git' | 'store' | 'trial'

export interface AdmittedRule {
  readonly rule: RuleRecord
  readonly hash: Sha256 // recomputed by ruleHash, never trusted from storage
  readonly origin: RuleOrigin
  readonly binding: Binding // effective: a trial rule is always 'watch'
}

declare const admittedBrand: unique symbol
// Only admit() makes this value, so compile code cannot receive an unchecked rule (hazard
// `invalid_rules`). It holds every input rule version once, active or not.
export interface Admitted {
  readonly [admittedBrand]: true
  readonly rules: readonly AdmittedRule[] // the newest version of each id, any status
  readonly older: readonly AdmittedRule[] // older derived versions: ledger 'superseded'
}

// Refuses: any loader problem of the library (lock, YAML, Zod, params); a derived row whose
// record fails RuleRecord, whose recomputed ruleHash differs from row.hash, or whose
// row id/version/owner differ from the record; a derived id that a stage rule already uses;
// a derived rule of kind shape (only a stage rule in git changes an output shape: decisions
// row 27, open question in design.md).
export function admit(library: RuleLibrary, derived: readonly DerivedRule[], trial?: RuleRecord): { ok: true; admitted: Admitted } | { ok: false; problems: CompileProblem[] } {
  return notImplemented()
}

export interface Tree {
  node(id: NodeId): TreeNode | undefined
  ancestorsOrSelf(id: NodeId): readonly NodeId[] // root first, OWNER_ALL not included
  isStrictAncestor(ancestor: NodeId, of: NodeId): boolean // OWNER_ALL is ancestor of all
}
export function indexTree(nodes: readonly TreeNode[]): Tree {
  return notImplemented()
}

export type OutOfScope = 'owner_not_on_path' | 'stage_not_named' | 'selector_misses_node'
export type Disposition =
  | { readonly applied: Binding }
  | { readonly excluded: 'draft' | 'retired' | 'superseded' }
  | { readonly out_of_scope: OutOfScope }

// TODO resolve:
//   node must exist and node.level ∈ STAGE_LEVELS[stage], else problem stage_not_at_level.
//   path = ancestorsOrSelf(node)
//   for each admitted rule (rules + older), exactly one ledger entry:
//     older                                   -> excluded superseded
//     status draft / retired (origin != trial)-> excluded draft / retired
//     owner ∉ path and owner != OWNER_ALL     -> out_of_scope owner_not_on_path
//     stage ∉ scope.stages                    -> out_of_scope stage_not_named
//     selector: 'owner' -> node == owner; 'subtree' -> true; {level} -> node.level == level
//       miss                                  -> out_of_scope selector_misses_node
//     else                                    -> applied (effective binding)
export function resolve(admitted: Admitted, tree: Tree, node: NodeId, stage: Stage): { ok: true; applied: readonly AdmittedRule[]; ledger: readonly LedgerEntry[] } | { ok: false; problems: CompileProblem[] } {
  return notImplemented()
}

// TODO weakenings (definition `compile.weaken`, see design.md): for each pair (A, B) of
// applied rules where tree.isStrictAncestor(A.owner, B.owner) and they share a field:
//   shape/shape, same shape.type:
//     looserDimensions(B.shape, A.shape, SHAPE_ORDERS[type]) non-empty  -> weakens
//     BINDING_STRENGTH[B] < BINDING_STRENGTH[A]                          -> weakens
//   code_check/code_check, same check.name, sameIdentity(params):
//     looserDimensions(B.params, A.params, template.order) non-empty     -> weakens
//     BINDING_STRENGTH[B] < BINDING_STRENGTH[A]                          -> weakens
//   judgement: never comparable, never weakens (it can only add).
// Each problem names both rules, the field, and the looser dimensions:
//   "sunscreen units.allow_iu@1 allows IU on criteria[].attributes[].unit, which skincare
//    units.label_unit@2 forbids. Change skincare's rule, or drop the value."
export function weakenings(applied: readonly AdmittedRule[], tree: Tree): CompileProblem[] {
  return notImplemented()
}

// =====================================================================================
// ===== src/compiler/scorers.ts (new, runtime code: fingerprinted) =====================
// =====================================================================================

export const RUNTIME_VERSION = 1 // paths.ts + scorers.ts + checks/define.ts; code.lock.json

export type Decider = VerdictInput['decider']
export type ScorerId = `${string}@${number}`
export type ItemVerdict = Omit<VerdictInput, 'runId'> // + runId = a row for store.writeVerdicts

export interface RuleScorer {
  readonly id: ScorerId // `${rule.id}@${rule.version}`
  readonly rule: { readonly id: string; readonly version: number; readonly hash: Sha256; readonly binding: Binding; readonly kind: RuleRecord['kind'] }
  readonly decider: Decider
  readonly fields: readonly string[]
  // For Mastra-run contexts (runEvals, experiments). Its per-item verdicts sit in analyzeStepResult.
  readonly scorer: MastraScorer<ScorerId, RunEvidence, unknown, any>
  // For the judge step. Never throws and never returns []: a thrown check, a judge error,
  // a missing judge answer, an `unknown` answer, or missing evidence -> cannot_verify.
  verify(output: unknown, evidence: RunEvidence): Promise<readonly ItemVerdict[]>
}

// TODO per target, the outcome policy that no template can bypass (hazard `determinism`):
//   shape rule:   absent -> fail (fix "Add <path>"); empty_list -> pass (observed []);
//                 present -> printShape(shape).safeParse -> pass | fail (fix from describe)
//   code_check:   absent -> cannot_verify ("field absent; its shape rule reports it");
//                 empty_list -> pass (observed []);
//                 any key of template.needs missing in evidence -> cannot_verify;
//                 check throws -> cannot_verify; else the template outcome.
export function codeScorer(rule: AdmittedRule & { rule: ShapeRule | CodeCheckRule }): RuleScorer {
  return notImplemented()
}

export interface JudgeModel {
  readonly id: string // `provider/model`, written into VerdictRow.decider.model
  readonly model: MastraModelConfig
}

// The static judge prompt: fixed system text + question, policy, reason, boundary examples,
// and the answer format (yes / no / unknown with a quote, for each target). Rendered at
// compile time, so its hash enters the manifest. The run part (targets + full source texts
// from evidence.sources, never a summary) is appended per run by the analyze step.
export function judgePrompt(rule: JudgementRule): { readonly text: string; readonly hash: Sha256 } {
  return notImplemented()
}

// A createScorer with judge { model, instructions }, a function preprocess (targets),
// a prompt-object analyze (judgePrompt + run part), a function generateScore.
export function judgeScorer(rule: AdmittedRule & { rule: JudgementRule }, model: JudgeModel): RuleScorer {
  return notImplemented()
}

// =====================================================================================
// ===== src/compiler/index.ts (new) — the public surface ===============================
// Nothing outside src/compiler imports another file of src/compiler (a test greps imports).
// =====================================================================================

export type TreeNode = Pick<GraphNode, 'id' | 'parentId' | 'level'>

export interface CompileInput {
  readonly stage: Stage
  readonly node: NodeId
  readonly library: RuleLibrary // loadRuleLibrary(rules/): must have zero problems
  readonly derived: readonly DerivedRule[] // store.derivedRules()
  readonly tree: readonly TreeNode[] // store.tree(): every node
  // The one door for a rule that is not active: a candidate version under trial
  // (enforce.change). It compiles as watch: a scorer only, no schema, no instruction.
  readonly trial?: RuleRecord
}

export type ProblemCode =
  | 'library_invalid'
  | 'derived_invalid'
  | 'derived_hash_mismatch'
  | 'id_collision'
  | 'stage_not_at_level'
  | 'no_output_fields'
  | 'field_unresolved'
  | 'field_kind_mismatch'
  | 'list_without_items'
  | 'shape_conflict'
  | 'weakens'
  | 'dormant' // auditLibrary only: an active rule that applies at no (node, stage)
  | 'golden_mismatch' // auditLibrary only

export interface CompileProblem {
  readonly code: ProblemCode
  readonly rules: readonly string[] // `id@version`, one or two
  readonly field?: string
  readonly message: string // what is wrong and how to fix it
}

export type CompileResult = { readonly ok: true; readonly plan: StagePlan } | { readonly ok: false; readonly problems: readonly CompileProblem[] }

export interface LedgerEntry {
  readonly rule: string
  readonly version: number
  readonly origin: RuleOrigin
  readonly disposition: Disposition
}

// Exactly what the rule-set hash covers. Plain JSON, so RFC 8785 makes it canonical.
export interface Manifest {
  readonly format: 1
  readonly code: {
    readonly runtime: number // RUNTIME_VERSION
    readonly checks: Readonly<Record<string, number>> // template versions in use
    readonly deps: { readonly zod: string; readonly '@mastra/core': string } // exact pins from package.json
  }
  readonly stage: Stage
  readonly rules: readonly { id: string; version: number; hash: Sha256; binding: Binding; origin: RuleOrigin }[] // applied, sorted by id
  readonly schema: Json // z.toJSONSchema(plan.schema)
  readonly instructions: string
  readonly scorers: readonly {
    id: ScorerId
    decider: 'code' | 'judge'
    fields: readonly string[]
    shape?: Shape
    check?: CheckRef
    judgePromptHash?: Sha256
  }[] // sorted by id
}

export interface StagePlan {
  readonly stage: Stage
  readonly node: NodeId
  readonly ruleSetHash: Sha256 // sha256(canonicalize(manifest)): store.recordStageRun
  readonly schema: z.ZodType // the drafter's structuredOutput.schema
  readonly instructions: string // strict + soft rules, by field; watch rules never print
  readonly scorers: {
    readonly code: readonly RuleScorer[] // shape + code_check rules, any binding
    // The only place a model enters the compiler (hazard `judge_model`).
    judges(model: JudgeModel): readonly RuleScorer[]
  }
  readonly ledger: readonly LedgerEntry[] // one entry per input rule version
  readonly manifest: Manifest
}

// TODO compileStage (pure, sync, never throws on rule data):
//   admit(library, derived, trial)            -> problems? return them
//   resolve(admitted, tree, node, stage)      -> applied + ledger
//   problems += weakenings(applied, tree)
//   composeShapes(applied strict shape rules) -> trie (or problems)
//   for each applied rule, each field: lookup(trie, field) must exist   -> field_unresolved
//     shape rule type == trie node type; template.target == node kind  -> field_kind_mismatch
//     template.requires(params, field) all resolve                      -> field_unresolved
//   any problem -> { ok: false, problems } (all of them, one round)
//   schema = printSchema(trie); instructions = renderInstructions(stage, trie, applied)
//   code scorers = codeScorer(each shape / code_check); judge specs = judgePrompt(each judgement)
//   manifest = { ... }; ruleSetHash = sha256(canonicalize(manifest))
export function compileStage(input: CompileInput): CompileResult {
  return notImplemented()
}

export interface AuditInput {
  readonly library: RuleLibrary
  readonly derived: readonly DerivedRule[]
  // 'unknown' in CI (the tree lives in the database): only checks that need no ancestry.
  readonly tree: readonly TreeNode[] | 'unknown'
}

// TODO auditLibrary (offline, async because scorers are):
//   admit(library, derived)
//   tree 'unknown': each field of each active rule, for each named stage, is defined by some
//     active strict shape rule of that stage (typo guard, no false positive); conflicts and
//     weakenings among rules that share an owner or involve OWNER_ALL.
//   tree given: compileStage for every (node, stage) with node.level ∈ STAGE_LEVELS[stage];
//     union of problems; each active rule applied at no pair -> dormant.
//   golden: for every shape / code_check rule (any status), each example:
//     codeScorer(rule).verify(embed(fields[0], output), input ?? {}) -> one verdict;
//     != expected -> golden_mismatch. Judgement examples are a paid run: never here.
export async function auditLibrary(input: AuditInput): Promise<readonly CompileProblem[]> {
  return notImplemented()
}

// Internal to index.ts. Fields sorted by path (code-unit order). Per field: its composed
// shape line (describe(trie node)), then its strict and soft rules (strict first, then id):
// "strict `id@v`. <statement> Why: <reason>." + the template render() line for a code check,
// "Should be: <describe(shape)>" for a soft shape rule, then examples as canonical JSON.
// A rule on several fields prints once, under its first field, with "Also on: …".
function renderInstructions(stage: Stage, trie: ShapeTrie, applied: readonly AdmittedRule[]): string {
  return notImplemented()
}
void renderInstructions

// =====================================================================================
// ===== src/store/store.ts (changed) ===================================================
//   tree(): Promise<GraphNode[]>              every node, for compileStage
//   derivedRules(): Promise<DerivedRule[]>    every derived rule version, for compileStage
//   NodeInput refuses id OWNER_ALL
// =====================================================================================

// =====================================================================================
// ===== Usage: the call sites, type-checked against the sketch ========================
// =====================================================================================

declare const store: GraphStore & { tree(): Promise<GraphNode[]>; derivedRules(): Promise<DerivedRule[]> }
declare function loadRuleLibrary(root: string): RuleLibrary
declare const judgeModel: JudgeModel

// Call site: the stage workflow (plan.stage_workflow). Compile is pure and cheap, so each step
// that needs the plan compiles again and refuses a changed hash: a resume after a rule
// change re-runs (plan.improve_ledger), and nothing un-serializable sits in a snapshot.
export async function planFor(run: { runId: string; stage: Stage; nodeId: NodeId; ruleSetHash?: string }): Promise<StagePlan> {
  const [tree, derived] = await Promise.all([store.tree(), store.derivedRules()])
  const compiled = compileStage({ stage: run.stage, node: run.nodeId, library: loadRuleLibrary('rules'), derived, tree })
  if (!compiled.ok) throw new Error(compiled.problems.map(p => `${p.code} ${p.rules.join(' ')}: ${p.message}`).join('\n'))
  if (run.ruleSetHash !== undefined && run.ruleSetHash !== compiled.plan.ruleSetHash) {
    throw new Error(`The rules changed during run ${run.runId}. Start a new run.`)
  }
  return compiled.plan
}

export async function contextStep(runId: string) {
  const plan = await planFor({ runId, stage: 'create_node', nodeId: 'sunscreen' })
  await store.recordStageRun({ runId, stage: plan.stage, nodeId: plan.node, ruleSetHash: plan.ruleSetHash })
  return { ruleSetHash: plan.ruleSetHash, instructions: plan.instructions } // into request context
}

// drafter: agent.generate(prompt, { structuredOutput: { schema: plan.schema }, ... })
// judge step: code checks first, then judges only when every strict code verdict passed.
export async function judgeStep(run: { runId: string; ruleSetHash: string }, draft: unknown, evidence: RunEvidence) {
  const plan = await planFor({ ...run, stage: 'create_node', nodeId: 'sunscreen' })
  const rows: ItemVerdict[] = []
  for (const s of plan.scorers.code) rows.push(...(await s.verify(draft, evidence)))
  const strictCodeOk = rows.every(r => r.binding !== 'strict' || r.verdict === 'pass')
  if (strictCodeOk) for (const s of plan.scorers.judges(judgeModel)) rows.push(...(await s.verify(draft, evidence)))
  await store.writeVerdicts(rows.map(r => ({ ...r, runId: run.runId })))
  return rows
}

// Call site: CI, inside `npm run rules:check` (src/rules/cli.ts), after the lock checks.
export async function rulesCheck(root: string): Promise<number> {
  const library = loadRuleLibrary(root)
  const problems = await auditLibrary({ library, derived: [], tree: 'unknown' })
  for (const p of problems) console.error(`${p.code} ${p.rules.join(' ')} ${p.field ?? ''}: ${p.message}`)
  return library.problems.length + problems.length === 0 ? 0 : 1
}

// Call site: the change trial (plan.change_process). Same compile, one candidate as watch.
export async function trialPlan(candidate: RuleRecord): Promise<StagePlan> {
  const [tree, derived] = await Promise.all([store.tree(), store.derivedRules()])
  const compiled = compileStage({ stage: 'create_node', node: 'sunscreen', library: loadRuleLibrary('rules'), derived, tree, trial: candidate })
  if (!compiled.ok) throw new Error('refused')
  return compiled.plan // its ruleSetHash differs from the live plan's; its schema and instructions do not
}
