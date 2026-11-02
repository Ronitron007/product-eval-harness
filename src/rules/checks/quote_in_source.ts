import { z } from 'zod'
import { defineCheck } from './define'

// A quote must stand word for word in a full source text of the run, such as the label.
// Substring only: no fuzzy match, no normalizing beyond letter case when the rule allows it.
export const quoteInSource = defineCheck({
  name: 'quote_in_source',
  version: 1,
  fact: 'substring',
  target: 'text',
  params: z
    .object({
      source: z.string({ error: 'Give source: the name of a source text of the run, such as label.' }).regex(/^[a-z][a-z0-9_]*$/, 'Name the source in snake_case, such as label.'),
      case_sensitive: z.boolean({ error: 'Give case_sensitive: true when the quote must keep the letter case of the source, else false.' }),
    })
    .strict(),
  order: { source: 'identity', case_sensitive: 'true_is_stricter' },
  needs: ['sources'],
  render: p =>
    p.case_sensitive
      ? `Copy each quote word for word from the ${p.source} text, with the same letter case.`
      : `Copy each quote word for word from the ${p.source} text. The letter case may differ.`,
  literals: p => [p.source],
  requires: () => [],
  check(p, value, evidence) {
    if (typeof value !== 'string') return { verdict: 'cannot_verify', why: 'The quote is not text.' }
    const text = evidence.sources[p.source]
    if (text === undefined) return { verdict: 'cannot_verify', why: `The run has no ${p.source} text.` }
    if (value.trim() === '') return { verdict: 'fail', fix: `Write the quote. An empty quote backs nothing.` }
    const found = p.case_sensitive ? text.includes(value) : text.toLowerCase().includes(value.toLowerCase())
    if (found) return { verdict: 'pass' }
    return {
      verdict: 'fail',
      fix: `Copy the quote word for word from the ${p.source} text${p.case_sensitive ? ', with the same letter case' : ''}, or drop the claim.`,
    }
  },
  vectors: [
    { params: { source: 'label', case_sensitive: true }, value: '500 mg', evidence: { sources: { label: 'Each capsule has 500 mg.' } }, expected: 'pass' },
    { params: { source: 'label', case_sensitive: true }, value: '600 mg', evidence: { sources: { label: 'Each capsule has 500 mg.' } }, expected: 'fail' },
    { params: { source: 'label', case_sensitive: true }, value: '500 MG', evidence: { sources: { label: 'Each capsule has 500 mg.' } }, expected: 'fail' },
    { params: { source: 'label', case_sensitive: false }, value: '500 MG', evidence: { sources: { label: 'Each capsule has 500 mg.' } }, expected: 'pass' },
    { params: { source: 'label', case_sensitive: false }, value: '600 mg', evidence: { sources: { label: 'Each capsule has 500 mg.' } }, expected: 'fail' },
    { params: { source: 'label', case_sensitive: false }, value: '', evidence: { sources: { label: 'Each capsule has 500 mg.' } }, expected: 'fail' },
    { params: { source: 'label', case_sensitive: true }, value: '500 mg', evidence: {}, expected: 'cannot_verify' },
    { params: { source: 'label', case_sensitive: true }, value: '500 mg', evidence: { sources: { record_zinc: 'Each capsule has 500 mg.' } }, expected: 'cannot_verify' },
    { params: { source: 'record_zinc', case_sensitive: true }, value: '500 mg', evidence: { sources: { record_zinc: 'Each capsule has 500 mg.' } }, expected: 'pass' },
  ],
})
