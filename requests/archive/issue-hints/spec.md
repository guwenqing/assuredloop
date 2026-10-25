<!-- SP-1 note -->

# Hints from the linked work items, and phrases for the review: the change spec

<!-- SP-2 note -->

This change serves R1 and R2 in `request.md`. It changes DES-22, DES-52 and
DES-72 in `specs/design.md`. It adds paragraphs to it on the hints from the
linked work items (section 8) and on the phrases for the review (section
3). Each section has the promise paragraphs first, then the design that
keeps them.

<!-- SP-3 note -->

## Hints from the linked work items

<!-- SP-4 rule serves:R1 -->

**Hints from the linked work items.** A project may keep its work items in
any tracker, or in none. `al check` never contacts a tracker. With
`al check --issues <folder>`, it reads the work items that the caller saved
in that folder, in the format below. It checks only the items that the
`tasks:` of an open request name. An item's text is its body and each
comment that is not hidden. It gives a hint:
- `issue-missing`: a task names an item that is not in the folder;
- `issue-superseded`: the item's text names a superseded ADR without the
  ADR that supersedes it, by the rule of hints-and-blocks R5 (schema.md 5):
  in the same marker for a link, in the same paragraph for a word;
- `issue-bare-ref`: the item's text holds a bare `#n`, and the item is in a
  repository other than the request's own;
- `issue-not-sub`: the item is not a child of the request's own item, where
  the item says which item is its parent;
- `phrase`: a phrase or pattern of the config matches the item's text
  ("Phrases for the review", section 3).

<!-- SP-5 rule serves:R1 -->

Each of these is a hint in every mode; none is `not ok`. Without
`--issues`, `al check` reads no item and gives no line about items.
Archived requests are history, and their tasks are not read. Reading items
is optional: a project needs no tracker, and every other check works the
same without one.

<!-- SP-6 rule serves:R1 changes:DES-52 -->

- A task is optional. Where a project uses tasks, a task has an ID and a
  reference: a line in a file of the request, an issue number, a tracker key
  or URL, or a title only.
- The chain holds the reference only. `al` reads no outside tracker and keeps
  no task status. `al check --issues <folder>` reads the work items that the
  caller saved from a tracker, for hints (below). Git shows which PRs name
  the task and whether they merged.
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

<!-- SP-8 data serves:R1 builds-on:SP-4 -->

**Which items.** For each task in the record of each open request,
`al check --issues` finds the items that its `ref` names:
- `#n`: item n of the request's own repository;
- `owner/repo#n`: item n of that repository;
- `<name>#n`: item n of a repository that the config names: an `outputs:`
  entry with that name, or `central` in an output repo. Its repository is
  the one that `git remote get-url origin` names in the folder of its
  `path`;
- a URL of the form `https://<host>/owner/repo/issues/n`, on any host: that
  item;
- the `ref` of an item in the folder (for example `PROJ-12`), where the
  task's `ref` holds it as a whole word: with no letter, digit, `_` or `-`
  beside it.

<!-- SP-9 data serves:R1 builds-on:SP-4 -->

An item that a task names in one of these forms, and that is not in the
folder, gets `issue-missing`; so does a `#n` when the request's own
repository is not known. A task whose `ref` names no item in the folder
gets `issue-missing` too. An item that several tasks name is checked once.
The items in the folder that no task names are not checked, and the
`Not known` line counts them.

<!-- SP-22 data serves:R1 builds-on:SP-4 -->

**Repositories.** An item's repository is its `repository` field, or else
the `owner/repo` of its `url` when the url has the form
`https://<host>/owner/repo/issues/n`. The request's own repository is the
`owner/repo` that `git remote get-url origin` names in this checkout, on any
host: `git@<host>:owner/repo.git`, `https://<host>/owner/repo.git` or
`ssh://git@<host>/owner/repo.git`. Two repositories are the same when their
`owner/repo` is the same, ignoring case. When the request's own repository
or an item's repository is not known, `issue-bare-ref` is not given for that
item, and the `Not known` line says why.
No output of `al check` shows the user name or the password of the
remote's URL.

<!-- SP-10 data serves:R1 builds-on:SP-4 -->

**The request's own item** is the item that the `url` of an origin source
of the request names: the first entry of `sources:` in its record whose
`url` names an item in one of the forms above, or holds the `url` or `ref`
of an item in the folder. An item is a child of the own item when its
`parent` names the own item: by the parent's `url`, its `ref`, or its
`number` in the item's repository. The parent's `url` names the own item
when it equals the `url` of the own item or of its source. It also names
the own item when it holds the own item's `ref` as a whole word, or names
the own item in a form above. When no source names an own item,
`issue-not-sub` is not given for that request's items, and the `Not known`
line says so. The own item itself gets no `issue-not-sub`. An item with no
`parent` field says nothing about its parent: it gets no `issue-not-sub`,
and the `Not known` line says so. `parent: null` means that the item has no
parent.

<!-- SP-11 interface serves:R1 builds-on:SP-4 -->

**The format of an item.** An item is a JSON object. Its GitHub fields are
the ones that the GitHub CLI prints with
`--json number,url,body,comments,parent`, so a GitHub user saves the output
of `gh` as it is, with no conversion:
- `body`: the item's text (gh);
- `url`: the item's address (gh);
- `number`: its number in its repository (gh);
- `comments`: a list, each with `body` and `isMinimized`, which is true for
  a hidden comment (gh); optional;
- `parent`: the parent item, an object with `url` and `number` (gh), or
  with `ref`; null for no parent; optional;
- `ref`: the reference that a task names, for an item of another tracker,
  for example `PROJ-12`; optional;
- `repository`: the item's repository or project, as `owner/repo` or as a
  project key; optional.

<!-- SP-24 interface serves:R1 builds-on:SP-4 -->

An item needs a `body`, and a `url` of the form above, a `number` with a
`repository`, or a `ref`, so that a task can name it.

<!-- SP-12 interface serves:R1 builds-on:SP-4 -->

**The folder.** `al check --issues <folder>` reads each `*.json` file in
the folder, but not its subfolders. A file holds one item, or a list of
items, as `gh issue view` and `gh issue list` print them. A file that is
not valid JSON gets `issue-unread` at the file. In a list, each entry that
is not an item gets `issue-unread` at the file, and the other entries are
read. The `Not known` line names each such file. The folder is a path from
the current directory. A folder that is not there stops `al check` with a
refusal: exit 2, and a line that names it.

<!-- SP-13 interface serves:R1 builds-on:SP-4 -->

**What the hints show.** An item's key is `owner/repo#n` when its
repository and its number are known, and else its `ref`. A hint in an
item's body is at `<key>:<line>`; a hint in a comment is at
`<key>/comment-<k>:<line>`, where k counts all the item's comments from 1,
the hidden ones too. Its ID is `<request>/<task>`, for the first task that
names the item. `issue-superseded` is at the first line of the paragraph or
the marker, as `superseded-cited` is. `issue-bare-ref` is given once for
each line that holds a bare `#n`. `issue-not-sub` is at `<key>`, once for
each request and item, with the ID of that request's first task that names
the item. `issue-missing` is at the reference as the task wrote it, for
example `acme/web#5`, or at the request's record when the task's `ref`
names no item. `issue-unread` is at `<folder>/<file>`, with the folder as
the caller wrote it, and the ID `-`. A `phrase` hint in a file has the ID
`-`. `al check --issues <folder>` adds the line
`info issues - - checked <c> items for the tasks of the open requests, from <folder>`,
where c counts the named items that are in the folder, and the folder is as
the caller wrote it.

<!-- SP-14 data serves:R1 builds-on:SP-4 -->

A bare `#n` is `#` and digits that come after no letter, digit, `_`, `-`,
`/`, `#` or `&`. GitHub reads it as an issue of the repository where it is
written. So in an item of another repository it points to that
repository's item n, not to the request's.

<!-- SP-15 rationale explains:SP-11 -->

Why the caller saves the items: `al` makes no network call, and handles no
token or login (issue-hints D9). Each tracker has its own tool and login,
GitHub Enterprise too, and the caller already has them. The format is the
one that `gh` prints, so GitHub needs no conversion (issue-hints D10). The
code of the superseded-ADR rule is the same as for `superseded-cited`, so
that the two rules cannot drift (issue-hints D7).

<!-- SP-23 example illustrates:SP-11 -->

To save GitHub issues, GitHub Enterprise included, save each issue with
`gh issue view`. `gh issue list` gives at most 100 comments of an issue, so
it can leave comments out.

```sh
mkdir -p /tmp/items
gh issue view 31 --repo acme/invoicer \
  --json number,url,body,comments,parent > /tmp/items/invoicer-31.json
GH_HOST=github.example.com gh issue view 5 --repo acme/web \
  --json number,url,body,comments,parent > /tmp/items/web-5.json
al check --issues /tmp/items
```

<!-- SP-25 example illustrates:SP-11 -->

An item of another tracker, saved by the caller:

```json
{"ref": "PROJ-12", "repository": "PROJ", "body": "Build the export (ADR-3).",
 "comments": [{"body": "Done.", "isMinimized": false}], "parent": {"ref": "PROJ-1"}}
```

<!-- SP-16 note -->

## Phrases for the review

<!-- SP-17 rule serves:R2 -->

**Phrases for the review.** A project may list phrases and patterns under
`phrases:` in `.assuredloop/config.yaml`. The list is empty by default.
`al check` gives the hint `phrase` for each match, at the file and the line
where the match starts, in: the spec docs and the ADRs; the Markdown files
of each open request, but its `origin/` folder; and, with `--issues`, the
text of each work item that it checks. Origin files and archived requests
are not read for phrases. The request records in `.assuredloop/records/` are not
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
  OpenSpec CLI caught duplicate requirement names that the v4 model missed.
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
  the review", below). With `--issues <folder>`, the hints from the work
  items that the caller saved for the tasks of the open requests (section
  8).
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
| `al check` | the checks in sections 3-9; `--issues <folder>` also checks the work items that the caller saved for the tasks of the open requests (section 8) |
| `al conclude` | the close rule. It refuses with exit 1 and a `refused:` line for each reason. Without `--yes` it shows what it would do. With `--yes` it writes the Outcome, which shows the evidence and what is unknown, and moves the request to `requests/archive/` |
| `al index` | writes derived facts and new bindings; `--align <ID>` advances a binding on purpose; lists the hints that the agent must refresh |
| `al export` | the export: one JSONL row per paragraph version, output file or result, with its repo, role, version, commit and edges; not committed |
| `al search` | search at levels 0-2 across the central repo and its output repos, with the current-system, change-context and history queries; it shows each hit's repo and commit |
