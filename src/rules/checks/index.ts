import { z } from 'zod'
import type { CheckOutcome, CheckTemplate, EvidenceKey } from './define'
import { keyInRegistry } from './key_in_registry'
import { quoteInSource } from './quote_in_source'
import { recordExists } from './record_exists'
import { uniqueBy } from './unique_by'

// The check registry (compile.checks): one list. CheckRef, the code lock and the docs derive from it.
export const CHECKS = [quoteInSource, keyInRegistry, recordExists, uniqueBy] as const
export type CheckName = (typeof CHECKS)[number]['name']
export type AnyCheckTemplate = CheckTemplate<string, z.ZodObject, EvidenceKey, CheckOutcome>

const NAMES = CHECKS.map(t => t.name).sort()
const refOf = <N extends string, P extends z.ZodObject>(t: { name: N; params: P }) => z.object({ name: z.literal(t.name), params: t.params }).strict()

// An unknown name is a loader problem at check.name, and a bad parameter at check.params.<key>,
// so `rules:check` refuses both before any run.
export const CheckRef = z.discriminatedUnion('name', [refOf(quoteInSource), refOf(keyInRegistry), refOf(recordExists), refOf(uniqueBy)], {
  error: iss =>
    iss.input === undefined
      ? 'A code_check rule needs a check field: { name, params }, with a name of the check registry.'
      : iss.code === 'invalid_union'
        ? `Name a check of the registry: ${NAMES.join(', ')}.`
        : undefined,
})
export type CheckRef = z.infer<typeof CheckRef>

const BY_NAME = new Map<string, AnyCheckTemplate>(CHECKS.map(t => [t.name, t as unknown as AnyCheckTemplate]))

export function checkTemplate(name: CheckName): AnyCheckTemplate {
  const t = BY_NAME.get(name)
  if (!t) throw new Error(`No check ${name} in the registry. Use one of: ${NAMES.join(', ')}.`)
  return t
}
