import { z } from 'zod'
import { defineCheck } from './define'

// A cited research record must exist. Exact ids only.
export const recordExists = defineCheck({
  name: 'record_exists',
  version: 1,
  fact: 'reference',
  target: 'text',
  params: z.object({}).strict(),
  order: {},
  needs: ['record_ids'],
  render: () => 'Cite only research records that exist.',
  literals: () => [],
  requires: () => [],
  check(_p, value, evidence) {
    if (typeof value !== 'string') return { verdict: 'cannot_verify', why: 'The record id is not text.' }
    if (evidence.record_ids.includes(value)) return { verdict: 'pass' }
    return { verdict: 'fail', fix: 'Cite the id of a research record that exists, or drop the citation.' }
  },
  vectors: [
    { params: {}, value: 'rec.zinc_oxide', evidence: { record_ids: ['rec.zinc_oxide'] }, expected: 'pass' },
    { params: {}, value: 'rec.zinc', evidence: { record_ids: ['rec.zinc_oxide'] }, expected: 'fail' },
    { params: {}, value: 'rec.zinc_oxide', evidence: {}, expected: 'cannot_verify' },
  ],
})
