---------------------------- MODULE RuleVersions ----------------------------
(* The versions of one rule id: as a stage rule file in git with rules/rules.lock.json,
   and as derived rule rows in harness.derived_rules.
   Code:
     src/rules/schema.ts      RuleRecord: version >= 1, supersedes = version - 1
     src/rules/hash.ts        ruleHash(): covers statement, reason, kind, scope, binding, judge,
                              check and examples. Not id, version, owner, status, provenance.
     src/rules/load.ts        loadRuleLibrary(), lockNewVersions(), lockGrowthProblems()
     src/rules/cli.ts         rules:lock and rules:check [--base <lock>]
     .github/workflows/ci.yml rules:check --base <the lock of the base commit> on each PR
     db/migrations/0001_harness_tables.sql  harness.derived_rules: primary key (id, version),
                              key columns agree with the record, rows only grow
     src/store/store.ts       addDerivedRule()
   A stage rule changes by one PR at a time. MergeRulePR is the whole PR: edit the file, run
   rules:lock, run the CI check, and merge when the check exits 0. "words" stands for every
   field that ruleHash() covers except binding. The model leaves out the status of the file:
   ruleHash() does not cover it, so a status change changes no lock entry. *)
EXTENDS Naturals, FiniteSets

CONSTANTS
  StageVersions,    \* the versions of the stage rule file, such as 1..3
  DerivedVersions,  \* the versions of the derived rule rows, such as 1..2
  Words,      \* the possible words of the rule, such as {"w1", "w2"}
  Owners,     \* the possible owner nodes of a derived rule
  CiBase      \* TRUE: CI runs rules:check with --base, as .github/workflows/ci.yml does

Bindings == {"watch", "strict"}
Statuses == {"draft", "active", "retired"}

VARIABLES
  file,     \* the rule file on main: [v, words, binding], with v = 0 before the first merge
  lock,     \* the entries of the rule in rules/rules.lock.json on main: a set of [v, words, binding]
  derived   \* the rows of the rule in harness.derived_rules: a set of [v, words, binding, owner, status]
vars == <<file, lock, derived>>

Entry(v, w, b) == [v |-> v, words |-> w, binding |-> b]
InLock(L, v) == \E e \in L : e.v = v
Hash(L, v) == CHOOSE e \in L : e.v = v

Init ==
  /\ file = [v |-> 0, words |-> "none", binding |-> "none"]
  /\ lock = {}
  /\ derived = {}

\* lockNewVersions(): add the version of the file when the lock lacks it and the file has no
\* other problem. The only other problem here: supersedes names a version that the lock lacks.
Relock(L, v, w, b) ==
  IF InLock(L, v) \/ (v > 1 /\ ~InLock(L, v - 1)) THEN L ELSE L \cup {Entry(v, w, b)}

\* loadRuleLibrary() with the base lock: no problem for the file and the lock.
CheckPasses(f, L, base) ==
  /\ InLock(L, f.v)
  /\ Hash(L, f.v) = Entry(f.v, f.words, f.binding)            \* the words did not change
  /\ f.v > 1 => InLock(L, f.v - 1)                             \* supersedes is in the lock
  /\ CiBase => base \subseteq L                                \* lockGrowthProblems()

\* A PR sets the rule file, runs rules:lock, and merges when rules:check exits 0.
MergeRulePR(v, w, b) ==
  LET f == [v |-> v, words |-> w, binding |-> b]
      L == Relock(lock, v, w, b)
  IN /\ f # file
     /\ CheckPasses(f, L, lock)
     /\ file' = f
     /\ lock' = L
     /\ UNCHANGED derived

\* A PR that edits the lock by hand: it drops an entry, or changes the words of an entry.
MergeLockEdit(e, w) ==
  LET L == IF w = e.words THEN lock \ {e} ELSE (lock \ {e}) \cup {[e EXCEPT !.words = w]}
  IN /\ e \in lock
     /\ CheckPasses(file, L, lock)
     /\ lock' = L
     /\ UNCHANGED <<file, derived>>

\* addDerivedRule(): insert into harness.derived_rules. The primary key (id, version) is the
\* only check across rows. RuleRecord asks supersedes = version - 1, but no code reads that row.
AddDerivedRule(v, w, o, s) ==
  /\ ~\E r \in derived : r.v = v
  /\ derived' = derived \cup {[v |-> v, words |-> w, binding |-> "watch", owner |-> o, status |-> s]}
  /\ UNCHANGED <<file, lock>>

Next ==
  \/ \E v \in StageVersions, w \in Words, b \in Bindings : MergeRulePR(v, w, b)
  \/ \E e \in lock, w \in Words : MergeLockEdit(e, w)
  \/ \E v \in DerivedVersions, w \in Words, o \in Owners, s \in Statuses : AddDerivedRule(v, w, o, s)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* The rules. *)

\* The rule file on main has the words that the lock holds for its version (rule_record.lock).
FileMatchesLock ==
  file.v > 0 => InLock(lock, file.v) /\ Hash(lock, file.v) = Entry(file.v, file.words, file.binding)

\* The lock only grows: no merge drops an entry or changes its hash (rule_record.lock).
LockOnlyGrows == [][lock \subseteq lock']_vars

\* Each new version supersedes the version before it (enforce.rule_record): no version skips one.
LockSkipsNoVersion ==
  \A e \in lock : e.v > 1 => InLock(lock, e.v - 1)

\* A new rule version starts as watch only. Rohan promotes it out of watch (rules.harness,
\* enforce.change). The hash covers binding, so the promotion is a new version with the same words.
NewVersionStartsWatch ==
  \A e \in lock :
    \/ e.binding = "watch"
    \/ e.v > 1 /\ InLock(lock, e.v - 1)
               /\ Hash(lock, e.v - 1).binding = "watch"
               /\ Hash(lock, e.v - 1).words = e.words

\* The same rule for derived rules: no version skips one.
DerivedSkipsNoVersion ==
  \A r \in derived : r.v > 1 => \E q \in derived : q.v = r.v - 1

\* One rule has one owner, so two nodes cannot hold two versions of it (enforce.rule_record).
DerivedHasOneOwner ==
  \A r, q \in derived : r.owner = q.owner

\* Readers see active rules only (enforce.rule_record). A new version replaces the old one,
\* so at most one version of a rule is active.
DerivedHasOneActiveVersion ==
  Cardinality({r \in derived : r.status = "active"}) <= 1

\* One id names one rule, and one version means the same words (rule_record.lock): a stage rule
\* and a derived rule with the same id and version have the same hash.
IdNamesOneRule ==
  \A r \in derived :
    InLock(lock, r.v) => Hash(lock, r.v) = Entry(r.v, r.words, r.binding)
=============================================================================
