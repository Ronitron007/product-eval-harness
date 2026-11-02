------------------------------ MODULE NodeTree ------------------------------
(* The category tree in harness.nodes (store.tree, store.safety).
   Code:
     db/migrations/0001_harness_tables.sql   table harness.nodes, its checks, and the
                                              trigger nodes_check_path (harness.check_node_path)
     src/store/store.ts                       addNode()
   Each action is one SQL statement. Postgres runs a statement, with its checks and its
   before-insert trigger, as one indivisible step. harness_app has select and insert on
   harness.nodes only (db/migrations/0003_harness_role.sql). The table owner can also update. *)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
  Ids,          \* the node ids of the model, such as {"a", "b", "c"}
  OwnerUpdates  \* TRUE: the table owner also runs plain UPDATE statements on harness.nodes

None == "none"
Levels == {"domain", "inner", "leaf"}

VARIABLE nodes  \* id -> [parent |-> an id or None, level |-> a level, path |-> a sequence of ids]
vars == <<nodes>>

Paths == UNION {[1..n -> Ids] : n \in 1..Cardinality(Ids)}
Last(s) == s[Len(s)]
PathTaken(p) == \E j \in DOMAIN nodes : nodes[j].path = p
Put(id, rec) == [j \in DOMAIN nodes \cup {id} |-> IF j = id THEN rec ELSE nodes[j]]

\* The checks of the table, which Postgres runs on each insert and each update.
TableChecks(id, parent, level, path) ==
  /\ (parent = None) = (level = "domain")       \* check ((parent_id is null) = (level = 'domain'))
  /\ (parent = None) = (Len(path) = 1)          \* check ((parent_id is null) = (nlevel(path) = 1))
  /\ Last(path) = id                            \* check (subpath(path, -1)::text = id)
  /\ parent # None => parent \in DOMAIN nodes   \* parent_id references harness.nodes (id)

\* harness.check_node_path(). It fires before each insert, not before an update.
PathTrigger(id, parent, path) ==
  IF parent = None THEN path = <<id>>
  ELSE /\ parent \in DOMAIN nodes
       /\ nodes[parent].level # "leaf"
       /\ path = nodes[parent].path \o <<id>>

Init == nodes = [j \in {} |-> None]

\* insert into harness.nodes: addNode() of src/store/store.ts, or plain SQL of harness_app.
InsertNode(id, parent, level, path) ==
  /\ id \notin DOMAIN nodes                     \* primary key (id)
  /\ ~PathTaken(path)                           \* unique (path)
  /\ TableChecks(id, parent, level, path)
  /\ PathTrigger(id, parent, path)
  /\ nodes' = Put(id, [parent |-> parent, level |-> level, path |-> path])

\* update harness.nodes set level = ...  by the table owner. No trigger fires.
OwnerSetLevel(id, level) ==
  /\ OwnerUpdates
  /\ id \in DOMAIN nodes
  /\ level # nodes[id].level
  /\ TableChecks(id, nodes[id].parent, level, nodes[id].path)
  /\ nodes' = [nodes EXCEPT ![id].level = level]

\* update harness.nodes set parent_id = ...  by the table owner. No trigger fires.
OwnerSetParent(id, parent) ==
  /\ OwnerUpdates
  /\ id \in DOMAIN nodes
  /\ parent # nodes[id].parent
  /\ TableChecks(id, parent, nodes[id].level, nodes[id].path)
  /\ nodes' = [nodes EXCEPT ![id].parent = parent]

Next ==
  \/ \E id \in Ids, parent \in Ids \cup {None}, level \in Levels, path \in Paths :
       InsertNode(id, parent, level, path)
  \/ \E id \in Ids, level \in Levels : OwnerSetLevel(id, level)
  \/ \E id \in Ids, parent \in Ids \cup {None} : OwnerSetParent(id, parent)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* The rules. *)

\* A domain node is a root, and each other node has a parent.
DomainIsRoot ==
  \A j \in DOMAIN nodes : (nodes[j].parent = None) <=> (nodes[j].level = "domain")

\* The path of a node is the path of its parent plus its id (graph-store.md, store.safety).
PathAgreesWithParent ==
  \A j \in DOMAIN nodes :
    IF nodes[j].parent = None THEN nodes[j].path = <<j>>
    ELSE /\ nodes[j].parent \in DOMAIN nodes
         /\ nodes[j].path = nodes[nodes[j].parent].path \o <<j>>

\* A leaf has no child (graph.shape, store.safety).
NoChildUnderLeaf ==
  \A j \in DOMAIN nodes :
    nodes[j].parent # None => nodes[nodes[j].parent].level # "leaf"

\* subtree() of src/store/store.ts walks the ltree path (path <@ node path). It must give
\* the node and each node below it by parent links, so that a rule scoped to a node and its
\* descendants reaches each of them (graph.scope).
IsPrefix(p, q) == Len(p) <= Len(q) /\ SubSeq(q, 1, Len(p)) = p
RECURSIVE Below(_, _)
Below(n, k) ==
  IF k = 0 THEN {n}
  ELSE {n} \cup UNION {Below(c, k - 1) : c \in {j \in DOMAIN nodes : nodes[j].parent = n /\ j # n}}
WalkAgreesWithParents ==
  \A n \in DOMAIN nodes :
    {j \in DOMAIN nodes : IsPrefix(nodes[n].path, nodes[j].path)} = Below(n, Cardinality(Ids))
=============================================================================
