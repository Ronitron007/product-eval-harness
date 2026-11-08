----------------------------- MODULE VerdictLog -----------------------------
(* One stage run, its drafts, its verdict rows, the decision of a person, its run end, and its
   accepted output in the graph store.
   Code:
     db/migrations/0001_harness_tables.sql   harness.stage_runs, harness.verdicts (foreign key
                                              to its run), harness.outputs (composite foreign key
                                              to the stage, node and rule set hash of its run),
                                              and the append-only triggers
     db/migrations/0004_stage_runs.sql       harness.drafts, harness.person_decisions,
                                              harness.run_ends, the round of harness.verdicts and
                                              harness.outputs, their keys and checks, and the
                                              triggers verdicts_open, person_decisions_open,
                                              run_ends_check and outputs_check
     src/store/store.ts                       recordStageRun(), addDraft(), writeVerdicts(),
                                              addDecision(), endRun(), acceptOutput()
   Each action is one insert that the database lets through. endRun() inserts the run end and
   the output in one transaction. The model takes the two inserts as two steps, which also
   covers a plain insert of an output by harness_app.
   The model has one run, one strict rule (version 1), and one target of that rule. So the
   unique key of harness.verdicts (run, round, rule, version, target) lets one row into each
   round. Rows only grow, so no action removes or changes a row. *)
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
\* stage.budget_in_db: the checks of harness.drafts.round and harness.verdicts.round.
Rounds == 1..3
Choices == {"accept", "reject"}
Ends == {"accepted", "person_accepted", "person_rejected"}
Accepting == {"accepted", "person_accepted"}

VARIABLES
  run,       \* [stage, node] of the row in harness.stage_runs, both None before the insert
  drafts,    \* the rounds of the rows in harness.drafts
  verdicts,  \* the rows in harness.verdicts: a set of [hash, result, round, row] (row: the insert number)
  decision,  \* the row in harness.person_decisions: [round, choice], round 0 and choice None before the insert
  ended,     \* the row in harness.run_ends: [round, kind], round 0 and kind None before the insert
  outputs    \* the rows in harness.outputs: a set of [stage, node, round, row]
vars == <<run, drafts, verdicts, decision, ended, outputs>>

Rows == Cardinality(verdicts) + Cardinality(outputs)
Recorded == run.stage # None

Init ==
  /\ run = [stage |-> None, node |-> None]
  /\ drafts = {}
  /\ verdicts = {}
  /\ decision = [round |-> 0, choice |-> None]
  /\ ended = [round |-> 0, kind |-> None]
  /\ outputs = {}

\* recordStageRun(): insert into harness.stage_runs. run_id is the primary key.
RecordStageRun(stage, node) ==
  /\ ~Recorded
  /\ run' = [stage |-> stage, node |-> node]
  /\ UNCHANGED <<drafts, verdicts, decision, ended, outputs>>

\* addDraft(): run_id references the run, and (run_id, round) is the primary key.
AddDraft(r) ==
  /\ Recorded
  /\ r \notin drafts
  /\ drafts' = drafts \cup {r}
  /\ UNCHANGED <<run, verdicts, decision, ended, outputs>>

\* writeVerdicts(rows, round): (run_id, round) references a draft. The trigger verdicts_open
\* refuses a row after the run end. The unique key leaves out the rule hash, and no check
\* compares rule_hash with the lock, with harness.derived_rules, or with other rows.
WriteVerdict(hash, result, r) ==
  /\ r \in drafts
  /\ ended.kind = None
  /\ ~(\E v \in verdicts : v.round = r)
  /\ verdicts' = verdicts \cup {[hash |-> hash, result |-> result, round |-> r, row |-> Rows + 1]}
  /\ UNCHANGED <<run, drafts, decision, ended, outputs>>

\* addDecision(): one row for each run (primary key run_id), with a draft of its round. The
\* trigger person_decisions_open refuses a row after the run end.
AddDecision(choice, r) ==
  /\ r \in drafts
  /\ decision.choice = None
  /\ ended.kind = None
  /\ decision' = [round |-> r, choice |-> choice]
  /\ UNCHANGED <<run, drafts, verdicts, ended, outputs>>

\* The insert of the run end by endRun(): one row for each run (primary key run_id), with a
\* draft of its round. The trigger run_ends_check: accepted needs a strict row of its round,
\* each strict row of its round pass, and no decision. A person end needs the equal decision.
EndRun(kind, r) ==
  /\ r \in drafts
  /\ ended.kind = None
  /\ \/ /\ kind = "accepted"
        /\ \E v \in verdicts : v.round = r
        /\ \A v \in verdicts : v.round = r => v.result = "pass"
        /\ decision.choice = None
     \/ /\ kind = "person_accepted"
        /\ decision = [round |-> r, choice |-> "accept"]
     \/ /\ kind = "person_rejected"
        /\ decision = [round |-> r, choice |-> "reject"]
  /\ ended' = [round |-> r, kind |-> kind]
  /\ UNCHANGED <<run, drafts, verdicts, decision, outputs>>

\* The insert of the output, by endRun() or by plain SQL of harness_app. The composite foreign
\* key makes stage and node agree with the run. outputs.run_id is unique. The trigger
\* outputs_check needs an accepting run end of the same round.
AcceptOutput(stage, node, r) ==
  /\ Recorded
  /\ Cardinality(outputs) < MaxOutputs
  /\ stage = run.stage /\ node = run.node
  /\ outputs = {}
  /\ ended.kind \in Accepting /\ ended.round = r
  /\ outputs' = outputs \cup {[stage |-> stage, node |-> node, round |-> r, row |-> Rows + 1]}
  /\ UNCHANGED <<run, drafts, verdicts, decision, ended>>

Next ==
  \/ \E s \in Stages, n \in Nodes : RecordStageRun(s, n)
  \/ \E r \in Rounds : AddDraft(r)
  \/ \E h \in Hashes, x \in Results, r \in Rounds : WriteVerdict(h, x, r)
  \/ \E c \in Choices, r \in Rounds : AddDecision(c, r)
  \/ \E k \in Ends, r \in Rounds : EndRun(k, r)
  \/ \E s \in Stages, n \in Nodes, r \in Rounds : AcceptOutput(s, n, r)

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

\* The graph accepts an output when each strict rule in scope gives pass (enforce.binding).
\* When the repair budget is spent, a person decides (decisions.tsv, 2026-10-24). So the round
\* of an accepted output has a strict verdict, and each strict verdict of that round is pass,
\* or a person decided to accept that round (stage.round_rows, stage.decision_first).
AcceptedAfterPassOrPerson ==
  \A o \in outputs :
    \/ /\ \E v \in verdicts : v.round = o.round
       /\ \A v \in verdicts : v.round = o.round => v.result = "pass"
    \/ decision = [round |-> o.round, choice |-> "accept"]

\* The log has one row for each output item and each rule (enforce.audit). A repair loop of
\* up to 3 rounds judges one target once in each round, so two rows of one target must name
\* two rounds.
OneVerdictPerTargetAndRound ==
  \A x, y \in verdicts : x # y => x.round # y.round

\* A run accepts one output, so that its verdicts answer "why did the graph accept this
\* output?" (enforce.audit). Inferred from store.tables, not stated as a rule.
OneOutputPerRun ==
  Cardinality(outputs) <= 1
=============================================================================
