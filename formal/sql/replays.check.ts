import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { ruleHash } from '../../src/rules/hash'
import { LOCK_FILE, loadRuleLibrary, lockNewVersions } from '../../src/rules/load'
import { writeLock } from '../../src/rules/lock'
import { RuleRecord } from '../../src/rules/schema'
import { createGraphStore, type GraphStore } from '../../src/store/store'
import { freshDatabase, withUser, type TestDatabase } from '../../tests/db'

// Replays of the bug paths of formal/models/ on the real code, one call or statement for each
// step of the path. Each test is a finding of 2026-11-02: it passes while the break still
// happens. When a fix lands, its replay fails. Then move the rule to "holds" in
// formal/expectations.ts, and change this test to check that the code refuses the step.

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const RULE_SET = sha('rule set')

const rule = RuleRecord.parse({
  id: 'criteria.attribute_is_product',
  version: 1,
  statement: 'Each candidate attribute describes a property of the product itself.',
  reason: 'A grade must rest on the product.',
  kind: 'judgement',
  scope: { nodes: { node: 'skincare', descendants: true }, stages: ['define_criteria'], fields: ['criteria[].attributes[]'] },
  binding: 'watch',
  judge: { question: 'Does the attribute describe a property of the product itself?' },
  examples: [{ output: { key: 'fragrance_present' }, expected: 'pass' }],
  provenance: { decision_row: '2026-10-24 Rohan ruled: attributes mean things that relate to products only.' },
  owner: 'skincare',
  status: 'active',
})
const version = (n: number, change: Partial<RuleRecord> = {}) =>
  RuleRecord.parse({ ...rule, version: n, ...(n > 1 ? { supersedes: n - 1 } : {}), ...change })

let db: TestDatabase
let owner: pg.Pool // the table owner, as a migration or an operator connects
let app: pg.Pool // harness_app, as the harness connects
let store: GraphStore
let run = 0
const newRun = async (stage: 'define_criteria' | 'create_pack', nodeId: string) => {
  const runId = `replay-${++run}`
  await store.recordStageRun({ runId, stage, nodeId, ruleSetHash: RULE_SET })
  return runId
}
const verdict = (runId: string, ruleHashValue: string, result: 'pass' | 'fail') => ({
  runId,
  ruleId: rule.id,
  ruleVersion: 1,
  ruleHash: ruleHashValue,
  binding: 'strict' as const,
  target: 'criteria[0].attributes[0]',
  verdict: result,
  decider: { by: 'code' as const },
  reason: `The check gives ${result}.`,
})

beforeAll(async () => {
  db = await freshDatabase()
  owner = db.pool()
  app = db.pool(withUser(db.url, 'harness_app'))
  store = createGraphStore(app)
  await store.addNode({ id: 'skincare', level: 'domain', label: 'Skincare' })
  await store.addNode({ id: 'sunscreen', parentId: 'skincare', level: 'inner', label: 'Sunscreen' })
  await store.addNode({ id: 'mineral', parentId: 'sunscreen', level: 'leaf', label: 'Mineral sunscreen' })
})
afterAll(async () => {
  await db?.drop()
})

describe('NodeTree', () => {
  it('holds for harness_app: it cannot update a node', async () => {
    await expect(app.query(`update harness.nodes set level = 'leaf' where id = 'sunscreen'`)).rejects.toThrow(/permission denied/)
  })

  // NodeTree_owner, NoChildUnderLeaf: add a, add b under a, add c under b, the owner makes b a leaf.
  it('finding nodes.owner_update: the table owner makes a parent a leaf, so a child sits under a leaf', async () => {
    await store.addNode({ id: 'a1', level: 'domain', label: 'A' })
    await store.addNode({ id: 'b1', parentId: 'a1', level: 'inner', label: 'B' })
    await store.addNode({ id: 'c1', parentId: 'b1', level: 'leaf', label: 'C' })
    await owner.query(`update harness.nodes set level = 'leaf' where id = 'b1'`)
    const { rows } = await owner.query(`select p.level from harness.nodes c join harness.nodes p on p.id = c.parent_id where c.id = 'c1'`)
    expect(rows).toEqual([{ level: 'leaf' }])
  })

  // NodeTree_owner, PathAgreesWithParent and WalkAgreesWithParents (the TLC path): add a, add b
  // under a, the owner sets the parent of b to b.
  it('finding nodes.owner_update: the table owner moves a node, so its path and the tree walk disagree with its parent', async () => {
    await store.addNode({ id: 'a2', level: 'domain', label: 'A' })
    await store.addNode({ id: 'b2', parentId: 'a2', level: 'inner', label: 'B' })
    await owner.query(`update harness.nodes set parent_id = 'b2' where id = 'b2'`)
    const { rows } = await owner.query(`select parent_id, path::text from harness.nodes where id = 'b2'`)
    expect(rows).toEqual([{ parent_id: 'b2', path: 'a2.b2' }])
    // subtree() walks the path, so it still puts b2 under a2.
    expect((await store.subtree('a2')).map(n => n.id)).toEqual(['a2', 'b2'])
  })
})

describe('VerdictLog', () => {
  it('holds: an output has the stage and the node of its run', async () => {
    const runId = await newRun('define_criteria', 'skincare')
    await expect(
      app.query(`insert into harness.outputs (run_id, stage, node_id, body, rule_set_hash) values ($1, 'create_pack', 'skincare', '{}', $2)`, [runId, RULE_SET]),
    ).rejects.toThrow(/outputs_run_id_stage_node_id_rule_set_hash_fkey/)
  })

  // StageFitsNodeLevel: the stage records a create_pack run at the domain node.
  it('finding verdicts.stage_level: a create_pack run at a domain node', async () => {
    const runId = await newRun('create_pack', 'skincare')
    expect(runId).toMatch(/^replay-/)
  })

  // AcceptedAfterPassOrPerson: record the run, accept the output. Also: after a fail. A person
  // may accept after a spent repair budget (decisions.tsv, 2026-10-24), but no table records
  // that decision, so the store cannot tell such an output from one that skipped the judge.
  it('finding verdicts.accept_without_pass: an output with no verdict, and an output after a strict fail, with no record of a person', async () => {
    const none = await newRun('define_criteria', 'skincare')
    await store.acceptOutput({ runId: none, body: { criteria: [] } })
    const failed = await newRun('define_criteria', 'skincare')
    await store.writeVerdicts([verdict(failed, ruleHash(rule), 'fail')])
    await store.acceptOutput({ runId: failed, body: { criteria: [] } })
    const { rows } = await owner.query(
      `select o.run_id, array_agg(v.verdict) filter (where v.verdict is not null) as verdicts
         from harness.outputs o left join harness.verdicts v on v.run_id = o.run_id
        where o.run_id in ($1, $2) group by o.run_id order by o.run_id`,
      [none, failed],
    )
    expect(rows).toEqual([
      { run_id: none, verdicts: null },
      { run_id: failed, verdicts: ['fail'] },
    ])
  })

  // OneVersionOneHash: two verdict rows of one rule id and version with two hashes.
  it('finding verdicts.hash_per_version: one rule version with two hashes in the verdict log', async () => {
    const runId = await newRun('define_criteria', 'skincare')
    await store.writeVerdicts([verdict(runId, ruleHash(rule), 'pass')])
    await store.writeVerdicts([verdict(runId, sha('other words'), 'pass')])
    const { rows } = await owner.query(
      `select count(distinct rule_hash)::int as hashes from harness.verdicts where rule_id = $1 and rule_version = 1 and run_id = $2`,
      [rule.id, runId],
    )
    expect(rows).toEqual([{ hashes: 2 }])
  })

  // OneVerdictPerTargetAndRound: a repair round writes a fail, then a pass, for one target. No
  // column says which round or which output a row judged: the columns are exactly these.
  it('finding verdicts.no_round: a repair round gives two verdict rows for one target and one rule', async () => {
    const runId = await newRun('define_criteria', 'skincare')
    await store.writeVerdicts([verdict(runId, ruleHash(rule), 'fail')])
    await store.writeVerdicts([verdict(runId, ruleHash(rule), 'pass')])
    await store.acceptOutput({ runId, body: { criteria: [] } })
    const { rows } = await owner.query(`select verdict from harness.verdicts where run_id = $1 order by created_at`, [runId])
    expect(rows.map(r => r.verdict)).toEqual(['fail', 'pass'])
    const { rows: cols } = await owner.query(
      `select column_name from information_schema.columns where table_schema = 'harness' and table_name = 'verdicts' order by column_name`,
    )
    // A new column fails this check. If it names the round or the output, the finding is fixed.
    expect(cols.map(c => c.column_name)).toEqual([
      'binding', 'created_at', 'decider', 'evidence', 'id', 'reason', 'rule_hash', 'rule_id', 'rule_version', 'run_id', 'target', 'verdict',
    ])
  })

  // OneOutputPerRun: accept two outputs for one run.
  it('finding verdicts.outputs_per_run: one run with two outputs', async () => {
    const runId = await newRun('define_criteria', 'skincare')
    await store.writeVerdicts([verdict(runId, ruleHash(rule), 'pass')])
    await store.acceptOutput({ runId, body: { draft: 1 } })
    await store.acceptOutput({ runId, body: { draft: 2 } })
    const { rows } = await owner.query(`select count(*)::int as n from harness.outputs where run_id = $1`, [runId])
    expect(rows).toEqual([{ n: 2 }])
  })
})

describe('RuleVersions', () => {
  const roots: string[] = []
  afterAll(() => {
    for (const r of roots) rmSync(r, { recursive: true, force: true })
  })

  // RuleVersions, NewVersionStartsWatch: a PR adds version 1 with binding strict, runs
  // rules:lock, and rules:check passes.
  it('finding rules.watch_first: rules:lock locks a new version with binding strict, and rules:check passes', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-rules-'))
    roots.push(root)
    mkdirSync(join(root, 'skincare'))
    writeFileSync(join(root, 'skincare', `${rule.id}.yaml`), stringify(JSON.parse(JSON.stringify({ ...rule, binding: 'strict' }))))
    const first = loadRuleLibrary(root)
    writeLock(join(root, LOCK_FILE), lockNewVersions(first).lock)
    expect(loadRuleLibrary(root, { baseLock: first.lock }).problems).toEqual([])
  })

  // RuleVersions, LockSkipsNoVersion: the lock holds version 1. A PR adds an entry for
  // version 3 by hand, and rules:check --base passes.
  it('finding rules.lock_hand_entry: a hand-added lock entry for version 3, with no version 2, passes rules:check', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-rules-'))
    roots.push(root)
    mkdirSync(join(root, 'skincare'))
    writeFileSync(join(root, 'skincare', `${rule.id}.yaml`), stringify(JSON.parse(JSON.stringify(rule))))
    const base = lockNewVersions(loadRuleLibrary(root)).lock
    writeLock(join(root, LOCK_FILE), { lock_version: 1, rules: { [rule.id]: { ...base.rules[rule.id], '3': sha('words that no file had') } } })
    const library = loadRuleLibrary(root, { baseLock: base })
    expect(library.problems).toEqual([])
    expect(Object.keys(library.lock.rules[rule.id]!)).toEqual(['1', '3'])
  })

  // RuleVersions_derived, DerivedSkipsNoVersion: add version 2 with no version 1.
  it('finding derived_rules.skip_version: version 2 of a derived rule with no version 1', async () => {
    const runId = await newRun('define_criteria', 'skincare')
    const id = 'derived.skip_version'
    await store.addDerivedRule({ rule: version(2, { id }), runId })
    const { rows } = await owner.query(`select array_agg(version order by version) as versions from harness.derived_rules where id = $1`, [id])
    expect(rows).toEqual([{ versions: [2] }])
  })

  // DerivedHasOneOwner: version 1 at skincare, version 2 at sunscreen.
  it('finding derived_rules.two_owners: two versions of one derived rule at two owner nodes', async () => {
    const runId = await newRun('define_criteria', 'skincare')
    const id = 'derived.two_owners'
    await store.addDerivedRule({ rule: version(1, { id }), runId })
    await store.addDerivedRule({ rule: version(2, { id, owner: 'sunscreen' }), runId })
    const { rows } = await owner.query(`select array_agg(owner order by version) as owners from harness.derived_rules where id = $1`, [id])
    expect(rows).toEqual([{ owners: ['skincare', 'sunscreen'] }])
  })

  // DerivedHasOneActiveVersion: version 1 active, version 2 active. Rows only grow, so version 1
  // stays active.
  it('finding derived_rules.two_active: two active versions, and the old one cannot retire', async () => {
    const runId = await newRun('define_criteria', 'skincare')
    const id = 'derived.two_active'
    await store.addDerivedRule({ rule: version(1, { id }), runId })
    await store.addDerivedRule({ rule: version(2, { id, statement: 'A new statement.' }), runId })
    await expect(
      owner.query(`update harness.derived_rules set record = jsonb_set(record, '{status}', '"retired"') where id = $1 and version = 1`, [id]),
    ).rejects.toThrow(/append-only/)
    const { rows } = await owner.query(`select count(*)::int as n from harness.derived_rules where id = $1 and record ->> 'status' = 'active'`, [id])
    expect(rows).toEqual([{ n: 2 }])
  })

  // IdNamesOneRule: the lock holds version 1 of a stage rule. A stage run adds a derived rule
  // with the same id and version and other words. rules/rules.lock.json holds no rule today, so
  // this replay cannot see a fix that reads that lock. Such a fix must update this replay.
  it('finding derived_rules.id_collision: a derived rule takes the id and version of a stage rule, with another hash', async () => {
    const runId = await newRun('define_criteria', 'skincare')
    const derived = version(1, { statement: 'Other words.' })
    const row = await store.addDerivedRule({ rule: derived, runId })
    expect(row.id).toBe(rule.id)
    expect(row.hash).not.toBe(ruleHash(rule))
  })
})
