<!-- SCH-1 note -->

# AssuredLoop: the model from input to output

<!-- SCH-2 note -->

This is the model behind `design.md` in this folder, with one worked
example. The example is invented: a small invoicing project, `invoicer`,
whose central repo holds the spec, and one output repo, `invoicer-web`, that
holds the web code. Where this file and `design.md` differ, `design.md`
holds.

<!-- SCH-3 rationale explains:SCH-5 -->

Why a model: the owner asked for "a schema with modeling from input till the
output (code + test + doc changes + adr .. etc), they are alll connected like
a graph" (input 100). The owner and the architect design the schema; the AI
only fills it (input 96).

<!-- SCH-4 note -->

## 1. The picture

<!-- SCH-5 flow serves:assuredloop-v4/R8 -->

Every item has an ID, and every link has a name. The graph runs from what the
owner said to what was shipped:

```
 owner's words ──from──> requirement ──signed by──> sign-off
   (O1, O2…)               (R1…R4)                    (S1)
                              │  ▲
                   delivers   │  └── clarifies ── decision (D1)
                              ▼
                            task ──follows──> ADR (ADR-3)
                           (T1…T4)
                              │ named by
                              ▼
                      change (PR, central or output repo)
                 ┌────────────┼──────────────┬──────────────┐
                 ▼            ▼              ▼              ▼
     change spec / spec     code           test          doc
       paragraph (SP-12,  implements     verifies       documents
       INV-41)                               │
                 ▲                           │
                 └── serves ── requirement   └─> result: pass / fail / not run
```

<!-- SCH-6 note -->

## 2. The kinds of item

<!-- SCH-7 data serves:assuredloop-v4/R3,assuredloop-v4/R8,adr-numbers/R1 -->

| Item | Where its text lives | Written by | ID | Needs the owner's sign-off |
|---|---|---|---|---|
| Owner's words (source) | `requests/<name>/origin/` snapshots | the owner; the agent snapshots | O1, O2… | no: it is the input |
| Requirement | `requests/<name>/request.md` | the agent organizes; the owner signs | R1, R2… | yes, as a set, when it touches a promise |
| Sign-off | `origin/` | the owner | S1, S2… | it is the sign-off |
| Decision | `request.md`, Decisions | the agent records; the source decides | D1, D2… | when its source is the owner |
| ADR | `specs/adr/<n>-*.md`, a name that starts with one or more digits and a dash (`001-x.md` is ADR-1), written by the PR that makes the decision | the agent; it records its source | ADR-3 | no; who accepts an ADR is the project's way of working |
| Change spec paragraph | `requests/<name>/spec.md`: the change's promises, design and plan | the agent, in the PR | SP-12 | a signed requirement that covers it, for a promise kind |
| Spec paragraph | `specs/*.md`: the promises and the lasting design, by kind | the agent, in the PR (consolidation by hand) | INV-41 | a signed requirement that covers it, for a promise kind |
| Task | a line in `tasks.md`, an issue, a tracker key, or a title | whoever divides the work | T1, T2… | no |
| Change | a PR and its commits, in the central repo or an output repo | the developer | `invoicer-web#57` | no |
| Code, test, user doc | the central repo or an output repo: outputs of a change | the developer | a file path | no |
| Result | a result file at a commit | a test run or a review | test + commit | no |

<!-- SCH-8 rule serves:assuredloop-v4/R4 -->

The owner signs the organized requirement, never a paragraph. The kind only
decides whether a change needs that sign-off.

<!-- SCH-9 note -->

## 3. IDs in the text

<!-- SCH-10 rule serves:assuredloop-v4/R2 -->

Each paragraph gets an ID, in a hidden marker on its own line before it, with
a blank line after the marker and a blank line before it. The marker holds
the ID, the kind and the links (input 123). GitHub does not show HTML
comments, so a reader sees only the paragraph. This is a paragraph of
`specs/invoices.md` as it is stored:

```markdown
<!-- INV-41 rule serves:invoice-exports/R2 builds-on:INV-12 -->

The export link MUST expire 30 minutes after the email is sent.
```

- The key (`INV-41`) is one flat number per file, never used again. A
  paragraph keeps its key when it moves. `al` computes the display number,
  for example "INV-41 (2.3:4, in Export links)", which can change.
- A list or a table belongs to the paragraph that introduces it.
- Headings get markers too.
- The marker is the only machine text in a doc. The derived facts, the
  link-time bindings and, where a project uses them, the AI hints are in the
  record files (section 7).

<!-- SCH-11 note -->

## 4. The kinds of paragraph

<!-- SCH-12 definition serves:assuredloop-v4/R2 -->

Each paragraph has one kind, from a fixed list. The kind decides what a
change to it needs, and what it must link to.

<!-- SCH-13 definition serves:assuredloop-v4/R2,assuredloop-v4/R4 -->

Promise kinds. A change needs a signed requirement that covers it:

| Kind | What it is | Hints when it does not | Example |
|---|---|---|---|
| `purpose` | why the product exists | stay short | "Invoicer sends correct invoices to small businesses and keeps a record of each one." |
| `scope` | who or what is covered | name the cases | "Invoicer covers one-off and monthly invoices in one currency." |
| `rule` | what MUST or MUST NOT happen | read as one testable statement | INV-41 "The export link MUST expire 30 minutes after the email is sent." |
| `limit` | what it does not do or promise | say what is out | "Invoicer does not calculate tax." |
| `definition` | a term or a structure; it changes what the rules mean | link to the rules that use it | "A paid invoice is one whose full amount has arrived." |

<!-- SCH-14 definition serves:assuredloop-v4/R2 -->

Informative kinds. A change needs review only:

| Kind | What it is | It must link to |
|---|---|---|
| `rationale` | why a rule is so | `explains` → the rule |
| `example` | a case | `illustrates` → the rule |
| `open` | a choice left open | `resolved by` → a later decision or ADR |

<!-- SCH-15 rule serves:light-resign/R5 -->

In a change spec, informative paragraphs are meant for `specs/`, beside the
rules they explain, so each is consolidated like any spec text. A
rationale that explains only how one change is built is an `approach`.

<!-- SCH-16 definition serves:assuredloop-v4/R2 -->

Design kinds, in a change spec and in `specs/`: `component`, `interface`,
`data`, `flow` and `choice`. A change needs review only. A `choice` that is
hard to undo becomes an ADR.

<!-- SCH-17 definition serves:assuredloop-v4/R2 -->

The `approach` kind is design text that explains how one change is built. It
links like the other design kinds (it serves a requirement, and builds on or
changes spec paragraphs), and it stays with its change: it is never
consolidated.

<!-- SCH-18 definition serves:assuredloop-v4/R2 -->

Change-only kinds, in a change spec only: `plan`, `step` and `migration`.
They belong to their request by default; a task reference is optional. They
stay with the change, and are never consolidated.

<!-- SCH-19 definition serves:assuredloop-v4/R2 -->

The `note` kind: introductions, headings and connecting text. It needs no
link, and a change to it needs review only.

<!-- SCH-20 rule serves:assuredloop-v4/R11 -->

How a rule is checked, and by whom, is the project's way of working. `al
context` lists each rule's checks, or "none"; there is no hint for a rule with
no check. A paragraph that holds two rules and a limit gets the hint "split
it"; it is only a hint.

<!-- SCH-21 note -->

## 5. ADRs

<!-- SCH-22 rule serves:assuredloop-v4/R1,adr-links/R1,hints-and-blocks/R1,hints-and-blocks/R2,adr-edits/R1,adr-edits/R2 -->

- One file per decision, numbered, in `specs/adr/`. Its status changes:
  proposed → accepted → superseded by ADR-n. Who accepts it is the project's
  way of working; the schema records only its source.
- Links: `decides` → the paragraphs that it governs; `source` → the sign-off
  or the owner's words; `supersedes` → an older ADR. The text also names the
  alternatives that were considered.
- Any text may be rewritten in other words when its meaning stays the same.
  This holds for an accepted or superseded ADR as for a spec. A new ADR that
  supersedes it is needed only when the decision changes, in whole or in
  part. The review judges whether a rewrite keeps the decision; the tool
  does not.
- So a changed text of an accepted or superseded ADR gets a hint: "ADR-3's
  text changed: check that its decision is unchanged; if the decision
  changed, write a new ADR that supersedes it." A changed or removed link in
  its marker gets the same hint, and so does any other change of its marker
  line. A deleted ADR file gets a hint with its own message. Links added to
  the marker of an accepted ADR, with nothing else changed, get no finding.
- A marker line of an ADR that holds anything other than its ID, its kind and
  links gets a hint, in every mode: an unknown token, a second `<!--` or
  `-->`, or an empty item in a list of links. A line of an ADR that starts
  like a marker, but that `al` does not read as one, gets the same hint.
- An ADR whose first line is not a status that `al` knows gets a hint, in
  every mode. The known first lines are `Status: proposed`,
  `Status: accepted` and `Status: superseded by ADR-n`, which may name more
  than one ADR, as SCH-37 says.
- A proposed or accepted ADR with no `source` or no `decides` link gets a
  hint, in every mode. A superseded ADR gets none: it is history.
- A PR that changes a paragraph that an ADR governs gets a hint: "check that
  ADR-3 still holds". The review view marks each ADR that it names that has
  no `source` link.
- An ADR's ID is its number. It is in the file name, for example
  `specs/adr/0003-export-links-expire.md`, and on the markers of its
  paragraphs. Its status is a line at the top of the file.
- A superseded ADR keeps its `decides` links as history, even to paragraphs
  that were removed later.
- After an accepted or superseded ADR is rewritten, `al index --align <ID>`
  advances the bindings that paragraph `<ID>` holds to it, as for any other
  target.

<!-- SCH-37 rule serves:hints-and-blocks/R5,several-successors/R1,adr-lists/R1 -->

**A citation of a superseded ADR.** A current place that names a superseded
ADR also names at least one ADR that supersedes it, directly or through a
chain. When an ADR that it names is itself superseded, the same rule applies
to it. Else `al check` gives `not ok superseded-cited`.
- A place names ADR-n by a link in a marker, with any link word, or by the
  word `ADR-n` in its text. `ADR-n-k`, a paragraph of ADR-n, names ADR-n.
  For a link, the successor is named in the same marker. For a word, it is
  named in the same paragraph's text.
- The text also names ADR-n by the number after `ADR` or `ADRs` and a space,
  for example `ADR 0040`, and in a list or a range that starts with `ADR`,
  `ADRs` or `ADR-n`. The number names the ADR whose file name has that
  number: `0040` and `40` name ADR-40. Each item of the list or range is a
  number or `ADR-n`, for example `ADRs 0003, 0005 and 0040`, `ADR-3, 5 and 7`
  or `ADRs 3 and ADR-5`. A comma, `and`, or a comma and `and` join a list.
  Only `to` joins a range, for example `ADRs 0003 to 0005` or `ADR-3 to 5`.
  A range names each ADR that exists from its first number to its last. A
  reversed range, such as `ADRs 5 to 3`, names only its two ends. A number
  outside such a list or range names nothing. `or` and a dash between two
  numbers join nothing, and `adr` in small letters names nothing.
- The ADRs that supersede ADR-n are the ones that ADR-n's status line
  names, and each one whose marker has `supersedes:ADR-n`.
- The current places are each paragraph of the spec docs, with its marker;
  the Markdown files of an open request, except its `origin/` folder; and
  each proposed or accepted ADR, with its marker. A current place that cannot
  be read gives `not ok superseded-cited` at its path: its citations are not
  checked, and a read failure never hides a block. `al` does not read through
  a symlink, so a Markdown file there that is a symlink is such a place. Any
  other file or folder that `al check` cannot read, and that no check reports
  as `not ok`, stops `al check` with a refusal: exit 2,
  `al: <path> cannot be read`.
- Exempt, because they are the chain itself or dated records: an ADR that
  supersedes ADR-n, directly or through a chain; a superseded ADR; an ADR's
  `## History` section; a request's `## Decisions` section (D1, D2...);
  origin files; and archived requests.
- Each superseded ADR's status line is `Status: superseded by ADR-m`. It
  may name more than one ADR, joined by commas or `and`, for example
  `Status: superseded by ADR-11, ADR-12` or `ADR-11 and ADR-12`. Each ADR
  that it names exists, and its marker has `supersedes:` for the superseded
  ADR. Else `al check` gives `not ok superseded-status`, once for each ADR
  that fails.

<!-- SCH-23 note -->

## 6. The links

<!-- SCH-24 definition serves:assuredloop-v4/R8 -->

| Link | From → to | How it is made |
|---|---|---|
| `from` | requirement → owner's words (with a quote) | declared |
| `signed by` | requirement set → sign-off (with the hash) | exact |
| `clarifies` | decision → requirement | declared |
| `serves` | change spec or spec paragraph → requirement | declared, in the marker |
| `builds on`, `changes` | change spec paragraph → spec paragraph | declared, in the marker; bound with both hashes |
| `removes` | change spec paragraph → spec paragraph | declared, in the marker; for a promise paragraph, only where a signed requirement covers the removal |
| `source` | spec paragraph → where its text came from: a change paragraph, a path-1 requirement, or `adoption` | exact, in the request's record |
| `delivers` | task → requirement | declared |
| `follows` | task → decision or ADR | declared |
| `named by` | change (PR) → task | exact, from the PRs that name the task; no task status is kept |
| `edits` | change → paragraph | exact, from the markers in the diff |
| `cites` | code or test → paragraph or requirement | exact, when the file names the ID; it proves only that the ID is named |
| `implements` | code → rule or requirement | declared and optional; a claim, never shown as proven |
| `verifies` | test → rule or requirement | declared and optional; a claim, never shown as proven |
| `documents` | user doc → paragraph | declared and optional |
| `result` | test or review → pass, fail or not run, at a commit, with the hashes of its declared inputs | exact: "declared inputs unchanged since C1"; that those inputs are complete is a claim; inputs not given or not available give "applicability unknown" |
| `explains`, `illustrates`, `resolved by`, `decides`, `supersedes` | as in sections 4 and 5 | declared |

<!-- SCH-25 definition serves:assuredloop-v4/R8 -->

The tool shows how each link was made:
- **exact**: the script finds it in the files or in git.
- **declared**: the developer's agent writes it in the PR, and the review
  reads it.
- **hinted**: a rough link from git history, from files that change
  together, or from an AI suggestion with a quote.

<!-- SCH-26 definition serves:assuredloop-v4/R8 -->

A link to another repo uses a qualified ID: `central:INV-41`,
`central:invoice-exports/R3`, or a PR such as `invoicer-web#57`.

<!-- SCH-27 note -->

## 7. Where the model lives

<!-- SCH-28 data serves:assuredloop-v4/R3,assuredloop-v4/R10 -->

- The docs hold the text and the markers.
- `.assuredloop/` holds `config.yaml` (the settings and, in the central repo,
  the output repos), `schema.yaml` (this model, with a version) and
  `records/`.
- One record per request, `.assuredloop/records/requests/<name>.yaml`: the
  chain of that change, from the owner's words to the outputs, with its
  link-time bindings and its close lines. Each PR of the change writes
  mostly this one file.
- One record per doc, mirroring the docs, for example
  `.assuredloop/records/specs/invoices.md.yaml`: only fields that the script
  can regenerate (hash list, display numbers, derived change kinds) and, where
  a project uses them, the AI hints. Each hint records the paragraph hash it
  was made from.
- A quote holds the exact text, scoped to its paragraph and source version. It
  adds `prefix` and `suffix` only when the exact text occurs more than once in
  that paragraph.
- The developer's agent writes the markers in the PR, and the review reads
  them. AI hints and declared outputs are optional: a project adds them only
  where they help (AI hints where it uses search level 2 or higher). The script recomputes every derived field and ignores
  what anyone wrote there. Ordinary indexing never advances a binding; only
  `al index --align <ID>` does.

<!-- SCH-39 data serves:origin-elsewhere/R1 -->

The committed config says that the project keeps its original files outside,
by a name, not by a path: `originals: {outside: <name>}` in
`.assuredloop/config.yaml`. With no `originals` key, the files are in the
repo, as today, and `al` reads no other setting for them.

<!-- SCH-29 note -->

## 8. A worked example as records

<!-- SCH-30 example illustrates:SCH-28 -->

The epic `invoice-exports` adds CSV and yearly ZIP exports of invoices, with a
link sent by email. Its requirement has R1 (CSV download), R2 (an email link
that expires), R3 (a yearly ZIP) and R4 (ISO dates in every export). Its change
spec consolidated SP-12 as INV-41 early, in part 1. The web code lives in the
output repo `invoicer-web`. Hashes are cut short.

<!-- SCH-31 example illustrates:SCH-28 -->

The per-doc record. The kinds and links are in the markers, so the record
holds only regenerable fields and, because this project uses them, the
optional AI hints; the `kind` lines are a copy that the script reads from the
markers:

```yaml
# .assuredloop/records/specs/invoices.md.yaml
schema: assuredloop/1
file: specs/invoices.md
paragraphs:
  - id: INV-12
    kind: data                 # read from the marker
    text_sha256: 9c41…         # recomputed by the script
    hint:
      basis_sha256: 9c41…      # the paragraph hash the hint was made from
      summary: An invoice has a number, a customer, lines, a total and a paid date.
      quote: {exact: "An invoice has a number"}
  - id: INV-41
    kind: rule
    text_sha256: 2f07…
    hint:
      basis_sha256: 2f07…
      summary: An export link expires 30 minutes after the email is sent.
      quote: {exact: "MUST expire 30 minutes"}
```

<!-- SCH-32 example illustrates:SCH-28 -->

The request record:

```yaml
# .assuredloop/records/requests/invoice-exports.yaml
schema: assuredloop/1
request: invoice-exports
tier: 3
status: open

sources:
  - id: O1
    kind: owner-words
    file: origin/2026-05-04-owner-words.md
    sha256: 51aa…

requirements:
  - id: R2
    version: 1
    title: An email link that expires
    from:
      - {source: O1, quote: {exact: "the link should not work forever"}}

signoff:
  - id: S1
    file: origin/2026-05-05-signoff.md
    sha256: 7d3e…              # the signed text
    signed: 2026-05-05T10:12:00Z
    source: owner
    covers:                    # the requirement versions that S1 signs
      - {id: R1, version: 1, sha256: 0b12…}
      - {id: R2, version: 1, sha256: 4c8a…}
      - {id: R3, version: 1, sha256: e91f…}
      - {id: R4, version: 1, sha256: 5d07…}

decisions:
  - id: D1
    source: owner
    clarifies: [R2]
    summary: 30 minutes is long enough for the email link.

tasks:                          # references only; no status is kept
  - id: T2
    ref: "tasks.md T2; issue #31"
    delivers: [R2]
    prs: ["#33", "invoicer-web#57"]   # exact: the PRs that name this task

outputs:                        # optional; this project declares them; claims, never shown as proven
  - {repo: invoicer-web, file: src/export-link.js, implements: [central:INV-41]}
  - {repo: invoicer-web, file: test/export-link.test.js, verifies: [central:INV-41]}
  - {repo: invoicer, file: docs/exports.md, documents: [INV-41]}

bindings:                       # written when a link is first indexed; advanced only by --align
  - {holder: invoice-exports/SP-12, link: serves, target: invoice-exports/R2, target_version: 1, holder_sha256: 2f07…}
  - {holder: invoice-exports/SP-12, link: builds-on, target: INV-12, target_sha256: 9c41…, holder_sha256: 2f07…}
  - {holder: invoicer-web/test/export-link.test.js, link: verifies, target: central:INV-41, target_sha256: 2f07…, commit: invoicer-web@a81c…}

closes:                         # close lines (design.md 5); al keeps the hashes
  - {id: C1, on: SP-14, reason: "Not delivered: INV-12 keeps the 30-minute email link.", sha256: 77d0…, names: [{id: INV-12, sha256: 9c41…}], recorded: 2026-03-02T10:15Z}
```

<!-- SCH-33 example illustrates:SCH-28 -->

The script adds the results from the result files, for example: the test
`test/export-link.test.js` passed at `invoicer-web@a81c…`, and its declared
inputs are unchanged since then.

<!-- SCH-34 note -->

## 9. What the graph lets the tool say

<!-- SCH-35 example illustrates:SCH-25 -->

On these records, the tool can say, as exact facts or as hints:

1. SP-12 declares that it serves R2 (a declaration). That S1 covers version 1
   of R2 with its hash, and whether INV-41 changed since SP-12 linked it by
   `changes`, are exact facts. Whether INV-41 now says what SP-12 means is
   the review's judgement.
2. `test/export-link.test.js` declares that it verifies INV-41 (a claim). If
   it, or another test file, names INV-41 in its text, that citation is an
   exact fact. Its declared inputs are unchanged since `invoicer-web@a81c…`
   (exact); whether they are complete is a claim.
3. R3 and R4 have no task yet (a hint, because this project uses tasks).
4. Two open changes that both `change` INV-41 get an overlap hint on both. A
   new proposal does not change INV-41's text, so it makes no binding stale.
5. A later PR that edits INV-12 makes SP-12's recorded binding to INV-12 stale
   (its hash no longer matches). The hint stays until the change aligns on
   purpose with `al index --align`.
6. A typo claim that changes "only paid invoices" to "all paid invoices" is
   marked meaning-sensitive; the review decides (a hint).

<!-- SCH-36 limit serves:assuredloop-v4/R8 -->

What it does not say: that a test really checks INV-41, that a kind is
right, or that a merged task means the work is complete.

<!-- SCH-38 rule serves:hints-and-blocks/R2 -->

The tool's findings are hints for the review, and the review decides. A
finding is `not ok` only where an exact check of the records, hashes and
links decides it, and where breaking the rule lets an unapproved or wrong
decision be built (design.md 3). The tool does not judge whether a rewrite
keeps a meaning or a decision.
