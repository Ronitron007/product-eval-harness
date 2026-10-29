import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import type pg from 'pg'
import { z } from 'zod'
import { ruleHash } from '../rules/hash'
import { Binding, NodeId, NodeLevel, RuleId, RuleRecord, Stage, Verdict } from '../rules/schema'
import { derivedRules, nodes, outputs, records, stageRuns, verdicts } from './schema'

// The graph store (docs/design/graph-store.md). Writes only add rows: the store has no
// update or delete function, and the database refuses both (store.safety).

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/, 'Give a lowercase sha256 hex digest.')
const Text = z.string().min(1)

export const NodeInput = z
  .object({ id: NodeId, parentId: NodeId.optional(), level: NodeLevel, label: Text })
  .strict()
  .refine(n => (n.parentId === undefined) === (n.level === 'domain'), {
    message: 'A domain node has no parent. An inner or leaf node needs a parent.',
  })
export const StageRunInput = z.object({ runId: Text, stage: Stage, nodeId: NodeId, ruleSetHash: Sha256 }).strict()
export const OutputInput = z.object({ runId: Text, body: z.unknown() }).strict()
export const Decider = z.union([
  z.object({ by: z.literal('code') }).strict(),
  z.object({ by: z.literal('judge'), model: Text, promptHash: Text }).strict(),
])
export const VerdictInput = z
  .object({
    runId: Text,
    ruleId: RuleId,
    ruleVersion: z.number().int().min(1),
    ruleHash: Sha256,
    binding: Binding,
    target: Text,
    verdict: Verdict,
    decider: Decider,
    reason: Text,
    evidence: z.object({ quote: z.string(), source: z.string() }).strict().optional(),
  })
  .strict()
export const RecordInput = z
  .object({ id: Text, version: z.number().int().min(1), question: Text, runId: Text, artifactRef: Text, artifactHash: Sha256 })
  .strict()
export const DerivedRuleInput = z.object({ rule: RuleRecord, runId: Text }).strict()

export type NodeInput = z.infer<typeof NodeInput>
export type StageRunInput = z.infer<typeof StageRunInput>
export type OutputInput = z.infer<typeof OutputInput>
export type VerdictInput = z.infer<typeof VerdictInput>
export type RecordInput = z.infer<typeof RecordInput>
export type DerivedRuleInput = z.input<typeof DerivedRuleInput>

export type GraphNode = typeof nodes.$inferSelect
export type StageRun = typeof stageRuns.$inferSelect
export type Output = typeof outputs.$inferSelect
export type VerdictRow = typeof verdicts.$inferSelect
export type ResearchRecord = typeof records.$inferSelect
export type DerivedRule = typeof derivedRules.$inferSelect

export interface GraphStore {
  db: NodePgDatabase
  addNode(input: NodeInput): Promise<GraphNode>
  recordStageRun(input: StageRunInput): Promise<StageRun>
  acceptOutput(input: OutputInput): Promise<Output>
  writeVerdicts(rows: VerdictInput[]): Promise<VerdictRow[]>
  addRecord(input: RecordInput): Promise<ResearchRecord>
  addDerivedRule(input: DerivedRuleInput): Promise<DerivedRule>
  // store.tree: the walks of graph.traversal.
  pathToRoot(nodeId: string): Promise<GraphNode[]>
  subtree(nodeId: string): Promise<GraphNode[]>
  siblings(nodeId: string): Promise<GraphNode[]>
}

// One store on the pool that Mastra storage uses too.
export function createGraphStore(pool: pg.Pool): GraphStore {
  const db = drizzle(pool)

  async function nodeOrThrow(nodeId: string): Promise<GraphNode> {
    const [node] = await db.select().from(nodes).where(eq(nodes.id, NodeId.parse(nodeId)))
    if (!node) throw new Error(`No node ${nodeId} in harness.nodes. Add it with addNode() first.`)
    return node
  }

  return {
    db,

    async addNode(input) {
      const n = NodeInput.parse(input)
      if (n.parentId === undefined) {
        const [row] = await db.insert(nodes).values({ id: n.id, level: n.level, label: n.label, path: n.id }).returning()
        return row!
      }
      const parent = await nodeOrThrow(n.parentId)
      if (parent.level === 'leaf') throw new Error(`Node ${parent.id} is a leaf, so it cannot have a child node.`)
      const [row] = await db
        .insert(nodes)
        .values({ id: n.id, parentId: parent.id, level: n.level, label: n.label, path: `${parent.path}.${n.id}` })
        .returning()
      return row!
    },

    async recordStageRun(input) {
      const [row] = await db.insert(stageRuns).values(StageRunInput.parse(input)).returning()
      return row!
    },

    // The stage, node and rule set hash come from the run, so an output cannot disagree with it.
    async acceptOutput(input) {
      const o = OutputInput.parse(input)
      const [run] = await db.select().from(stageRuns).where(eq(stageRuns.runId, o.runId))
      if (!run) throw new Error(`No stage run ${o.runId} in harness.stage_runs. Record the run before you accept its output.`)
      if (o.body === undefined) throw new Error('An output needs a body.')
      const [row] = await db
        .insert(outputs)
        .values({ runId: run.runId, stage: run.stage, nodeId: run.nodeId, ruleSetHash: run.ruleSetHash, body: o.body })
        .returning()
      return row!
    },

    // All rows or none, in one statement.
    async writeVerdicts(rows) {
      if (rows.length === 0) return []
      return db.insert(verdicts).values(rows.map(r => VerdictInput.parse(r))).returning()
    },

    async addRecord(input) {
      const [row] = await db.insert(records).values(RecordInput.parse(input)).returning()
      return row!
    },

    // The hash comes from ruleHash(), so the stored hash always matches the stored record.
    async addDerivedRule(input) {
      const { rule, runId } = DerivedRuleInput.parse(input)
      const [row] = await db
        .insert(derivedRules)
        .values({ id: rule.id, version: rule.version, hash: ruleHash(rule), owner: rule.owner, record: rule, runId })
        .returning()
      return row!
    },

    // From the root down to the node.
    async pathToRoot(nodeId) {
      const node = await nodeOrThrow(nodeId)
      return db
        .select()
        .from(nodes)
        .where(sql`${nodes.path} @> ${node.path}::ltree`)
        .orderBy(sql`nlevel(${nodes.path})`)
    },

    // The node first, then its descendants in path order.
    async subtree(nodeId) {
      const node = await nodeOrThrow(nodeId)
      return db
        .select()
        .from(nodes)
        .where(sql`${nodes.path} <@ ${node.path}::ltree`)
        .orderBy(asc(nodes.path))
    },

    // The other children of the same parent. For a domain node, the other domain nodes.
    async siblings(nodeId) {
      const node = await nodeOrThrow(nodeId)
      const sameParent = node.parentId === null ? isNull(nodes.parentId) : eq(nodes.parentId, node.parentId)
      return db
        .select()
        .from(nodes)
        .where(and(sameParent, ne(nodes.id, node.id)))
        .orderBy(asc(nodes.id))
    },
  }
}
