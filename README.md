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

The recommended install adds the embedding model's library beside it, for
search at level 2 (see "Search"). `al` names the library as an optional
dependency, so npm installs it only when you ask:

    npm install --global @assuredloop/cli @huggingface/transformers@4.3.1

To pin a version, name it: `npm install --global @assuredloop/cli@<version>`.

The package carries the skill, at
`$(npm root -g)/@assuredloop/cli/skills/assuredloop/SKILL.md`. Add one line to
the project's AGENTS.md:

```
AssuredLoop keeps this project's requests and spec: before work that changes the spec, read <dir>/skills/assuredloop/SKILL.md and run `al context`.
```

In a shared repo whose contributors install `al` in different places, copy
the skill at the pinned version into the project, for example as
`.claude/skills/assuredloop/SKILL.md`. Name that path in the AGENTS.md line,
and say in the commit which version it came from.

Search at level 2 needs the library `@huggingface/transformers` 4.3.1 (see
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
  and the sign-offs, as snapshots with SHA-256), `request.md` (the dialog, the
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
- **Records** in `.assuredloop/records/`, committed to git: one per request
  (its sources, requirement versions, sign-offs, decisions, tasks, the
  bindings of its links and the dispositions of its paragraphs) and one per
  doc (fields that `al index` can always rebuild). `al` writes every hash and
  every derived field.
- **Bindings.** When a link is first indexed, `al index` records the hash of
  both ends. Ordinary indexing never moves a binding. When the target
  changes, the source gets a hint until someone checks it and runs
  `al index --align <ID>`.
- **Consolidation is by hand.** A PR copies a change paragraph into `specs/`
  word for word, and records its disposition: `incorporated`, `removed`,
  `superseded` or `abandoned`. No command writes the spec.

## Paths

The user picks the path. The skill has the steps of each path.

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
no sign-off, a spike's current question is not signed, or a change paragraph
with a baseline effect has no valid disposition for its current version.

## The commands

- `al new <name> --from <file|-> [--tier <1|1d|2|3|S>] [--title <text>]`:
  start a request from the owner's words (`-` reads standard input).
- `al record <name> origin --url <source> --from <file|->`: a snapshot of
  later words of the owner, or of a source you rely on.
- `al record <name> signoff --source <where> --words <their words>`: show what
  the owner signs; with `--yes`, record the sign-off on the owner's own yes.
- `al record <name> decision --source <who> --text <decision>
  [--clarifies R<n>]`: add D1, D2…
- `al spec`: every doc's IDs, display numbers and kinds.
  `al spec --add-ids <file> [--prefix <P>]`: give each unmarked paragraph the
  next free ID.
- `al index`: write the derived facts and the new bindings, and list the AI
  hints to refresh. `al index --align <ID>` moves the bindings of one
  paragraph to its targets' current text, on purpose.
- `al check [--strict] [--issues <folder>]`: the checks of this branch
  against its base. With `--issues <folder>`, it also checks the work items
  that the caller saved in the folder (see "Hints from the linked work
  items").
- `al context [<name> | <ID>]`: where the project, a request or a paragraph
  stands. `--diff <range> --for review` is the review view. `--audit` gives a
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
would write, and writes only with `--yes`. Each output ends with three lines:
`Read` (what it read), `Next` (what to do next) and `Not known` (what the
tool cannot know).

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
```

`al check` gives the hint `phrase` for each match of `phrases:` in the spec
docs, the ADRs and the Markdown files of the open requests, but their
`origin/` folders; with `--issues <folder>`, in the work items too. The list is empty by
default. A bad entry or an invalid pattern stops `al check` with exit 2.

`.assuredloop/schema.yaml` holds the kinds and the link words, with a version.
`al spec --add-ids` writes both files when they are absent.

ADRs are `specs/adr/NNNN-<slug>.md`, with `Status: proposed`, `accepted` or
`superseded by ADR-<n>` on the first line. The heading's marker holds
`ADR-<n>` and its `decides:`, `source:` and `supersedes:` links.

- Any text may be rewritten in other words when its meaning stays the same,
  an accepted or superseded ADR's text too. A new ADR that supersedes it is
  needed only when the decision changes, in whole or in part.
- The review judges whether a rewrite keeps the decision; `al` does not. So
  a changed ADR text, or a changed or removed link in its marker, gives a
  hint: check that its decision is unchanged. Links added to the marker of
  an accepted ADR, with nothing else changed, give no finding.
- After a rewrite, `al index --align <ID>` moves the bindings of paragraph
  `<ID>` to the ADR's new text, for an accepted or a superseded ADR.
- `al check` gives a hint for a proposed or accepted ADR with no `source:`
  or no `decides:`.
- A current place that names a superseded ADR also names the ADR that
  supersedes it, in the same marker or the same paragraph. Current places
  are the spec docs, the open requests and the proposed and accepted ADRs.
  The chain itself and dated records are exempt: an ADR that supersedes it,
  a superseded ADR, an ADR's `## History`, a request's `## Decisions`, the
  `origin/` files and the archived requests. Else `al check` gives
  `not ok superseded-cited`.
- A superseded ADR's status line names the ADR that supersedes it, and that
  ADR's marker has `supersedes:` for it. Else `al check` gives
  `not ok superseded-status`.

## Hints from the linked work items

A project may keep its work items in any tracker, or in none. `al` never
contacts a tracker. The caller saves the items in a folder, and
`al check --issues <folder>` checks the items that the `tasks:` of the open
requests name. Without `--issues`, `al check` reads no item. A task's `ref`
names an item as `#n`, `owner/repo#n`, `<name>#n` for an output repo that
config names, an issue URL on any host, or the item's own `ref`, for
example `PROJ-12`. Each finding is a hint:

- `issue-missing`: a task names an item that is not in the folder;
- `issue-superseded`: the item's text names a superseded ADR without the ADR
  that supersedes it, by the rule of `superseded-cited`;
- `issue-bare-ref`: a bare `#n` in an item of another repository, which
  GitHub reads as that repository's issue. The request's own repository
  comes from `git remote get-url origin`;
- `issue-not-sub`: the item is not a child of the request's own item, the
  item that `assuredloop-requests.json` in the folder names (below);
- `phrase`: a phrase of `phrases:` matches;
- `issue-unread`: a file in the folder is not valid JSON, or holds an entry
  that is not an item.

The folder holds `*.json` files. Each file holds one item, or a list of
items. An item is the JSON that the GitHub CLI prints with
`--json number,url,body,comments,parent`, so GitHub issues need no
conversion:

| Field | What it is | Needed |
|---|---|---|
| `body` | the item's text | yes |
| `url` | its address, `https://<host>/owner/repo/issues/n` for GitHub | one of `url`, `number` with `repository`, or `ref` |
| `number` | its number in its repository | |
| `comments` | a list, each with `body`, and `isMinimized` true for a hidden comment | no |
| `parent` | the parent item, with `url` and `number`, or `ref`; `null` for none | no: with no `parent`, the child check is not made |
| `ref` | the reference that a task names, for another tracker, for example `PROJ-12` | for another tracker |
| `repository` | `owner/repo`, or a project key | no |

To save GitHub issues, GitHub Enterprise included, save each issue with
`gh issue view`. `gh issue list` gives at most 100 comments of an issue.

```sh
mkdir -p /tmp/items
gh issue view 31 --repo acme/invoicer \
  --json number,url,body,comments,parent > /tmp/items/invoicer-31.json
GH_HOST=github.example.com gh issue view 5 --repo acme/web \
  --json number,url,body,comments,parent > /tmp/items/web-5.json
al check --issues /tmp/items
```

An item of another tracker:

```json
{"ref": "PROJ-12", "repository": "PROJ", "body": "Build the export (ADR-3).",
 "comments": [{"body": "Done.", "isMinimized": false}], "parent": {"ref": "PROJ-1"}}
```

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
        {"required": ["url"], "properties": {"url": {"type": "string", "pattern": "^https?://[^/\\s]+/[^/\\s]+/[^/\\s]+/issues/[0-9]+"}}},
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
        "repository": {"type": "string", "minLength": 1}
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

`al search` answers at the strongest level that is installed, falls back by
itself (2, then 1, then 0), and says which level answered and why.

| Level | What it is | Needs |
|---|---|---|
| 0 | a scan of the export | nothing |
| 1 | a local full-text index (SQLite FTS5, BM25), with the ID in its own exact column | Node 24 or newer (`node:sqlite`) |
| 2 | level 1, plus a small local embedding model; word and vector results are fused | the library `@huggingface/transformers` 4.3.1, in the project or beside `al` |

- The default query is the current system: the spec text at the selected
  commit. `--change <name>` adds that request's open change spec, its
  sources and its evidence. `--history` adds removed, abandoned and replaced
  text, marked as history.
- `--id <ID>` finds one paragraph by its exact ID, never through search.
  `--level <0|1|2>` asks for a lower level; `--at <commit>` another commit.
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
- Level 2 runs a small local model (bge-small-en-v1.5, pinned by its
  revision). The model download is the only data that leaves the machine.
  `al` itself makes no network call. Without the library, `al search`
  answers at level 1, and a `Not known` line says how to add level 2. Only
  `al search` loads the library.

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
5. Run `al index`, and commit the markers and the records together. On that
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
  exactly; its file is in the request's `origin/` folder, and the hash of
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
an invalid disposition, and the rest. `--strict` changes only the exit code:
it is 1 when a `not ok` prints.

## What is enforced, and by whom

| The tool checks | The skill asks | The owner decides |
|---|---|---|
| `al conclude` refuses on its three conditions (see "The close rule") | write the owner's words and the organized requirement, and ask for the sign-off | what is wanted, by signing the organized requirement |
| `not ok`: sign-off coverage of promise changes, unsigned requirement versions, changed record evidence, citations of superseded ADRs and their status lines, and records or a spec root that cannot be read | choose the path, and state it in a commit message and the PR | whether a changed requirement is signed again |
| hints for the review: IDs missing, used twice, lost or used again; kinds and links; links that do not resolve; path and typo claims; dispositions and exact equality; stale bindings; overlapping changes; ADR text changes; a proposed or accepted ADR with no `source:` or no `decides:`; result applicability; a design paragraph that links to none of its requirement's promise paragraphs in its change spec; a `for:` that names no task; matches of the configured phrases; with `--issues <folder>`, the hints from the linked work items | record each later decision, with its source | decisions whose source is the owner, such as dropping or keeping work |
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
