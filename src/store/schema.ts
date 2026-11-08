import { customType, foreignKey, integer, jsonb, pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { RuleRecord } from '../rules/schema'

// The graph tables of store.tables (docs/design/graph-store.md) and of stage.store
// (docs/design/stage-workflow.md). db/migrations/0001_harness_tables.sql and
// 0004_stage_runs.sql make them, with their checks, keys and triggers.
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
    round: integer('round').notNull(), // stage.round_rows: the round of the accepted draft
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
  round: integer('round').notNull(), // stage.round_rows: 1 to 3, with a draft row
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

// stage.draft_log, stage.reply_lossless: one row for each round. reply_text is JSON.stringify of
// the reply, and reply is harness.try_jsonb(reply_text), null when jsonb refuses it.
export const drafts = harness.table(
  'drafts',
  {
    runId: text('run_id')
      .notNull()
      .references(() => stageRuns.runId),
    round: integer('round').notNull(),
    replyText: text('reply_text').notNull(),
    reply: jsonb('reply').$type<unknown>(),
    drafter: text('drafter').notNull(),
    createdAt: at('created_at'),
  },
  t => [primaryKey({ columns: [t.runId, t.round] })],
)

// stage.judge_claim, stage.claim_lease: one row for each attempt to judge one round.
export const judgeClaims = harness.table(
  'judge_claims',
  {
    runId: text('run_id').notNull(),
    round: integer('round').notNull(),
    attempt: integer('attempt').notNull(),
    claimedAt: at('claimed_at'),
  },
  t => [primaryKey({ columns: [t.runId, t.round, t.attempt] }), foreignKey({ columns: [t.runId, t.round], foreignColumns: [drafts.runId, drafts.round] })],
)

// stage.decision_first: the decision of a person, one row for each run.
export const personDecisions = harness.table(
  'person_decisions',
  {
    runId: text('run_id').primaryKey(),
    round: integer('round').notNull(),
    decision: text('decision', { enum: ['accept', 'reject'] }).notNull(),
    reviewer: text('reviewer').notNull(),
    note: text('note'),
    createdAt: at('created_at'),
  },
  t => [foreignKey({ columns: [t.runId, t.round], foreignColumns: [drafts.runId, drafts.round] })],
)

// stage.end_once, stage.reject_end: one run end for each run.
export const runEnds = harness.table(
  'run_ends',
  {
    runId: text('run_id')
      .primaryKey()
      .references(() => stageRuns.runId),
    round: integer('round').notNull(),
    end: text('end', { enum: ['accepted', 'person_accepted', 'person_rejected'] }).notNull(),
    reviewer: text('reviewer'),
    note: text('note'),
    createdAt: at('created_at'),
  },
  t => [foreignKey({ columns: [t.runId, t.round], foreignColumns: [drafts.runId, drafts.round] })],
)

export const graphTables = { nodes, stageRuns, outputs, verdicts, records, derivedRules, drafts, judgeClaims, personDecisions, runEnds }
