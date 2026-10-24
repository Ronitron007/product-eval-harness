# Naming `rules.naming`

- Refer to a thing by its name, never by its number. Do not write "step 4", "doc 03", "section 11", or "rule 5". List numbers are local to one reply.

- Use dotted, code-like snake_case names. A name is the short name of the doc plus words from its heading, such as `graph.nodes` or `enforce.binding`. Name rules (`rules.pack_binding`) and stages (`define_criteria`, `create_node`, `create_pack`).

- The harness keeps its name map in `harness.names`, in `docs/design/README.md`. Add each new name there.

- Put the name of a heading in backticks and give the heading no number: ``## What ships `build.outcome` ``. File names keep numbers only because links use them. Never say the number.

- Use an id only when the team agreed on it and it is stable. Examples are Notion refs (EH1 to EH12) and rule ids that a committed ruleset defines.

- Name a new thing once. Then use that exact name every time.

- Write a PR reference as a full link: `[owner/repo#n](https://github.com/owner/repo/pull/n)`.
