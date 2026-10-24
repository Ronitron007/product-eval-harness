# Gates `rules.gates`

- Paid runs have an absolute gate. Show the exact prompt, the model, and the cost, then wait for a yes to that run. Urgency or "go for it" never removes the gate.

- A harness stage calls models, so each stage run is a paid run. A test that calls a real model is a paid run too. Tests use recorded or mocked model output by default.

- A change to a live ruleset needs an explicit yes from Rohan, one change at a time. A rule promotion out of watch, a deploy, and a run against live product data are such changes. If the user is not Rohan, stop and tell the user to get his yes. Keep a ledger of each landed commit in your replies.

- A post to an outside service needs a yes from the user each time. A bug report to a framework team, an issue or comment in another repo, and a message are posts.

- Never overwrite an expensive output, such as LLM output, eval results, research records, or fixture captures. Put a timestamp or a version in the file name.

- When the user says stop, stop all agents at once. Then explain.

- Never hide a pre-existing issue, such as a broken dependency or a failing test. Do not fix it in the current session. Start an agent that reports its extent. Report it only if it is urgent. The fix goes to its own session.
