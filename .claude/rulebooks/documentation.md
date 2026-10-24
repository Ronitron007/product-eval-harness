# Documentation `rules.documentation`

- The docs of the harness live in this repo, in `docs/`. Start at the docs hub, `docs/README.md`.

- Give each doc one kind:

  - Evergreen, in `docs/design/`, `docs/canvas/`, or the `docs/` root. It changes with the code.

  - Dated, in `docs/research/` and `docs/plans/`. Start its file or folder name with `YYYY-MM-DD-`. After it ships, change only its stamp lines.

- Keep each fact in one file, and link to it from other places. A board holds names and pointers. A doc holds the prose.

- Give each term one definition in `docs/glossary.md`. Link each use of the term to it.

- When a design ships, move its content into the evergreen doc and board.

- Ship each mechanism change with a docs PR that updates the doc and the board. Name the docs PR after the code PR.

- Put a code stamp on each evergreen doc and board. It gives the `main` SHA that you verified against, the date, and the code paths. For code in another repo, give the SHA and the branch of that repo.

- Make each diagram a text file in git. Use Mermaid inside a doc. A board in `docs/canvas/` is a JSON Canvas file.

- Use the names from the code and verbatim excerpts. Inside `docs/`, use relative markdown links, never wikilinks. Link to code in another repo with a GitHub URL pinned to a commit SHA.

- Record each design decision as one row in `docs/decisions.tsv`: date, decision, why, evidence, result. Say who made each ruling, and when. This trail outranks other docs.

- Keep `CLAUDE.md` and `AGENTS.md` routing indexes. When you add a topic doc, add its routing row in the same PR.

- Before you say that a thing has no doc, search all of `docs/`.

- This repo is public. A doc holds no secret, API key, database id, customer data, or personal data.

- For style, names, boards, and reviews, follow `rules.writing`, `rules.naming`, `rules.replies`, and `rules.agents`.
