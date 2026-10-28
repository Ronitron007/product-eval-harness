import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import type { RuleRecord } from './schema'

// The hash covers every field that changes what the rule asks or how it is checked.
// It leaves out id, version, owner, status, provenance and supersedes, which say
// where the rule sits, not what it says.
export function ruleHash(rule: RuleRecord): string {
  const content = {
    statement: rule.statement,
    reason: rule.reason,
    kind: rule.kind,
    scope: rule.scope,
    binding: rule.binding,
    judge: rule.judge ?? null,
    check: rule.check ?? null,
    examples: rule.examples,
  }
  const text = canonicalize(content)
  if (text === undefined) throw new Error(`Rule ${rule.id} has no canonical form.`)
  return createHash('sha256').update(text).digest('hex')
}
