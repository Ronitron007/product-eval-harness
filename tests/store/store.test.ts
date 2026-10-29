import { createHash } from 'node:crypto'
import { createStep, createWorkflow } from '@mastra/core/workflows'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createHarness } from '../../src/mastra/harness'
import { ruleHash } from '../../src/rules/hash'
import { RuleRecord } from '../../src/rules/schema'
import { createGraphStore, type GraphStore } from '../../src/store/store'
import { freshDatabase, withUser, type TestDatabase } from '../db'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const RULE_SET = sha('rule set')

const rule = RuleRecord.parse({
  id: 'criteria.attribute_is_product',
  version: 1,
  statement: 'Each candidate attribute describes a property of the product itself.',
  reason: 'A grade must rest on the product.',
  kind: 'judgement',
  scope: { nodes: { node: 'skincare', descendants: true }, stages: ['define_criteria'], fields: ['criteria[].attributes[]'] },
  binding: 'strict',
  judge: { question: 'Does the attribute describe a property of the product itself?' },
  examples: [{ output: { key: 'fragrance_present' }, expected: 'pass' }],
  provenance: { decision_row: '2026-10-24 Rohan ruled: attributes mean things that relate to products only.' },
  owner: 'skincare',
  status: 'draft',
})

let db: TestDatabase
let pool: pg.Pool
let store: GraphStore

// The fixture tree: skincare > sunscreen > mineral_sunscreen, and skincare > moisturizer.
beforeAll(async () => {
  db = await freshDatabase()
  pool = db.pool()
  store = createGraphStore(pool)
  await store.addNode({ id: 'skincare', level: 'domain', label: 'Skincare' })
  await store.addNode({ id: 'sunscreen', parentId: 'skincare', level: 'inner', label: 'Sunscreen' })
  await store.addNode({ id: 'mineral_sunscreen', parentId: 'sunscreen', level: 'leaf', label: 'Mineral sunscreen' })
  await store.addNode({ id: 'moisturizer', parentId: 'skincare', level: 'leaf', label: 'Moisturizer' })
  await store.recordStageRun({ runId: 'run-1', stage: 'create_node', nodeId: 'sunscreen', ruleSetHash: RULE_SET })
})
afterAll(async () => {
  await db?.drop()
})

const ids = (rows: { id: string }[]) => rows.map(r => r.id)

describe('addNode', () => {
  it('stores the ltree path from the root', async () => {
    const rows = await pool.query('select id, path::text as path from harness.nodes order by path')
    expect(rows.rows).toEqual([
      { id: 'skincare', path: 'skincare' },
      { id: 'moisturizer', path: 'skincare.moisturizer' },
      { id: 'sunscreen', path: 'skincare.sunscreen' },
      { id: 'mineral_sunscreen', path: 'skincare.sunscreen.mineral_sunscreen' },
    ])
  })

  it('refuses a child of a leaf, an unknown parent, and a domain node with a parent', async () => {
    await expect(store.addNode({ id: 'tinted', parentId: 'mineral_sunscreen', level: 'leaf', label: 'Tinted' })).rejects.toThrow(/is a leaf/)
    await expect(store.addNode({ id: 'serum', parentId: 'haircare', level: 'leaf', label: 'Serum' })).rejects.toThrow(/No node haircare/)
    await expect(store.addNode({ id: 'oral', parentId: 'skincare', level: 'domain', label: 'Oral' })).rejects.toThrow(/A domain node has no parent/)
  })
})

describe('the tree walk (store.tree)', () => {
  it('gives the path to the root, from the root down', async () => {
    expect(ids(await store.pathToRoot('mineral_sunscreen'))).toEqual(['skincare', 'sunscreen', 'mineral_sunscreen'])
    expect(ids(await store.pathToRoot('skincare'))).toEqual(['skincare'])
  })

  it('gives a node and its descendants', async () => {
    expect(ids(await store.subtree('sunscreen'))).toEqual(['sunscreen', 'mineral_sunscreen'])
    expect(ids(await store.subtree('skincare'))).toEqual(['skincare', 'moisturizer', 'sunscreen', 'mineral_sunscreen'])
    expect(ids(await store.subtree('moisturizer'))).toEqual(['moisturizer'])
  })

  it('gives the siblings', async () => {
    expect(ids(await store.siblings('sunscreen'))).toEqual(['moisturizer'])
    expect(ids(await store.siblings('moisturizer'))).toEqual(['sunscreen'])
    expect(ids(await store.siblings('mineral_sunscreen'))).toEqual([])
  })

  it('refuses an unknown node', async () => {
    await expect(store.subtree('haircare')).rejects.toThrow(/No node haircare/)
  })
})

describe('the append-only writes', () => {
  it('records a stage run', async () => {
    const run = await store.recordStageRun({ runId: 'run-2', stage: 'define_criteria', nodeId: 'skincare', ruleSetHash: RULE_SET })
    expect(run).toMatchObject({ runId: 'run-2', stage: 'define_criteria', nodeId: 'skincare', ruleSetHash: RULE_SET })
    expect(run.startedAt).toBeInstanceOf(Date)
  })

  it('accepts an output with the stage, node and rule set hash of its run', async () => {
    const out = await store.acceptOutput({ runId: 'run-1', body: { criteria: [{ key: 'spf' }] } })
    expect(out).toMatchObject({ runId: 'run-1', stage: 'create_node', nodeId: 'sunscreen', ruleSetHash: RULE_SET, body: { criteria: [{ key: 'spf' }] } })
    await expect(store.acceptOutput({ runId: 'no-such-run', body: {} })).rejects.toThrow(/No stage run no-such-run/)
  })

  it('writes verdict rows, all or none', async () => {
    const base = { runId: 'run-1', ruleId: 'criteria.attribute_is_product', ruleVersion: 1, ruleHash: ruleHash(rule), binding: 'strict' as const }
    const rows = await store.writeVerdicts([
      { ...base, target: 'criteria[0]', verdict: 'pass', decider: { by: 'code' }, reason: 'The key names a product property.' },
      {
        ...base,
        target: 'criteria[1]',
        verdict: 'cannot_verify',
        decider: { by: 'judge', model: 'anthropic/claude-haiku-4-5', promptHash: sha('prompt') },
        reason: 'The label text does not say.',
        evidence: { quote: 'SPF 50', source: 'label' },
      },
    ])
    expect(rows.map(r => [r.target, r.verdict, r.decider.by])).toEqual([
      ['criteria[0]', 'pass', 'code'],
      ['criteria[1]', 'cannot_verify', 'judge'],
    ])

    // A row of an unknown run fails the whole call, so the first row is not stored either.
    await expect(
      store.writeVerdicts([
        { ...base, target: 'criteria[9]', verdict: 'pass', decider: { by: 'code' }, reason: 'ok' },
        { ...base, runId: 'no-such-run', target: 'criteria[9]', verdict: 'pass', decider: { by: 'code' }, reason: 'ok' },
      ]),
    ).rejects.toThrow()
    const { rows: left } = await pool.query("select count(*)::int as n from harness.verdicts where target = 'criteria[9]'")
    expect(left[0].n).toBe(0)
  })

  it.each([
    ['decider', '{"by": "judge"}', null, /verdicts_decider_check/],
    ['decider', '{"by": "code", "model": "m"}', null, /verdicts_decider_check/],
    ['evidence', '{"by": "code"}', '{"quote": "q"}', /verdicts_evidence_check/],
  ])('lets the database refuse a bad %s: %s %s', async (_field, decider, evidence, error) => {
    await expect(
      pool.query(
        `insert into harness.verdicts (run_id, rule_id, rule_version, rule_hash, binding, target, verdict, decider, evidence, reason)
         values ('run-1', 'a.b', 1, $1, 'strict', 'x', 'pass', $2, $3, 'r')`,
        [sha('r'), decider, evidence],
      ),
    ).rejects.toThrow(error)
  })

  it('lets the database refuse a derived rule whose key columns disagree with its record', async () => {
    await expect(
      pool.query(`insert into harness.derived_rules (id, version, hash, owner, record, run_id) values ('a.b', 1, $1, 'skincare', '{"id": "a.b"}', 'run-1')`, [sha('r')]),
    ).rejects.toThrow(/derived_rules_check/)
  })

  it('adds a research record', async () => {
    const rec = await store.addRecord({ id: 'rec.zinc_oxide', version: 1, question: 'Is zinc oxide a mineral filter?', runId: 'run-1', artifactRef: 'records/rec.zinc_oxide/1.json', artifactHash: sha('artifact') })
    expect(rec).toMatchObject({ id: 'rec.zinc_oxide', version: 1, artifactHash: sha('artifact') })
  })

  it('adds a derived rule with the hash of ruleHash()', async () => {
    const row = await store.addDerivedRule({ rule, runId: 'run-1' })
    expect(row).toMatchObject({ id: rule.id, version: 1, owner: 'skincare', hash: ruleHash(rule) })
    expect(row.record).toEqual(rule)
  })
})

describe('the append-only triggers', () => {
  // Each table and one of its time columns, for the update.
  const tables = [
    ['stage_runs', 'started_at'],
    ['outputs', 'accepted_at'],
    ['verdicts', 'created_at'],
    ['records', 'created_at'],
    ['derived_rules', 'created_at'],
  ]

  it.each(tables)('harness.%s refuses update, delete and truncate', async (table, column) => {
    const { rows } = await pool.query(`select count(*)::int as n from harness.${table}`)
    expect(rows[0].n).toBeGreaterThan(0)
    await expect(pool.query(`update harness.${table} set ${column} = now()`)).rejects.toThrow(/append-only: update is refused/)
    await expect(pool.query(`delete from harness.${table}`)).rejects.toThrow(/append-only: delete is refused/)
    await expect(pool.query(`truncate harness.${table} cascade`)).rejects.toThrow(/append-only: truncate is refused/)
    const after = await pool.query(`select count(*)::int as n from harness.${table}`)
    expect(after.rows[0].n).toBe(rows[0].n)
  })
})

describe('the harness_app role', () => {
  const Count = z.object({ n: z.number() })
  const double = createStep({ id: 'double', inputSchema: Count, outputSchema: Count, execute: async ({ inputData }) => ({ n: inputData.n * 2 }) })
  const smoke = createWorkflow({ id: 'smoke', inputSchema: Count, outputSchema: Count }).then(double).commit()
  let appPool: pg.Pool

  beforeAll(async () => {
    // A stand-in for a Kyaloon table, outside the schemas of the harness.
    await pool.query("create table public.kyaloon_table (id int primary key, secret text); insert into public.kyaloon_table values (1, 'x')")
    appPool = db.pool(withUser(db.url, 'harness_app'))
  })

  it('connects as harness_app', async () => {
    const { rows } = await appPool.query('select current_user as u')
    expect(rows[0].u).toBe('harness_app')
  })

  it('runs a workflow on Mastra storage and writes graph rows', async () => {
    const harness = createHarness({ pool: appPool, workflows: { smoke } })
    const run = await harness.getWorkflow('smoke').createRun()
    const result = await run.start({ inputData: { n: 2 } })
    expect(result.status).toBe('success')

    const app = createGraphStore(appPool)
    await app.recordStageRun({ runId: run.runId, stage: 'create_node', nodeId: 'moisturizer', ruleSetHash: RULE_SET })
    expect(ids(await app.pathToRoot('moisturizer'))).toEqual(['skincare', 'moisturizer'])
  })

  it('cannot read or change a table in another schema', async () => {
    await expect(appPool.query('select * from public.kyaloon_table')).rejects.toThrow(/permission denied for table kyaloon_table/)
    await expect(appPool.query("insert into public.kyaloon_table values (2, 'y')")).rejects.toThrow(/permission denied for table kyaloon_table/)
  })

  it('has no update or delete right on the graph tables', async () => {
    await expect(appPool.query("update harness.nodes set label = 'x'")).rejects.toThrow(/permission denied for table nodes/)
    await expect(appPool.query('delete from harness.verdicts')).rejects.toThrow(/permission denied for table verdicts/)
  })
})
