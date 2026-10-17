# Hints from the linked issues, and phrases for the review
Tier: 2 · Status: open

## Owner's words and dialog

- 2026-10-17 the owner's words, snapshot origin/2026-10-17-owner-words.md:
  issue #239 on GitHub, its title and body as the owner filed them.
- The dialog in brief: the owner filed issue #239. It builds on #238
  (request hints-and-blocks): its R2 makes every finding a hint unless an
  exact rule blocks, and its R5 is the superseded-ADR rule. `al check` gains
  an option and new findings, so this is a promise change on path 2. The
  architect gave the organized requirement below, and asked the owner to
  sign it.

## Organized requirement

From issue #239. Each finding here is a hint in every mode (hints-and-blocks R2).

<!-- R1 from:2026-10-17-owner-words.md -->

### R1 Hints from the linked issues
With `al check --issues`, `al check` reads the GitHub issues that the `tasks:` of each open request name. It only reads, and it changes nothing on GitHub. It gives a hint for an issue when its body, or a comment that is not hidden, names a superseded ADR without the ADR that supersedes it, as in hints-and-blocks R5. It gives a hint when a bare `#n` is in an issue of a repository other than the request's own. It gives a hint when the issue is not a sub-issue of the request's own issue, where GitHub has sub-issues. It gives a hint when a phrase of R2 matches. Without `--issues`, `al check` reads no issue. When it cannot read an issue, it says so in a hint. Reading issues is optional: a project needs no GitHub issues, and every other check works the same without them.

<!-- R2 from:2026-10-17-owner-words.md -->

### R2 Phrases for the review
A project can list phrases or patterns in its configuration. `al check` gives a hint for each match in the specs and the request files, and with `--issues` in the issues, with the file or issue and the line. Origin files are exempt. The list is empty by default.

Out: blocking on any of these; writing to GitHub.

## Decisions

- D1, 2026-10-17. Source: the agent (architect), session prompt of developer-239, 2026-10-17. Read the issues with the GitHub CLI (`gh`), which the project already has for its own work. No new dependency and no token handling of our own. Tests use a fake `gh` on PATH, never the network.
- D2, 2026-10-17. Source: the agent (architect), session prompt of developer-239, 2026-10-17. Which issues: the issue references in each open request's `tasks:` entries (`ref`, and the forms `#n`, `owner/repo#n`, `<repo>#n` for a repo the config names, and issue URLs). Archived requests are history and are not read.
- D3, 2026-10-17. Source: the agent (architect), session prompt of developer-239, 2026-10-17. "The request's own issue" is the issue its origin source came from (its `url`). When a request has none, or when GitHub gives no sub-issue data for that repository, the sub-issue hint is not given, and the "Not known" line says why.
- D4, 2026-10-17. Source: the agent (architect), session prompt of developer-239, 2026-10-17. "Hidden" means a comment that GitHub shows as minimized.
- D5, 2026-10-17. Source: the agent (architect), session prompt of developer-239, 2026-10-17. When `gh` is missing, not logged in, or fails for an issue, `al check --issues` gives one hint for each issue that it did not read, with the reason, and the "Not known" line names it. It is not a refusal, because R1 is hints only.
- D6, 2026-10-17. Source: the agent (architect), session prompt of developer-239, 2026-10-17. R2's configuration is a list in `.assuredloop/config.yaml`; plain phrases match ignoring case; a pattern is a regular expression. An invalid pattern is a refusal with exit 2 that names it.
- D7, 2026-10-17. Source: the agent (architect), session prompt of developer-239, 2026-10-17. Use hints-and-blocks R5's code for "names a superseded ADR without its successor", so that the two rules cannot drift.
- D8, 2026-10-17. Source: the agent (architect), session prompt of developer-239, 2026-10-17. In the PR body, say what each changed spec paragraph said before and after.
