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
next. It refuses only in its own `al conclude`. Every other check is a hint;
a project that wants blocks turns on `al check --strict` in its CI.

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
  `INV-41 (2.3:4, in Export links)`, which can change when text moves.
- **Kinds.** Promise kinds (purpose, scope, rule, limit, definition): a
  change needs a signed requirement that covers it. Design kinds (component,
  interface, data, flow, choice) and `approach` (how one change is built):
  a change needs review. Informative kinds (rationale, example, open), `note`
  (headings and connecting text), and the change-only kinds (plan, step,
  migration).
- **A request** is the folder `requests/<name>/`: `origin/` (the owner's words
  and the sign-offs, as snapshots with SHA-256), `request.md` (the dialog, the
  organized requirement R1…, the decisions D1…) and, from path 2, `spec.md`,
  the change spec, with IDs SP-1, SP-2…
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
| 2. Big change | a real design, one or a few PRs | a request and a change spec | if a promise kind changes | the close rule holds |
| 3. Epic | big, in parts over time | as 2, with optional task references | as 2 | the close rule holds |
| S. Spike | not yet clear what to build | a request with an organized question; the findings open with the answer | yes, on the question | the answer names the question version |

Every PR states its path and its claim in a commit message, for example
`Tier: 0 — typo in INV-3` or `Tier: 2 — invoice-payments, part 1`. `al check`
reads the newest `Tier:` line in the branch's commits, and checks the claim
against the kinds and the changed paragraphs: "path 0, but a rule paragraph
is changed with no typo claim" is `not ok`. It checks the labels, not their
meaning.

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
- `al check [--strict]`: the checks of this branch against its base.
- `al context [<name> | <ID>]`: where the project, a request or a paragraph
  stands. `--diff <range> --for review` is the review view. `--audit` gives a
  request's whole trace; `--at <commit>` any v4 state.
- `al conclude <name>`: the close rule; with `--yes` it writes the Outcome
  and moves the request to `requests/archive/<name>/`.
- `al export [--at <commit>] [--out <file>]`: one JSONL row per paragraph
  version, with its role, version, commit and links. It is not committed.
- `al search <words>`: see "Search".

Every command that changes files, except `new` and `index`, shows what it
would write, and writes only with `--yes`. Each output ends with three lines:
`Read` (what it read), `Next` (what to do next) and `Not known` (what the
tool cannot know).

## Settings

`.assuredloop/config.yaml`, at the repo's root. Every key is optional.

```yaml
root: specs                # the spec folder; every *.md in it except adr/ is a spec doc
docs:                      # each file and its ID prefix; other files may be listed too
  - {file: specs/invoices.md, prefix: INV}
results: .assuredloop/results   # where result files are
outputs:                   # in the central repo: its output repos
  - {name: invoicer-web, path: ../invoicer-web, commit: <sha>}
central: {path: ../invoicer}    # in an output repo: the central repo
```

`.assuredloop/schema.yaml` holds the kinds and the link words, with a version.
`al spec --add-ids` writes both files when they are absent.

ADRs are `specs/adr/NNNN-<slug>.md`, with `Status: proposed`, `accepted` or
`superseded` on the first line. The heading's marker holds `ADR-<n>` and its
`decides:`, `source:` and `supersedes:` links. The text of an accepted ADR
does not change; a new ADR supersedes it.

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
those commits. To move:

1. Finish each open 0.1.0 request on its pinned copy, or start it again
   under v4.
2. Install 0.2.0 (see "Install").
3. Run `al spec --add-ids`, as in steps 1-5 above. It marks every paragraph
   and writes the adoption record.

## What is enforced, and by whom

| The tool checks | The skill asks | The owner decides |
|---|---|---|
| `al conclude` refuses on its three conditions (see "The close rule") | write the owner's words and the organized requirement, and ask for the sign-off | what is wanted, by signing the organized requirement |
| IDs: missing, used twice, lost, used again; kinds and links; links that do not resolve; sign-off coverage of promise changes; path and typo claims; dispositions and exact equality; stale bindings; overlapping changes; ADR text changes; result applicability, as hints | choose the path, and state it in a commit message and the PR | whether a changed requirement is signed again |
| `check --strict` exits 1 on a `not ok`, when a project opts in | record each later decision, with its source | decisions whose source is the owner, such as dropping or keeping work |

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
