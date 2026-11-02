import { mkdirSync, mkdtempSync, writeFileSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringify } from 'yaml'
const W = '../../../../../src/rules/'
const { loadRuleLibrary, lockNewVersions, LOCK_FILE } = await import(W + 'load.ts')
const { writeLock } = await import(W + 'lock.ts')
const { ruleHash } = await import(W + 'hash.ts')

const base = {
  id: 'criteria.attribute_is_product', version: 1, statement: 'Each candidate attribute describes a property of the product itself.',
  reason: 'A grade must rest on the product.', kind: 'judgement',
  scope: { nodes: { node: 'sunscreen', descendants: true }, stages: ['create_node'], fields: ['criteria[].attributes[]'] },
  binding: 'strict', judge: { question: 'Does it describe the product?' },
  examples: [{ output: 'x', expected: 'pass' }], provenance: { decision_row: 'r' }, owner: 'sunscreen', status: 'active',
}
const root = mkdtempSync(join(tmpdir(), 'own-'))
const put = (owner: string) => { mkdirSync(join(root, owner), { recursive: true }); writeFileSync(join(root, owner, base.id + '.yaml'), stringify({ ...base, owner })) }
put('sunscreen')
writeLock(join(root, LOCK_FILE), lockNewVersions(loadRuleLibrary(root)).lock)
console.log('locked at owner sunscreen: problems =', loadRuleLibrary(root).problems.length)
// the PR moves the same id@1 to owner "all" (every domain). Words untouched.
renameSync(join(root, 'sunscreen'), join(root, 'tmp')); renameSync(join(root, 'tmp'), join(root, 'sunscreen'))
import { rmSync } from 'node:fs'; rmSync(join(root, 'sunscreen'), { recursive: true }); put('all')
const lib = loadRuleLibrary(root)
console.log('after move to owner all: problems =', lib.problems.length, lib.problems)
console.log('hash sunscreen == hash all:', ruleHash({ ...base, owner: 'sunscreen' } as any) === ruleHash({ ...base, owner: 'all' } as any))
