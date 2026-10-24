# Git and PRs `rules.git_prs`

- Make a new branch for each feature, fix, or chore. Name it `<name>/<descriptor>` with your own short name, for example `rohan/`.

- `main` is the integration branch of this repo. Never commit directly to `main`. Branch from `main` and open PRs against it.

- Use the GitHub CLI (`gh`). Merge with a merge commit, so that cited SHAs stay reachable.

- Put a code change and its docs in two PRs.

- A docs PR changes only files under `docs/`. Merge it at once with a merge commit, with no CI wait and no review gate. Put `[skip ci]` in each of its commit messages and in the merge commit subject. Prompt, rulebook, and skill `.md` files are code, not docs. Code commits never carry `[skip ci]`.

- For stacked PRs, base each PR on the branch of its parent. After the parent merges, run `gh pr edit <n> --base main`. Then merge.

- After you open a PR, run `gh pr list --state open` and report the count.

- End commits and PR text with the attribution lines that your agent harness gives.

- This repo is public. Before each commit, make sure that no file holds secrets, keys, database ids, customer data, or personal data. Commit with a GitHub noreply email address.
