----------------------------- MODULE HarnessRun -----------------------------
(* One stage run of the harness, as the design states it on main f0bfed8 (2026-11-08).
   Sources:
     docs/design/mastra-mapping.md  mastra.stage_workflow: .dountil(draft, judge) with
                                    errors.length === 0 || iterationCount >= REPAIR_BUDGET,
                                    then person (suspends when a strict verdict is not pass),
                                    then assimilate (writes the output)
     docs/design/compiler.md        compile.usage.calls: planFor compiles again in each step
                                    that needs the plan, and refuses a hash that differs;
                                    the decode gate; code scorers, then judges or skippedJudges;
                                    a failed decode is a strict failure that goes to repair
     docs/design/rule-enforcement.md enforce.binding, enforce.repair
     src/compiler/scorers.ts        the judge scorer (built): yes, no, unknown, or a failed call
                                    give pass, fail, cannot_verify; the quote goes into the
                                    reason text, and no code looks for it in the sources
     @mastra/core 1.79.0            executeLoop: iterationCount is 1 after the first pass
   Scope: one strict shape rule (the unit) and one judgement rule, strict or soft.
   The model leaves out: research, the content of a draft, many items, watch rules,
   two runs at the same time, and the store tables (VerdictLog covers them). *)
EXTENDS Naturals

CONSTANT Budget  \* REPAIR_BUDGET, the number of drafts that one run may make

Bindings == {"strict", "soft"}
Answers == {"yes", "no", "unknown", "call_fails"}
Terminal == {"accepted", "accepted_by_reviewer", "rejected", "refused"}

VARIABLES
  phase,         \* "context", "draft", "judge", "decide", "suspended", or a Terminal phase
  round,         \* the number of drafts so far
  judgeBinding,  \* the binding of the judgement rule, fixed for the run
  shapeOk,       \* the last draft gives the shape rule a value that fits it
  extraKey,      \* the last draft has a key that no rule owns
  fits,          \* the last draft passes the decode gate
  shapeRow,      \* verdict row of the shape rule: "none", "pass", "fail"
  judgeRow,      \* verdict row of the judgement rule: "none", "pass", "fail", "cannot_verify"
  judged,        \* a judge model ran on the last draft
  quoteFound,    \* the quote of the judge's answer is in the sources
  errors,        \* the next round gets errors: a strict fail or a decode issue
  rulesChanged   \* a rule change merged after the run recorded its hash

vars == <<phase, round, judgeBinding, shapeOk, extraKey, fits, shapeRow, judgeRow,
          judged, quoteFound, errors, rulesChanged>>

StrictOpen == shapeRow # "pass" \/ (judgeBinding = "strict" /\ judgeRow # "pass")

Init ==
  /\ phase = "context"
  /\ round = 0
  /\ judgeBinding \in Bindings
  /\ shapeOk = TRUE /\ extraKey = FALSE /\ fits = TRUE
  /\ shapeRow = "none" /\ judgeRow = "none"
  /\ judged = FALSE /\ quoteFound = TRUE
  /\ errors = FALSE
  /\ rulesChanged = FALSE

\* The context step: planFor compiles the rules, and recordStageRun keeps their hash.
RecordRun ==
  /\ phase = "context"
  /\ phase' = "draft"
  /\ UNCHANGED <<round, judgeBinding, shapeOk, extraKey, fits, shapeRow, judgeRow, judged, quoteFound, errors, rulesChanged>>

\* The draft step compiles again. planFor throws when the hash differs from the hash of the run.
DraftRefused ==
  /\ phase = "draft" /\ rulesChanged
  /\ phase' = "refused"
  /\ UNCHANGED <<round, judgeBinding, shapeOk, extraKey, fits, shapeRow, judgeRow, judged, quoteFound, errors, rulesChanged>>

\* The drafter replies. Any reply can come back.
Draft ==
  /\ phase = "draft" /\ ~rulesChanged
  /\ round' = round + 1
  /\ shapeOk' \in BOOLEAN
  /\ extraKey' \in BOOLEAN
  /\ phase' = "judge"
  /\ UNCHANGED <<judgeBinding, fits, shapeRow, judgeRow, judged, quoteFound, errors, rulesChanged>>

\* The judge step compiles again too.
JudgeRefused ==
  /\ phase = "judge" /\ rulesChanged
  /\ phase' = "refused"
  /\ UNCHANGED <<round, judgeBinding, shapeOk, extraKey, fits, shapeRow, judgeRow, judged, quoteFound, errors, rulesChanged>>

\* The decode gate and the code scorers. The shape scorer checks only its own field, so an
\* extra key breaks the decode gate and gives no fail row. The judges run only when the draft
\* decoded and the strict code check passed; otherwise skippedJudges writes cannot_verify.
\* The judge's answer carries a quote, and the built scorer does not look for it in the sources.
Check ==
  /\ phase = "judge" /\ ~rulesChanged
  /\ LET f == shapeOk /\ ~extraKey
         s == IF shapeOk THEN "pass" ELSE "fail"
     IN /\ fits' = f
        /\ shapeRow' = s
        /\ IF f /\ s = "pass"
             THEN \E a \in Answers, q \in BOOLEAN :
                    /\ judged' = TRUE
                    /\ judgeRow' = CASE a = "yes" -> "pass" [] a = "no" -> "fail" [] OTHER -> "cannot_verify"
                    /\ quoteFound' = (IF a \in {"yes", "no"} THEN q ELSE TRUE)
             ELSE /\ judged' = FALSE
                  /\ judgeRow' = "cannot_verify"
                  /\ quoteFound' = TRUE
        /\ errors' = (s = "fail" \/ ~f \/ (judgeBinding = "strict" /\ judgeRow' = "fail"))
  /\ phase' = "decide"
  /\ UNCHANGED <<round, judgeBinding, shapeOk, extraKey, rulesChanged>>

\* The .dountil condition: loop again while errors remain and the budget is not spent.
Repair ==
  /\ phase = "decide" /\ errors /\ round < Budget
  /\ phase' = "draft"
  /\ UNCHANGED <<round, judgeBinding, shapeOk, extraKey, fits, shapeRow, judgeRow, judged, quoteFound, errors, rulesChanged>>

\* The loop ends. The person step suspends when a strict verdict is not pass.
Suspend ==
  /\ phase = "decide" /\ (~errors \/ round >= Budget) /\ StrictOpen
  /\ phase' = "suspended"
  /\ UNCHANGED <<round, judgeBinding, shapeOk, extraKey, fits, shapeRow, judgeRow, judged, quoteFound, errors, rulesChanged>>

\* Otherwise the person step passes through, and assimilate writes the output.
Accept ==
  /\ phase = "decide" /\ (~errors \/ round >= Budget) /\ ~StrictOpen
  /\ phase' = "accepted"
  /\ UNCHANGED <<round, judgeBinding, shapeOk, extraKey, fits, shapeRow, judgeRow, judged, quoteFound, errors, rulesChanged>>

\* A reviewer resumes the run. Neither the person step nor assimilate needs the plan,
\* so no step compiles again on this path.
ReviewerAccepts ==
  /\ phase = "suspended"
  /\ phase' = "accepted_by_reviewer"
  /\ UNCHANGED <<round, judgeBinding, shapeOk, extraKey, fits, shapeRow, judgeRow, judged, quoteFound, errors, rulesChanged>>

ReviewerRejects ==
  /\ phase = "suspended"
  /\ phase' = "rejected"
  /\ UNCHANGED <<round, judgeBinding, shapeOk, extraKey, fits, shapeRow, judgeRow, judged, quoteFound, errors, rulesChanged>>

\* Rohan merges a change to the rules while the run is open.
ChangeRules ==
  /\ phase \notin Terminal \cup {"context"} /\ ~rulesChanged
  /\ rulesChanged' = TRUE
  /\ UNCHANGED <<phase, round, judgeBinding, shapeOk, extraKey, fits, shapeRow, judgeRow, judged, quoteFound, errors>>

Done == phase \in Terminal /\ UNCHANGED vars

Next ==
  \/ RecordRun \/ DraftRefused \/ Draft \/ JudgeRefused \/ Check
  \/ Repair \/ Suspend \/ Accept \/ ReviewerAccepts \/ ReviewerRejects
  \/ ChangeRules \/ Done

Spec == Init /\ [][Next]_vars

\* The rules that the design states.
RepairBudget == round <= Budget                                       \* enforce.repair
JudgeOnlyAfterCode == judged => (fits /\ shapeRow = "pass")           \* enforce.deciders
EveryRuleHasARow == phase = "decide" => (shapeRow # "none" /\ judgeRow # "none")  \* mastra.stage_workflow
SoftNeverBlocks ==                                                    \* enforce.binding
  /\ (phase = "draft" /\ round > 0) => errors
  /\ phase = "suspended" => StrictOpen
AutoAcceptOnlyWhenStrictPass == phase = "accepted" => ~StrictOpen      \* enforce.binding
BrokenSchemaNeverAccepted == phase = "accepted" => fits               \* scorers.closed_output
BrokenSchemaNeverLandsByReviewer == phase = "accepted_by_reviewer" => fits  \* scorers.closed_output
JudgeVerdictRestsOnQuote == (phase = "decide" /\ judged /\ judgeRow \in {"pass", "fail"}) => quoteFound  \* mastra_ref: verdict, reason, quote
ResumeAfterRuleChangeRefuses == phase = "accepted_by_reviewer" => ~rulesChanged    \* compile.usage

=============================================================================
