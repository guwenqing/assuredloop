<!-- SP-1 note -->

# Findings are hints, except three exact rules that block: the change spec

<!-- SP-2 note -->

This change serves R1 to R5 in `request.md`. It changes SCH-22 in
`specs/schema.md`, and DES-5, DES-9, DES-10, DES-22, DES-33, DES-49 and
DES-58 in `specs/design.md`. It adds a paragraph on superseded ADRs and one
on findings to `specs/schema.md`, and a paragraph on unsigned requirements
and one on record evidence to `specs/design.md`. Each section has the
promise paragraphs first, then the design that keeps them.

<!-- SP-3 note -->

## Findings are hints for the review

<!-- SP-4 rule serves:R2 changes:DES-22 -->

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

<!-- SP-5 limit serves:R2 changes:DES-5 -->

**What v4 is not.** "I do not want a fullscacle lifecycle tool, to demand
user must follow an exact heavy wow to do everything in one way. anti
pattern, AWS's ai software development lifecycle framework" (input 126). AWS
AI-DLC (awslabs/aidlc-workflows, version 2) runs a deterministic engine with
14 agents and 33 stages, with a gate at each stage. Every rule in this design
must pass these limits:
- No phases or stages, and no order of work. How and when to test, review or
  design is the project's way of working (R11).
- The tool refuses only in its own command `al conclude`, for three reasons:
  a promise change with no signed requirement, a spike with no signed
  question, and a change paragraph with a baseline effect and no valid
  disposition (sections 5 and 6). `al check` gives the review hints, and the
  review decides. Only a few exact rules are `not ok` (section 3), and they
  block CI only where a project opts in with `--strict`.
- No roles, no approvals beyond the sign-off, no task states (R11).
- The user picks the path. A fix needs no record (R7).
- The tool keeps records of what was asked, decided, changed and delivered.
  It does not run the process. The records of what happened to spec text,
  and of which version a link read, are facts, not work phases, task
  dependencies, review receipts or approvals.

<!-- SP-6 rule serves:R2 changes:DES-33 -->

**Invalid dispositions.** `al check` shows an invalid disposition as a hint,
in every mode; `al conclude` refuses. A small design
correction (path 1d) to text that an open change incorporated makes that
change's `incorporated` disposition invalid, because the spec text no longer
equals the incorporated version. Both sides are told: the 1d PR gets a hint
that names the open change, and the open change's check shows the invalid
disposition. The open change aligns by a wording decision that names the new
text's hash, or by changing the text again. A typo fix (path 0) to such text
has the same effect, and its PR gets the same information hint.

<!-- SP-7 rule serves:R2 changes:DES-49 -->

- A spike may end with no follow-up. A new request is needed only for
  separately authorized work, which says `Follows: <spike>`. An answer may
  also inform work that is already open.
- Work that grows changes its path: a small change that needs a design adds a
  change spec and becomes path 2.
- Every PR states its path and its claim in a `Tier:` line of a commit
  message, for example `Tier: 0 — typo in INV-41`. `al check` reads the newest
  one in the branch's commits; it works offline, so it does not read the PR's
  text. With no `Tier:` line, a hint says so, and the path checks do not run.
- The script checks the claim against the declared kinds and the paragraph
  hash list, and gives a hint where they disagree: "path 0, but the PR
  changes a `rule` paragraph with no typo claim". On path 0, a change of kind into a promise kind is a
  promise change too. A non-promise spec paragraph that path 0 changes, adds
  or removes with no typo claim gets the hint "path 1d or 2?". A typo claim
  with a meaning-sensitive mark goes to the review. This checks the labels,
  not their meaning; a code-only change claimed as a fix still needs the
  review.
- **Small design corrections.** "Small" means, for the reviewer: it changes
  only names or wording of design-kind paragraphs; it adds or removes no
  component, interface, data or flow; and it touches no promise kind. The
  script shows the changed words. A 1d claim that touches a promise kind, or
  adds or removes a design paragraph, gets a hint. The review judges the
  rest. Larger design changes stay on path 2.

<!-- SP-8 rule serves:R2 changes:DES-58 -->

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

<!-- SP-9 rule serves:R2 -->

The tool's findings are hints for the review, and the review decides. A
finding is `not ok` only where an exact check of the records, hashes and
links decides it, and where breaking the rule lets an unapproved or wrong
decision be built (design.md 3). The tool does not judge whether a rewrite
keeps a meaning or a decision.

<!-- SP-10 approach serves:R2 builds-on:SP-4 -->

`al check` gives each finding one severity, the same with or without
`--strict`; `--strict` changes only the exit code. The marker lints
(`no-id`, `no-blank-before`, `no-blank-after`, `duplicate-id`,
`unknown-kind`, `unknown-link`, `no-kind`, `no-link`,
`duplicate-heading`) and the ID lints (`lost-id`, `used-again`) are
hints. So are `path-claim`, `unresolved-link`, `adr-changed`, `adr-links`
and `disposition`. The findings that stay `not ok` are `signoff-coverage`,
`unsigned-requirement`, `record-evidence`, `superseded-cited`,
`superseded-status`, `record-unreadable` and the line `spec-root`.

<!-- SP-11 note -->

## A rewrite that keeps an ADR's decision

<!-- SP-12 rule serves:R1,R2 changes:SCH-22 -->

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
  its marker gets the same hint. A deleted ADR file gets a hint with its own
  message. Links added to the marker of an accepted ADR, with nothing else
  changed, get no finding.
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

<!-- SP-13 data serves:R1 changes:DES-9 builds-on:SP-12 -->

| Set | Where | Holds | Changes how |
|---|---|---|---|
| One change | `requests/<name>/origin/` | the owner's words as snapshots, with SHA-256 | append only |
| | `requests/<name>/request.md` | the dialog, the organized requirement (R1...), the sign-off line, decisions (D1...), task references, the outcome | the requirement is an editable draft until it is signed (section 6); signed versions, the dialog and the decisions are append only; task references and the outcome are updated |
| | `requests/<name>/spec.md` | **the change spec**: the promises this change adds or changes, its design (the largest part), its plan, and its explanations | edited in the change's PRs |
| Consolidated | `specs/*.md` | the system now: the promises and the lasting design, told apart by kind | a PR replaces paragraphs by hand |
| | `specs/adr/` | the decisions; an ADR's text may be rewritten when its decision stays the same, and a changed decision is a new ADR that supersedes it | a new ADR file, or a rewrite that keeps the decision |
| Outputs | code, tests, `docs/` | the product and its user documents | normal PRs; traced from the change's record (input 112) |
| Tool data | `.assuredloop/` | `config.yaml`, `schema.yaml`, `records/` | the developer's agent and `al` |

<!-- SP-14 rule serves:R1 changes:DES-10 -->

- There is no free design document anywhere. Design lives only in a change
  spec or in `specs/` (inputs 108, 109).
- ADRs live in the spec folder (input 110). An ADR made in a change is
  written straight into `specs/adr/` by that change's PR, so it needs no
  consolidation. A rewrite that keeps an ADR's decision is made in place; a
  changed decision is a new ADR (schema.md 5).
- User documents in `docs/` are an output of a change, like code and tests
  (input 112). They carry no paragraph IDs of their own, unless the config's
  `docs:` list names them (section 17).
- Change-only paragraphs (plan, step, migration), `approach` paragraphs and
  `note` paragraphs stay with the change as its history; they are never
  copied into `specs/`. Every other kind in a change spec (promise kinds,
  the lasting design kinds, and the informative kinds rationale, example and
  open) is meant for `specs/`. A rationale that only explains how this change
  is built is written as `approach`.
- A change closes and its folder moves to `requests/archive/<name>/`.

<!-- SP-15 approach serves:R1 builds-on:SP-12 -->

For each ADR that was `accepted` or `superseded` at the base, `al check`
compares the working tree with the base, as before. When the file is gone,
the hint `adr-changed` says that ADR-n's file is gone, and asks to check
that its decision is not lost: an ADR that no longer holds is superseded by
a new ADR. When the text after the Status line changed, and the change is
not only links added to the heading marker of an accepted ADR, the hint
`adr-changed` has R1's message. Neither is `not ok`.

<!-- SP-16 approach serves:R1 builds-on:SP-12 -->

`al index --align <ID>` already advances a binding to a superseded ADR. On
main at 89813b7, a rewrite of a superseded ADR gave `stale-base` hints on a
change spec paragraph, a spec paragraph and the accepted ADR that
supersedes it. `al index --align` on each of them cleared the hint. So the
code does not change for this part; a test keeps it.

<!-- SP-17 note -->

## An unsigned requirement version

<!-- SP-18 rule serves:R3 -->

**An unsigned requirement version.** In each request whose record has
`requirements:`, open or archived, the latest version of each requirement
(or question) is covered by a valid sign-off; else `al check` gives
`not ok unsigned-requirement`. A requirement in `request.md` whose text is
not its latest recorded version is a new version, so it is not covered. A
requirement, sign-off or `covers` entry that `al check` cannot read is
`not ok` too, not skipped. The YAML layout does not count: block and flow
mappings and any valid indentation give the same result. A sign-off is valid
only when:
- a `covers` entry has the requirement's id, version and `sha256` exactly,
  with no case folding;
- its `file` is in the request's `origin/` folder, and the hash of that
  file's signed text equals its `sha256`;
- it records when it was signed (`signed`) and the signer's words
  (`words`).

<!-- SP-19 approach serves:R3 builds-on:SP-18 -->

`al check` parses each request record with the `yaml` library, so the
layout does not count. The latest version of a requirement is its entry with
the highest version. A requirement entry that is not a mapping, or has no
`id` of the form R<n> or Q<n>, no whole `version` above 0, or no `sha256`
text, cannot be read. So can a sign-off entry that is not a mapping, or has
no `id`, `file`, `sha256` or `covers` list, and a `covers` entry with no
`id`, `version` or `sha256`. A record that is not YAML, or not a mapping,
gives `not ok record-unreadable`. Each finding names the request and the
requirement or sign-off: `<request>/R2`, `<request>/S1`.

<!-- SP-20 note -->

## Changed record evidence

<!-- SP-21 rule serves:R4 -->

**Record evidence.** Each file that a request's record lists with a hash
still has that hash: each origin file under `sources:`, and the `file` of
each sign-off. `al check` hashes the snapshot's text, after its `---` line,
as `al record` hashed it. A changed, missing or unreadable file, or an entry
with no file or no hash, is `not ok record-evidence`. This holds for open and
archived requests. A result file's inputs are not record evidence: when one
changes, the result "does not apply to the current text", as section 9 says.

<!-- SP-22 approach serves:R4 builds-on:SP-21 -->

The snapshot's text is the bytes after the first line that is `---` or
`--- signed text ---`, as `al new` and `al record` write it. A file name may
be written with `origin/` in front or without it. A name with another
folder or with `..` is not in `origin/`, and is `not ok`. Each finding
names the request and the file: `<request>/<file>`.

<!-- SP-23 note -->

## A citation of a superseded ADR

<!-- SP-24 rule serves:R5 -->

**A citation of a superseded ADR.** A current place that names a superseded
ADR also names the ADR that supersedes it. When that ADR is itself
superseded, the same rule applies to it. Else `al check` gives
`not ok superseded-cited`.
- A place names ADR-n by a link in a marker, with any link word, or by the
  word `ADR-n` in its text. `ADR-n-k`, a paragraph of ADR-n, names ADR-n.
  For a link, the successor is named in the same marker. For a word, it is
  named in the same paragraph's text.
- The ADR that supersedes ADR-n is the one that ADR-n's status line names,
  or one whose marker has `supersedes:ADR-n`.
- The current places are each paragraph of the spec docs, with its marker;
  the Markdown files of an open request, except its `origin/` folder; and
  each proposed or accepted ADR, with its marker.
- Exempt, because they are the chain itself or dated records: an ADR that
  supersedes ADR-n, directly or through a chain; a superseded ADR; an ADR's
  `## History` section; a request's `## Decisions` section (D1, D2...);
  origin files; and archived requests.
- Each superseded ADR's status line is `Status: superseded by ADR-m`. ADR-m
  exists, and its marker has `supersedes:` for it. Else `al check` gives
  `not ok superseded-status`.

<!-- SP-25 approach serves:R5 builds-on:SP-24 -->

`al check` reads each current place line by line. A block is a run of lines
between blank lines. A marker line is its own block, and its links are the
values of its link words, split at commas; a value `ADR-n` or `ADR-n-k`
names ADR-n. In any other block, each word `ADR-n` or `ADR-n-k` names
ADR-n, also in fenced code. A `## History` or `## Decisions` heading starts
a section that is not read, up to the next heading of level 1 or 2. Each
finding names the place by its file and line, and by the paragraph ID where
it has one.
