# AssuredLoop

AssuredLoop keeps an AI focused on one change. It holds together:
- the owner's words, as snapshots;
- the organized requirement that the owner signs;
- the consolidated spec in `specs/`: the system now, the promises and the
  lasting design, each paragraph with a hidden ID;
- each change's own design, its change spec, beside its request;
- the decisions and the ADRs;
- the code, the tests and the documents that came with the change.

Its command, `al`, keeps these records, checks them, and says what to do
next. It refuses only in its own `al conclude`. `al check` gives the AI
review hints, and the review decides. Only a few exact rules are `not ok`
(see "Hints, and the rules that block"). A project that wants them to block
turns on `al check --strict` in its CI.

AssuredLoop is not a lifecycle tool. It has no phases, no roles, no task
states and no approvals beyond the owner's sign-off. How and when you design,
test and review is your project's way of working.

## Install

Version 0.2.0 is v4. It is a breaking release: it does not read the records
of 0.1.0. To move a project from 0.1.0, see "From 0.1.0" in "Adopting
AssuredLoop".

It needs Node 24 or newer and git 2.31 or newer. Install the npm package
`@assuredloop/cli`, which puts `al` on your PATH:

    npm install --global @assuredloop/cli

Search with a model needs the embedding model's library beside it (see
"Search"). `al` names the library as an optional dependency, so npm installs
it only when you ask:

    npm install --global @assuredloop/cli @huggingface/transformers@4.3.1

To pin a version, name it: `npm install --global @assuredloop/cli@<version>`.

The package carries the skill, at
`$(npm root -g)/@assuredloop/cli/skills/assuredloop/SKILL.md`. Add one line to
the project's AGENTS.md:

```
AssuredLoop keeps this project's requests and spec: at the start of each task, read <dir>/skills/assuredloop/SKILL.md and run `al check`.
```

In a shared repo whose contributors install `al` in different places, copy
the skill at the pinned version into the project, for example as
`.claude/skills/assuredloop/SKILL.md`. Name that path in the AGENTS.md line,
and say in the commit which version it came from.

Search with a model needs the library `@huggingface/transformers` 4.3.1 (see
"Search"). Install it in the project, or beside `al`.

## The model in one page

- **Paragraphs and markers.** Every paragraph of a spec doc has an ID in a
  hidden HTML comment on its own line before it, with a blank line before and
  after it. The marker holds the ID, the kind and the links:

  ```markdown
  <!-- INV-41 rule serves:invoice-exports/R2 builds-on:INV-12 -->

  The export link MUST expire 30 minutes after the email is sent.
  ```

  GitHub does not show the marker. The ID is one flat number per file, and
  it is never used again. `al` computes a display number, for example
  `INV-41 (2.3:4, in Export links)`, which can change when text moves. So
  a heading needs no number of its own: write `## The proxy`, not
  `## 7. The proxy`.
- **Kinds.** Promise kinds (purpose, scope, rule, limit, definition): a
  change needs a signed requirement that covers it. Design kinds (component,
  interface, data, flow, choice) and `approach` (how one change is built):
  a change needs review. Informative kinds (rationale, example, open), `note`
  (headings and connecting text), and the change-only kinds (plan, step,
  migration).
- **A request** is the folder `requests/<name>/`: `origin/` (the owner's words
  and the sign-offs, as snapshots with SHA-256; a project may keep them
  outside the repo, see "Original files outside the repo"), `request.md` (the dialog, the
  organized requirement R1…, the decisions D1…) and, from path 2, `spec.md`,
  the change spec, with IDs SP-1, SP-2… The order of its paragraphs is
  free. The recommended order is one section per topic. Each section has
  the promise paragraph first, then the design that keeps it, with its
  rationale and examples, then its open points. Cross-cutting design and
  decisions follow. While the request is open, a paragraph of its change
  spec may be deleted: its ID is retired and never used again, and
  `al check` gives a hint. In `specs/`, a removal needs `removes:`. Plan,
  step and migration paragraphs may live in the tracker issue that a task's
  `ref` names, instead of in the change spec.
- **A new version of an archived requirement** is a requirement of a new
  request, whose marker names the old one:
  `<!-- R5 from:<snapshot> replaces:assuredloop-v4/R5 -->`. Once the new one
  is signed, `al` shows the old one as replaced.
- **Records** in `.assuredloop/records/`, committed to git: one per request
  (its sources, requirement versions, sign-offs, decisions, tasks, the
  bindings of its links and its close lines) and one per
  doc (fields that `al index` can always rebuild). `al` writes every hash and
  every derived field.
- **Bindings.** When a link is first indexed, `al index` records the hash of
  both ends. Ordinary indexing never moves a binding. When the target
  changes, the source gets the hint `stale-base` until someone checks it
  and records a judgement (see "Hints, and the rules that block"). When the
  source paragraph's own text changes, it gets the hint `holder-changed`
  until it is judged in the same way. The judgement moves the binding to
  the texts of now.
  This hint covers the links that a paragraph of a spec doc, an ADR or an
  open change spec still declares, to a target that still resolves, in the
  records of the open requests. A requirement is out, because a changed
  requirement needs a new sign-off. An output file is out. When no current
  marker declares a link any more, `al index` removes its binding, in the
  open and the archived records, and names it in its output. Git history
  keeps it.
- **Consolidation is by judgement.** A PR brings each piece of a change into
  `specs/` in its own words: it may rewrite, split or join paragraphs, so
  that the spec reads as the current system. No command writes the spec,
  and `al` does not compare the two texts. The review judges each piece in
  a consolidation judgement, and `al check` shows it as current or stale.

## Paths

The user picks the path. The skill has the steps of a change, the review
steps among them, and one short section on what differs by path.

| Path | When | Records | Sign-off | Closes when |
|---|---|---|---|---|
| 0. Fix | no promise changes: it restores what the spec says, or claims a typo in any paragraph | none | no | the PR merges |
| 1. Small promise amend | one or a few promise paragraphs change | a short request; the PR edits `specs/` directly | yes | the PR merges |
| 1d. Small design correction | names or wording of design paragraphs only | a short request with a one-line source note; the PR edits `specs/` directly | no | the PR merges |
| 2. Big change | a real design, one or a few PRs | a request and a change spec | if a promise kind changes, or the request has an R<n> | the close rule holds |
| 3. Epic | big, in parts over time | as 2, with optional task references | as 2 | the close rule holds |
| S. Spike | not yet clear what to build | a request with an organized question; the findings open with the answer | yes, on the question | the answer names the question version |

Every PR states its path and its claim in a commit message, for example
`Tier: 0 — typo in INV-3` or `Tier: 2 — invoice-payments, part 1`. `al check`
reads the newest `Tier:` line in the branch's commits, and checks the claim
against the kinds and the changed paragraphs. Where they disagree, it gives
a hint, for example "path 0, but a rule paragraph is changed with no typo
claim". It checks the labels, not their meaning.

**The close rule.** `al conclude <name>` refuses while a promise change has
no sign-off, a spike's current question is not signed, or an original file
of the request is not checked or does not match its record. On paths 2 and
3 it also refuses while:

- a signed requirement of the request's current version has no declared
  paragraph link: no paragraph of `specs/` says `serves:<name>/R<n>`, and no
  accepted ADR says `decides:<name>/R<n>`;
- a change paragraph says `changes:<ID>`, and that spec paragraph is
  unchanged since the link (or the link has no binding yet: run `al index`);
- a change paragraph says `removes:<ID>`, and that paragraph is still in
  `specs/`.

A close line clears the last three for what it names: one sentence that you
record with `al record <name> close --on <ID> --reason <sentence>`. On a
change paragraph, it says why the paragraph is not delivered. On a
requirement, it says where the requirement is met when no lasting paragraph
links to it, for example an existing design reused or a one-time migration.
`al` keeps the version of what the line names and of each spec paragraph
that its reason names. When one of them changes, `al conclude` shows the
line as stale, and it clears nothing until you record it again. A close line
never replaces a sign-off. A review judgement never clears a refusal, and a
missing or stale consolidation judgement is shown and never refuses.

## The commands

- `al new <name> --from <file|-> [--tier <1|1d|2|3|S>] [--title <text>]`:
  start a request from the owner's words (`-` reads standard input).
- `al record <name> origin --url <source> --from <file|->`: a snapshot of
  later words of the owner, or of a source you rely on.
- `al record <name> signoff --source <where> --words <their words>`: show what
  the owner signs; with `--yes`, record the sign-off on the owner's own yes.
- `al record <name> decision --source <who> --text <decision>
  [--clarifies R<n>]`: add D1, D2…
- `al record <name> judgement --hint <code> --on <ID> --reason <why>`:
  record a one-line judgement that clears a hint; see "Hints, and the rules
  that block". For `issue-changed`, add `--issues <folder>`; see "Hints from
  the linked work items".
- `al record <name> close --on <ID> --reason <sentence>`: a close line, on a
  change paragraph that is not delivered or on a requirement that is met
  where no lasting paragraph links to it; see "The close rule".
- `al spec`: every doc's IDs, display numbers and kinds.
  `al spec --add-ids <file> [--prefix <P>]`: give each unmarked paragraph the
  next free ID.
- `al index`: write the derived facts and the new bindings, remove the
  bindings of links that no marker declares, and list the AI hints to
  refresh. `--align` is removed: a judgement moves a binding (see "Hints,
  and the rules that block").
  `al index --issues <folder>` also keeps the text of the tasks' work items
  (see "Hints from the linked work items").
- `al check [--strict] [--issues <folder>] [--full] [--all] [--at <commit>]`:
  it runs `al index` first, and names in one line the record files that it
  wrote, to commit with the change. Then the checks of this branch against
  its base, what is in force for the change (see "What is in force for a
  change") and the map. With `--issues <folder>`, it also checks the work
  items that the caller saved in the folder (see "Hints from the linked
  work items"). `--full` shows the text of every item in force, and of each
  changed paragraph with its links. `--all` is the audit: every item in
  force on its own line. `--at <commit>` answers as of that commit, read
  from git, and writes nothing. The facts that `al` takes from the branch
  history need that history: in a shallow clone they are "not known", so
  check out the whole history (on GitHub Actions, `fetch-depth: 0`).
- `al context [<name> | <ID>]`: where the project, a request, a paragraph,
  an ADR (`ADR-2`) or a requirement (`<name>/R1`) stands. For an ID, it
  gives one `Cited` line for each file that names the ID, with the count
  and every line number; `--full` adds the text of each of those lines.
  The review view is now `al check --full`. `--audit` gives a
  request's whole trace; `--at <commit>` any v4 state.
- `al conclude <name>`: the close rule; with `--yes` it writes the Outcome
  and moves the request to `requests/archive/<name>/`.
- `al export [--at <commit>] [--out <file>] [--yes]`: one JSONL row per
  paragraph version, with its role, version, commit and links. It is not
  committed. With no `--out`, it writes the rows to standard output. With
  `--out`, it shows the path, the row count and whether it replaces an
  existing file; with `--yes`, it writes the file.
- `al search <words>`: see "Search".

Every command that changes files, except `new` and `index`, shows what it
would write, and writes only with `--yes`. Beside each ID that an answer
shows, it gives the file and the line of the item's text (never its marker
line). A finding of `al check` ends with `· places:` and the place of each
other ID that it names. A fact that only `al`'s records hold, such as a
sign-off, is named as such. Each output ends with three lines:
`Read` (what it read), `Next` (what to do next) and `Not known` (what the
tool cannot know).

## What is in force for a change

On a branch, `al check` shows the requirements and decisions in force that
may govern the change, also when no code or test names an ID. The change is
the branch against its base, with the untracked files and without
`.assuredloop/`. In force are the promise and design paragraphs of the spec
(not `approach`), and each accepted ADR that no accepted ADR supersedes.

- `in force <ID> <basis> · <file>:<line> · <kind>: <text>`: an item that the
  change edits (`changed by this change`), names in a line that it adds or
  removes (`cited (<file>:<line>)`), or reaches through the item's file scope
  (`scope changed in this change`, `by scope`, `all files`). An accepted ADR
  whose text changed is marked `text changed, review open`; an item that
  another open request changes is marked
  `open proposal: <name>/SP-n (<file>:<line>) changes it`.
- `proposed ...`: the change's own signed requirements, its change spec
  paragraphs and the documents of its design lines. They are not in force.
  The change's own request is an open request whose folder or record the
  change touches, or whose name a commit message of the branch names.
- `<N> further items in force: ...`: every other item, by its ID, with exact
  counts. `al check --full` shows their text.
- `list basis:` and `list limits:` say what the list rests on and what it
  cannot show. An item that is not shown in full may still apply.

A file scope is a token in the item's marker, for example
`<!-- INV-41 rule serves:R2 files:src/export/**,test/export/** -->`. `**`
matches any number of folders, `*` matches within one folder name, and `?`
one character; write `?` for a space or a comma in a path. `files:**` is
all files. The token is not part of the text: changing it changes no hash
and gives no marker hint. A scope that matches no file gets the hint
`scope-no-file`.

A design line names a document as the change's design: a line
`Design: <path>` in the request's `request.md`, or the field `design` (a
path or a list) of a saved JSON work item that a task of the request names.
`<repo>:<path>` names a file of an output repo at its selected commit. A
document with markers lists its design paragraphs; one without is
supporting evidence. A design line whose document is missing or cannot be
read gets the hint `design-doc`.

## The review's judgements

The review writes its judgements in `requests/<name>/review.md` of the
change's own request. One judgement is one top-level list item:

```markdown
- INV-41 complies: the link expires 30 minutes after the email.
  - Item: "MUST expire 30 minutes after the email is sent"
  - Code (src/export.js): "export const ttl = 30;"
  - Code (invoicer-web:src/guard.js, base): "if (!signed) refuse();"
  - Test: no test found
```

The verdict is `complies`, `violates`, `unclear` or `not applicable`. A
path is read at the head; `, base` reads it at the base, and
`<repo>:<path>` reads an output repo at its selected commit. `Test` takes a
quote, `no test found` or `tests not examined`. A quote matches word for
word, with each run of white space taken as one space. An ID in the note
is no citation in the list above.

`al index` keeps the identity of each new judgement in the request's record:
the base and a hash of the change in each repo, without the review notes
and `.assuredloop/`, and the hash of the item's text. Do not write or read
it. After the list, `al check` shows one line for each judgement:

```text
review note requests/csv-export/review.md: 1 judgements, 1 current, 0 stale, 0 not known when judged, 0 identity not kept, 0 not read
judgement INV-41 version 1a2b3c4d5e6f complies · requests/csv-export/review.md:3 · item quote found; item in force · code quote found (src/export.js) · no test found · current
```

The item's state is `in force`, `proposed by this change`, `draft`,
`replaced` or `not in force`. A quote that `al` found is "quote found",
never "complies". A judgement is `stale: judged at <commit>` when another
file of the change, in any repo, or the item's text or version changed
since. When a repo cannot be read, it is `not known: <repo> cannot be read
(<reason>)`, never `current`. To renew
it, rewrite the judgement (for example its reason) and run `al index`.
These are hints only: a judgement changes no exit code, no `not ok`,
`--strict` or `al conclude`.

A consolidation judgement says how a piece of the change went into
`specs/`. It has a `Spec` line for each spec paragraph that holds the piece
now. It may name several change paragraphs, so a split or a join needs one
judgement:

```markdown
- SP-3 and SP-4 complies: one shared link that lives 24 hours, now in INV-41 and INV-42.
  - Item (SP-3): "A shared export link lives for 24 hours"
  - Item (SP-4): "the email carries only the link"
  - Spec (INV-41): "The export link MUST expire 24 hours after it is created."
  - Spec (INV-42): "The email MUST hold the link and no file."
  - Spec (INV-9, base): "The link expires 30 minutes after the email is sent."
```

`al index` keeps the version of each paragraph that it names. The
judgement goes stale when any of them changes, by this change or by other
work.

## The map of a change

On a branch with an open change of path 2 or 3, `al check` shows the map
after the review section, from facts only. al compares no text with text:

```text
map: the change against its base 1a2b3c4 (own changes: csv-export), from facts only
map spec INV-41 · specs/invoices.md:14 · changed; named by csv-export/SP-3 changes, judgement requests/csv-export/review.md:3
map spec INV-43 · specs/invoices.md:30 · added; named by no change paragraph
map link csv-export/SP-3 changes INV-41 · requests/csv-export/spec.md:9 · changed since the link
map consolidation · 2 change paragraphs · current: its named paragraphs are unchanged (judgement requests/csv-export/review.md:3, complies): csv-export/SP-3 (requests/csv-export/spec.md:9), csv-export/SP-4 (requests/csv-export/spec.md:13)
```

A link's target is `unchanged since the link`, `changed since the link` or
`removed`. "Unchanged" means that the paragraph still has the text that it
had when the change first linked it. Whether the change's effect is in it
is the review's judgement. Lines with the same fact are one line, which
names each ID. Two hints come with the map: `map-unnamed`, a spec paragraph
that the branch changed and that no `changes` or `removes` link and no
consolidation judgement names; and `map-consolidation`, the change
paragraphs that go into `specs/` with no current consolidation judgement.
`al conclude` shows them again, and never refuses on them.

## Settings

`.assuredloop/config.yaml`, at the repo's root. Every key is optional. A
spec root that is outside the repository, reached through a symlink, or not a
folder is a `not ok` in `al check`. Only the default root, `specs`, may be
absent.

```yaml
root: specs                # the spec folder; every *.md in it except adr/ is a spec doc
docs:                      # each file and its ID prefix; other files may be listed too
  - {file: specs/invoices.md, prefix: INV}
results: .assuredloop/results   # where result files are
outputs:                   # in the central repo: its output repos
  - {name: invoicer-web, path: ../invoicer-web, commit: <sha>}
central: {path: ../invoicer}    # in an output repo: the central repo
phrases:                   # text for the review to look at; each match is a hint
  - the requester          # a phrase: ignoring case, across a line break too
  - {pattern: "Avery (asked|wants)"}   # a JavaScript regular expression
items-out-of-reach:        # work items that the CI token cannot read
  - acme/private-plans     # see "Items out of the CI token's reach"
```

`al check` gives the hint `phrase` for each match of `phrases:` in the spec
docs, the ADRs and the Markdown files of the open requests, but their
`origin/` folders; with `--issues <folder>`, in the work items too. The list is empty by
default. A bad entry or an invalid pattern stops `al check` with exit 2.

`items-out-of-reach:` names the work items that the CI token cannot read
(see "Hints from the linked work items"). A value that is not a list of
texts that are not empty stops `al check` with exit 2.

`.assuredloop/schema.yaml` holds the kinds and the link words, with a version.
`al spec --add-ids` writes both files when they are absent.

ADRs are `specs/adr/<n>-<slug>.md`, with `Status: proposed`, `accepted` or
`superseded by ADR-<n>` on the first line. The name starts with one or more
digits and a dash, and the digits are the ADR's number: `001-x.md` is ADR-1.
Two files with the same number give the hint `adr-number`; `al` reads each
of them, and uses the first in name order where the number is named. When
`specs/adr/` holds Markdown files and none of them is an ADR, `al check`
gives the hint `adr-none`. A status line may name several
ADRs that supersede it: `superseded by ADR-11, ADR-12` or
`ADR-11 and ADR-12`. The heading's marker holds `ADR-<n>` and its
`decides:`, `source:` and `supersedes:` links.

- Any text may be rewritten in other words when its meaning stays the same,
  an accepted or superseded ADR's text too. A new ADR that supersedes it is
  needed only when the decision changes, in whole or in part.
- The review judges whether a rewrite keeps the decision; `al` does not. So
  a changed ADR text, a changed or removed link in its marker, or any other
  change of its marker line, gives a hint: check that its decision is
  unchanged. Links added to the marker of an accepted ADR, with nothing else
  changed, give no finding.
- `al check` gives a hint for a marker line of an ADR that holds anything
  other than its ID, its kind and links: an unknown token, a second `<!--`
  or `-->`, or an empty item in a list of links. A line that starts like a
  marker, but that `al` does not read as one, gets the same hint.
- `al check` gives a hint for an ADR whose first line is not
  `Status: proposed`, `Status: accepted` or `Status: superseded by ADR-<n>`,
  with one ADR or a list of them.
- The hint `adr-changed` clears by a fix, or by a judgement, with its
  reason, that the decision is unchanged: `al record <name> judgement
  --hint adr-changed --on ADR-3 --reason <why>`. It holds until the ADR's
  text or its marker line changes again.
- After a rewrite, a judgement on `holder-changed` moves the bindings of
  paragraph `<ID>` to the ADR's new text, for an accepted or a superseded
  ADR.
- `al check` gives a hint for a proposed or accepted ADR with no `source:`
  or no `decides:`.
- A current place that names a superseded ADR also names the ADR that
  supersedes it, in the same marker or the same paragraph. Current places
  are the spec docs, the open requests and the proposed and accepted ADRs.
  The text names an ADR by `ADR-40`, by `ADR 0040`, or in a list or a range
  such as `ADRs 0003, 0005 and 0040` or `ADRs 0003 to 0005`.
  The chain itself and dated records are exempt: an ADR that supersedes it,
  a superseded ADR, an ADR's `## History`, a request's `## Decisions`, the
  `origin/` files and the archived requests. Else `al check` gives
  `not ok superseded-cited`.
- A superseded ADR's status line names the ADR that supersedes it, and that
  ADR's marker has `supersedes:` for it. Else `al check` gives
  `not ok superseded-status`.

## Original files outside the repo

A project may keep the original files of its requests outside the repo: the
owner's words, the sign-off snapshots and the other source snapshots. The
repo then keeps only the name and the SHA-256 of each file, in the records.
The committed config names the place by a name, never by a path:

```yaml
originals:
  outside: assuredloop     # the name that each worker maps to a folder
```

With no `originals` key, the files are in `requests/<name>/origin/`, as
before, and `al` reads no other setting.

Each worker maps the name to a folder in `assuredloop/places.yaml` in the
user's config folder (`$XDG_CONFIG_HOME`, else `~/.config`), one line for
each name:

```yaml
assuredloop: /path/to/folder
```

In the folder, the files are `<request>/<file>`, with the same names as in
`origin/`. Every clone on the machine uses the same folder.

- `al new`, `al record <name> origin` and `al record <name> signoff` write
  each new original file to the folder, under a name that is free in the
  folder and in `origin/`. With no place set, or when the write fails, they
  refuse and write nothing. A `--url`, `--source` or `--presented` that is a
  path inside the folder is recorded as `originals:<path>`.
- `al` reads `requests/<name>/origin/<file>` first. Only a file that is not
  there is read from the folder. A file in `origin/` that cannot be read is
  `not ok record-evidence`, also when the folder holds a good copy.
- A file in the folder that is missing, cannot be read or has changed is
  `not ok record-evidence`, named as `originals:<request>/<file>`.
- With no place set, as on CI, `al check` gives
  `info originals-not-checked` for each request, with its files, and the
  `Not known` line names them. A sign-off whose file is not checked is not
  counted as signed, and is no `not ok` for that reason alone. Its other
  conditions are checked. So `al check --strict` passes on CI.
- `al conclude` checks each original file of the request again, and refuses
  while one is not checked or does not match. So a request closes only on a
  machine where the place is set.
- `al export` gives no row for a file kept outside. It names each one with
  its SHA-256 on standard error, or in the summary with `--out`.
- A places file that cannot be read or is not valid YAML, or a line that is
  not the absolute path of a folder, stops the command. No places file, or
  no line for the name, is "no place set".

## Hints from the linked work items

A project may keep its work items in any tracker, or in none. `al` never
contacts a tracker. The caller saves the items in a folder, and
`al check --issues <folder>` checks the items that the `tasks:` of the open
requests name. Without `--issues`, `al check` reads no item. A task's `ref`
names an item as `#n`, `owner/repo#n`, `<name>#n` for an output repo that
config names, an issue URL on any host, or the item's own `ref`, for
example `PROJ-12`. Each finding is a hint, except that a closed item gives
`issue-superseded` as `info`:

- `issue-missing`: a task names an item that is not in the folder;
- `issue-superseded`: the item's text names a superseded ADR without the ADR
  that supersedes it, by the rule of `superseded-cited`. A closed item gives
  it as `info`, not as a hint, because a closed item records what held when
  it closed;
- `issue-bare-ref`: a bare `#n` in an item of another repository, which
  GitHub reads as that repository's issue. The request's own repository
  comes from `git remote get-url origin`;
- `issue-not-sub`: the item is not a child of the request's own item, the
  item that `assuredloop-requests.json` in the folder names (below);
- `phrase`: a phrase of `phrases:` matches;
- `issue-unread`: a file in the folder is not valid JSON or YAML, is a
  Markdown file that is not an item, or holds an entry that is not an item.
- `issue-changed`: the item says something different from what it said
  when the change relied on it, or `al` cannot tell (below).

**A work item that changed.** `al index --issues <folder>` keeps the hash
of each task item's text in the request's record, by itself; no person and
no AI writes or reads it. The text is the body and each comment that is not
hidden; the state is not text. It keeps the text at the moment of reliance:
when the request names the item, and again at the first sign-off after
that. So run it in the commit that names an item, and after
`al record <name> signoff --yes`, before the commit that records the
sign-off. It never keeps a text for a moment that is past: for an item
named in an earlier commit, it keeps nothing. `al` cannot tell when the
caller saved the items, and the `Not known` line of each
`al check --issues` says so: save them again before a check.
`al check --issues <folder>` then gives `issue-changed`:

- "changed since …" when the item's text now differs from the kept text;
- "not known whether it changed …" when no text was kept at that moment, or
  the item is not in the folder or cannot be read. `al` never reports such
  an item as unchanged.

A closed item gets the same hint. To clear it, read the item, then record
that you read it, with its reason:

    al record <name> judgement --hint issue-changed --on <item> \
      --reason "<why>" --issues <folder> --yes

`<item>` takes the forms of a task's `ref`. The judgement records the item's
text now, and the moment of reliance that it covers. The hint comes back
when the text changes again, or when a later sign-off becomes the moment of
reliance.

The folder holds `*.json`, `*.yaml`, `*.yml` and `*.md` files. Every file
of these kinds is read as items, a README.md too. A JSON or YAML file holds
one item, or a list of items; a Markdown file holds one item. An item is
the JSON that the GitHub CLI prints with
`--json number,url,body,comments,parent,state`, so GitHub issues need no
conversion. A YAML item has the same fields:

| Field | What it is | Needed |
|---|---|---|
| `body` | the item's text | yes |
| `url` | its address, `https://<host>/owner/repo/issues/n` for GitHub | one of `url`, `number` with `repository`, or `ref` |
| `number` | its number in its repository | |
| `comments` | a list, each with `body`, and `isMinimized` true for a hidden comment | no |
| `parent` | the parent item, with `url` and `number`, or `ref`; `null` for none | no: with no `parent`, the child check is not made |
| `ref` | the reference that a task names, for another tracker, for example `PROJ-12` | for another tracker |
| `repository` | `owner/repo`, or a project key | no |
| `state` | `OPEN` or `CLOSED`, as `gh` gives it; another tracker maps its states to these two. Any other value is ignored | no: with no `state`, the item counts as open |

To save GitHub issues, GitHub Enterprise included, save each issue with
`gh issue view`. `gh issue list` gives at most 100 comments of an issue.

```sh
mkdir -p /tmp/items
gh issue view 31 --repo acme/invoicer \
  --json number,url,body,comments,parent,state > /tmp/items/invoicer-31.json
GH_HOST=github.example.com gh issue view 5 --repo acme/web \
  --json number,url,body,comments,parent,state > /tmp/items/web-5.json
al check --issues /tmp/items
```

An item of another tracker:

```json
{"ref": "PROJ-12", "repository": "PROJ", "body": "Build the export (ADR-3).",
 "comments": [{"body": "Done.", "isMinimized": false}], "parent": {"ref": "PROJ-1"}}
```

An item in Markdown is plain text that a person or an AI writes with no
tool:

    URL: https://github.com/acme/invoicer/issues/31
    State: OPEN
    Parent: https://github.com/acme/invoicer/issues/30

    Build the CSV export of invoices (ADR-3).

    Design: docs/rfc/0018-export.md

    ## Comment 1

    The first PR is up.

    ## Comment 2 (minimized)

    An off-topic remark.

- The header is the first lines, up to the first blank line, each
  `<Key>: <value>`. The keys are `URL`, `Number`, `Repository`, `Ref`,
  `State` and `Parent`, case ignored, and each gives the field of the same
  name. `State` is `open` or `closed`. `Parent` is a URL, `#n`, `none` for
  no parent, or another text, which is the parent's `ref`. With no
  `Parent` line, the child check is not made.
- The body goes from the header's blank line to the first comment. A
  `Design:` line in it names the item's design.
- Each comment starts at a line that is exactly `## Comment <k>` or
  `## Comment <k> (minimized)`, outside fenced code. k counts from 1, in
  order.
- Blank lines at the start and the end of the body and of each comment are
  dropped. So an item whose body or comment starts or ends with a blank line
  has another kept text in Markdown than in JSON or YAML.
- A Markdown file whose first line is not a header line, or that has no
  `URL`, no `Number` with a `Repository`, and no `Ref`, is not an item: it
  gets `issue-unread` with the reason.

Two files may hold the same item, in any formats. The files are read in one
name order. Where a task names the item by `#n`, `owner/repo#n`,
`<name>#n` or a URL, the first copy is checked, and the other counts as an
item that no task names. Where a task names it by its `ref`, each copy is
checked.

**Items out of the CI token's reach.** The token of a CI job often cannot
read every item, for example the items of a private repository. Name those
items in the committed config, and save the others:

```yaml
items-out-of-reach:      # work items that the CI token cannot read
  - acme/private-plans   # every item of this repository
  - acme/web#5           # one item, in a form of a task's ref
  - PROJ-12
```

For a task's item that the list names and that is not in the folder,
`al check --issues` gives no `issue-missing` and no `issue-changed`. In
their place, it gives one line for all of them, with every task that names
each one:

    info issues-out-of-reach - - 2 items out of the CI token's reach (items-out-of-reach in .assuredloop/config.yaml) are not in <folder>, so they are not checked, and al cannot tell whether they changed since the change relied on them: acme/private-plans#4 (pay-run/T2), PROJ-12 (pay-run/T1)

An item that the list names and that is in the folder is read as usual.
The line names each item once, ignoring case. A task's `ref` that names no
saved item, and that holds more than other trackers' keys of the list,
keeps its `issue-missing`.

The folder also says which item is each request's own item, in the file
`assuredloop-requests.json`. `al` reads the own item from this file only,
never from an origin source. Without the file, or for a request that it
does not list, `issue-not-sub` is not checked, and the `Not known` line
says so once for each request. The file is not read as an item. A file that
is not valid gets `issue-unread` and is ignored; `al check` goes on.

- `format`: the exact text `assuredloop-items/1`;
- `requests`: each key is a request's name, and its value is that request's
  own item, in a form that a task's `ref` uses: a URL, `owner/repo#n`, or
  another tracker's key, for example `PROJ-1`.

```json
{
  "format": "assuredloop-items/1",
  "requests": {
    "invoice-exports": "https://github.com/acme/invoicer/issues/30",
    "pay-run": "PROJ-1"
  }
}
```

To write it for a GitHub issue:

```sh
printf '{"format": "assuredloop-items/1", "requests": {"invoice-exports": "%s"}}\n' \
  "$(gh issue view 30 --repo acme/invoicer --json url --jq .url)" \
  > /tmp/items/assuredloop-requests.json
```

The JSON Schema (draft 2020-12) of each file, for a person or an AI that
writes them. An item file:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "an item file: one item, or a list of items",
  "oneOf": [
    {"$ref": "#/$defs/item"},
    {"type": "array", "items": {"$ref": "#/$defs/item"}}
  ],
  "$defs": {
    "item": {
      "type": "object",
      "required": ["body"],
      "anyOf": [
        {"required": ["url"], "properties": {"url": {"type": "string", "pattern": "^https?://[^/\\s]+/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/issues/[0-9]+([^A-Za-z0-9_][\\s\\S]*)?$"}}},
        {"required": ["number", "repository"]},
        {"required": ["ref"]}
      ],
      "properties": {
        "body": {"type": "string"},
        "url": {"type": "string"},
        "number": {"type": "integer"},
        "comments": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["body"],
            "properties": {"body": {"type": "string"}, "isMinimized": {"type": "boolean"}}
          }
        },
        "parent": {
          "oneOf": [
            {"type": "null"},
            {
              "type": "object",
              "properties": {"url": {"type": "string"}, "number": {"type": "integer"}, "ref": {"type": "string", "minLength": 1}}
            }
          ]
        },
        "ref": {"type": "string", "minLength": 1},
        "repository": {"type": "string", "minLength": 1},
        "state": {"enum": ["OPEN", "CLOSED"]}
      }
    }
  }
}
```

`assuredloop-requests.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "assuredloop-requests.json",
  "type": "object",
  "required": ["format", "requests"],
  "additionalProperties": false,
  "properties": {
    "format": {"const": "assuredloop-items/1"},
    "requests": {
      "type": "object",
      "additionalProperties": {"type": "string", "minLength": 1}
    }
  }
}
```

## Search

Search follows one committed setting, `search:` in
`.assuredloop/config.yaml`. No choice is a default. Until you set one,
`al search` searches nothing: it shows the choices, what each costs on this
computer, the measured figures with their limits, and its recommendation.
The checks never use search.

| Setting | What `al search` does |
|---|---|
| `search: {own: <name>}` | Your team's knowledge base, an MCP server or a skill: `al search` names it and says to ask it. `al export` gives it `al`'s rows. |
| `search: local` | Word search (level 1): a local full-text index (SQLite FTS5, BM25), with the ID in its own exact column. Needs Node 24 or newer (`node:sqlite`). |
| `search: {local: <row>}` | Word search and one row of the measured table (level 2): for an embedding row, word and vector results are fused; for a reranker row, the reranker reorders the word-search top 30. A `tjs-*` row needs the library `@huggingface/transformers` 4.3.1, in the project or beside `al`. A `llama-*` row needs llama.cpp's `llama-server` on PATH (measured: release b11624), on macOS arm64. |
| `search: none` | No search: `al search` says so. Read the files (grep). |

- The measured table holds each model, precision and runtime that was
  measured for `al search` (issue #28), for example
  `bge-small-en-v1.5 q8 tjs-cpu`. With no setting, `al search <words>` names
  every row: the rows that fit this computer, each with its download,
  memory, first index time, time for each search, recall@10 and gain over
  word search with their intervals; then the rows that do not fit and the
  excluded rows, each with its reason. A `llama-*` row does not fit off
  macOS arm64, where it was not measured. `--full` shows every row in
  full, and `--json` gives them all.
- The recommendation comes from code with no model: of the rows that this
  `al` runs and that fit, those with a gain whose interval is above zero
  and a measured time of at most 10 s for each search, then the smallest
  download within 0.05 of the best recall. When no row is left, it
  recommends `local`. When the 10 s bound removes the row that it would
  recommend, it names that row, its gain and its time. The figures come
  from one Mac and 50 questions from one repo; the Limits line says so.
- A wrong setting, a row that is not in the table and an excluded row are
  refused (exit 2). A row that does not fit this computer still runs, and
  a `Not known` line says what it needs.
- The default query is the current system: the spec text at the selected
  commit. `--change <name>` adds that request's open change spec, its
  sources and its evidence. `--history` adds removed and replaced text,
  marked as history.
- `--id <ID>` finds one paragraph by its exact ID, never through search.
  `--level <0|1|2>` asks for a lower level (2 is the row of the setting);
  `--at <commit>` another commit.
- Word search also finds each file of the central repo and the output repos
  by the words of its path. Such a hit shows `file <path> <kind>`, where the
  kind (code, test, doc, config or other) comes from the path alone.
- Each hit shows its role (`baseline`, `proposal`, `spike`, `source`,
  `evidence` or `history`), its version and its commit.
- In the central repo, search covers the output repos that its committed
  config lists, each at its resolved commit. The `Repos` line names each repo
  and its commit, for example
  `Repos     invoicer@a6ac3a7785dd invoicer-web@5aa04042117b`. An output repo
  gives `evidence` rows: its result files, and the files that cite a central
  ID or that a record declares. Such a hit shows `<repo>:<path>`, and each
  line that names a central ID, with its line number. A repo that is absent,
  or a commit that cannot be found, gives no rows and a `Not known` line with
  the reason.
- The index is one SQLite file inside `.git`, never committed. `al search`
  brings it up to date before it answers; `--rebuild` builds it again.
- Level 2 runs the model of the row on this computer, pinned by its commit.
  Before the first download, `al` writes the row and its size to standard
  error. The model download is the only data that leaves the machine. `al`
  itself makes no network call. Without the row's runtime, `al search`
  answers at level 1, and a `Not known` line says how to add it. Only
  `al search` loads the library or starts `llama-server`.
- For a `llama-*` row, `al` starts one `llama-server` on 127.0.0.1 for each
  `al search`, with the measured arguments, and stops it after. The model
  file is fetched by `llama-server` into its own place (`LLAMA_CACHE`, else
  `~/Library/Caches/llama.cpp`). `al` checks the file's size on every run
  and its SHA-256 once; a file that differs gives word search, and the
  `Fallback` line says what was expected and found. Another build of
  llama.cpp still runs, and a `Not known` line says that its figures may
  differ.

## One central repo, and output repos

The central repo holds `specs/`, the ADRs, the requests and the records. Its
config lists the output repos. An output repo holds code, tests and user
documents only; its config names the central repo.

- Code and tests in an output repo cite central IDs with a qualifier:
  `central:INV-41`, `central:invoice-exports/R3`. A fix there says
  `Tier: 0 — restores central:INV-41`.
- `al` reads another repo only through git, at the commit that config pins
  or at the clone's HEAD, and never fetches. A repo or a commit that is not
  there is "unknown", never a guess.
- In an output repo, `al check` looks up the central IDs that the branch's
  changed files cite.

## Adopting AssuredLoop

1. Put the spec under the root (`specs/` by default), or set `root:`.
2. Mark every paragraph: `al spec --add-ids specs/<file>.md --prefix <P> --yes`
   for each spec file. Headings get the kind `note`. Write the kind of each
   other paragraph into its marker. An adopted paragraph needs no link.
3. Add the AGENTS.md line from "Install". Claim
   `Tier: 0 — adds paragraph IDs; no promise changes`.
4. `al spec --add-ids --yes` also records where the adopted text came from.
   For each paragraph it marks whose text is a block of the file at HEAD, in
   the same place, it writes an entry with HEAD's commit and the text's hash
   to `.assuredloop/records/requests/adoption.yaml`. It writes
   `requests/archive/adoption/request.md` when that file is absent. So commit
   the spec unmarked before you mark it. A paragraph whose text is not at
   HEAD is not adopted: the command names it, and it follows its path as a
   change. `source: adoption` says where the text came from. It is not an
   owner approval, and it does not excuse a later change.
5. Run `al check`, and commit the markers and the records together. On that
   branch, `al check --strict` reads the adopted paragraphs as unchanged, so
   they need no sign-off and no path claim.

**A sign-off bound to the whole text.** Markers change a file's bytes. If a
signed requirement, or any other record, binds the whole text of a spec file
by its SHA-256, that hash no longer matches after the markers are added. Ask
the owner for a new approval after the conversion. The paragraph text itself
does not change; `al` hashes each paragraph without its marker.

**From 0.1.0.** v4 (0.2.0) does not read 0.1.0 records. Keep 0.1.0 pinned
until you move. Older records stay readable as files; run the pinned 0.1.0 at
those commits.

In a project where `.assuredloop` is a file, as 0.1.0 writes it, each `al`
command refuses with exit 2 and one line: `al: .assuredloop is a file, so the
project has 0.1.0 records, which v4 does not read; keep 0.1.0 pinned, or move
as "From 0.1.0" in the README says`. It reads and writes nothing else, so
`al check` never passes there. `al --version` and the usage message still
work. To move:

1. Finish each open 0.1.0 request on its pinned copy, or start it again
   under v4.
2. Install 0.2.0 (see "Install").
3. Remove the 0.1.0 file: `git rm .assuredloop`. v4 keeps its settings in
   the folder `.assuredloop/`. If the file had a `root:` line, write the
   same line in `.assuredloop/config.yaml` (see "Settings").
4. Run `al spec --add-ids`, as in steps 1-5 above. It marks every paragraph
   and writes the adoption record.

## Hints, and the rules that block

`al check` gives the AI review hints, and the review decides. A finding is
`not ok` only for a rule that meets two tests: breaking it lets an
unapproved or wrong decision be built, and an exact check of the records,
hashes and links decides it, with no judgement. These rules are:

- **An unsigned requirement** (`not ok unsigned-requirement`). In each
  request whose record has `requirements:`, open or archived, the latest
  version of each requirement has a valid sign-off. A sign-off is valid only
  when a `covers` entry matches the requirement's id, version and `sha256`
  exactly; its file is in the request's `origin/` folder (or at the place,
  see "Original files outside the repo"), and the hash of
  its signed text equals the sign-off's `sha256`; and it records when it was
  signed and the signer's words. A requirement in `request.md` that is not
  its latest recorded version is not signed. An entry that `al check` cannot
  read is `not ok` too. A promise paragraph that changes with no signed
  requirement that covers it stays `not ok signoff-coverage`.
- **Changed record evidence** (`not ok record-evidence`). Each origin file
  under `sources:`, and each sign-off file, still has the hash that the
  record lists. `al check` hashes the snapshot's text after its `---` line,
  as `al record` did.
- **A citation of a superseded ADR** (`not ok superseded-cited` and
  `superseded-status`; see "Settings").

A request record that cannot be read (`record-unreadable`) and a spec root
that cannot be read (`spec-root`) are `not ok` too. Every other finding is a
hint in every mode, `--strict` included: the marker and ID lints, the path
claim, a link that does not resolve, an ADR's changed text or missing links,
the map's hints, and the rest. `--strict` changes only the exit code:
it is 1 when a `not ok` prints.

A hint clears by a fix, or by a one-line judgement with its reason:
`al record <name> judgement --hint <code> --on <ID> --reason "<why>" --yes`.
`<name>` is an open request, the change's own; `--on` is the ID that the
hint line shows, or its path when that ID is `-`. The judgement keeps the
versions of both sides of the hint. When one of them changes, the hint
comes back and names the judgement as stale. `al check` shows the current
judgements in one line, `info judged`. On `stale-base`, `holder-changed` and
`binding-unknown`, the judgement moves or binds the binding of that link to
the texts of now. A judgement never clears a `not ok` or a refusal of
`al conclude`: it is shown on the `not ok` line, and nothing else changes.

`al check` gives the hint "promise kind?" (`promise-kind`) for a paragraph
that is not a promise kind and holds a requirement word: MUST, SHALL, SHOULD,
MAY, never or always. When the paragraph is a promise, change its kind. When
it applies a promise, for example a flow step that keeps a rule, give it
`builds-on:` the promise paragraph in its marker. The hint then goes. A
`builds-on:` to another kind, or to an ID that does not exist, keeps it.

`al check` gives the hint `no-paragraph-link` for a signed requirement of an
open request that no paragraph of `specs/`, no accepted ADR and no promise or
design paragraph of an open change spec links to. At the close, `al conclude`
refuses on the same fact for paths 2 and 3. The hint says that the link is
missing, not that nothing was built. It names the known direct links, each
with the limit of its evidence: an `approach` or another paragraph of a
change spec that serves the requirement, an ADR that decides it and is not
accepted, a declared `verifies` output, and each file that cites
`<name>/R<n>`. The message holds no line number: the citing lines follow it
after ` · cited lines:`, and the places of its IDs after ` · places:`. It
clears by a link, by a close line (`al record <name> close --on R<n>
--reason <where it is met>`), or by a judgement on `<name>/R<n>`.

## What is enforced, and by whom

| The tool checks | The skill asks | The owner decides |
|---|---|---|
| `al conclude` refuses on its conditions (see "The close rule") | write the owner's words and the organized requirement, and ask for the sign-off | what is wanted, by signing the organized requirement |
| `not ok`: sign-off coverage of promise changes, unsigned requirement versions, changed record evidence, citations of superseded ADRs and their status lines, and records or a spec root that cannot be read | choose the path, and state it in a commit message and the PR | whether a changed requirement is signed again |
| hints for the review: IDs missing, used twice, lost or used again; kinds and links; links that do not resolve; path and typo claims; a spec paragraph changed with no change paragraph that names it, and a change paragraph with no current consolidation judgement; stale bindings; overlapping changes; ADR text changes; a proposed or accepted ADR with no `source:` or no `decides:`; result applicability; a design paragraph that links to none of its requirement's promise paragraphs in its change spec; a `for:` that names no task; matches of the configured phrases; with `--issues <folder>`, the hints from the linked work items | record each later decision, with its source | decisions whose source is the owner, such as dropping or keeping work |
| | review from the changed behaviour: one search question, a judgement for each item that applies, the consolidation, the tests and the user documents; say what is unknown | |
| `check --strict` exits 1 on a `not ok`, when a project opts in | | |

`al` checks that declarations are well formed and that references resolve.
It does not check that a kind is right, that a requirement is fully
covered, that a test checks the rule it names, or that a change is
authorized in substance; its views say "not checked" for these. Nothing is
installed in git hooks.

## Beyond code: results

A result file in `.assuredloop/results/` (or the `results:` folder) records a
check, a test run or a review:

```yaml
check: test/export-link.test.js
outcome: pass            # pass, fail or not run
commit: <sha>            # or unknown
inputs:
  - {file: src/export-link.js, sha256: <sha256 of its bytes>}
by: ci                   # optional, with source and note
```

`al` shows "declared inputs unchanged since <commit>" when the inputs still
have those hashes, "does not apply to the current text" when one changed,
and "applicability unknown" when it cannot tell. That the declared inputs
are complete is a claim. The same works for a repo of documents: the report
is the deliverable, and a review result names it as its input.

## This repository

- `requests/`: the requests, and `requests/archive/` for the concluded ones;
- `docs/adr/`: the decision records;
- `specs/`: the current spec.

The previous version is on the `legacy` branch. Its build is tagged
`assuredloop-base-0.1.0-canonical-build`, and its issues and pull requests stay
in this repository.

## Releasing

1. Bump `version` in `package.json` in a PR, and merge it.
2. Publish a GitHub Release tagged `v<version>` on that commit. Mark it a
   pre-release to publish under npm's `next` tag.

`.github/workflows/publish.yml` does the rest: it runs the tests and
`al check --strict`, checks that the tag matches `package.json`, and
publishes @assuredloop/cli to npm. It skips a version that is already on npm,
so a failed run can run again. It stores no npm token: npm trusts the
workflow by name, and adds a provenance statement saying which commit built
the package.
