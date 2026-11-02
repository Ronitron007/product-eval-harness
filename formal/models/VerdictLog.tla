----------------------------- MODULE VerdictLog -----------------------------
(* One stage run, its verdict rows, and its accepted outputs in the graph store.
   Code:
     db/migrations/0001_harness_tables.sql   harness.stage_runs, harness.verdicts (foreign key
                                              to its run), harness.outputs (composite foreign key
                                              to the stage, node and rule set hash of its run),
                                              and the append-only triggers
     src/store/store.ts                       recordStageRun(), writeVerdicts(), acceptOutput()
   Each action is one call of the store, and each call runs one insert statement.
   The model has one run, one strict rule (version 1), and one target of that rule.
   Rows only grow, so no action removes or changes a row. *)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Hashes,      \* rule hashes that a verdict row can name, such as {"h1", "h2"}
  MaxOutputs   \* a bound on the outputs of the run, for the model checker

None == "none"
Nodes == {"skincare", "mineral"}
Level == [n \in Nodes |-> IF n = "skincare" THEN "domain" ELSE "leaf"]
Stages == {"define_criteria", "create_pack"}
\* graph.stages (docs/design/rule-graph.md): the node level where each stage runs.
StageLevel == [s \in Stages |-> IF s = "define_criteria" THEN "domain" ELSE "leaf"]
Results == {"pass", "fail", "cannot_verify"}

VARIABLES
  run,       \* [stage, node] of the row in harness.stage_runs, both None before the insert
  verdicts,  \* the rows in harness.verdicts: a set of [hash, result, row] (row: the insert number)
  latest,    \* the result of the last verdict row, or None
  outputs    \* the rows in harness.outputs: a set of [stage, node, row]
vars == <<run, verdicts, latest, outputs>>

Rows == Cardinality(verdicts) + Cardinality(outputs)
Recorded == run.stage # None

Init == run = [stage |-> None, node |-> None] /\ verdicts = {} /\ latest = None /\ outputs = {}

\* recordStageRun(): insert into harness.stage_runs. run_id is the primary key.
RecordStageRun(stage, node) ==
  /\ ~Recorded
  /\ run' = [stage |-> stage, node |-> node]
  /\ UNCHANGED <<verdicts, latest, outputs>>

\* writeVerdicts(): insert into harness.verdicts. run_id must name a stage run.
\* No check compares rule_hash with the lock, with harness.derived_rules, or with other rows.
WriteVerdict(hash, result) ==
  /\ Recorded
  /\ verdicts' = verdicts \cup {[hash |-> hash, result |-> result, row |-> Rows + 1]}
  /\ latest' = result
  /\ UNCHANGED <<run, outputs>>

\* insert into harness.outputs, by acceptOutput() or by plain SQL of harness_app.
\* The composite foreign key makes stage and node agree with the run.
\* No check reads harness.verdicts.
AcceptOutput(stage, node) ==
  /\ Recorded
  /\ Cardinality(outputs) < MaxOutputs
  /\ stage = run.stage /\ node = run.node
  /\ outputs' = outputs \cup {[stage |-> stage, node |-> node, row |-> Rows + 1]}
  /\ UNCHANGED <<run, verdicts, latest>>

Next ==
  \/ \E s \in Stages, n \in Nodes : RecordStageRun(s, n)
  \/ \E h \in Hashes, r \in Results : WriteVerdict(h, r)
  \/ \E s \in Stages, n \in Nodes : AcceptOutput(s, n)

Spec == Init /\ [][Next]_vars

\* Bounds the verdict rows, so that the model stays finite.
Bound == Cardinality(verdicts) <= 2

-----------------------------------------------------------------------------
(* The rules. *)

\* An output has the stage and the node of its run (store.tables).
OutputAgreesWithRun ==
  \A o \in outputs : o.stage = run.stage /\ o.node = run.node

\* A stage runs at a node of its level (graph.stages): define_criteria at a domain node,
\* create_pack at a leaf.
StageFitsNodeLevel ==
  Recorded => Level[run.node] = StageLevel[run.stage]

\* One rule version always means the same words (rule_record.lock): each verdict row of
\* one rule id and version names one hash.
OneVersionOneHash ==
  \A x, y \in verdicts : x.hash = y.hash

\* The graph accepts an output only when each strict rule in scope gives pass
\* (enforce.binding, rules.harness): the last verdict of the strict rule is pass.
AcceptedOnlyAfterStrictPass ==
  outputs # {} => latest = "pass"

\* The log has one row for each output item and each rule (enforce.audit).
OneVerdictPerTarget ==
  Cardinality(verdicts) <= 1

\* A run accepts one output, so that its verdicts answer "why did the graph accept this
\* output?" (enforce.audit). Inferred from store.tables, not stated as a rule.
OneOutputPerRun ==
  Cardinality(outputs) <= 1
=============================================================================
