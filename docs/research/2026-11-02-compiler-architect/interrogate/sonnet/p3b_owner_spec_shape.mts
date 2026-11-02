const { ruleHash } = await import('../../../../../src/rules/hash.ts')
const specRule = (owner: string) => ({ id: 'units.label_unit', version: 1, statement: 's', reason: 'r', kind: 'shape',
  scope: { nodes: 'subtree', stages: ['create_node'], fields: ['criteria[].attributes[].unit'] }, binding: 'strict',
  shape: { type: 'text', values: ['mg', 'mcg', 'g'] }, examples: [{ output: 'mg', expected: 'pass' }], provenance: { record_id: 'x' }, owner, status: 'active' })
const a = ruleHash(specRule('sunscreen') as any), b = ruleHash(specRule('all') as any)
console.log('subtree@sunscreen =', a.slice(0, 12), '| subtree@all =', b.slice(0, 12), '| equal:', a === b)
console.log('(shape key is ignored too: ruleHash today does not read rule.shape) ->', ruleHash({ ...specRule('all'), shape: { type: 'text', values: ['IU'] } } as any) === b)
