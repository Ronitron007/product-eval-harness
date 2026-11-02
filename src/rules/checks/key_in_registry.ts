import { z } from 'zod'
import { defineCheck } from './define'

// An attribute key must be a key of the attribute registry of the node. Exact strings only:
// a fuzzy normalizer would make this check a matcher (compile.limits).
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
  check(_p, value, evidence) {
    if (typeof value !== 'string') return { verdict: 'cannot_verify', why: 'The key is not text.' }
    if (evidence.attribute_keys.includes(value)) return { verdict: 'pass' }
    return { verdict: 'fail', fix: 'Use a key of the attribute registry of this node, or propose the attribute as a new key.' }
  },
  vectors: [
    { params: {}, value: 'spf', evidence: { attribute_keys: ['spf', 'zinc_oxide_percent'] }, expected: 'pass' },
    { params: {}, value: 'SPF', evidence: { attribute_keys: ['spf', 'zinc_oxide_percent'] }, expected: 'fail' },
    { params: {}, value: 'trending', evidence: { attribute_keys: [] }, expected: 'fail' },
    { params: {}, value: 'spf', evidence: {}, expected: 'cannot_verify' },
  ],
})
