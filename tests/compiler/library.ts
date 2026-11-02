import { ruleHash } from '../../src/rules/hash'
import type { RuleLibrary } from '../../src/rules/load'
import { RuleRecord } from '../../src/rules/schema'
import type { DerivedRule } from '../../src/store/store'
import { compileStage, type CompileInput, type TreeNode } from '../../src/compiler'
import { FIXTURE, TREE, type RuleInput } from './rules'

// In-memory inputs of compileStage: a library with no loader problem, as after rules:lock.

export function library(rules: readonly RuleInput[]): RuleLibrary {
  const lib: RuleLibrary = { rules: [], problems: [], lock: { lock_version: 1, rules: {} } }
  for (const input of rules) {
    const rule = RuleRecord.parse(input)
    const hash = ruleHash(rule)
    lib.rules.push({ rule, hash, file: `${rule.owner}/${rule.id}.yaml` })
    lib.lock.rules[rule.id] = { ...lib.lock.rules[rule.id], [String(rule.version)]: hash }
  }
  return lib
}

// A row of harness.derived_rules for a record, with the hash that the store writes.
export function derivedRow(input: RuleInput, overrides: Partial<DerivedRule> = {}): DerivedRule {
  const rule = RuleRecord.parse(input)
  return { id: rule.id, version: rule.version, hash: ruleHash(rule), owner: rule.owner, record: rule, runId: 'run-fixture', createdAt: new Date(0), ...overrides }
}

export const tree: readonly TreeNode[] = TREE.map(n => ({ ...n }))

export function input(overrides: Partial<CompileInput> & { rules?: readonly RuleInput[] } = {}): CompileInput {
  const { rules = FIXTURE, ...rest } = overrides
  return { stage: 'create_node', node: 'sunscreen', library: library(rules), derived: [], tree, ...rest }
}

export function compile(overrides: Parameters<typeof input>[0] = {}) {
  return compileStage(input(overrides))
}

// The plan of a compile that must succeed. A refusal fails the test with its problems.
export function planOf(overrides: Parameters<typeof input>[0] = {}) {
  const r = compile(overrides)
  if (!r.ok) throw new Error(`The compile was refused:\n${r.problems.map(p => `${p.code} ${p.rules.join(' ')} ${p.field ?? ''}: ${p.message}`).join('\n')}`)
  return r.plan
}

// The problems of a compile that must fail.
export function problemsOf(overrides: Parameters<typeof input>[0] = {}) {
  const r = compile(overrides)
  if (r.ok) throw new Error('The compile succeeded, and the test expects a refusal.')
  return r.problems
}

export const codes = (problems: readonly { code: string }[]) => problems.map(p => p.code)

// Replaces the fixture rules that share an id with a given rule, and adds the others.
export function withRules(...rules: RuleInput[]): RuleInput[] {
  const ids = new Set(rules.map(r => r.id))
  return [...FIXTURE.filter(r => !ids.has(r.id)), ...rules]
}

// Sets a value at a field path of a copy of an output. Each [] means item 0.
export function setAt(output: unknown, field: string, value: unknown): unknown {
  const copy = structuredClone(output) as Record<string, unknown>
  const keys = field.split('.')
  let at: Record<string, unknown> = copy
  keys.forEach((seg, i) => {
    const each = seg.endsWith('[]')
    const key = each ? seg.slice(0, -2) : seg
    const last = i === keys.length - 1
    if (last && !each) at[key] = value
    else if (last) (at[key] as unknown[])[0] = value
    else at = (each ? (at[key] as unknown[])[0] : at[key]) as Record<string, unknown>
  })
  return copy
}
