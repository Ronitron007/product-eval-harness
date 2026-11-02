import type { Json } from '../rules/checks/define'

// Field paths and the walk of an output (compile.scorers). Runtime code: RUNTIME_VERSION covers it.

export interface Segment {
  readonly key: string
  readonly each: boolean // `key[]`: each item of the list at key
}

export function parsePath(path: string): readonly Segment[] {
  return path.split('.').map(seg => (seg.endsWith('[]') ? { key: seg.slice(0, -2), each: true } : { key: seg, each: false }))
}

const show = (segments: readonly Segment[]) => segments.map(s => (s.each ? `${s.key}[]` : s.key)).join('.')
const join = (prefix: string, rest: string) => (prefix === '' ? rest : rest === '' ? prefix : `${prefix}.${rest}`)
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// One concrete place in an output, such as criteria[2].attributes[0].unit.
export type Target =
  | { readonly path: string; readonly state: 'present'; readonly value: Json }
  // A key on the way is missing, or a value on the way is not the container that the path needs.
  // found holds that value, so a row can keep the raw value that broke the walk.
  | { readonly path: string; readonly state: 'absent'; readonly why: string; readonly found?: Json }
  | { readonly path: string; readonly state: 'empty_list' } // a list on the way exists and is []

// Walks output along path, item by item. It never returns []: a walk that finds nothing gives
// one absent or empty_list target, so each rule gives at least one verdict row (rules.harness).
export function targets(output: unknown, path: string): readonly [Target, ...Target[]] {
  const segments = parsePath(path)
  const out: Target[] = []
  const absent = (at: string, i: number, why: string, found?: unknown): void => {
    out.push(found === undefined ? { path: join(at, show(segments.slice(i))), state: 'absent', why } : { path: join(at, show(segments.slice(i))), state: 'absent', why, found: found as Json })
  }
  const walk = (value: unknown, at: string, i: number): void => {
    if (i === segments.length) {
      out.push({ path: at, state: 'present', value: value as Json })
      return
    }
    const seg = segments[i]!
    if (!isObject(value)) return absent(at, i, `${at === '' ? 'The output' : at} is not an object`, value)
    const here = join(at, seg.key)
    if (!Object.hasOwn(value, seg.key)) return absent(at, i, `${here} is missing`)
    const next = value[seg.key]
    if (!seg.each) return walk(next, here, i + 1)
    if (!Array.isArray(next)) return absent(at, i, `${here} is not a list`, next)
    if (next.length === 0) {
      out.push({ path: here, state: 'empty_list' })
      return
    }
    next.forEach((item, k) => walk(item, `${here}[${k}]`, i + 1))
  }
  walk(output, '', 0)
  return out as [Target, ...Target[]]
}

// The inverse of targets() for one item: embed('criteria[].unit', 'mg') = { criteria: [{ unit: 'mg' }] }.
// The golden gate uses it, so golden examples run through the real scorer path.
export function embed(path: string, value: Json): Json {
  return parsePath(path).reduceRight<Json>((inner, seg) => ({ [seg.key]: seg.each ? [inner] : inner }), value)
}
