# Agents and build process `rules.agents`

- Look Before You Build. Before a spec or a big engineering step, find what already does a similar thing. Look at packages, open-source projects, SDKs, services, and our own code. Record that research in the session scratchpad, always. Tell the user only if it matters.

- Build from scratch only with a recorded reason. A maintained package is the default choice. Try the smallest change that works first.

- Commit the spec and the plan before any code. The recorded decisions trail (for example `decisions.tsv`) outranks other specs and PRs. An outside spec is a source of parts, never the authority.

- One plan unit is one PR, with a check that can fail.

- Opus implements. A fresh Opus adversarial reviewer, never the implementer, reviews each unit. Fable has no role now. A unit merges only when its checks pass and no finding is open. After each fix round, a short verify confirms the fixes.

- Each agent brief carries these items:

  - The base SHA, with "reset if HEAD differs".

  - The branch, the files to read, and the check that closes the unit.

  - "Commit only when every exit code is 0. Push normally, never force-push."

  - "Add one PR comment that maps each finding to its commit."

  - A word cap for the report, and the Look Before You Build rule.

- Tell agents not to start background sub-delegates. A sub-delegate stops in a "waiting" state.

- Use one writer per worktree. Put manual worktrees at `.worktrees/<branch>`, excluded through `.git/info/exclude`.

- Give each agent its own scratchpad subfolder. The filesystem ignores letter case.

- If HTTP 429 or a DNS failure stops an agent, check `git status` in its worktree. Then resume the agent with SendMessage.
