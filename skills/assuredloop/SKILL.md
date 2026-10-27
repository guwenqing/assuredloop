---
name: assuredloop
description: >-
  Keeping a change on what governs it with AssuredLoop's `al` (v4). Use in a
  project whose AGENTS.md names AssuredLoop: at the start of a task, before
  review, and when you need to know where a request stands.
---
# AssuredLoop

`al` keeps the records and gives hints. The review decides. Only
`al conclude` refuses.

## 1. At the start of a task

Run `al check`. Read the requirement, the change spec and the items that its
list shows in force. For an item whose status or history matters, run
`al context <ID>`. For an open request, `al context <name>` says where it
stands and what comes next.

## 2. Writing a change spec

Write the change's design as one readable document, `requests/<name>/spec.md`.
Name the requirement that each part serves, and the spec paragraphs that it
builds on, changes or removes. Copy no spec text, and write no "from A to B".

Each paragraph has a hidden marker line before it, with a blank line on each
side: `<!-- SP-4 rule serves:R2 builds-on:INV-12 -->`. Kinds: promise
(purpose, scope, rule, limit, definition), design (component, interface, data,
flow, choice), approach (how this change is built), informative (rationale,
example, open), note, change-only (plan, step, migration). Links: serves, builds-on, changes,
removes, explains, illustrates, resolved-by, governed-by, for; an ADR's heading
takes decides, source and supersedes. `files:<glob>,<glob>` sets a file scope.
A promise, design or approach paragraph needs a link. In `specs/`, write
`serves:<name>/R<n>`. Write a new paragraph with no marker, run
`al spec --add-ids <file> --yes`, then write its kind and links. Keep a marker
with its paragraph. Never renumber an ID, and never use one again.

## 3. Consolidating

When a piece is ready, and before the change closes, bring it into `specs/` by
your own judgement. Write `specs/` as the current system, and honor what is in
force. Rewrite, split or join paragraphs where that reads better. Write no
Was/Now text. Promise, design and informative paragraphs go into `specs/`;
approach, change-only and note paragraphs stay with the change. Then run
`al check`, and read its map.

## 4. Reviewing

Start from the change's behaviour, not only from the IDs written. Write the
judgements in `requests/<name>/review.md`.

1. Read the diff, the task, and the list and the map of `al check`.
2. Ask one search question about the changed behaviour: "which requirement or
   decision governs <behaviour>?". Use the chosen search: the team's knowledge
   base for `own`, `al search <words>` for `local`, grep for `none`. Written
   IDs can be incomplete or wrong. An empty result never means that you found
   every governing item.
3. Write a judgement, with its evidence, for each item that applies to the
   change, conflicts with it, or that you are not sure of, however you found
   it. Write no routine judgement for an item that does not apply.
4. For a design in the change: check that it answers the request's organized
   requirement. Name each part that serves no requirement.
5. For the consolidation: check that `specs/` now says what the change decided,
   with nothing lost and nothing added that the change did not decide. Write
   one consolidation judgement for each piece.
6. For the changed behaviour, find the test assertions that check it, by search
   or grep, whether or not a test names an ID or changed. Read each assertion:
   a test's name is not a check. When you found none, or read none, say so as
   unknown. A code quote never stands for a test.
7. For the changed behaviour, find the user documents that describe it, changed
   or not, and compare them with what was decided. A document that you did not
   read stays unknown.
8. Judge a "fix" claim: does the change alter behaviour that a requirement
   covers, other than to restore what the spec says? Then it is not path 0.
9. Run `al check` again. Stop when the search question and the lookups find
   nothing more that applies. An empty lookup alone does not mean that nothing
   applies.
10. Clear each hint by a fix, or, when it calls for no change, by a one-line
    judgement with its reason: `al record <name> judgement --hint <code>
    --on <ID> --reason "<why>" --yes`. A judgement never clears a `not ok`.

A judgement, then a consolidation judgement, which names the spec paragraphs
that hold the piece now:

```markdown
- INV-41 complies: the link expires 24 hours after it is created.
  - Item: "MUST expire 24 hours after it is created"
  - Code (src/export.js): "export const ttlHours = 24;"
  - Test (test/export.test.js): "assert.equal(ttlHours, 24)"
- SP-3 complies: the 24-hour link is now in INV-41.
  - Item (SP-3): "A shared export link lives for 24 hours"
  - Spec (INV-41): "The export link MUST expire 24 hours after it is created."
```

The verdict is complies, violates, unclear or not applicable. Quote word for
word. `Test: no test found` and `Test: tests not examined` are the unknowns.
Add `, base` after a path to quote the base.

## 5. A large spec, or other words

When the spec is large, or the task's words are not the spec's words, search
first, with the chosen search (step 4.2). Then read the files that it names.

When `.assuredloop/config.yaml` has no `search` line, set it up once:
1. Ask the user first whether the team has a knowledge base (an MCP server
   or a skill). If it has one, write `search: {own: <name>}`.
2. Else run `al search <words>`. Show the user its choices, its
   recommendation and its limits. Write the user's choice: `search: local`,
   `search: {local: <row>}` or `search: none`. Add `--full` to see every row.
3. Commit the line, so that every agent and CI read the same choice.

## 6. In every answer

- Support each material claim, with its meaning, its state and its version,
  from the project's own text. Cite the file and line, with an `al` ID beside
  it only as a label.
- Keep apart project evidence, declared links, inferences, facts held only in
  `al`'s records, and what is unknown. What a `Not known` line names is unknown
  to you too.
- Report `al`'s own output (a hint, a `Tier:` line, a "not checked" line) as
  `al`'s output. Check a hint in the project's files before you state it.
- "`al` found no hint" does not mean "the change has no misalignment".

## 7. An audit, only on request

Run `al check --all`. Write a judgement for every item in force, "not
applicable" included.

## What differs by path

Choose the path. Work that grows changes its path.

| Path | When | Records | Owner's sign-off |
|---|---|---|---|
| 0 | No promise changes: a fix that restores what the spec says, or a typo. | none | no |
| 1 | One or a few promise paragraphs change. | a short request; edit `specs/` directly | yes |
| 1d | Only names or wording of design paragraphs change. | a short request; edit `specs/` directly | no |
| 2 | A real design, in one or a few PRs. | a request and a change spec | if a promise changes, or the request has an R<n> |
| 3 | A big change, in parts over time. | as path 2, part by part | as path 2 |
| S | It is not clear yet what to build. | a request with a question | yes, on the question |

- Claim the path in a commit message and in the PR: `Tier: 0 — restores INV-41`,
  `Tier: 0 — typo in INV-3`, `Tier: 1 — amends INV-10`. `al check` reads the
  newest `Tier:` line.
- Start a request: `al new <name> --tier <1|1d|2|3|S> --from -`, with the
  owner's words on standard input. In `request.md`, under
  `## Organized requirement`, write each requirement as
  `<!-- R1 from:<snapshot> -->`, `### R1 <title>`, and one sentence with MUST,
  SHOULD or MAY. A spike writes `## Organized question`, `<!-- Q1 -->` and
  `### Q1 <title>`.
- A new version of an archived request's requirement is a requirement of a
  new request. Name the old one in its marker:
  `<!-- R1 from:<snapshot> replaces:<old request>/R<n> -->`.
- `al record <name> signoff --source <where> --words "<their words>"` shows
  what the owner signs. Only on the owner's own yes, run
  `al record <name> signoff --source <where> --words "<their words>" --yes`.
- Record each later word of the owner that you rely on, and each decision:
  `al record <name> origin --url <where> --from - --yes`,
  `al record <name> decision --source <who> --text "<it>" --yes`.
- Path 3: save the tasks' work items in a folder, and run
  `al check --issues <folder>`.
- A spike's change spec is never consolidated. Open its findings with the
  answer and the question version: "Answer to Q1 version 1: …".
- Delete a change paragraph that you will not deliver while the request is
  open, or run `al record <name> close --on SP-<n> --reason "<why>" --yes`. For
  a signed requirement met where no lasting paragraph links to it, run
  `al record <name> close --on R<n> --reason "<where>" --yes`.
- Close with `al conclude <name> --yes`: with the PR, or on path 3 with the
  last part.
