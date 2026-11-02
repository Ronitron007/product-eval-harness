/**
 * plan.compiler, candidate "sonnet": one registry of checks, rules in conjunction,
 * a rule set that is a content-addressed value.
 *
 * This file is a sketch. It shows types and signatures of the whole unit in one place.
 * In the real unit each `// ── file ──` section is its own file (module map in design.md).
 * Bodies throw 'not implemented', except the few pure functions that DEFINE a term
 * (implies, rank). They are written out because the design depends on their meaning.
 *
 * Type-checked: this file, placed at src/compiler/sketch.ts in a copy of the repo at 803301a,
 * passes `tsc --noEmit` (TypeScript 6.0.3). The imports use that path ('../rules/...').
 *
 * Reading order: 1 record additions, 2 checks, 3 admission, 4 compile output,
 * 5 public API, 6 internals.
 */

import type { MastraScorer, ScorerJudgeConfig, ScorerRunResult } from '@mastra/core/evals'
import { z } from 'zod'
import type { RuleLibrary } from '../rules/load'
import type { Binding as BindingZ, NodeLevel as NodeLevelZ, RuleKind as RuleKindZ, RuleRecord as StoredRuleRecord, Stage as StageZ, Verdict } from '../rules/schema'

// schema.ts exports these four as values only today. The unit adds `export type X = z.infer<typeof X>` for each (additive).
type Binding = z.infer<typeof BindingZ>
type NodeLevel = z.infer<typeof NodeLevelZ>
type RuleKind = z.infer<typeof RuleKindZ>
type Stage = z.infer<typeof StageZ>

const nope = (what: string): never => {
  throw new Error(`not implemented: ${what}`)
}

// ── src/rules/shape.ts and src/rules/schema.ts (edit) ───────────────────────────────────
// Two new optional fields on RuleRecord. Both sit inside ruleHash(). Nothing else changes.
//
//   shape:  kind 'shape' only. The type of the value at each path in scope.fields.
//   params: kind 'code_check' only. The parameters of the check named by `check`. Always
//           present for a code_check, `{}` when the check has none.
//
// Shape has no facets (no min, no max, no pattern). A bound is a code_check, so there is
// one way to state a bound, and `implies` can compare it (weaken, below).
// A list is never a Shape. A list comes from `[]` in the path: a rule at `criteria[]`
// states the type of each item of `criteria`. This keeps one way to say "list".

export type Shape =
  | { readonly type: 'text' }
  | { readonly type: 'number' }
  | { readonly type: 'flag' }
  | { readonly type: 'enum'; readonly values: readonly string[] } // at least one, unique, authored order
  | { readonly type: 'object'; readonly fields: Readonly<Record<string, Shape>> } // closed, every field required
  | { readonly type: 'nullable'; readonly of: Shape } // how a field is optional. nullable of nullable is refused

export const FieldName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/)

export const Shape: z.ZodType<Shape> = z.lazy(() =>
  z.union([
    z.object({ type: z.literal('text') }).strict(),
    z.object({ type: z.literal('number') }).strict(),
    z.object({ type: z.literal('flag') }).strict(),
    z
      .object({
        type: z.literal('enum'),
        values: z.array(z.string().min(1)).min(1).refine(vs => new Set(vs).size === vs.length, { message: 'List each enum value once.' }),
      })
      .strict(),
    z.object({ type: z.literal('object'), fields: z.record(FieldName, Shape) }).strict(),
    z.object({ type: z.literal('nullable'), of: Shape }).strict(),
  ]),
)

/** Fields to add to RuleRecord, and the three new superRefine lines. */
export const ruleSpecFields = {
  params: z.record(z.string(), z.unknown()).optional(),
  shape: Shape.optional(),
}
/** superRefine additions:
 *    kind 'shape'      -> shape required, binding must be 'strict' (a decoder enforces a shape, so a 'watch' shape would be a lie)
 *    kind 'code_check' -> params required
 *    other kinds       -> no shape, no params
 */
export type RuleRecord = StoredRuleRecord & { readonly params?: Readonly<Record<string, unknown>>; readonly shape?: Shape }

// ── src/rules/schema.ts (edit): one more list, keyed by Stage so a new stage breaks the build ──
export const STAGE_LEVELS: Readonly<Record<Stage, readonly NodeLevel[]>> = {
  define_criteria: ['domain'],
  create_node: ['inner', 'leaf'],
  create_pack: ['leaf'],
  create_layout: ['leaf'],
  evaluate_product: ['leaf'], // inferred: graph.stages says the product evaluation reads the pack of a leaf
}

// ── src/compiler/checks/define.ts ───────────────────────────────────────────────────────

/** Evidence a check may need. A check names the keys it needs. */
export interface Evidence {
  readonly source_text?: string
  readonly registered_record_ids?: ReadonlySet<string>
}
export type EvidenceKey = keyof Evidence

/**
 * What a check can say. There is no number, no choice among candidates, no "best".
 * So a check cannot grade and cannot match (RealDose invariant 11, rules.harness).
 */
export type Outcome =
  | { readonly verdict: 'pass' }
  | { readonly verdict: 'fail'; readonly error: string; readonly fix: string }
  | { readonly verdict: 'cannot_verify'; readonly why: string }

/** The type of a node of the compiled output shape. 'nullable' is a flag on a node, not a kind. */
export type NodeKind = 'object' | 'list' | 'text' | 'number' | 'flag' | 'enum'
export type FieldNode =
  | { readonly kind: 'object'; readonly nullable: boolean; readonly fields: ReadonlyMap<string, FieldNode> }
  | { readonly kind: 'list'; readonly nullable: boolean; readonly of: FieldNode }
  | { readonly kind: 'enum'; readonly nullable: boolean; readonly values: readonly string[] }
  | { readonly kind: 'text' | 'number' | 'flag'; readonly nullable: boolean }

export interface Vector<P, K extends EvidenceKey> {
  readonly params: P
  readonly item: unknown
  readonly evidence?: Pick<Evidence, K>
  readonly expected: Verdict
}

/**
 * One check. `params` is the ONE copy of the parameters. render, verify, fits and implies
 * all take it. The compiler passes the same parsed object to all four, to the hash,
 * and to the scorer. There is no second copy to drift (hazard drift).
 */
export interface CheckDef<N extends string = string, P = unknown, K extends EvidenceKey = never> {
  readonly name: N
  /** Node kinds the target may have. A check on another kind is refused at compile time. */
  readonly on: readonly NodeKind[]
  /** Strict. No defaults, no optional keys: authored params equal parsed params (see hash). */
  readonly params: z.ZodType<P>
  /** The harness withholds the call and answers cannot_verify when a key is missing. verify never sees a missing key. */
  readonly needs: readonly K[]
  /** The clause that the instruction prints, from the same `params` that verify reads. */
  render(params: P, target: string): string
  verify(params: P, value: unknown, evidence: Required<Pick<Evidence, K>>): Outcome
  /** L(stronger) is a subset of L(weaker): every value that passes `stronger` also passes `weaker`. Defines "weaken". */
  implies(stronger: P, weaker: P): boolean
  /** Refusal text when the params do not fit the node they target (example: a value outside the enum). */
  fits?(params: P, node: FieldNode): string | undefined
  /** Boundary cases: at least one pass, one fail, and a cannot_verify when `needs` is not empty. Feed the conformance suite and the behaviour digest. */
  readonly vectors: readonly Vector<P, K>[]
}
export type AnyCheck = CheckDef<string, any, EvidenceKey>

export function defineCheck<N extends string, P, K extends EvidenceKey = never>(def: CheckDef<N, P, K>): CheckDef<N, P, K> {
  return def
}

/** The gate between a scorer and verify. Withholds the call when evidence is missing. Turns a throw into cannot_verify. Never returns pass by default. */
export function runCheck(def: AnyCheck, params: unknown, value: unknown, evidence: Evidence): Outcome {
  return nope('runCheck: missing needs -> cannot_verify; try verify; catch -> cannot_verify with the message')
}

// ── src/compiler/checks/registry.ts: THE one list ────────────────────────────────────────

const minItems = defineCheck({
  name: 'min_items',
  on: ['list'],
  params: z.object({ min: z.number().int().min(0), max: z.number().int().min(0).nullable() }).strict(),
  needs: [],
  render: (p, target) => nope(`render min_items ${p.min} at ${target}`),
  verify: (p, value) => nope(`verify min_items ${p.min} ${String(value)}`),
  // stronger if min is not lower and max is not higher
  implies: (a, b) => a.min >= b.min && (b.max === null || (a.max !== null && a.max <= b.max)),
  vectors: [],
})

const oneOf = defineCheck({
  name: 'one_of',
  on: ['text', 'enum'],
  params: z.object({ values: z.array(z.string().min(1)).min(1) }).strict(),
  needs: [],
  render: (p, target) => nope(`render one_of ${p.values.join()} at ${target}`),
  verify: (p, value) => nope(`verify one_of ${p.values.join()} ${String(value)}`),
  implies: (a, b) => a.values.every(v => b.values.includes(v)), // a bigger enum is NOT stronger
  fits: (p, node) => (node.kind === 'enum' ? p.values.filter(v => !node.values.includes(v)).map(v => `${v} is outside the enum of the shape rule`).join(' ') || undefined : undefined),
  vectors: [],
})

const quoteInSource = defineCheck({
  name: 'quote_in_source',
  on: ['text'],
  params: z.object({}).strict(),
  needs: ['source_text'],
  render: (_p, target) => nope(`render quote_in_source at ${target}`),
  verify: (_p, value, ev) => nope(`verify the quote ${String(value)} is a substring of ${ev.source_text.length} chars`),
  implies: () => true,
  vectors: [],
})

export const CHECKS = [minItems, oneOf, quoteInSource] as const
export type CheckName = (typeof CHECKS)[number]['name']
type CallOf<D> = D extends CheckDef<infer N, infer P, any> ? { readonly check: N; readonly params: P } : never
/** A code_check in typed form. Discriminated on `check`, so params are typed per check. Derived from CHECKS. */
export type CheckCall = CallOf<(typeof CHECKS)[number]>

export interface Registry {
  readonly all: readonly AnyCheck[]
  get(name: string): AnyCheck | undefined
}

// ── src/compiler/admit.ts ───────────────────────────────────────────────────────────────

export type RuleRef = `${string}@${number}` // criteria.reason_has_record@1, also the scorer id
export type RuleSpec =
  | { readonly kind: 'shape'; readonly shape: Shape }
  | ({ readonly kind: 'code_check' } & CheckCall)
  | { readonly kind: 'judgement'; readonly question: string; readonly policy?: string }

declare const admittedBrand: unique symbol
/** A rule that passed every static test. The only constructor is admitRules. */
export interface AdmittedRule {
  readonly [admittedBrand]: true
  readonly ref: RuleRef
  readonly record: Readonly<RuleRecord>
  readonly hash: string // ruleHash(record), recomputed here, never trusted from storage
  readonly origin: 'library' | 'derived'
  readonly spec: RuleSpec // the typed form; params parsed by the check's own schema
}
declare const poolBrand: unique symbol
/** All admitted versions of all rules. compile accepts this type and nothing else. */
export interface AdmittedPool {
  readonly [poolBrand]: true
  readonly rules: readonly AdmittedRule[]
}

/** The columns of harness.derived_rules that the compiler reads. Not the Drizzle row type. */
export interface StoredRuleRow {
  readonly id: string
  readonly version: number
  readonly hash: string
  readonly owner: string
  readonly record: unknown
}
export interface AdmitInput {
  readonly library: RuleLibrary // refused whole when library.problems is not empty
  readonly derived?: readonly StoredRuleRow[] // each row is re-parsed, re-hashed, and compared with its own columns
}

export type ProblemCode =
  | 'library_has_problems' | 'derived_row_invalid' | 'derived_hash_mismatch' | 'derived_column_mismatch' | 'id_collision' // admission
  | 'unknown_check' | 'params_invalid' | 'example_input_invalid' //                                                       parameters
  | 'check_not_applicable' //                                                                                          params do not fit the target
  | 'tree_invalid' | 'node_unknown' | 'owner_unknown' | 'owner_not_ancestor' | 'scope_reaches_nothing' | 'stage_not_at_level' //  scope
  | 'field_unresolved' | 'stage_has_no_shape' | 'shape_conflict' | 'shape_overlap' | 'shape_parent_missing' //                 fields
  | 'weakens_inherited' //                                                                                              monotonicity
  | 'trial_ref_unknown' | 'trial_ref_not_draft' | 'trial_shape_draft' //                                                 trial mode

/** Same spirit as RuleProblem in load.ts: says what is wrong and how to fix it. Plus a code and the rules involved. */
export interface CompileProblem {
  readonly code: ProblemCode
  readonly rules: readonly RuleRef[]
  readonly field: string
  readonly message: string
}
export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly problems: readonly CompileProblem[] }

// ── src/compiler/resolve.ts ─────────────────────────────────────────────────────────────

export interface TreeNode {
  readonly id: string
  readonly parentId: string | null
  readonly level: NodeLevel
} // structural: GraphNode rows fit
declare const treeBrand: unique symbol
export interface TreeSnapshot {
  readonly [treeBrand]: true
}
/** Checks one parent each, no cycle, domain nodes have no parent. */
export function treeOf(rows: readonly TreeNode[]): Result<TreeSnapshot> {
  return nope('treeOf')
}

const BINDING_RANK: Readonly<Record<Binding, number>> = { watch: 0, soft: 1, strict: 2 }
export const bindingRank = (b: Binding): number => BINDING_RANK[b]

/**
 * The definition of weaken. Inputs: two rules that name the same check on at least one
 * identical (stage, field path) target, where `child` is owned by a deeper node than `inherited`.
 * `child` weakens `inherited` when
 *   (1) check.implies(child.params, inherited.params) is false, or
 *   (2) the authored binding of child ranks below the authored binding of inherited.
 * Equal rules do not weaken (the combined rule is no weaker). Shape rules never reach this
 * function: one owner per field, so a second claim is shape_conflict.
 */
export function weakens(def: AnyCheck, child: Extract<RuleSpec, { kind: 'code_check' }> & { binding: Binding }, inherited: typeof child): readonly ('params_widen' | 'binding_lowered')[] {
  const out: ('params_widen' | 'binding_lowered')[] = []
  if (!def.implies(child.params, inherited.params)) out.push('params_widen')
  if (bindingRank(child.binding) < bindingRank(inherited.binding)) out.push('binding_lowered')
  return out
}

// ── src/compiler/fields.ts ──────────────────────────────────────────────────────────────

/** The composed output shape of one (stage, node). Built from claims, one owner per path. */
export interface FieldTree {
  readonly root: Extract<FieldNode, { kind: 'object' }>
  /** normalized path -> rule that owns it. The error messages and the instruction read this. */
  readonly owners: ReadonlyMap<string, RuleRef>
}
export function composeFields(shapeRules: readonly AdmittedRule[], stage: Stage): Result<FieldTree> {
  // claims sorted (depth, path, ref). For each claim: walk to the parent through the tree built so far
  // (missing -> shape_parent_missing). The last segment must be absent in the parent (present -> shape_overlap,
  // or shape_conflict when the same path has two claims; the message says "incompatible types" when kinds differ).
  return nope('composeFields')
}
/** `criteria[].attributes[]` -> the item node of attributes. `criteria[].recordIds` -> the list node. undefined -> field_unresolved. */
export function resolvePath(tree: FieldTree, path: string): FieldNode | undefined {
  return nope('resolvePath')
}
export function toZod(node: FieldNode): z.ZodType<unknown> {
  return nope('toZod: strict objects, fields sorted by name, enums keep authored order')
}
export function describeNode(node: FieldNode, path: string): string {
  return nope('describeNode: the sentence for a shape rule, from the same node that toZod reads')
}

// ── src/compiler/compile.ts: what comes out ─────────────────────────────────────────────

declare const hashBrand: unique symbol
export type RuleSetHash = string & { readonly [hashBrand]: true } // 64 hex chars, fits StageRunInput.ruleSetHash

export interface EnforcedRule {
  readonly ref: RuleRef
  readonly id: string
  readonly version: number
  readonly hash: string
  readonly kind: RuleKind
  readonly owner: string
  readonly authoredBinding: Binding
  readonly binding: Binding // differs from authoredBinding only for a trial draft (clamped to watch)
  readonly targets: readonly string[]
}

/** One line for EVERY admitted rule. enforced + excluded = the whole pool, each ref once. */
export type LedgerEntry = { readonly ref: RuleRef; readonly owner: string } & (
  | { readonly state: 'enforced' }
  | { readonly state: 'trial'; readonly authored: Binding }
  | { readonly state: 'excluded'; readonly why: 'draft' | 'retired' | 'superseded' | 'other_node' | 'other_stage' }
)

export interface Instructions {
  readonly text: string // goes to the drafter. Names the stage. Never names the node.
  readonly byRule: ReadonlyMap<RuleRef, string> // the same words per rule, for repair messages
}

export interface Finding {
  readonly target: string // concrete address: criteria[2].attributes[0]
  readonly verdict: Verdict
  readonly reason: string
  readonly fix?: string
  readonly evidence?: { readonly quote: string; readonly source: string }
}
/** The input of a code scorer run. */
export interface ScorerInput {
  readonly evidence: Evidence
}
export type RuleScorer = MastraScorer<string, ScorerInput, unknown, Record<string, any>>
/** The three-way result lives in analyzeStepResult. The numeric score is 1 when every finding is pass, else 0 (cannot_verify is 0). Read findings, never the score. */
export function readFindings(run: ScorerRunResult<any, any, any>): readonly Finding[] {
  return nope('readFindings: run.analyzeStepResult')
}

/** A judgement rule as data. No model inside. */
export interface JudgeSpec {
  readonly ref: RuleRef
  readonly binding: Binding
  readonly question: string
  readonly policy?: string
  readonly targets: readonly string[]
}
export type JudgeModel = ScorerJudgeConfig['model']

export interface CompiledRuleSet {
  readonly stage: Stage
  readonly hash: RuleSetHash
  readonly schema: z.ZodType<unknown> // strict; goes to structuredOutput: { schema }
  readonly instructions: Instructions
  readonly enforced: readonly EnforcedRule[] // sorted by (owner depth, id)
  readonly judges: readonly JudgeSpec[]
  readonly ledger: readonly LedgerEntry[]
  /** Built on first call. Shape and code_check rules. No judge, no model. */
  codeScorers(): ReadonlyMap<RuleRef, RuleScorer>
}

// ── src/compiler/index.ts: the public API ───────────────────────────────────────────────

export interface CompileRequest {
  readonly stage: Stage
  readonly node: string
  /** live: active rules. trial: active rules plus the named drafts, drafts clamped to watch. Default live. */
  readonly mode?: 'live' | { readonly trial: readonly RuleRef[] }
}
export interface GoldenReport {
  readonly results: readonly { readonly ref: RuleRef; readonly example: number; readonly expected: Verdict; readonly got: Verdict }[]
  readonly failures: readonly string[] // one sentence each
  readonly skipped: readonly RuleRef[] // judgement rules: a paid run
}

export interface Compiler {
  /** The only way to get an AdmittedPool. All problems in one round, never throws. */
  admitRules(input: AdmitInput): Result<AdmittedPool>
  /** One (stage, node). Pure. No model, no clock, no network. Same input, same output, same hash. */
  compile(pool: AdmittedPool, tree: TreeSnapshot, request: CompileRequest): Result<CompiledRuleSet>
  /** Every (stage, node) pair that STAGE_LEVELS allows in the tree. Pool analysis runs once. For CI and for the add-node flow. */
  compileAll(pool: AdmittedPool, tree: TreeSnapshot): Result<readonly CompiledRuleSet[]>
  /** Runs the examples of shape and code_check rules through their own checks. Offline. */
  goldenCheck(set: CompiledRuleSet, pool: AdmittedPool): GoldenReport
  /** Builds the judge scorers. This is the first place a model appears. compile never calls it. */
  judgeScorers(set: CompiledRuleSet, model: JudgeModel): ReadonlyMap<RuleRef, RuleScorer>
}

/** The seam for tests: a cloned registry shows that a changed check changes the hash. */
export function createCompiler(registry: Registry): Compiler {
  return nope('createCompiler')
}
const defaultRegistry: Registry = { all: CHECKS, get: name => CHECKS.find(c => c.name === name) }
export const { admitRules, compile, compileAll, goldenCheck, judgeScorers } = createCompiler(defaultRegistry)

// ── src/compiler/hash.ts ────────────────────────────────────────────────────────────────

/**
 * sha256 of RFC 8785 canonical JSON of:
 *   format            COMPILER_FORMAT (changes only when this layout changes)
 *   stage
 *   rules             [{ref, ruleHash, effective binding}]   sorted by ref
 *   instructions      the text itself
 *   schema            z.toJSONSchema(set.schema, { io: 'input' })   the real Zod, not our tree
 *   checks            [{ref, check, parsed params, targets, behaviour}] sorted by ref
 *                     behaviour = sha256 of the verdicts of def.verify and the text of def.render over def.vectors
 *   judges            [{ref, binding, question, policy, targets, JUDGE_PROMPT}]
 * The node id is NOT an input. The node enters only by choosing the rules.
 * Every list is sorted by a total order. No Map or Set order reaches the hash.
 */
export function ruleSetHash(parts: Omit<CompiledRuleSet, 'hash' | 'ledger' | 'codeScorers'> & { checks: readonly unknown[] }): RuleSetHash {
  return nope('ruleSetHash')
}

// ── tests/compiler/types.test.ts: lines that tsc --noEmit (already in CI) must keep refusing ──
declare const rawRules: readonly StoredRuleRecord[]
declare const someTree: TreeSnapshot
declare const aPool: AdmittedPool
// @ts-expect-error compile takes an AdmittedPool. A raw record list is not one (hazard: unlocked or invalid rules).
compile(rawRules, someTree, { stage: 'create_node', node: 'skincare' })
compile(aPool, someTree, { stage: 'create_node', node: 'skincare' })
export const okCall: CheckCall = { check: 'min_items', params: { min: 1, max: null } }
// @ts-expect-error params are typed per check (hazard: params that do not fit the check).
export const badCall: CheckCall = { check: 'min_items', params: { values: ['mg'] } }
// @ts-expect-error a verdict is pass, fail or cannot_verify. A check has no way to return a grade (hazard: determinism).
export const grade: Outcome = { verdict: 'pass', score: 0.7 }
