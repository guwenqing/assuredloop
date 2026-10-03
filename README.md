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

It needs Node 24 or newer and git 2.31 or newer, and nothing else. Get the
tool, which puts `al` on your PATH (nothing is published to a registry):

    git clone https://github.com/guwenqing/assuredloop <dir>
    npm install --global <dir>

Then add one line to the project's AGENTS.md:

```
AssuredLoop keeps this project's requests and spec: before work that changes a promise, read <dir>/skills/assuredloop/SKILL.md and run `al context`.
```

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
