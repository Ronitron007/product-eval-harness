import { isDeepStrictEqual } from 'node:util'

// One order for each parameter (compile.weaken). The same table drives the meet of shapes
// (compile.shape) and the weaken test, so "stricter" means one thing in both.
export type DimensionOrder =
  | 'identity' // part of the slot: two values make two slots, never a stricter one
  | 'higher_is_stricter' // number.min, list.min_items, text.min_length
  | 'lower_is_stricter' // number.max, list.max_items, text.max_length
  | 'subset_is_stricter' // text.values
  | 'superset_is_stricter' // none yet: required keys, forbidden words
  | 'true_is_stricter' // number.integer, quote_in_source.case_sensitive

// One order for each key of P. A key with no order fails the build.
export type OrderTable<P> = { readonly [K in keyof P]-?: DimensionOrder }

export const BINDING_STRENGTH = { watch: 0, soft: 1, strict: 2 } as const

type Params = Readonly<Record<string, unknown>>

const asList = (v: unknown): readonly unknown[] => (Array.isArray(v) ? v : [v])
const has = (list: readonly unknown[], item: unknown) => list.some(x => isDeepStrictEqual(x, item))

// Is value a at least as strict as value b, by the order of their dimension? Both are set.
export function atLeastAsStrict(order: DimensionOrder, a: unknown, b: unknown): boolean {
  switch (order) {
    case 'identity':
      return isDeepStrictEqual(a, b)
    case 'higher_is_stricter':
      return (a as number) >= (b as number)
    case 'lower_is_stricter':
      return (a as number) <= (b as number)
    case 'subset_is_stricter':
      return asList(a).every(x => has(asList(b), x))
    case 'superset_is_stricter':
      return asList(b).every(x => has(asList(a), x))
    case 'true_is_stricter':
      return a === true || b !== true
  }
}

// Is the whole parameter object a at least as strict as b? A dimension that only a sets adds a
// constraint. A dimension that only b sets is a constraint that a lacks, so a is looser.
export function paramsAtLeastAsStrict<P extends object>(a: P, b: P, order: OrderTable<P>): boolean {
  return (Object.keys(order) as (keyof P)[]).every(k => {
    const x = (a as Params)[k as string]
    const y = (b as Params)[k as string]
    if (y === undefined) return true
    if (x === undefined) return false
    return atLeastAsStrict(order[k], x, y)
  })
}

// The dimensions that both set, where child is looser than parent. A dimension that only the
// child sets is an addition. A dimension that only the parent sets stays in force (conjunction).
export function looserDimensions<P extends object>(child: P, parent: P, order: OrderTable<P>): (keyof P)[] {
  return (Object.keys(order) as (keyof P)[]).filter(k => {
    if (order[k] === 'identity') return false
    const c = (child as Params)[k as string]
    const p = (parent as Params)[k as string]
    return c !== undefined && p !== undefined && !atLeastAsStrict(order[k], c, p)
  })
}

// Do the identity dimensions of a and b agree, so that both rules sit in one slot?
export function sameIdentity<P extends object>(a: P, b: P, order: OrderTable<P>): boolean {
  return (Object.keys(order) as (keyof P)[]).every(
    k => order[k] !== 'identity' || isDeepStrictEqual((a as Params)[k as string], (b as Params)[k as string]),
  )
}

const byCodeUnit = (x: unknown, y: unknown) => (String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0)

// The strictest parameters that satisfy a and b, one dimension at a time. It fails on an identity
// mismatch and on an empty set. The joint tests across dimensions (min above max) belong to the
// caller, which knows what the dimensions mean together (shape.joint_meet).
export function meetParams<P extends object>(
  a: P,
  b: P,
  order: OrderTable<P>,
): { ok: true; params: P } | { ok: false; dimension: keyof P } {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(order) as (keyof P & string)[]) {
    const x = (a as Params)[k]
    const y = (b as Params)[k]
    if (x === undefined && y === undefined) continue
    if (x === undefined || y === undefined) {
      out[k] = x ?? y
      continue
    }
    switch (order[k]) {
      case 'identity':
        if (!isDeepStrictEqual(x, y)) return { ok: false, dimension: k }
        out[k] = x
        break
      case 'higher_is_stricter':
        out[k] = Math.max(x as number, y as number)
        break
      case 'lower_is_stricter':
        out[k] = Math.min(x as number, y as number)
        break
      case 'subset_is_stricter': {
        const both = asList(x).filter(v => has(asList(y), v))
        if (both.length === 0) return { ok: false, dimension: k }
        out[k] = [...both].sort(byCodeUnit)
        break
      }
      case 'superset_is_stricter': {
        const all = [...asList(x)]
        for (const v of asList(y)) if (!has(all, v)) all.push(v)
        out[k] = all.sort(byCodeUnit)
        break
      }
      case 'true_is_stricter':
        out[k] = x === true || y === true
        break
    }
  }
  return { ok: true, params: out as P }
}
