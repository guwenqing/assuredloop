<!-- SP-1 note -->

# Hints from the linked issues, and phrases for the review: the change spec

<!-- SP-2 note -->

This change serves R1 and R2 in `request.md`. It changes DES-22, DES-52,
DES-58 and DES-72 in `specs/design.md`. It adds paragraphs to it on the
hints from the linked issues (section 8) and on the phrases for the review
(section 3). Each section has the promise paragraphs first, then
the design that keeps them.

<!-- SP-3 note -->

## Hints from the linked issues

<!-- SP-4 rule serves:R1 -->

**Hints from the linked issues.** With `al check --issues`, `al check` reads
the GitHub issues that the `tasks:` of each open request name. It only
reads, and it changes nothing on GitHub. An issue's text is its body and
each comment that GitHub does not show as minimized (hidden). For each issue
that it reads, it gives a hint:
- `issue-superseded`: the issue's text names a superseded ADR without the
  ADR that supersedes it, by the rule of hints-and-blocks R5 (schema.md 5):
  in the same marker for a link, in the same paragraph for a word;
- `issue-bare-ref`: the issue's text holds a bare `#n`, and the issue is in
  a repository other than the request's own;
- `issue-not-sub`: the issue is not a sub-issue of the request's own issue,
  where GitHub gives sub-issue data;
- `phrase`: a phrase or pattern of the config matches the issue's text
  ("Phrases for the review", section 3).

<!-- SP-5 rule serves:R1 -->

When it cannot read an issue, it gives the hint `issue-unread` with the
reason, and the `Not known` line names the issue. Each of these is a hint in
every mode; none is `not ok`. Without `--issues`, `al check` reads no issue.
Archived requests are history, and their issues are not read.

<!-- SP-6 rule serves:R1 changes:DES-52 -->

- A task is optional. Where a project uses tasks, a task has an ID and a
  reference: a line in a file of the request, an issue number, a tracker key
  or URL, or a title only.
- The chain holds the reference only. `al` keeps no task status. It reads
  an outside tracker only in `al check --issues`, which reads the GitHub
  issues that the references name, for hints (below). Git shows which PRs
  name the task and whether they merged.
- Change-only paragraphs belong to their request by default. A plan needs no
  task node.
- One way of working that the tool supports and does not enforce (input 136):
  a `tasks.md` in the request holds the definite list of tasks (T1, T2...);
  issues for the developers each summarize one or more tasks. The chain is
  R → task → issue → PR → outputs; several tasks may share one issue.
- Hints only, and only where the project uses tasks: a PR with no task in an
  epic; an R that no task delivers; a task that delivers no R.
- The context and the outcome never claim that a merged task or a reconciled
  spec proves the work complete. They show the evidence and what is unknown.

<!-- SP-7 rule serves:R1 changes:DES-58 -->

- `.assuredloop/schema.yaml`: the schema, with a version. The owner and the
  architect design it. A user's extension gets the same careful review.
- `.assuredloop/records/`, committed to git:
  - one record per request: the chain of that change, its bindings (section
    4) and its dispositions (section 5). Mostly that change's own PRs touch
    it.
  - one record per doc: only fields that the script can regenerate (hash
    list, display numbers, derived change kinds), and the AI hints where a
    project uses them.
- On a merge conflict in a per-doc record: run the index again to rebuild the
  regenerable fields. Conflicting optional AI hints may be dropped and shown
  as absent; no AI refresh is required. Bindings are never in a per-doc
  record, so a re-run cannot erase them.
- The developer's agent writes the markers in the PR, and the review reads
  them (input 98). The script writes the derived facts.
- AI hints and declared outputs are optional. A PR never needs them. A
  project fills AI hints only where it uses search level 2 or higher. Why: in
  validation, no AI hint changed a verdict; their own cost was not measured
  (validation.md section 9).
- **AI hints** (summaries, tags, quotes):
  - Each hint records the paragraph hash it was made from. A hint is stale
    when the paragraph's hash differs, even if its quote still matches: a
    kept sentence does not keep the rest of a summary true.
  - Where a project uses hints, the agent refreshes them only for paragraphs
    that the PR changed. An empty or missing hint is an honest state, not a
    defect.
- The kinds and the declared links are checked data, in the limited sense of
  section 3. The AI summaries and tags are hints (input 123).
- Checks give the review hints, and the review decides. The few exact rules
  of section 3 are `not ok`. A project that wants them to block turns on
  `--strict` in its CI, and the README advises it (input 123).
- The core checks stay deterministic: no AI, network or database calls.
  Only `al check --issues` reads the network, through `gh`, and only when
  it is asked to (section 8).

<!-- SP-8 data serves:R1 builds-on:SP-4 -->

**Which issues.** `al check --issues` reads the `ref` of each task in the
record of each open request. A `ref` may name several issues, in these
forms:
- `#n`: issue n of the request's own repository;
- `owner/repo#n`: issue n of that GitHub repository;
- `<name>#n`: issue n of a repository that the config names: an `outputs:`
  entry with that name, or `central` in an output repo. Its GitHub
  repository is the one that `gh` names for the folder of its `path`;
- `https://github.com/owner/repo/issues/n`: that issue.

<!-- SP-9 data serves:R1 builds-on:SP-4 -->

Other text in a `ref` names no issue. An issue that several tasks name is
read once. The request's own repository is the GitHub repository that `gh`
names for this checkout, the repo that holds the request.

<!-- SP-10 data serves:R1 builds-on:SP-4 -->

**The request's own issue** is the issue that the `url` of an origin source
of the request names: the first entry of `sources:` in its record whose
`url` is an issue URL or `owner/repo#n`. When no source names one, the
`issue-not-sub` hint is not given for that request's issues, and the
`Not known` line says so. The request's own issue itself gets no
`issue-not-sub`.

<!-- SP-11 interface serves:R1 builds-on:SP-4 -->

**How `al` reads an issue.** It runs the GitHub CLI `gh`, with
`GH_PROMPT_DISABLED=1` so that `gh` asks no question, and a time limit
of 60 seconds for each call:
- `gh repo view --json nameWithOwner`, in this checkout and in the folder of
  each repository that a `<name>#n` names, for its `owner/repo`;
- `gh issue view <n> --repo <owner/repo> --json number,url,body,comments,parent`
  for each issue. `parent` is the issue whose sub-issue it is, or null.
  `comments` holds each comment's `body`, `isMinimized` and `url`.

<!-- SP-12 interface serves:R1 builds-on:SP-4 -->

When `gh` refuses the field `parent` (its error names it), `al` runs the
same call again without `parent`. Then GitHub gives no sub-issue data for
that repository: the `issue-not-sub` hint is not given for its issues, and
the `Not known` line says so. When `gh` is not installed, is not logged in,
or fails or times out for an issue, that issue gets one `issue-unread` hint
with the reason (the first line of what `gh` wrote), and is not read.
When `gh repo view` fails for this checkout, each `#n` issue gets
`issue-unread`, the `issue-bare-ref` check is not made, and the
`Not known` line says so.

<!-- SP-13 interface serves:R1 builds-on:SP-4 -->

**What the hints show.** A hint in an issue's body is at
`<owner>/<repo>#<n>:<line>`; a hint in a comment is at
`<owner>/<repo>#<n>/comment-<k>:<line>`, where k counts all the issue's
comments from 1, the hidden ones too. Its ID is `<request>/<task>`, for the
first task that names the issue. `issue-not-sub` is given once for each
request and issue. `al check --issues` adds the line
`info issues - - read <r> of <t> issues that the tasks of the open requests name`.
Without `--issues`, when the tasks of an open request name an issue, the
`Not known` line says that the issues were not read, and that
`al check --issues` reads them.

<!-- SP-14 data serves:R1 builds-on:SP-4 -->

A bare `#n` is `#` and digits that come after no letter, digit, `_`, `-`,
`/`, `#` or `&`. GitHub reads it as an issue of the repository where it is
written. So in an issue of another repository it points to that
repository's issue n, not to the request's.

<!-- SP-15 rationale explains:SP-11 -->

Why `gh`: the project already has it for its own work. It needs no new
dependency, and `al` handles no token of its own (issue-hints D1). The
tests use a fake `gh` on PATH, not the network. The code of the
superseded-ADR rule is the same as for `superseded-cited`, so that the two
rules cannot drift (issue-hints D7).

<!-- SP-16 note -->

## Phrases for the review

<!-- SP-17 rule serves:R2 -->

**Phrases for the review.** A project may list phrases and patterns under
`phrases:` in `.assuredloop/config.yaml`. The list is empty by default.
`al check` gives the hint `phrase` for each match, at the file and the line
where the match starts, in: the spec docs and the ADRs; the Markdown files
of each open request, but its `origin/` folder; and, with `--issues`, the
text of each issue that it reads. Origin files and archived requests are not
read for phrases. The request records in `.assuredloop/records/` are not
read either: their `source:` fields would match a phrase such as "the
owner" on every line. A match is a hint in every mode.

<!-- SP-18 data serves:R2 builds-on:SP-17 -->

```yaml
phrases:
  - the requester                 # a phrase
  - {pattern: "Avery (asked|wants)"}   # a pattern
```

- A phrase is a string. It matches ignoring case. A space in it matches any
  run of white space, a line break too, so a phrase that a line break splits
  still matches.
- A pattern is a JavaScript regular expression, matched as written, over
  the whole text of the file. A match of no characters is not counted.
- The hint names the entry and the text that matched.
- A `phrases:` that is not a list, an entry that is neither a phrase nor a
  mapping with a `pattern`, an empty phrase or pattern, or a pattern that is
  not a valid regular expression, stops `al check` with a refusal: exit 2,
  and a line that names the entry.

<!-- SP-19 rule serves:R1,R2 changes:DES-22 -->

**What the script checks** (no AI):
- A paragraph with no ID: a hint. A promise or design paragraph with no kind
  or no link: a hint. An adopted paragraph (section 5) gets no link hint
  while its text equals the captured text.
- A proposed or accepted ADR with no `source` or no `decides` link: a hint
  (schema.md 5).
- A link to an ID that does not exist: a hint. When another change removed
  the target, the hint is "target removed", and the open change aligns.
- Two headings with the same text under the same parent (the same heading
  path): a hint. The same text under different parents is valid. Why: the
  OpenSpec CLI caught duplicate requirement names that the v4 model missed
  (validation.md B6).
- Per PR, the ID lint: IDs lost since the base, IDs used twice, and IDs used
  again after removal. Agents can remove comments near the lines they edit
  (claude-code issue #22530), so a lost ID must be caught. A lost ID is at the
  base, absent at the head in every doc of its scope, and named by no
  `removes:`. An ID used again is absent at the base but was used in an
  earlier commit.
- In an open request's change spec, deleting a paragraph is ordinary
  editing. Its lost ID is a hint that names the deletion, and each
  disposition or wording decision of the request that names the ID. When the
  deletion is on purpose, nothing more is needed: the ID is retired and never
  used again. A marker removed by accident, with its text kept, still leaves
  a paragraph with no ID, which gets its own hint. In `specs/` and in an
  archived change spec, the hint on a lost ID asks for `removes:<ID>` or for
  the marker back.
- A per-paragraph hash list, from which the script derives each paragraph's
  change in the PR: Changed, Moved, New or Removed.
- A non-promise kind whose text holds requirement words (MUST, SHALL, MUST
  NOT, SHOULD, MAY, never, always): the hint "promise kind?". ISO/IEC
  Directives Part 2 says notes "shall not contain requirements". It is only a
  hint: an example can quote a MUST correctly, and a new promise can hold no
  such word.
- A change paragraph whose text is close to an existing spec paragraph, with
  no `changes` or `builds on` link to it: the hint "does this change
  INV-12?".
- A design or `approach` paragraph in a change spec can serve a
  requirement that promise paragraphs of the same change spec also serve.
  When it has no `builds on` or `changes` link to one of them, it gets the
  hint "which promise does it keep?". Why: else the records cannot say
  which design keeps which promise (issue #229).
- Where the project uses tasks: a `for <task>` that names no task in the
  record: a hint.
- The phrases that the config lists: a hint for each match ("Phrases for
  the review", below). With `--issues`, the hints from the issues that the
  tasks of the open requests name (section 8).
- A change of kind from a promise kind to any other kind counts as a promise
  change.
- Findings are hints for the review, and the review decides. A finding is
  `not ok` only for a rule that meets two tests: breaking it lets an
  unapproved or wrong decision be built, and an exact check of the records,
  hashes and links decides it, with no judgment. These rules are: a promise
  change with no signed requirement that covers it, and an unsigned
  requirement version (section 6); changed record evidence (section 10); a
  citation of a superseded ADR, and a superseded ADR's status line
  (schema.md 5). A request record that cannot be read, and a spec root that
  cannot be read, are `not ok` too. Every other finding is a hint in every
  mode.
- The exit code is 0 by default, even when `not ok` lines print. Under
  `--strict`, the exit is 1 when any `not ok` prints. No finding changes
  severity with the mode.

<!-- SP-20 note -->

## The commands

<!-- SP-21 interface serves:R1 builds-on:SP-4 changes:DES-72 -->

| Command | v4 |
|---|---|
| `al new` | stays: snapshots the owner's words |
| `al record origin`, `signoff`, `decision` | stay |
| `al record section`, `al consolidate` | go |
| `al spec` | lists IDs, display numbers and kinds; `--add-ids` marks every paragraph |
| `al context` | a change's dispositions (for example "120 paragraphs, 40 with a baseline effect: 30 incorporated, 6 pending, 2 removed, 2 abandoned"), coverage per section, the hints, the open changes on an ID, and what is not checked |
| `al context --diff ... --for review` | the review view: each changed paragraph's text beside its kind, its requirement and the baseline paragraphs it touches |
| `al check` | the checks in sections 3-9; `--issues` also reads the GitHub issues that the tasks of the open requests name (section 8) |
| `al conclude` | the close rule. It refuses with exit 1 and a `refused:` line for each reason. Without `--yes` it shows what it would do. With `--yes` it writes the Outcome, which shows the evidence and what is unknown, and moves the request to `requests/archive/` |
| `al index` | writes derived facts and new bindings; `--align <ID>` advances a binding on purpose; lists the hints that the agent must refresh |
| `al export` | the export: one JSONL row per paragraph version, output file or result, with its repo, role, version, commit and edges; not committed |
| `al search` | search at levels 0-2 across the central repo and its output repos, with the current-system, change-context and history queries; it shows each hit's repo and commit |
