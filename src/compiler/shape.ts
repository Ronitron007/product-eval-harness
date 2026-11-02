import { z } from 'zod'
import { SHAPE_ORDERS, type Shape, type ShapeParams } from '../rules/schema'
import { meetParams, type OrderTable } from '../rules/strictness'
import type { CompileProblem } from './index'
import { parsePath } from './paths'

// Schema composition (compile.shape): the meet of the shape rules in scope, for each path of a
// trie. Runtime code: RUNTIME_VERSION covers it, because printShape decides each shape verdict.

export type RuleRef = string // id@version
type LeafShape = Exclude<Shape, { type: 'list' }>

export type TrieNode =
  | { readonly kind: 'object'; readonly keys: ReadonlyMap<string, TrieNode>; readonly from: readonly RuleRef[] }
  | { readonly kind: 'list'; readonly items: TrieNode | undefined; readonly shape: ShapeParams<'list'>; readonly from: readonly RuleRef[] }
  | { readonly kind: 'leaf'; readonly shape: LeafShape; readonly from: readonly RuleRef[] }
export type ShapeTrie = Extract<TrieNode, { kind: 'object' }>

// One field of one shape rule.
export interface ShapeEntry {
  readonly ref: RuleRef
  readonly field: string
  readonly shape: Shape
}

// The trie while it grows. Keys live in a Map, so no key can reach an object prototype
// (shape.reserved_names). dims holds the rules that set each dimension, to name them in a conflict.
type Dims = Map<string, RuleRef[]>
type MObject = { kind: 'object'; keys: Map<string, MNode>; from: RuleRef[]; path: string }
type MList = { kind: 'list'; items: MNode | undefined; shape: ShapeParams<'list'>; from: RuleRef[]; dims: Dims; path: string; explicit: RuleRef[] }
type MLeaf = { kind: 'leaf'; shape: LeafShape; from: RuleRef[]; dims: Dims; path: string }
type MNode = MObject | MList | MLeaf

const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const join = (prefix: string, key: string) => (prefix === '' ? key : `${prefix}.${key}`)
const uniq = (refs: readonly RuleRef[]) => [...new Set(refs)].sort(byCodeUnit)
const kindName = (n: MNode) => (n.kind === 'object' ? 'an object' : n.kind === 'list' ? 'a list' : `a ${n.shape.type} leaf`)
const entryKind = (shape: Shape) => (shape.type === 'list' ? 'a list' : `a ${shape.type} leaf`)
const paramsOf = (shape: Shape): Record<string, unknown> => {
  const { type: _type, ...params } = shape
  return params
}

function addDims(dims: Dims, params: Record<string, unknown>, ref: RuleRef): void {
  for (const [k, v] of Object.entries(params)) if (v !== undefined) dims.set(k, [...(dims.get(k) ?? []), ref])
}

export function composeShapes(entries: readonly ShapeEntry[]): { trie: ShapeTrie; problems: CompileProblem[] } {
  const problems: CompileProblem[] = []
  const root: MObject = { kind: 'object', keys: new Map(), from: [], path: '' }
  const conflict = (rules: readonly RuleRef[], field: string, message: string) =>
    problems.push({ code: 'shape_conflict', rules: uniq(rules), field, message })

  // A new node for the shape of one entry, at path.
  const fresh = (e: ShapeEntry, path: string): MList | MLeaf => {
    const dims: Dims = new Map()
    addDims(dims, paramsOf(e.shape), e.ref)
    return e.shape.type === 'list'
      ? { kind: 'list', items: undefined, shape: paramsOf(e.shape), from: [e.ref], dims, path, explicit: [e.ref] }
      : { kind: 'leaf', shape: e.shape, from: [e.ref], dims, path }
  }

  // Puts the shape of entry e on the node at path, or meets it with the shape already there.
  const place = (existing: MNode | undefined, e: ShapeEntry, path: string): MNode | undefined => {
    if (existing === undefined) return fresh(e, path)
    const isList = e.shape.type === 'list'
    if (existing.kind === 'object' || (existing.kind === 'list') !== isList) {
      conflict([existing.from[0] ?? e.ref, e.ref], path, `${path} is ${kindName(existing)} in ${uniq(existing.from).join(', ')}, and ${entryKind(e.shape)} in ${e.ref}. A field is a leaf or a container, never both. Change one rule.`)
      return undefined
    }
    if (existing.kind === 'leaf' && existing.shape.type !== e.shape.type) {
      conflict([existing.from[0]!, e.ref], path, `${path} is ${existing.shape.type} in ${uniq(existing.from).join(', ')}, and ${e.shape.type} in ${e.ref}. Give the field one type.`)
      return undefined
    }
    const order = SHAPE_ORDERS[e.shape.type] as OrderTable<Record<string, unknown>>
    const met = meetParams(existing.kind === 'list' ? existing.shape : paramsOf(existing.shape), paramsOf(e.shape), order)
    addDims(existing.dims, paramsOf(e.shape), e.ref)
    existing.from.push(e.ref)
    if (!met.ok) {
      const rules = existing.dims.get(met.dimension) ?? [e.ref]
      conflict(rules, path, `The ${met.dimension} of ${path} in ${uniq(rules).join(', ')} share no value, so no value fits. Change one rule.`)
      return undefined
    }
    if (existing.kind === 'list') {
      existing.shape = met.params
      existing.explicit.push(e.ref)
    } else existing.shape = { type: existing.shape.type, ...met.params } as LeafShape
    return existing
  }

  const insert = (e: ShapeEntry): void => {
    const segments = parsePath(e.field)
    let node: MObject = root
    for (const [i, seg] of segments.entries()) {
      const last = i === segments.length - 1
      const path = join(node.path, seg.key)
      const existing = node.keys.get(seg.key)
      node.from.push(e.ref)
      if (!seg.each && last) {
        const placed = place(existing, e, path)
        if (placed) node.keys.set(seg.key, placed)
        return
      }
      if (!seg.each) {
        if (existing && existing.kind !== 'object') {
          conflict([existing.from[0]!, e.ref], path, `${path} is ${kindName(existing)} in ${uniq(existing.from).join(', ')}, and an object in ${e.ref}, which names ${e.field}. Change one rule.`)
          return
        }
        const next: MObject = existing ?? { kind: 'object', keys: new Map(), from: [], path }
        node.keys.set(seg.key, next)
        node = next
        continue
      }
      // seg.each: the node at path is a list, and the rest of the path is about its items.
      if (existing && existing.kind !== 'list') {
        conflict([existing.from[0]!, e.ref], path, `${path} is ${kindName(existing)} in ${uniq(existing.from).join(', ')}, and a list in ${e.ref}, which names ${e.field}. Change one rule.`)
        return
      }
      const list: MList = existing ?? { kind: 'list', items: undefined, shape: {}, from: [], dims: new Map(), path, explicit: [] }
      node.keys.set(seg.key, list)
      list.from.push(e.ref)
      const itemPath = `${path}[]`
      if (last) {
        const placed = place(list.items, e, itemPath)
        if (placed) list.items = placed
        return
      }
      if (list.items && list.items.kind !== 'object') {
        conflict([list.items.from[0]!, e.ref], itemPath, `${itemPath} is ${kindName(list.items)} in ${uniq(list.items.from).join(', ')}, and an object in ${e.ref}, which names ${e.field}. Change one rule.`)
        return
      }
      const items: MObject = list.items ?? { kind: 'object', keys: new Map(), from: [], path: itemPath }
      list.items = items
      node = items
    }
  }

  const sorted = [...entries].sort((a, b) => byCodeUnit(a.ref, b.ref) || byCodeUnit(a.field, b.field))
  for (const e of sorted) insert(e)
  if (entries.length === 0) {
    problems.push({ code: 'no_output_fields', rules: [], message: 'No shape rule applies, so the schema would accept any output. Add a shape rule for each output field of this stage.' })
  }

  // The joint meet (shape.joint_meet): the composed shape must be exactly the set that the printed schema decodes.
  const joint = (n: MNode): void => {
    const rulesOf = (...dims: string[]) => dims.flatMap(d => (n.kind === 'object' ? [] : (n.dims.get(d) ?? [])))
    if (n.kind === 'object') return n.keys.forEach(joint)
    if (n.kind === 'list') {
      const s = n.shape
      if (s.min_items !== undefined && s.max_items !== undefined && s.min_items > s.max_items) {
        conflict(rulesOf('min_items', 'max_items'), n.path, `${n.path} needs at least ${s.min_items} and at most ${s.max_items} items, so no list fits. Change one rule.`)
      }
      if (n.items) joint(n.items)
      else if (n.explicit.length > 0) {
        problems.push({ code: 'list_without_items', rules: uniq(n.explicit), field: n.path, message: `The list shape at ${n.path} has no rule on ${n.path}[], so its items have no shape. Add a shape rule on ${n.path}[] or below it.` })
      }
      return
    }
    const s = n.shape
    if (s.type === 'text') {
      if (s.values !== undefined && (s.min_length !== undefined || s.max_length !== undefined)) {
        conflict(rulesOf('values', 'min_length', 'max_length'), n.path, `${n.path} has values and a length limit. The schema prints values as an enum, which carries no length limit. Drop the length limit, or the values.`)
      } else if (s.min_length !== undefined && s.max_length !== undefined && s.min_length > s.max_length) {
        conflict(rulesOf('min_length', 'max_length'), n.path, `${n.path} needs at least ${s.min_length} and at most ${s.max_length} characters, so no text fits. Change one rule.`)
      }
    }
    if (s.type === 'number') {
      if (s.min !== undefined && s.max !== undefined && s.min > s.max) {
        conflict(rulesOf('min', 'max'), n.path, `${n.path} needs a number of at least ${s.min} and at most ${s.max}, so no number fits. Change one rule.`)
      } else if (s.integer && s.min !== undefined && s.max !== undefined && Math.ceil(s.min) > Math.floor(s.max)) {
        conflict(rulesOf('integer', 'min', 'max'), n.path, `${n.path} needs a whole number from ${s.min} to ${s.max}, and no whole number lies there. Change one rule.`)
      }
    }
  }
  joint(root)
  return { trie: root as ShapeTrie, problems }
}

export function lookup(trie: ShapeTrie, path: string): TrieNode | undefined {
  let node: TrieNode | undefined = trie
  for (const seg of parsePath(path)) {
    if (node?.kind !== 'object') return undefined
    const child: TrieNode | undefined = node.keys.get(seg.key)
    if (!child) return undefined
    if (!seg.each) node = child
    else if (child.kind !== 'list') return undefined
    else node = child.items
  }
  return node
}

// One shape, for the per-rule shape check and for each leaf of the schema. Only constructs that
// z.toJSONSchema shows in full: no refine, no transform.
export function printShape(shape: Shape): z.ZodType {
  switch (shape.type) {
    case 'text': {
      let s = z.string()
      if (shape.min_length !== undefined) s = s.min(shape.min_length)
      if (shape.max_length !== undefined) s = s.max(shape.max_length)
      const values = shape.values && z.enum([...shape.values].sort(byCodeUnit) as [string, ...string[]])
      // values with a length limit never reach the schema (shape_conflict). The per-rule check
      // of one such rule still tests both.
      if (values) return shape.min_length !== undefined || shape.max_length !== undefined ? s.pipe(values) : values
      return s
    }
    case 'number': {
      let s = z.number()
      if (shape.integer) s = s.int()
      if (shape.min !== undefined) s = s.min(shape.min)
      if (shape.max !== undefined) s = s.max(shape.max)
      return s
    }
    case 'flag':
      return z.boolean()
    case 'list': {
      let s = z.array(z.unknown())
      if (shape.min_items !== undefined) s = s.min(shape.min_items)
      if (shape.max_items !== undefined) s = s.max(shape.max_items)
      return s
    }
  }
}

// The decoding schema: strict objects that require each key, keys and enum values in code-unit order.
export function printSchema(trie: ShapeTrie): z.ZodType {
  const print = (n: TrieNode): z.ZodType => {
    if (n.kind === 'leaf') return printShape(n.shape)
    if (n.kind === 'list') {
      let s = z.array(n.items ? print(n.items) : z.never())
      if (n.shape.min_items !== undefined) s = s.min(n.shape.min_items)
      if (n.shape.max_items !== undefined) s = s.max(n.shape.max_items)
      return s
    }
    const shape: Record<string, z.ZodType> = Object.create(null)
    for (const key of [...n.keys.keys()].sort(byCodeUnit)) shape[key] = print(n.keys.get(key)!)
    return z.strictObject(shape)
  }
  return print(trie)
}

const count = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`
const range = (min: number | undefined, max: number | undefined, unit: string): string =>
  min !== undefined && max !== undefined ? `${min} to ${count(max, unit)}` : min !== undefined ? `at least ${count(min, unit)}` : max !== undefined ? `at most ${count(max, unit)}` : ''

// The shape line of the instruction, from the same trie that printSchema reads.
export function describe(node: TrieNode | Shape): string {
  if ('kind' in node) {
    if (node.kind === 'object') return `object with the keys ${[...node.keys.keys()].sort(byCodeUnit).join(', ')}`
    if (node.kind === 'list') return describe({ type: 'list', ...node.shape })
    return describe(node.shape)
  }
  switch (node.type) {
    case 'text': {
      if (node.values) return `text, one of: ${[...node.values].sort(byCodeUnit).join(', ')}`
      const r = range(node.min_length, node.max_length, 'character')
      return r === '' ? 'text' : `text of ${r}`
    }
    case 'number': {
      const parts = [node.integer ? 'whole number' : 'number']
      if (node.min !== undefined) parts.push(`at least ${node.min}`)
      if (node.max !== undefined) parts.push(`at most ${node.max}`)
      return parts.join(', ')
    }
    case 'flag':
      return 'true or false'
    case 'list': {
      const r = range(node.min_items, node.max_items, 'item')
      return r === '' ? 'list' : `list of ${r}`
    }
  }
}
