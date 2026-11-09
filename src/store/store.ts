import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import type pg from 'pg'
import { z } from 'zod'
import { ruleHash } from '../rules/hash'
import { Binding, NodeId, NodeLevel, OWNER_ALL, RuleId, RuleRecord, Stage, Verdict } from '../rules/schema'
import { derivedRules, drafts, nodes, outputs, records, stageRuns, toolRuns, verdicts } from './schema'

// The graph store (docs/design/graph-store.md). The ltree type and operators live in
// schema extensions (db/migrations/0001_harness_tables.sql), so the queries name that schema
// and work with any search_path. Writes only add rows: the store has no update or delete
// function, and the database refuses both (store.safety).

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/, 'Give a lowercase sha256 hex digest.')
const Text = z.string().min(1)

// The id all names the virtual owner of the rules for every domain (compile.scope), never a node.
const NewNodeId = NodeId.refine(id => id !== OWNER_ALL, `The node id ${OWNER_ALL} is reserved for the rules of every domain (rules/${OWNER_ALL}/). Pick another id.`)

export const NodeInput = z
  .object({ id: NewNodeId, parentId: NodeId.optional(), level: NodeLevel, label: Text })
  .strict()
  .refine(n => (n.parentId === undefined) === (n.level === 'domain'), {
    message: 'A domain node has no parent. An inner or leaf node needs a parent.',
  })
export const StageRunInput = z.object({ runId: Text, stage: Stage, nodeId: NodeId, ruleSetHash: Sha256 }).strict()
export const OutputInput = z.object({ runId: Text, round: z.number().int().min(1), body: z.unknown() }).strict()
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

// The rows of the stage workflow (stage.store in docs/design/stage-workflow.md).
const Round = z.number().int().min(1)
// stage.person_payload: a reviewer or a note that is blank after a trim is refused. No transform.
const Filled = z.string().refine(v => v.trim() !== '', 'Give a value that is not blank.')
const ModelId = z.string().regex(/^[^/]+\/.+$/, 'Give a provider/model id.')
export const DraftRowInput = z.object({ runId: Text, round: Round, reply: z.unknown(), drafter: ModelId, error: Filled.optional() }).strict()
export const DecisionRowInput = z.discriminatedUnion('decision', [
  z.object({ runId: Text, round: Round, decision: z.literal('accept'), reviewer: Filled, note: Filled.optional() }).strict(),
  z.object({ runId: Text, round: Round, decision: z.literal('reject'), reviewer: Filled, note: Filled }).strict(),
])
export const RunEnd = z.enum(['accepted', 'person_accepted', 'person_rejected'])
export type RunEnd = z.infer<typeof RunEnd>

export interface DraftRow {
  runId: string
  round: number
  reply: unknown // JSON.parse of reply_text (stage.reply_lossless). Undefined for a draft with an error.
  drafter: string // provider/model
  error?: string // stage.draft_deadline: the drafter gave no reply, such as 'drafter deadline'
}
// stage.decision_first: one row for each run, written before assimilate runs.
export type DecisionRow = { readonly runId: string; readonly round: number; readonly reviewer: string } & (
  | { readonly decision: 'accept'; readonly note?: string }
  | { readonly decision: 'reject'; readonly note: string }
)
export type RunEndInput =
  | { readonly runId: string; readonly round: number; readonly end: 'accepted'; readonly output: unknown }
  | { readonly runId: string; readonly round: number; readonly end: 'person_accepted'; readonly reviewer: string; readonly note?: string; readonly output: unknown }
  | { readonly runId: string; readonly round: number; readonly end: 'person_rejected'; readonly reviewer: string; readonly note: string }
// The stored end of a run: StageResult of src/stage/types.ts.
export interface RunEndRow {
  runId: string
  end: RunEnd
  round: number
  outputId: string | null
}

// The run record of the tool registry (tools.run_record in docs/design/tool-registry.md). The
// snapshot is a ToolSnapshot of src/tools/types.ts. The store reads it by its shape only.
const ToolRunInputSchema = z
  .object({
    runId: Text,
    snapshot: z
      .object({
        runId: Text,
        consumer: z.enum(['agent', 'mcp_client', 'step']),
        toggles: z.custom<object>(v => typeof v === 'object' && v !== null && !Array.isArray(v), 'Give the toggles as an object.'),
        manifest: z.array(z.unknown()),
        hash: Sha256,
      })
      .strict(),
    allowedTools: z.array(Text).optional(), // the allowedTools of a claude -p run. Default: none.
  })
  .strict()
  .refine(r => r.snapshot.runId === r.runId, 'The snapshot is for another run.')
export const ToolRunEndInput = z
  .object({
    runId: Text,
    subtype: z.string().nullable(),
    costUsd: z.number().min(0).nullable(),
    numTurns: z.number().int().min(0).nullable(),
    terminalReason: z.string().nullable(),
    denials: z.array(z.unknown()),
  })
  .strict()
export interface ToolRunInput {
  readonly runId: string
  readonly snapshot: {
    readonly runId: string
    readonly consumer: 'agent' | 'mcp_client' | 'step'
    readonly toggles: object
    readonly manifest: readonly unknown[]
    readonly hash: string
  }
  readonly allowedTools?: readonly string[]
}
export type ToolRunEndInput = z.infer<typeof ToolRunEndInput>
export interface ToolRunRow {
  runId: string
  consumer: 'agent' | 'mcp_client' | 'step'
  toggles: unknown
  manifest: unknown[]
  snapshotHash: string
  allowedTools: string[]
  startedAt: Date
  end: (Omit<ToolRunEndInput, 'runId'> & { endedAt: Date }) | null
}

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
  acceptOutput(input: OutputInput): Promise<Output> // only endRun calls it, inside its transaction
  writeVerdicts(rows: readonly VerdictInput[], round: number): Promise<VerdictRow[]> // stage.round_rows
  addRecord(input: RecordInput): Promise<ResearchRecord>
  addDerivedRule(input: DerivedRuleInput): Promise<DerivedRule>
  // store.tree: the walks of graph.traversal.
  tree(): Promise<GraphNode[]> // every node, in path order, for compileStage
  derivedRules(): Promise<DerivedRule[]> // every derived rule version, for compileStage
  pathToRoot(nodeId: string): Promise<GraphNode[]>
  subtree(nodeId: string): Promise<GraphNode[]>
  siblings(nodeId: string): Promise<GraphNode[]>
  // stage.store: the calls of the stage workflow.
  stageRun(runId: string): Promise<Pick<StageRun, 'runId' | 'stage' | 'nodeId' | 'ruleSetHash'> | undefined>
  addDraft(row: DraftRow): Promise<void>
  // stage.draft_claim, stage.claim_lease: the new attempt number, or null. It inserts attempt
  // max + 1 only when the latest claim is older than leaseMs and the round has no draft row.
  claimDraft(runId: string, round: number, leaseMs: number): Promise<number | null>
  draftOf(runId: string, round: number): Promise<DraftRow | undefined>
  verdictsOf(runId: string, round: number): Promise<VerdictInput[]>
  // stage.judge_claim, stage.claim_lease: the new attempt number, or null. It inserts attempt
  // max + 1 only when the latest claim is older than leaseMs and the round has no verdict row.
  claimJudge(runId: string, round: number, leaseMs: number): Promise<number | null>
  // stage.decision_first: an equal row again is a no-op. Another row for the run throws.
  addDecision(row: DecisionRow): Promise<void>
  decisionOf(runId: string): Promise<DecisionRow | undefined>
  // stage.reuse_end: the stored end of a run, or undefined.
  runEndOf(runId: string): Promise<RunEndRow | undefined>
  // stage.end_once: one transaction, the run_ends row, then the output for an accepting end.
  // An equal end that is stored already gives the stored end. Another end throws.
  endRun(input: RunEndInput): Promise<RunEndRow>
  // tools.run_record: one row for each run, before its first tool call. An equal row again is a
  // no-op. A row with another consumer, hash, or allowed tools throws.
  recordToolRun(input: ToolRunInput): Promise<void>
  // tools.run_record: one end for each run. An equal end again is a no-op. Another end throws.
  endToolRun(input: ToolRunEndInput): Promise<void>
  toolRunOf(runId: string): Promise<ToolRunRow | undefined>
}

// The SQLSTATE of a unique or primary key violation.
const UNIQUE_VIOLATION = '23505'
const codeOf = (e: unknown) => (e as { code?: string })?.code

const OUTPUT_SQL = `insert into harness.outputs (run_id, stage, node_id, body, rule_set_hash, round)
  select run_id, stage, node_id, $2::jsonb, rule_set_hash, $3 from harness.stage_runs where run_id = $1 returning id`

// One store on the pool that Mastra storage uses too.
export function createGraphStore(pool: pg.Pool): GraphStore {
  const db = drizzle(pool)

  async function runEndOf(runId: string): Promise<RunEndRow | undefined> {
    const { rows } = await pool.query(
      'select e.run_id, e."end", e.round, o.id as output_id from harness.run_ends e left join harness.outputs o on o.run_id = e.run_id where e.run_id = $1',
      [runId],
    )
    const r = rows[0]
    return r && { runId: r.run_id, end: r.end, round: r.round, outputId: r.output_id ?? null }
  }

  async function decisionOf(runId: string): Promise<DecisionRow | undefined> {
    const { rows } = await pool.query('select run_id, round, decision, reviewer, note from harness.person_decisions where run_id = $1', [runId])
    const r = rows[0]
    if (!r) return undefined
    return r.decision === 'reject'
      ? { runId: r.run_id, round: r.round, decision: 'reject', reviewer: r.reviewer, note: r.note }
      : { runId: r.run_id, round: r.round, decision: 'accept', reviewer: r.reviewer, ...(r.note !== null ? { note: r.note } : {}) }
  }

  async function nodeOrThrow(nodeId: string): Promise<GraphNode> {
    const [node] = await db.select().from(nodes).where(eq(nodes.id, NodeId.parse(nodeId)))
    if (!node) throw new Error(`No node ${nodeId} in harness.nodes. Add it with addNode() first.`)
    return node
  }

  async function toolRunOf(runId: string): Promise<ToolRunRow | undefined> {
    const { rows } = await pool.query(
      `select r.run_id, r.consumer, r.toggles, r.manifest, r.snapshot_hash, r.allowed_tools, r.started_at,
              e.run_id as end_run, e.subtype, e.cost_usd, e.num_turns, e.terminal_reason, e.denials, e.ended_at
         from harness.tool_runs r left join harness.tool_run_ends e on e.run_id = r.run_id where r.run_id = $1`,
      [runId],
    )
    const r = rows[0]
    if (!r) return undefined
    return {
      runId: r.run_id,
      consumer: r.consumer,
      toggles: r.toggles,
      manifest: r.manifest,
      snapshotHash: r.snapshot_hash,
      allowedTools: r.allowed_tools,
      startedAt: r.started_at,
      end:
        r.end_run === null
          ? null
          : { subtype: r.subtype, costUsd: r.cost_usd === null ? null : Number(r.cost_usd), numTurns: r.num_turns, terminalReason: r.terminal_reason, denials: r.denials, endedAt: r.ended_at },
    }
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

    // An equal row that exists is not an error, so two starts of one run id at the same time both
    // go on (stage.rerun_reuses). A row with another stage, node, or hash throws.
    async recordStageRun(input) {
      const r = StageRunInput.parse(input)
      const [row] = await db.insert(stageRuns).values(r).onConflictDoNothing({ target: stageRuns.runId }).returning()
      if (row) return row
      const [stored] = await db.select().from(stageRuns).where(eq(stageRuns.runId, r.runId))
      if (!stored || stored.stage !== r.stage || stored.nodeId !== r.nodeId || stored.ruleSetHash !== r.ruleSetHash) {
        throw new Error(`Stage run ${r.runId} exists with another stage, node, or rule set hash. Start a new run.`)
      }
      return stored
    },

    // The stage, node and rule set hash come from the run, so an output cannot disagree with it.
    // The database refuses an output with no accepting run end of its run and round.
    async acceptOutput(input) {
      const o = OutputInput.parse(input)
      const [run] = await db.select().from(stageRuns).where(eq(stageRuns.runId, o.runId))
      if (!run) throw new Error(`No stage run ${o.runId} in harness.stage_runs. Record the run before you accept its output.`)
      if (o.body === undefined) throw new Error('An output needs a body.')
      const [row] = await db
        .insert(outputs)
        .values({ runId: run.runId, stage: run.stage, nodeId: run.nodeId, ruleSetHash: run.ruleSetHash, body: o.body, round: o.round })
        .returning()
      return row!
    },

    // All rows or none, in one statement. Each row gets the round (stage.round_rows).
    async writeVerdicts(rows, round) {
      const n = Round.parse(round)
      if (rows.length === 0) return []
      return db.insert(verdicts).values(rows.map(r => ({ ...VerdictInput.parse(r), round: n }))).returning()
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

    async tree() {
      return db.select().from(nodes).orderBy(asc(nodes.path))
    },

    // Each version, old ones too: the compiler gives each older version the ledger reason superseded.
    async derivedRules() {
      return db.select().from(derivedRules).orderBy(asc(derivedRules.id), asc(derivedRules.version))
    },

    // From the root down to the node.
    async pathToRoot(nodeId) {
      const node = await nodeOrThrow(nodeId)
      return db
        .select()
        .from(nodes)
        .where(sql`${nodes.path} operator(extensions.@>) ${node.path}::extensions.ltree`)
        .orderBy(sql`extensions.nlevel(${nodes.path})`)
    },

    // The node first, then its descendants in path order.
    async subtree(nodeId) {
      const node = await nodeOrThrow(nodeId)
      return db
        .select()
        .from(nodes)
        .where(sql`${nodes.path} operator(extensions.<@) ${node.path}::extensions.ltree`)
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

    async stageRun(runId) {
      const [run] = await db
        .select({ runId: stageRuns.runId, stage: stageRuns.stage, nodeId: stageRuns.nodeId, ruleSetHash: stageRuns.ruleSetHash })
        .from(stageRuns)
        .where(eq(stageRuns.runId, runId))
      return run
    },

    // stage.reply_lossless: JSON.stringify writes NUL and a lone surrogate as escapes, so the text
    // column keeps each reply. The jsonb column is null when jsonb refuses the text.
    async addDraft(row) {
      const d = DraftRowInput.parse(row)
      const text = d.error === undefined ? JSON.stringify(d.reply) : null
      if (text === undefined) throw new Error(`The drafter gave no reply for round ${d.round} of run ${d.runId}.`)
      await pool.query('insert into harness.drafts (run_id, round, reply_text, reply, drafter, error) values ($1, $2, $3, harness.try_jsonb($3), $4, $5)', [d.runId, d.round, text, d.drafter, d.error ?? null])
    },

    // One statement, as claimJudge. A row, not a session lock: no connection stays open across
    // the model call, so the pool and a transaction pooler stay free.
    async claimDraft(runId, round, leaseMs) {
      const { rows } = await pool.query(
        `insert into harness.draft_claims (run_id, round, attempt)
         select $1, $2, coalesce(max(c.attempt), 0) + 1 from harness.draft_claims c where c.run_id = $1 and c.round = $2
         having (max(c.claimed_at) is null or max(c.claimed_at) < now() - make_interval(secs => $3::double precision / 1000))
            and not exists (select 1 from harness.drafts d where d.run_id = $1 and d.round = $2)
         on conflict do nothing returning attempt`,
        [runId, Round.parse(round), z.number().int().min(0).parse(leaseMs)],
      )
      return rows[0] ? (rows[0].attempt as number) : null
    },

    async draftOf(runId, round) {
      const [d] = await db
        .select({ runId: drafts.runId, round: drafts.round, replyText: drafts.replyText, drafter: drafts.drafter, error: drafts.error })
        .from(drafts)
        .where(and(eq(drafts.runId, runId), eq(drafts.round, round)))
      if (!d) return undefined
      if (d.replyText === null) return { runId: d.runId, round: d.round, reply: undefined, drafter: d.drafter, error: d.error ?? 'no reply' }
      return { runId: d.runId, round: d.round, reply: JSON.parse(d.replyText), drafter: d.drafter }
    },

    async verdictsOf(runId, round) {
      const rows = await db
        .select()
        .from(verdicts)
        .where(and(eq(verdicts.runId, runId), eq(verdicts.round, round)))
        .orderBy(asc(verdicts.ruleId), asc(verdicts.ruleVersion), asc(verdicts.target))
      return rows.map(r => ({
        runId: r.runId,
        ruleId: r.ruleId,
        ruleVersion: r.ruleVersion,
        ruleHash: r.ruleHash,
        binding: r.binding,
        target: r.target,
        verdict: r.verdict,
        decider: r.decider,
        reason: r.reason,
        ...(r.evidence !== null ? { evidence: r.evidence } : {}),
      }))
    },

    // One statement. The primary key lets one caller win each attempt.
    async claimJudge(runId, round, leaseMs) {
      const { rows } = await pool.query(
        `insert into harness.judge_claims (run_id, round, attempt)
         select $1, $2, coalesce(max(c.attempt), 0) + 1 from harness.judge_claims c where c.run_id = $1 and c.round = $2
         having (max(c.claimed_at) is null or max(c.claimed_at) < now() - make_interval(secs => $3::double precision / 1000))
            and not exists (select 1 from harness.verdicts v where v.run_id = $1 and v.round = $2)
         on conflict do nothing returning attempt`,
        [runId, Round.parse(round), z.number().int().min(0).parse(leaseMs)],
      )
      return rows[0] ? (rows[0].attempt as number) : null
    },

    async addDecision(row) {
      const d = DecisionRowInput.parse(row)
      try {
        await pool.query('insert into harness.person_decisions (run_id, round, decision, reviewer, note) values ($1, $2, $3, $4, $5)', [d.runId, d.round, d.decision, d.reviewer, d.note ?? null])
      } catch (e) {
        if (codeOf(e) !== UNIQUE_VIOLATION) throw e
        const o = await decisionOf(d.runId)
        const same = o !== undefined && o.round === d.round && o.decision === d.decision && o.reviewer === d.reviewer && (o.note ?? null) === (d.note ?? null)
        if (!same) throw new Error(`Run ${d.runId} has another person decision. A run takes one decision (stage.end_once).`)
      }
    },

    decisionOf,
    runEndOf,

    async endRun(input) {
      const e = input
      const client = await pool.connect()
      try {
        await client.query('begin')
        // stage.round_closed: the lock of the run, as the triggers of 0004 take it, to the commit.
        await client.query('select pg_advisory_xact_lock(hashtext($1))', [e.runId])
        await client.query('insert into harness.run_ends (run_id, round, "end", reviewer, note) values ($1, $2, $3, $4, $5)', [
          e.runId,
          Round.parse(e.round),
          RunEnd.parse(e.end),
          e.end === 'accepted' ? null : e.reviewer,
          e.end === 'accepted' ? null : (e.note ?? null),
        ])
        if (e.end !== 'person_rejected') {
          if (e.output === undefined) throw new Error('An output needs a body.')
          const { rowCount } = await client.query(OUTPUT_SQL, [e.runId, JSON.stringify(e.output), e.round])
          if (rowCount !== 1) throw new Error(`No stage run ${e.runId} in harness.stage_runs.`)
        }
        await client.query('commit')
      } catch (err) {
        await client.query('rollback')
        if (codeOf(err) !== UNIQUE_VIOLATION) throw err
        const stored = await runEndOf(e.runId)
        if (stored === undefined || stored.end !== e.end || stored.round !== e.round) throw err
        return stored
      } finally {
        client.release()
      }
      return (await runEndOf(e.runId))!
    },

    async recordToolRun(input) {
      const r = ToolRunInputSchema.parse(input)
      const allowed = r.allowedTools ?? []
      const [row] = await db
        .insert(toolRuns)
        .values({ runId: r.runId, consumer: r.snapshot.consumer, toggles: r.snapshot.toggles, manifest: r.snapshot.manifest, snapshotHash: r.snapshot.hash, allowedTools: allowed })
        .onConflictDoNothing({ target: toolRuns.runId })
        .returning({ runId: toolRuns.runId })
      if (row) return
      const stored = await toolRunOf(r.runId)
      const same = stored !== undefined && stored.consumer === r.snapshot.consumer && stored.snapshotHash === r.snapshot.hash && JSON.stringify(stored.allowedTools) === JSON.stringify(allowed)
      if (!same) throw new Error(`Tool run ${r.runId} exists with another consumer, snapshot hash, or allowed tools. Start a new run.`)
    },

    async endToolRun(input) {
      const e = ToolRunEndInput.parse(input)
      const { rowCount } = await pool.query(
        `insert into harness.tool_run_ends (run_id, subtype, cost_usd, num_turns, terminal_reason, denials) values ($1, $2, $3, $4, $5, $6::jsonb)
         on conflict (run_id) do nothing`,
        [e.runId, e.subtype, e.costUsd, e.numTurns, e.terminalReason, JSON.stringify(e.denials)],
      )
      if (rowCount === 1) return
      const stored = (await toolRunOf(e.runId))?.end
      const same =
        stored != null &&
        stored.subtype === e.subtype &&
        stored.costUsd === e.costUsd &&
        stored.numTurns === e.numTurns &&
        stored.terminalReason === e.terminalReason &&
        JSON.stringify(stored.denials) === JSON.stringify(e.denials)
      if (!same) throw new Error(`Tool run ${e.runId} has another end. A run takes one end.`)
    },

    toolRunOf,
  }
}
