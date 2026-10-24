# Writing `rules.writing`

- Write docs, READMEs, and PR text in ASD-STE100 Simplified Technical English (STE). In replies, use STE only when the user asks for it or presses for an explanation.

- To write STE, load the `ste-writing` skill, draft, and lint with `python3 ~/.claude/skills/ste-writing/ste-lint.py <file>`. Without the skill, apply the rules below.

- Use active voice, simple tenses, and articles. Define each term the first time.

- Write a maximum of 20 words in an instruction and 25 in a description. Write a maximum of 6 sentences in a paragraph, with one topic.

- Write one instruction in each sentence, in command form.

- Use no semicolons, contractions, long dashes, or mid-sentence colons. A colon before a list is correct.

- Use vertical lists with one action in each item. Put a condition before its command. In files, put a blank line between list items. The linter counts a list with no blank lines as one paragraph.
