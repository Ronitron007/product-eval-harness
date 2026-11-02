import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import type { RuleRecord } from './schema'

// The hash covers every field that changes what the rule asks, how it is checked, or where it
// applies. With an anchored scope the owner decides where a rule applies, so the owner is in the
// hash (record.owner_in_hash). It leaves out id, version, status, provenance and supersedes.
export function ruleHash(rule: RuleRecord): string {
  const content = {
    statement: rule.statement,
    reason: rule.reason,
    kind: rule.kind,
    scope: rule.scope,
    binding: rule.binding,
    owner: rule.owner,
    shape: rule.kind === 'shape' ? rule.shape : null,
    check: rule.kind === 'code_check' ? rule.check : null,
    judge: rule.kind === 'judgement' ? rule.judge : null,
    examples: rule.examples,
  }
  const text = canonicalize(content)
  if (text === undefined) throw new Error(`Rule ${rule.id} has no canonical form.`)
  return createHash('sha256').update(text).digest('hex')
}
