# AssuredLoop

AssuredLoop keeps an AI focused on one change. It holds together:
- the owner's words;
- the organized requirement the owner signs off;
- the current consolidated spec, the baseline: Markdown sections in `specs/`,
  each headed by an ID such as `## [INV-3] Dates`; and the change to it;
- the decisions;
- the code and tests that came with it.

A change to a promise keeps these records in a request, the folder
`requests/<name>/`.

Its command, `al`, gathers and checks these records and says what to do next.
It gives hints; it blocks nothing but its own `consolidate` and `conclude`.

## Install

It needs Node 24 or newer and git 2.31 or newer, and nothing else. Install
the npm package `@assuredloop/cli`, which puts `al` on your PATH:

    npm install --global @assuredloop/cli

To pin a version, name it: `npm install --global @assuredloop/cli@0.1.0`.
`al --version` prints the version and the folder it runs from.

The package carries the skill. Its folder, `<dir>` below, is
`$(npm root -g)/@assuredloop/cli`, so the skill is at
`$(npm root -g)/@assuredloop/cli/skills/assuredloop/SKILL.md`. Then add one
line to the project's AGENTS.md:

```
AssuredLoop keeps this project's requests and spec: before work that changes a promise, read <dir>/skills/assuredloop/SKILL.md and run `al context`.
```

In a shared repo whose contributors install `al` in different places, copy
`skills/assuredloop/SKILL.md` from `<dir>` at the pinned version into the
project, for example as `.claude/skills/assuredloop/SKILL.md`. Name that path
in the AGENTS.md line, say in the commit which version it came from, and copy
it again when you re-pin.

To work on `al` itself, use a clone in place of the npm package:

    git clone https://github.com/guwenqing/assuredloop <dir>
    npm install --global <dir>

The global `al` links to `<dir>`, so it follows whatever `<dir>` checks out.
To pin a commit, check out its SHA in a clone of its own (`git -C <dir>
checkout <sha>`) and run `node <dir>/bin/al.js` in place of `al`; it needs no
install, having no dependencies. From a clone, `al --version` also prints the
commit.

To run `al check --strict` in CI, the job needs a clone of this repo at the
pinned SHA, and the project checked out with its whole history
(`fetch-depth: 0`); then it runs `node <clone>/bin/al.js check --strict`. A
checkout with no main ref says
`no main to compare with, so no commits were checked`: it compares none of the
branch's commits with main, though its other checks, such as duplicate IDs in
the working tree, still run and can fail. A shallow clone that has
`origin/main` does not print that line, but reads no history before its
shallow boundary. While this repo is private, that clone
needs a secret with read access to it, which only this repo's owner can grant.
Without one, run `al check --strict` before each review instead.

## The commands

- `al new <name> --from <file|-> [--tier <1|2|3|S>] [--title <text>]`: start
  a request from the owner's words (`-` reads standard input); `--title` sets
  its heading, which is the name otherwise.
- `al record <name> origin|signoff|decision|part|section`: write one part of
  a record. To change a section the request already holds, write the decision
  first, then `al record <name> section <ID> --decision Dn` adds a new version.
- `al context [<name> | <ID> | --diff <range>]`: where the project, a request
  or a section stands; `--audit` for the whole trace, `--at <commit>` for any
  past state.
- `al spec [--list]`: the design as it stands. `--add-ids <file> --prefix <P>`
  gives IDs to the headings of a baseline file that have none.
- `al check [--strict] [--all]`: the hints for this branch, five at most;
  `--all` shows every one.
- `al consolidate <name>`: write a request's pending sections into the baseline.
- `al conclude <name>`: write the Outcome (what became of each requirement) and
  archive the request.

Every command that changes files, except `new`, shows what it would write, and
writes only with `--yes`. The skill, `skills/assuredloop/SKILL.md`, says how to
choose a tier (0 to 3, or S for a spike) and when to use which command. The
promises are in `specs/`.

A request that follows an earlier one says so on its Status line, as in
`Status: open · Follows: <name>`. Every word after `Follows:` is read as a
request name, so write names only.

## Settings

A project may add a file `.assuredloop` at its root, one `key: value` per line,
each path inside the repo:
- `root: <folder>`: the baseline's folder, `specs` when there is no such line;
- `tests: <path>`: a test file or folder beyond the usual names;
- `results: <path>`: a test result file or folder for `al check` to read;
- `adrs: <folder>`: a folder of decision records; `docs/adr` is always read too.

`tests:`, `results:` and `adrs:` may each be given on several lines.

## Common situations

Each example gives the steps, and what `al check` says on the PR. The `Tier:`
line goes in a commit message and in the PR.

### Adopting when the spec lives elsewhere

Say the design is `docs/prd.md`, and the root is to be `docs/prd/`. Use two
PRs.

PR 1 moves the file, fixes each relative link the move breaks (`(adr/)`
becomes `(../adr/)`), and sets the root. It comes before the project adopts
AssuredLoop, so it carries no Tier line:

    mkdir docs/prd && git mv docs/prd.md docs/prd/prd.md
    printf 'root: docs/prd\n' > .assuredloop

This is the step before the baseline exists. `al check`, if run on it, exits 0
(`--strict` too) with two notes:

    note: <sha> changes docs/prd/prd.md with no request linked (fine for tier 0; say why); git show <sha>
    note: no Tier line in origin/main..HEAD; add "Tier: <n> — <claim>" to a commit message, e.g. with git commit --amend

A tier-0 claim here would get
`not ok: the claim is tier 0, but origin/main..HEAD edits the baseline`: the
fork had no baseline, so the whole file reads as new.

PR 2, after PR 1 merges, adopts: the AGENTS.md line from Install, and IDs. It
claims `Tier: 0 — adds section IDs; no promise changes`:

    al spec --add-ids docs/prd/prd.md --prefix PRD --yes

`al check --strict` passes, with one note: the commit changes
`docs/prd/prd.md` with no request linked (fine for tier 0; say why). In one PR,
the IDs read as edits too: `edits the baseline: [PRD-1], [PRD-2], [PRD-3]`.

### Adding IDs to a spec file in the root

    al spec --add-ids specs/api.md --prefix API --yes

It numbers the headings that have no ID, with the next free numbers. Claim
tier 0. `al check --strict` passes, with the same note.

### Moving or splitting sections in the root

Move each section whole, heading and text unchanged, to another file in the
root. Claim tier 0. `al check --strict` passes, and its Evidence line says
`moves [R-3] specs/rules.md → specs/dates.md, text unchanged`. A new file holds
only the moved sections: a title or an intro line in it is new text, and gets
a `not ok`.

### A move that forces a text change

Moving `[R-2]` from `specs/` into `specs/files/` breaks its link
`(limits.md)`. The fix, `(../limits.md)`, changes the section's text. So does a
heading reworded on the way. `al` follows neither. Claimed as tier 0:

    not ok: the claim is tier 0, but origin/main..HEAD edits the baseline: [R-2]; al context --diff origin/main..HEAD

Either keep the change out of the move: move the section where its text still
works (a file in the same folder keeps its links), and reword in a tier-1 PR of
its own. Or claim tier 1 for the whole PR, as in the skill's quick path, with
`Amends: [R-2]` and the owner's sign-off. `al check --strict` then passes.

### Renaming a section's ID

Code, tests and requests cite a section by its ID. Rename `[R-2]` to
`[SIZE-1]`, claim tier 0, and `al check` says
`not ok: the claim is tier 0, but origin/main..HEAD edits the baseline: [R-2], [SIZE-1]`.
`al context R-2` then says `[R-2] not in the baseline`, and still lists the
code and tests that name it.

Keep the ID: it names the promise, not the file it sits in. If it must change,
claim tier 1, with the owner's sign-off and `Amends: [R-2], [SIZE-1]` (name
both, or a note says the new one is not named). In the same PR, change the
citations in code and tests; `al context R-2` lists them. `[R-2]` is never used
again.

Do not replace `[R-2]` across the whole repo:
- Archived requests and the other append-only records ([REC-12]) stay as they
  are, and keep `[R-2]` as history. Editing one gives
  `not ok: <sha> requests/archive/<name>/request.md: changes a request archived on main ([REC-12])`.
- An open request that holds `[R-2]` then reads it as
  `not found; candidates SIZE-1`, shown as that request's own information. It
  is re-aligned in that request's own work. A replace there edits its signed
  `origin/` snapshot, which gives a `not ok`.

### Starting a new repo from an already-agreed spec

Adopt the agreed text as it is, with no request: the owner signs a request's
organized requirement, never the spec text ([REC-5]). Say in the commit
message where and when the owner agreed it. Use two steps, as in the first
example.

PR 1, before adoption, imports the agreed text under `specs/` (with
`.assuredloop` if the root is elsewhere). It has no AGENTS.md line and no Tier
line: AssuredLoop is not adopted yet, and its rules start at adoption.
`al check`, if run on it, exits 0 with the two notes PR 1 above gets. In an
empty repo, PR 1 can instead be the first commit, straight to main.

PR 2 adopts: the AGENTS.md line from Install, and the IDs. It claims
`Tier: 0 — adds section IDs and the AGENTS line; no promise changes`:

    al spec --add-ids specs/<file>.md --prefix <P> --yes

`al check --strict` passes, with one note: the commit changes
`specs/<file>.md` with no request linked (fine for tier 0; say why). Requests,
with the owner's sign-off, start at the first promise change after that.

`specs/` holds promises, and each change to one needs the owner's sign-off, so
a build or UI design belongs in `docs/`, or as ADRs in `docs/adr/`, which `al`
reads, unless a passage is a promise the owner wants guarded.

## What is enforced, and by whom

The way of working (tests first, review, the PR flow) belongs to the bots that
use AssuredLoop, and is not in this table.

| The tool checks | The skill asks | The owner decides |
|---|---|---|
| `consolidate` and `conclude` refuse while the requirement is not signed, or a section is not ready | write the owner's words and the organized requirement, and ask for the sign-off | what is wanted, by signing the organized requirement |
| section states: was and now against the baseline, by exact text | choose the tier, and state it in a commit message (where `al check` reads it) and the PR | whether a changed requirement is signed again |
| append-only records, snapshot hashes, duplicate IDs, broken links, as hints | read the hints, and fix each `not ok` or say why it stands | decisions whose source is the owner, such as dropping or keeping work |
| `check --strict` exits 1 on a `not ok` this branch owns, when a project opts in | record each later decision, with its source | |

Everything else the tool shows is a hint: an observation, not a guarantee.
Nothing is installed in git hooks.

## Beyond code

The same records work on a repo of documents alone. The documents are the
deliverable, and `specs/` holds promises about them. "Tests" are named checks
(a deterministic check, a checklist or a review), listed with `tests:` in
`.assuredloop`; their results are the files they write, listed with
`results:`, in TAP or JUnit form. A result counts as evidence for a change
only when a `revision: <sha>` line names the commit being checked:
`# revision: <sha>` in TAP, `<!-- revision: <sha> -->` in JUnit XML. A result
with no such line, or at an older commit, is shown but is not evidence.
`test/non-code.test.js` walks one through.

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
`al check --strict`, checks that the tag matches `package.json`, and publishes
@assuredloop/cli to npm. It stores no npm token: npm trusts the workflow by
name. While this repo is private, npm publishes with no provenance statement,
since npm makes one only for a public repository.
