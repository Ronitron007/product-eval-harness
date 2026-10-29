import { customType, foreignKey, integer, jsonb, pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { RuleRecord } from '../rules/schema'

// The graph tables of store.tables (docs/design/graph-store.md).
// db/migrations/0001_harness_tables.sql makes them, with their checks and append-only triggers.
// tests/store/migrations.test.ts fails when this file and the migration drift apart.

const ltree = customType<{ data: string }>({ dataType: () => 'ltree' })
const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' }).notNull().defaultNow()

const STAGES = ['define_criteria', 'create_node', 'create_pack', 'create_layout', 'evaluate_product'] as const

export const harness = pgSchema('harness')

export const nodes = harness.table('nodes', {
  id: text('id').primaryKey(),
  parentId: text('parent_id'),
  level: text('level', { enum: ['domain', 'inner', 'leaf'] }).notNull(),
  path: ltree('path').notNull().unique(),
  label: text('label').notNull(),
  createdAt: at('created_at'),
})

export const stageRuns = harness.table('stage_runs', {
  runId: text('run_id').primaryKey(),
  stage: text('stage', { enum: STAGES }).notNull(),
  nodeId: text('node_id')
    .notNull()
    .references(() => nodes.id),
  ruleSetHash: text('rule_set_hash').notNull(),
  startedAt: at('started_at'),
})

export const outputs = harness.table(
  'outputs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: text('run_id').notNull(),
    stage: text('stage', { enum: STAGES }).notNull(),
    nodeId: text('node_id').notNull(),
    body: jsonb('body').$type<unknown>().notNull(),
    ruleSetHash: text('rule_set_hash').notNull(),
    acceptedAt: at('accepted_at'),
  },
  t => [
    foreignKey({
      columns: [t.runId, t.stage, t.nodeId, t.ruleSetHash],
      foreignColumns: [stageRuns.runId, stageRuns.stage, stageRuns.nodeId, stageRuns.ruleSetHash],
    }),
  ],
)

export type Decider = { by: 'code' } | { by: 'judge'; model: string; promptHash: string }
export type Evidence = { quote: string; source: string }

export const verdicts = harness.table('verdicts', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: text('run_id')
    .notNull()
    .references(() => stageRuns.runId),
  ruleId: text('rule_id').notNull(),
  ruleVersion: integer('rule_version').notNull(),
  ruleHash: text('rule_hash').notNull(),
  binding: text('binding', { enum: ['strict', 'soft', 'watch'] }).notNull(),
  target: text('target').notNull(),
  verdict: text('verdict', { enum: ['pass', 'fail', 'cannot_verify'] }).notNull(),
  decider: jsonb('decider').$type<Decider>().notNull(),
  reason: text('reason').notNull(),
  evidence: jsonb('evidence').$type<Evidence>(),
  createdAt: at('created_at'),
})

export const records = harness.table(
  'records',
  {
    id: text('id').notNull(),
    version: integer('version').notNull(),
    question: text('question').notNull(),
    runId: text('run_id')
      .notNull()
      .references(() => stageRuns.runId),
    artifactRef: text('artifact_ref').notNull(),
    artifactHash: text('artifact_hash').notNull(),
    createdAt: at('created_at'),
  },
  t => [primaryKey({ columns: [t.id, t.version] })],
)

export const derivedRules = harness.table(
  'derived_rules',
  {
    id: text('id').notNull(),
    version: integer('version').notNull(),
    hash: text('hash').notNull(),
    owner: text('owner')
      .notNull()
      .references(() => nodes.id),
    record: jsonb('record').$type<RuleRecord>().notNull(),
    runId: text('run_id')
      .notNull()
      .references(() => stageRuns.runId),
    createdAt: at('created_at'),
  },
  t => [primaryKey({ columns: [t.id, t.version] })],
)

export const graphTables = { nodes, stageRuns, outputs, verdicts, records, derivedRules }
