<!-- DES-1 note -->

# AssuredLoop: the design

<!-- DES-2 note -->

This is the consolidated spec of AssuredLoop: its promises and its lasting
design. Its paragraphs come from the change spec of the request
`assuredloop-v4`, which also keeps how that change was built. `schema.md` in
this folder holds the model and a worked example. "R<n>" is a requirement of
that request, and "Input N" means owner input N, whose words are in the
request's `origin/` folder.
Where this design and an older text differ, this design holds.

<!-- DES-3 note -->

## 1. Intent

<!-- DES-4 rationale explains:DES-5 -->

What the owner wants, and why, in the owner's words:

- Each paragraph of the spec and the design is traced, and a reference
  points to the part that matters, not to a whole section (input 101).
- Each change keeps its own documents, and one consolidated set stays
  current: "still have both one ti,e and the consolidated
  files/spec/design/adr" (input 92).
- "the big part of the change is the design itself for THAT CHANGE ONLY"
  (input 106), "with the honor of the existing consolidated design" (input
  107).
- "I DO NOT WANT TO HAVE 90% of the things in a "free" uncontrolled/untraced
  document" (input 109).
- No tool consolidates: "just do the simple paragraph replacement" (input
  95), and consolidation may happen "before the close of the whole "epic""
  (input 105).
- "a schema with modeling from input till the output (code + test + doc
  changes + adr .. etc), they are alll connected like a graph" (input 100).
- "if things are not useful, it is a total waste" (input 111), but "soem
  sort of price we must pay, we can pay" (input 127).
- "I allow ai to do typo fixing at least" (input 128).

<!-- DES-5 limit serves:assuredloop-v4/R11,assuredloop-v4/R7,hints-and-blocks/R2 -->

**What v4 is not.** "I do not want a fullscacle lifecycle tool, to demand
user must follow an exact heavy wow to do everything in one way. anti
pattern, AWS's ai software development lifecycle framework" (input 126). AWS
AI-DLC (awslabs/aidlc-workflows, version 2) runs a deterministic engine with
14 agents and 33 stages, with a gate at each stage. Every rule in this design
must pass these limits:
- No phases or stages, and no order of work. How and when to test, review or
  design is the project's way of working (R11).
- The tool refuses only in its own command `al conclude`: for a promise
  change with no signed requirement, a spike with no signed question, and,
  on paths 2 and 3, a signed requirement with no declared link or a spec
  paragraph that the change set out to change or remove and did not, with no
  close line (sections 5 and 6). `al check` gives the review hints, and the
  review decides. Only a few exact rules are `not ok` (section 3), and they
  block CI only where a project opts in with `--strict`.
- No roles, no approvals beyond the sign-off, no task states (R11).
- The user picks the path. A fix needs no record (R7).
- The tool keeps records of what was asked, decided, changed and delivered.
  It does not run the process. The records of what happened to spec text,
  and of which version a link read, are facts, not work phases, task
  dependencies, review receipts or approvals.

<!-- DES-6 rationale explains:DES-5 -->

The risk to watch: an ID on every paragraph, and a kind and links on promise
and design paragraphs, come close to an element-level trace chain. The
difference must hold: the links live in the doc and in git, most checks are
hints, and the records cost a small share of the work (a flexible 20%
target, input 123). Validation measures each rule against that cost.

<!-- DES-7 note -->

## 2. One change, and the consolidated spec

<!-- DES-8 rationale explains:DES-9,DES-10 -->

Why: the owner keeps both a change's own documents and one current set
(inputs 92, 104-108), and wants no design text outside the trace (input 109).
A reader must find the current system without reading past changes (R1).

<!-- DES-9 data serves:assuredloop-v4/R1,adr-links/R1,adr-rewrite/R1 -->

| Set | Where | Holds | Changes how |
|---|---|---|---|
| One change | `requests/<name>/origin/` | the owner's words as snapshots, with SHA-256 | append only |
| | `requests/<name>/request.md` | the dialog, the organized requirement (R1...), the sign-off line, decisions (D1...), task references, the outcome | the requirement is an editable draft until it is signed (section 6); signed versions, the dialog and the decisions are append only; task references and the outcome are updated |
| | `requests/<name>/spec.md` | **the change spec**: the promises this change adds or changes, its design (the largest part), its plan, and its explanations | edited in the change's PRs |
| | `requests/<name>/review.md` | the review note: the review's judgements of the change, consolidation judgements included (section 15) | written by the review in the change's PRs |
| Consolidated | `specs/*.md` | the system now: the promises and the lasting design, told apart by kind | a PR replaces paragraphs by hand |
| | `specs/adr/` | the decisions; an ADR's text may be rewritten when its decision stays the same, and a changed decision is a new ADR that supersedes it | a new ADR file, or a rewrite that keeps the decision |
| Outputs | code, tests, `docs/` | the product and its user documents | normal PRs; traced from the change's record (input 112) |
| Tool data | `.assuredloop/` | `config.yaml`, `schema.yaml`, `records/` | the developer's agent and `al` |

<!-- DES-10 rule serves:assuredloop-v4/R1,assuredloop-v4/R2,adr-rewrite/R1 -->

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

<!-- DES-11 note -->

## 3. IDs, kinds and links

<!-- DES-12 rationale explains:DES-13 -->

Why: "I assume every paragraph will have an "id", so you can freely link
them" (input 100), and "there are different kind of texts" (input 100). Only
an ID stored in the text survives rewording: Doorstop takes the ID from the
file name, StrictDoc keeps a machine ID apart from the other fields, and the
Ferrocene Language Specification keeps a stable ID apart from its shown
paragraph number. IDs built from a hash or from a heading change when the
text changes.

<!-- DES-13 rule serves:assuredloop-v4/R2 -->

**IDs:**
- Every paragraph has an ID. The key is one flat number per file, for example
  `INV-41`, never used again.
- The key is apart from the shown position. `al` computes a display number,
  for example "INV-41 (2.3:4, in Export links)". The display number can change
  when text moves; the key does not.
- An ID that is new in an open PR may be renumbered until the PR merges,
  because nothing outside the PR cites it yet. The duplicate-ID lint catches
  two parallel PRs that took the same number.
- A hidden HTML-comment marker goes on its own line before the paragraph,
  with a blank line after it and a blank line before it. Headings get
  markers too. GitHub does not show HTML comments, so a reader sees no ID.
- A list or a table belongs to the paragraph that introduces it.

<!-- DES-14 rationale explains:DES-13 -->

Why the blank line: a marker on the line next to the text can join two
paragraphs in some Markdown renderers (tested with pandoc); a blank line
keeps them apart. Prettier and mdformat keep such markers and their blank
lines. The check flags a marker with no blank line after it.

<!-- DES-15 definition serves:assuredloop-v4/R2 -->

**Kinds**, one per paragraph:

| Group | Kinds | Needs a link | A change to it needs |
|---|---|---|---|
| promise | purpose, scope, rule, limit, definition | yes | a signed requirement that covers it |
| design | component, interface, data, flow, choice | yes | review |
| design, kept with the change | approach: how one change is built | yes (R2 holds for all design text) | review; stays with its change, never consolidated |
| informative | rationale, example, open | when it explains, illustrates or resolves something | review |
| note | note: introductions, headings, connecting text | no | review |
| change-only | plan, step, migration | no; it belongs to its request, and a task reference is optional | review; never consolidated |

- A `rule` has a strength: must, should or may. The script reads it from the
  words (MUST, SHOULD, MAY and their negations); nobody writes it.
- A `definition` is a promise kind, because it changes what the rules mean.
- A design `choice` that is hard to undo becomes an ADR.
- `approach` is design text that explains how one change is built, as
  OpenSpec keeps its `design.md` with the change. It links like the other
  design kinds, and it stays with its change. Lasting design (component,
  interface, data, flow, choice) is consolidated. Why: the OpenSpec replay
  found delivered design that belongs to its change only.

<!-- DES-16 definition serves:assuredloop-v4/R2,assuredloop-v4/R8,link-hints/R1 -->

**Links:**
- `serves R<n>`: a promise or design paragraph, to the requirement;
- `builds on <ID>` or `changes <ID>`: to a consolidated paragraph. In a
  change spec, `builds on` may also name a promise paragraph of the same
  change spec, from the design that keeps it;
- `removes <ID>`: a change declares that it removes a spec paragraph (see
  section 5 for promise kinds);
- `for <task>`: optional, for a project that uses tasks;
- `explains`, `illustrates`, `resolved by`, `governed by <ADR>`.

<!-- DES-17 rule serves:assuredloop-v4/R2 -->

**Where the kind and the links are written** (input 123): in the paragraph's
hidden marker, so they move with the paragraph and cannot drift from it:

```markdown
<!-- INV-41 rule serves:invoice-exports/R2 builds-on:INV-12 -->

The export link MUST expire 30 minutes after the email is sent.
```

<!-- DES-18 definition serves:assuredloop-v4/R2 -->

Inside a request's own change spec, `serves:R2` means that request's R2. In
`specs/`, a link names the request. The marker holds IDs only. The hashes and
versions at the time of each link are bindings that the script keeps in the
request's record (section 4).

<!-- DES-19 rule serves:assuredloop-v4/R2,assuredloop-v4/R8 -->

**Who writes what:**
- People and agents write the markers (ID, kind, links), and, where a
  project wants them, the AI hints and the declared outputs (section 10).
- The script recomputes every derived field (files, paths, hashes, git links,
  results) from the repo, and ignores or overwrites whatever anyone wrote
  there. It does not try to prove who wrote a byte.
- The link-time bindings are the one derived record that is kept, not
  recomputed: they are frozen when first indexed (section 4).
- A declared link is never shown as proven.

<!-- DES-20 rationale explains:DES-19 -->

Why: derived facts that anyone can type in cannot be trusted, and a claim
shown as a fact misleads the review (the rules of the TraceLayer tool).

<!-- DES-21 rule serves:assuredloop-v4/R2,assuredloop-v4/R8 -->

**What "checked" means.** The script checks that declarations are well formed
and that references resolve. It does not check that a kind is right, that a
requirement is fully covered, or that a change is authorized in substance.
`al context` and `al check` say this in plain words; a clean check names
semantic coverage as "not checked".
- A code or test file that names an ID **cites** it. That is an exact fact.
- `implements`, `verifies` and `documents` are declared claims, and they are
  optional. By default the chain to code, tests and documents comes from
  exact `cites` and from git. A project declares an output only where it
  helps a reviewer. A test can cite INV-41 and check another condition, so a
  `verifies` claim is shown as a claim. Why: a review question can depend on a declared output.
- Rough links from git history and from files that change together stay
  beside the declared links. The graph is not limited to the links that the
  author chose. Studies of trace links find that declared links are often
  incomplete (only about 60% of commits named an issue, Rath et al., ICSE
  2018).

<!-- DES-22 rule serves:assuredloop-v4/R2,assuredloop-v4/R11,promise-design-split/R1,delete-in-change-spec/R1,link-hints/R1,adr-links/R1,hints-and-blocks/R2,issue-hints/R1,issue-hints/R2,applied-promise/R1 -->

**What the script checks** (no AI):
- A paragraph with no ID: a hint. A promise or design paragraph with no kind
  or no link: a hint. An adopted paragraph (section 5) gets no link hint
  while its text equals the captured text.
- A proposed or accepted ADR with no `source` or no `decides` link: a hint
  (schema.md 5).
- A link to an ID that does not exist: a hint. When another change removed
  the target, the hint is "target removed", and the open change aligns.
- Two headings with the same text under the same parent (the same heading
  path): a hint. The same text under different parents is valid. Why: two headings with the same path make a reference ambiguous.
- Per PR, the ID lint: IDs lost since the base, IDs used twice, and IDs used
  again after removal. Agents can remove comments near the lines they edit
  (claude-code issue #22530), so a lost ID must be caught. A lost ID is at the
  base, absent at the head in every doc of its scope, and named by no
  `removes:`. An ID used again is absent at the base but was used in an
  earlier commit.
- In an open request's change spec, deleting a paragraph is ordinary
  editing. Its lost ID is a hint that names the deletion. When the
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
  such word. A paragraph that is not a promise can hold such a word because it
  applies a promise. When it has a `builds on` link to a promise paragraph
  that exists, it gets no hint "promise kind?". A `builds on` link to another
  kind, or to an ID that does not exist, does not count. The other hints on
  the paragraph stay.
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

<!-- DES-165 rule serves:link-hints/R1 builds-on:DES-22,DES-37 -->

**A signed requirement with no declared paragraph link.** Each requirement
R<n> of an open request's current version that is signed gets the hint
`no-paragraph-link` while no paragraph of `specs/` serves it, no accepted ADR
decides it, and no promise or design paragraph of an open change spec serves
it. In `specs/` these are the declared links of item 2 of the close rule
(section 5), read by the same rule. A current close line on the requirement
clears the hint, as it clears item 2; a stale one does not, and the hint
names it. The hint says that the link is missing, never that the
requirement has no code or test. It shows the known direct links, each with
the limit of its evidence: an `approach` or another paragraph of an open
change spec that serves it and is no promise or design; an ADR that decides
it and is not accepted; a declared `verifies` output; and each file that
cites `<name>/R<n>`, as `al context <name>/R<n>` shows them. When none is
known, it says so. The message names each link by its ID or its file and
holds no line number; the places of its IDs and the citing line numbers
follow it, outside it. A judgement (below) keeps the message, so it goes
stale when a link or a citing file comes or goes, and not when a linked
paragraph or a citing line only moves. A
requirement whose sign-off is not checked gets no hint, and the Not known
line names it. An unsigned requirement, a spike's question and a
requirement of an archived request get no hint.

<!-- DES-163 rule serves:hints-and-blocks/R2,adr-rewrite/R1 builds-on:DES-22 -->

**A hint clears by a fix or by a judgement.** Every hint of `al check`
clears by a fix, or by a one-line judgement with its reason:
`al record <name> judgement --hint <code> --on <ID> --reason <why>`. `--on`
is the ID that the hint line shows, or the hint's path when that ID is `-`.
The command refuses when `al check` gives no such hint now. Why: the review
decides a hint, and its decision is recorded where the next review finds it.
- A judgement lives only in the record of an open request. A PR with no
  request of its own records no judgement, and its hints stay for its
  review. A rewrite of an ADR in other words is path 1d, which has a short
  request.
- The judgement keeps the versions of both sides of its hint. For
  `adr-changed`, these are the text of each ADR file that it covers, with its
  marker line, and its status line; after a rename, the one file of that
  number counts. For a hint with no ID on a line of a file, such as `no-id`,
  it is the text of the block at that line, as the marker parser reads it
  (a list after a blank line included), because the message names the
  place, which a move changes. For another hint, they are the hint's
  message, and the text of the paragraph that it is on and of each paragraph
  that its message names. The hint is cleared while these are the versions
  of now.
- When one side changes, the hint comes back, and it ends with "the
  judgement <request>/J<n> (<date>) is stale: <what> changed since it".
- `al check` shows the current judgements in one line:
  `info judged - - <request>/J<n> <code> <ID>: <reason>; …`. A judgement
  that is stale on one of its hints is not current, and the line leaves it
  out.
- For each pair of hint code and `--on`, only the newest judgement counts.
  An older one is history: it clears nothing, and `al check` does not name
  it; the request's record keeps it. This is for the judgements that keep
  versions. A binding names the judgement that moved it, and that one
  counts for that binding; `issue-changed` keeps its own form.
- A judgement on `stale-base` or `holder-changed` moves each binding of that
  holder that has the hint, in the record of `<name>`, to the versions of now
  (section 4). The binding names its judgement (`judgement: J<n>`), so the
  versions are kept once. Another record that holds the same link keeps its
  binding and its hint.
- For a `changes` or `removes` link of a change paragraph, the judgement
  moves only the holder side. The target side stays the version from when
  the change linked it, which the map and `al conclude` read (DES-160). A
  judgement on its `stale-base` keeps the target's version of now in
  `judged_target_sha256`, which only `stale-base` reads: it compares the
  target with that version only, and a later judgement keeps it.
- A judgement on `binding-unknown` binds each link of that holder whose
  binding is unknown, in the record of `<name>`. For a `changes` or
  `removes` link of a change paragraph, the target takes its text at the
  base, when the base holds it. A target that is gone takes its text in the
  newest commit that held it. When no commit of the clone holds it, the
  command refuses.
- A binding with no hint is not moved, for example a binding of an output
  file whose bytes changed.
- A move makes no binding and no judgement stale: the text hashes leave out
  the place. An ID-only edit makes no binding stale: the text hashes leave
  out the ID. A judgement names its hint by the ID, so after a new ID the
  hint shows again. The ID rules still name a lost ID.
- A judgement never clears a `not ok` or a refusal of `al conclude`. A
  judgement on a `not ok` is recorded and shown on its line ("· judgement
  <request>/J<n> is shown; it does not clear a not ok"). It changes neither
  `--strict` nor `al conclude`.
- `issue-changed` keeps its own form, with `--issues <folder>` (section 8).

<!-- DES-81 choice serves:assuredloop-v4/R2,assuredloop-v4/R11,promise-design-split/R1 -->

Close means a word-set similarity (Dice) of 0.6 or more, one named
constant.

<!-- DES-101 rule serves:issue-hints/R2 -->

**Phrases for the review.** A project may list phrases and patterns under
`phrases:` in `.assuredloop/config.yaml`. The list is empty by default.
`al check` gives the hint `phrase` for each match, at the file and the line
where the match starts, in: the spec docs and the ADRs; the Markdown files
of each open request, but its `origin/` folder; and, with `--issues`, the
text of each work item that it checks. Origin files and archived requests
are not read for phrases. The request records in `.assuredloop/records/` are not
read either: their `source:` fields would match a phrase such as "the
owner" on every line. A match is a hint in every mode.

<!-- DES-102 data serves:issue-hints/R2 builds-on:DES-101 -->

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

<!-- DES-23 flow serves:assuredloop-v4/R2 -->

**Who sets the kind.** The developer's agent proposes it in the PR, and the
review checks it. `al check --full` shows each changed paragraph's text
beside its kind and the requirements that it serves, with the text at the
base of the spec paragraphs that it builds on, changes or removes. Text
that changes a promise gets the promise treatment, whatever its kind. The
review may ask for a split where that makes the text clearer.

<!-- DES-24 note -->

## 4. The change spec honors the consolidated spec

<!-- DES-25 rationale explains:DES-26 -->

Why: the change's design must honor "the existing consolidated design"
(input 107), and parallel work must align, never overwrite in silence (R6,
input 25). A link is only useful if it remembers what the target said when
the link was made.

<!-- DES-26 rule serves:assuredloop-v4/R6,link-hints/R1,removed-links/R1,removed-links/R2 -->

- A change paragraph that relies on a spec paragraph says `builds on <ID>`.
  One that replaces it says `changes <ID>`: a reference, with no copy of the
  old text and no replacement text.
- **Bindings.** When a link is first indexed, the script records a binding in
  the request's record: the target's version or text hash at that time, and
  the source paragraph's text hash. Both ends are hashed.
  - Ordinary indexing never advances a binding.
  - Only a recorded judgement moves it, after the agent has checked the
    change against the new target (section 3): `al record <name> judgement
    --hint stale-base --on <ID> --reason <why>`, or `--hint holder-changed`.
    The PR diff then shows the old and the new binding, and the binding names
    its judgement. For a `changes` or `removes` link of a change paragraph,
    the judgement moves only the source side (section 3).
  - A newly declared link (not in the marker at the base commit) gets its
    first binding when it is first indexed. A link that was in the marker at
    the base commit but whose binding record is gone stays "binding unknown".
    The script never fills a lost binding with today's value by itself. A
    recorded judgement with `--hint binding-unknown` binds it, to the versions
    of now, or, for a target that is gone, to its text in the newest commit
    that held it (section 3).
  - The same rules hold for `serves R<n>` (the requirement version), for
    `from` (the owner's-words snapshot), and for declared outputs where a
    project declares them. Where a project declares no outputs, the tool
    cannot say that an output's declared claim went stale; the context view
    says which holds.
  - When no current marker declares a link any more (the same holder, link
    word and target), `al index` removes its binding and names it in its
    output. This holds for the records of the open and the archived requests.
    An archived change spec's markers, its requirements' `from` links and its
    record's `outputs` still declare their links. Git history keeps the
    removed binding. While `al index` cannot read a file that can declare
    links, it removes no binding and says why.
- When a bound target changes, the source paragraph gets the hint
  `stale-base` until it is fixed or judged: "builds-on INV-41, which changed
  since it was bound. Align it: check it, then al record <name> judgement
  --hint stale-base --on <ID> --reason <why>". Running the index again does
  not remove the hint.
- When the source paragraph's text changes after a link was bound, it gets
  the hint `holder-changed` until it is fixed or judged: "builds-on INV-41:
  this paragraph changed after the link was bound. Check that it still
  builds-on INV-41, then al record <name> judgement --hint holder-changed
  --on <ID> --reason <why>". The hint covers the links that a paragraph in a
  spec doc, an ADR or a change spec still declares, to a target that still
  resolves, in the records of the open requests: the bindings that a
  judgement can move. A requirement is out, because a changed requirement
  already needs a new sign-off. An output file is out.
- Request-local IDs resolve by request name, never by path:
  `invoice-exports/R2`, `invoice-exports/SP-12`. A request's name is
  permanent, so its IDs still resolve after a move or an archive.
- Two open changes that both `change` the same spec ID get a hint on both.
  The script sees only declared `changes` links; the near-match hint (section
  3) helps where a link is missing. `al context <ID>` shows the open changes
  that build on or change it, and the paragraphs that build on, explain or
  illustrate it.
- The change that holds a stale link aligns it. The PR that changes the
  target gets an information hint that lists the open changes linking to it;
  it is not blocked.
- A limit: `al` works offline and cannot see other open PRs. Two open path-1
  PRs that edit one spec paragraph surface through git's merge conflict and
  the second PR's stale binding, not through an overlap hint.

<!-- DES-27 note -->

## 5. Consolidation and the close rule

<!-- DES-28 rationale explains:DES-29 -->

Why: the owner wants no tool that consolidates (input 95), consolidation
before an epic closes (input 105), and nothing applied dropped in silence
(R5).

<!-- DES-29 rule serves:light-resign/R5 -->

**Consolidation:**
1. The agent brings each piece of a change into `specs/` by its own
   judgement. No command writes the spec. It may rewrite, split or join
   paragraphs, so that the spec reads as the current system, and it writes
   no Was/Now text. `al` does not compare the spec text with the change's
   text.
2. It happens when a piece is ready: in the PR with its code, or in a later
   PR, part by part, before the change closes.
3. Promise kinds, the lasting design kinds (component, interface, data,
   flow, choice) and the informative kinds (rationale, example, open) go into
   `specs/`. Change-only kinds (plan, step, migration), `approach` and `note`
   stay with the change as its history.
4. A promise-kind paragraph consolidated before its requirement is signed:
   `not ok`.
5. The review judges the consolidation, one judgement for each piece, in its
   review note. `al check` shows each judgement as current or stale, and a
   judgement goes stale when a paragraph that it names changes. A missing or
   stale judgement is a hint, and it never refuses.

<!-- DES-34 rule serves:light-resign/R5 -->

**Removals.** A change declares a removal with `removes:<ID>`. For a promise
paragraph, a removal is allowed only where a signed requirement covers it. An
informative paragraph needs only the declaration. In the central repo,
`removes:central:<ID>` names its own `<ID>`, for every reader (section 12). A
loss that nobody declared stays a lost-ID lint. Why: a whole-block replace in
real OpenSpec history dropped scenarios with no notice.

<!-- DES-37 rule serves:assuredloop-v4/R4,light-resign/R5,origin-elsewhere/R1 -->

**The close rule, by path.** A spike closes when its current question is
signed (section 6), and its change spec needs no consolidation. Paths 0, 1
and 1d close when every promise change is signed. On paths 2 and 3 (a
request that is not a spike, and whose tier is not 0, 1 or 1d), `al conclude`
refuses while:
1. a promise change is not signed;
2. a signed requirement of the request's current version has no declared
   paragraph link: a `serves` link from a paragraph in `specs/`, or a
   `decides` link from an accepted ADR. A requirement that the owner dropped
   is not in the current version, so it is not asked for. `al` says "no
   declared paragraph link", never "not built";
3. a change paragraph names a spec paragraph by `changes`, and that paragraph
   is unchanged since the link; or it names one by `removes`, and that
   paragraph is still in `specs/`. A `changes` link that has no binding yet
   refuses until `al index` binds it, because `al` cannot tell.
- Every request also needs each of its original files verified, on every
  path. `al conclude` reads each one again with the reader of section 10,
  in the preview and with `--yes`. It refuses while one is not checked or
  failed, and names each file and why. It does not run the checks of other
  requests. A request whose original files are all in the repo and verified
  needs no place.
- **The close line.** The author records one sentence with
  `al record <name> close --on <ID> --reason <sentence>`. On a change
  paragraph, it says why the paragraph is not delivered, and it clears item
  3 for that paragraph. On a requirement, it says where the requirement is
  met when no lasting paragraph links to it (an existing design reused, or
  a one-time task such as a migration), and it clears item 2. `al` keeps, by
  itself, the version of what the line names and of each spec paragraph
  that its reason names. For a requirement, that is its requirement version,
  so a text that changes and changes back still makes the line stale; a line
  on a requirement whose current text has no version yet is refused until
  `al index` gives it one. A word of the reason in the ID form that names no
  paragraph of `specs/` is shown, and not kept. The line clears only while
  they keep those versions. When one changes, `al conclude` shows the line as
  stale, and it clears nothing until the author records it again. The
  latest line for an ID counts. A close line is the author's declaration,
  shown with its basis; the review reads it. It never clears item 1.
- Nothing else refuses. A missing or stale consolidation judgement and the
  map's hints are shown before `al conclude` closes, and never refuse. A
  review judgement never clears or causes a refusal.
- The check runs on the closing PR's state. An archived request is never
  checked again against today's spec.
- The local tree and main stay apart: "consolidated on main" is read from
  main's history, not from the working tree.
- Code or tests that still cite a removed ID get a hint.

<!-- DES-38 rule serves:light-resign/R5,assuredloop-v4/R7,removed-links/R1 -->

**Path 1 and adoption.** A promise paragraph edited directly on path 1
names its requirement in its marker, `serves:<request>/R<n>`, with a binding.
A direct edit moves that `serves` link to the new request's requirement;
`al index` then removes the old binding, and git history keeps it. A typo
fix (path 0) keeps the link. The adoption record names each paragraph that
existed before adoption with `source: adoption` and the captured baseline
(the commit and its hash). It proves where the text came from;
`source: adoption` is not an owner approval, and it does not excuse later
changes that nobody asked for. The word `from` is kept only for the link from
a requirement to the owner's words.

<!-- DES-39 definition serves:light-resign/R5 -->

An adopted paragraph is a spec paragraph that a request's record names with
`source: adoption`, the captured commit and its text hash. It has no
requirement to serve, so it gets no link hint while its text equals the
captured text. After an edit, it follows its path: a typo fix keeps it as it
is, and a path-1 edit adds `serves:<request>/R<n>`.

<!-- DES-40 note -->

## 6. Sign-off

<!-- DES-41 rationale explains:DES-42 -->

Why: "Requirements are still the same need the signoff" (input 100); the
owner signs the organized requirement, never a paragraph (R4). The owner and
the requirement may change while the owner explores (input 122).

<!-- DES-42 rule serves:assuredloop-v4/R4,hints-and-blocks/R3 -->

- A sign-off is needed when a change touches a promise kind, and for every
  spike's question. A request that has a requirement (R<n>) needs it signed,
  also when it changes no promise kind (below). A request that touches no
  promise kind, is not a spike and has no requirement closes without one. So
  a design-only change, whose request has no requirement, needs no sign-off;
  the review reads it.
- A PR that edits a promise-kind paragraph, in a change spec or in `specs/`,
  with no signed requirement that covers it: `not ok`. It blocks only under
  opt-in `--strict`. A typo-fix claim is the exception (below).
- `al conclude` refuses while a promise change has no sign-off.
- A later change to a signed requirement needs a new sign-off.
- A request with no kept effect may be abandoned without a sign-off. The owner
  never has to sign work that the owner chose not to pursue.

<!-- DES-89 rule serves:hints-and-blocks/R3,origin-elsewhere/R1 -->

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
- its `file` is in the request's `origin/` folder, or kept outside the
  repo (section 10), and the hash of that file's signed text equals its
  `sha256`;
- it records when it was signed (`signed`) and the signer's words
  (`words`).

<!-- DES-126 rule serves:origin-elsewhere/R1 builds-on:DES-89 -->

A sign-off whose file is kept outside and is not checked (section 10) is
never counted as signed. That alone gives no `not ok`. Its other conditions
(the `covers` entry, `signed` and `words`) are checked in every state, and a
failure of one stays `not ok`.

<!-- DES-43 rule serves:assuredloop-v4/R4,assuredloop-v4/R7 -->

**Typo fixes** (input 128). An AI may claim a typo fix in any paragraph of a
change spec or of `specs/`, promise kinds included, with no request and no
sign-off, on path 0. The script cannot establish that the meaning is
unchanged: "The export includes only paid invoices" becoming "The export
includes all paid invoices" changes one short word, no number and no MUST,
and changes the promise. So:
- The script shows each changed word beside the word it replaces, and the full
  sentence.
- It marks as "meaning-sensitive; review the typo claim" any change to a
  normative word (MUST, SHALL, SHOULD, MAY, REQUIRED), a negation (not, never,
  no), a number (number words count: zero to twenty, half, once, twice, first
  to tenth), or a quantifier (only, all, every, any, each, none, some, at
  least, at most). "MUST MUST" to "MUST" is marked and is a true typo; "paid"
  to "unpaid" is not marked and changes the meaning. So the mark never forces
  a request or a sign-off by itself, and its absence proves nothing. The
  review decides in both cases.
- The claim is never shown as proven.
- Typo fixes apply to spec and change-spec text only. The owner's words in
  `origin/` are never edited; a corrected reading is a note in the dialog, and
  the snapshot stays.

<!-- DES-44 rule serves:assuredloop-v4/R4,assuredloop-v4/R7 -->

**The spike:**
- The spike's current organized question needs the owner's sign-off.
- Its conclusion names the question version that it answers.
- Its exploratory change spec (candidate designs and experiments) stays with
  the spike as history. It needs no consolidation, and it never becomes
  current design.
- An unsigned spike that the owner drops may be abandoned unsigned.

<!-- DES-45 rule serves:assuredloop-v4/R3,assuredloop-v4/R4 -->

**The owner's words and the requirement change too** (input 122):
- Before the sign-off, the requirement is a draft. It changes freely, and work
  may start on it; delivery comes with the sign-off or after it.
- New or changed owner's words are a new snapshot, appended. The old snapshot
  stays.
- After the sign-off, a changed requirement is a new version, signed again.
  The first and the latest versions both stay readable.
- Each `from` link binds its snapshot, and each `serves R<n>` link binds the
  requirement version (section 4). When a newer snapshot or version changes
  the linked text, the linking paragraphs get a hint until they are aligned:
  "R2 changed after this paragraph was linked to it. Check that it still
  serves R2."
- A spike's organized question can change the same way.

<!-- DES-119 rule serves:light-design/R1,assuredloop-v4/R9 -->

**A requirement that replaces one of another request.** An archived request
is not edited, so a new version of its requirement is a requirement of a
new request. Its marker names the old one:
`<!-- R5 from:<snapshot> replaces:assuredloop-v4/R5 -->`. The token is
outside the signed text, and it names a requirement `R<n>` of another
request only.
- The replacement holds once the current version of the new requirement is
  signed. Until then, the old one stays as it is. When the original file of
  the sign-off is not checked, `al` says that it does not know.
- A replaced requirement is not in force. `al context` shows the link on
  both requirements, and the full trace of the old request names each of
  its replaced requirements.
- A paragraph of `specs/` that serves the replaced requirement and not the
  new one gets the hint `serves-replaced`, until it serves the new one or no
  longer serves the old one.
- A link on a question, a link to no requirement of another request, a link
  inside one request, and two requirements that replace one are hints
  (`replaces-link`).

<!-- DES-129 interface serves:light-design/R1,assuredloop-v4/R9 builds-on:DES-119 -->

How `al` shows a replacement. A marker may hold more than one `replaces:`
token, and a token may hold a list joined by commas.
- `al context <old>` adds "replaced" after the sign state when the
  replacement holds, and "replaced: not known" when `al` does not know. It
  shows a `Replaced` line for each requirement that replaces it, with that
  requirement's place, version and sign state, and then "the replacement
  holds", "a proposed replacement: it holds once this version is signed" or
  "not known whether the replacement holds".
- `al context <new>` shows a `Replaces` line for each link, with the old
  requirement's place and its last signed version, or "never signed".
- Where the list of section 15 shows a signed requirement whose replacement
  holds, it shows it as replaced, with the requirement that replaces it: its
  place, version, sign state and text. A listed requirement that replaces
  another names it.
- The hint `serves-replaced` comes once for each replacement that holds:
  "<ID> serves <old>, which <new> replaces: check that it still holds, then
  serve <new>". When `al` does not know whether the replacement holds, its
  `Not known` line says so, and it gives no hint. A paragraph of an open
  change spec is a proposal, and gets no such hint.
- The hint `replaces-link` is on the marker line. For two requirements that
  replace the same one, each marker gets the hint, and each requirement
  that replaces it stays shown.
- `al context <old request> --audit` names each of its requirements that a
  link replaces, with its place and the same words.
- Each of these findings is a hint and not a `not ok`, and no exit code
  changes.

<!-- DES-46 note -->

## 7. Paths for each kind of work

<!-- DES-47 rationale explains:DES-48,DES-49 -->

Why: "we need to support a regular wow, in various cases, big or small, clear
or spike" (input 114), with the user free to pick (R7, input 126).

<!-- DES-48 definition serves:assuredloop-v4/R7,hints-and-blocks/R3 -->

| Path | When | Records | Sign-off | Consolidation | Closes when |
|---|---|---|---|---|---|
| 0. Fix | no promise changes: it restores what the spec says, or claims a typo fix in any paragraph | none; the PR says `Tier: 0 — restores INV-41` or `Tier: 0 — typo in INV-41` | no | none | the PR merges |
| 1. Small promise amend | one or a few promise paragraphs change | a short request; no change spec; the PR edits `specs/` directly | yes | in the same PR | the PR merges |
| 1d. Small design correction | names or wording of design-kind paragraphs only (input 129) | a short request with a one-line source note; no change spec; the PR edits `specs/` directly | no | in the same PR | the PR merges |
| 2. Big change | a real design; one or a few PRs | request, change spec | if a promise kind changes, or the request has a requirement (R<n>) | in the PRs | the close rule holds |
| 3. Epic | big, in parts over time | as 2, with optional task references | as 2 | part by part, before the epic closes | the close rule holds |
| S. Spike | not yet clear what to build | request with an organized question; the change spec holds the candidates and the experiment; findings open with the answer | yes, on the question | none | the answer names the question version |

<!-- DES-49 rule serves:assuredloop-v4/R7,hints-and-blocks/R2 -->

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

<!-- DES-50 note -->

## 8. Tasks

<!-- DES-51 rationale explains:DES-52 -->

Why: "I want to be light on the project mgmt side ... we do not enforce one
way" (input 115). The chain must still reach from the requirement to the work
(input 100).

<!-- DES-52 rule serves:assuredloop-v4/R8,assuredloop-v4/R11,issue-hints/R1 -->

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

<!-- DES-91 rule serves:issue-hints/R1,own-item/R1,closed-items/R1 -->

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
  the folder names the request's own item and the item says which item is
  its parent;
- `phrase`: a phrase or pattern of the config matches the item's text
  ("Phrases for the review", section 3).
An item may say whether it is open or closed, in its `state`. An item that
does not say counts as open. For a closed item, `issue-superseded` is
`info`, not a hint, because a closed item records what held when it closed.
The other hints are the same for a closed item.

<!-- DES-92 rule serves:issue-hints/R1,own-item/R1,closed-items/R1 -->

Each of these is a hint in every mode, except that a closed item's
`issue-superseded` is `info` (DES-91); none is `not ok`. Without
`--issues`, `al check` reads no item and gives no line about items.
Archived requests are history, and their tasks are not read. Reading items
is optional: a project needs no tracker, and every other check works the
same without one. `al check` takes a request's own item only from the file
in the folder that names it, never from an origin source or another record.
When the folder names no own item for a request, `al check` does not make
the `issue-not-sub` check for that request's items, and its `Not known`
line says so once for that request.

<!-- DES-93 data serves:issue-hints/R1 builds-on:DES-91 -->

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

<!-- DES-94 data serves:issue-hints/R1 builds-on:DES-91 -->

An item that a task names in one of these forms, and that is not in the
folder, gets `issue-missing`; so does a `#n` when the request's own
repository is not known. A task whose `ref` names no item in the folder
gets `issue-missing` too. An item that several tasks name is checked once.
The items in the folder that no task names are not checked, and the
`Not known` line counts them. Two files may hold the same item, in the
same format or in two formats. The files are read in one name order, across
all formats. Where a task names the item in a form above other than its
`ref`, the first copy in that order is checked, and the other copy counts
as an item that no task names. Where a task names it by its `ref`, each
copy is checked.

<!-- DES-103 data serves:issue-hints/R1 builds-on:DES-91 -->

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

<!-- DES-95 data serves:issue-hints/R1,own-item/R1 builds-on:DES-91 -->

**The request's own item** is the item that the file
`assuredloop-requests.json` in the folder names for the request: the value
of the request's name under `requests`. The value names an item in one of
the forms above, as a task's `ref` does. When the value names no item in
those forms, the item in the folder whose `ref` the value holds as a whole
word is the own item; when there is none, the value itself is the own
item's `ref`. An item is a child of the own item when its `parent` names
the own item: by the parent's `url`, its `ref`, or its `number` in the
item's repository. The parent's `url` names the own item when it equals the
`url` of the own item or the value. It also names the own item when it
holds the own item's `ref` as a whole word, or names the own item in a form
above. When the file names no own item for a request, or the value is a
`#n` and the request's own repository is not known, `issue-not-sub` is not
given for that request's items, and the `Not known` line says why, once for
that request. An origin source's `url` does not name the own item. The own
item itself gets no `issue-not-sub`. An item with no `parent` field says
nothing about its parent: it gets no `issue-not-sub`, and the `Not known`
line says so. `parent: null` means that the item has no parent.

<!-- DES-107 interface serves:own-item/R1 builds-on:DES-91 -->

**The file of own items.** `assuredloop-requests.json` is a JSON object
with two fields, and no other field:
- `format`: the exact text `assuredloop-items/1`;
- `requests`: an object. Each key is the name of a request, and its value is
  that request's own item, as a text that is not empty: a URL, an
  `owner/repo#n`, or another tracker's key, for example `PROJ-1`.

<!-- DES-108 interface serves:own-item/R1 builds-on:DES-91 -->

The file is optional. It is not an item, and it is not read as one. A file
that is not valid JSON, has another `format`, has another field, or has a
value of another type gets `issue-unread` at the file, and is ignored as a
whole: no request has an own item then, and `al check` goes on. A key
that names no open request is ignored.

<!-- DES-96 interface serves:issue-hints/R1,closed-items/R1 builds-on:DES-91 -->

**The format of an item.** An item is a JSON object, a YAML mapping with
the same fields, or a Markdown file (below). Its GitHub fields are
the ones that the GitHub CLI prints with
`--json number,url,body,comments,parent,state`, so a GitHub user saves the
output of `gh` as it is, with no conversion:
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
  project key; optional;
- `state`: `OPEN` or `CLOSED` (gh); another tracker maps its states to these
  two; optional. Any other value is ignored, as a value of the wrong type is
  for the other fields, so the item counts as open.

<!-- DES-105 interface serves:issue-hints/R1 builds-on:DES-91 -->

An item needs a `body`, and a `url` of the form above, a `number` with a
`repository`, or a `ref`, so that a task can name it.

<!-- DES-97 interface serves:issue-hints/R1,own-item/R1 builds-on:DES-91 -->

**The folder.** `al check --issues <folder>` reads each `*.json`,
`*.yaml`, `*.yml` and `*.md` file in the folder, but not its subfolders,
and not `assuredloop-requests.json`. A JSON or YAML file holds one item,
or a list of items, as `gh issue view` and `gh issue list` print them. A
Markdown file holds one item. A file that is not valid JSON or YAML, and a
Markdown file that is not an item, get `issue-unread` at the file, with
the reason. In a list, each entry that is not an item gets
`issue-unread` at the file, and the other entries are read. The `Not known`
line names each such file. The folder is a path from the current
directory. A folder that is not there stops `al check` with a refusal: exit
2, and a line that names it.

<!-- DES-98 interface serves:issue-hints/R1 builds-on:DES-91 -->

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

<!-- DES-99 data serves:issue-hints/R1 builds-on:DES-91 -->

A bare `#n` is `#` and digits that come after no letter, digit, `_`, `-`,
`/`, `#` or `&`. GitHub reads it as an issue of the repository where it is
written. So in an item of another repository it points to that
repository's item n, not to the request's.

<!-- DES-100 rationale explains:DES-96 -->

Why the caller saves the items: `al` makes no network call, and handles no
token or login (issue-hints D9). Each tracker has its own tool and login,
GitHub Enterprise too, and the caller already has them. The format is the
one that `gh` prints, so GitHub needs no conversion (issue-hints D10). The
code of the superseded-ADR rule is the same as for `superseded-cited`, so
that the two rules cannot drift (issue-hints D7).

<!-- DES-104 example illustrates:DES-96 -->

To save GitHub issues, GitHub Enterprise included, save each issue with
`gh issue view`. `gh issue list` gives at most 100 comments of an issue, so
it can leave comments out.

```sh
mkdir -p /tmp/items
gh issue view 31 --repo acme/invoicer \
  --json number,url,body,comments,parent,state > /tmp/items/invoicer-31.json
GH_HOST=github.example.com gh issue view 5 --repo acme/web \
  --json number,url,body,comments,parent,state > /tmp/items/web-5.json
al check --issues /tmp/items
```

<!-- DES-106 example illustrates:DES-96 -->

An item of another tracker, saved by the caller:

```json
{"ref": "PROJ-12", "repository": "PROJ", "body": "Build the export (ADR-3).",
 "comments": [{"body": "Done.", "isMinimized": false}], "parent": {"ref": "PROJ-1"}}
```

<!-- DES-114 interface serves:issue-hints/R1 builds-on:DES-96 -->

**An item in Markdown.** A `.md` file of the folder holds one item, as
plain text that a person or an AI writes with no tool:
- The header: the first lines of the file, up to the first blank line.
  Each is `<Key>: <value>`, with one of the keys `URL`, `Number`,
  `Repository`, `Ref`, `State` and `Parent`, case ignored. Each gives the
  field of the same name. `State` is `open` or `closed`, case ignored.
  `Parent` is a URL, which gives the parent's `url`; `#n`, which gives its
  `number`; `none`, which gives `parent: null`; or another text, which
  gives its `ref`. With no `Parent` line, the item has no `parent` field.
- The body: the lines after the header's blank line, up to the first
  comment. A `Design:` line in the body names the item's design
  (light-design LD-48).
- The comments: each starts at a line that is exactly `## Comment <k>` or
  `## Comment <k> (minimized)`, outside fenced code, and goes on to the next
  comment or to the end of the file. k counts the comments from 1, in
  order, as the place `<key>/comment-<k>` of a hint does. `(minimized)`
  gives `isMinimized` true.
- Blank lines at the start and at the end of the body and of each comment
  are dropped. The rest is kept as it is, with line ends made LF.

<!-- DES-115 interface serves:issue-hints/R1 builds-on:DES-114 -->

Every `.md` file of the folder is read as an item, a README too. A
Markdown file is not an item, and gets `issue-unread` with the reason, when
its first line is not a header line, when a header line has another key or
a key that an earlier line has, when `Number` is not digits, when a
comment's k is not the next number, or when the header gives no `URL` of
the form above, no `Number` with a `Repository`, and no `Ref`. The same
item in JSON, YAML and Markdown has the same kept text (light-design
LD-22), with one limit: a Markdown body or comment cannot start or end
with a blank line. So a JSON item whose body or comment starts or ends with
a blank line has another kept text than its Markdown form.

<!-- DES-116 example illustrates:DES-114 -->

An item in Markdown, with a parent, a design line and two comments, one of
them minimized:

```markdown
URL: https://github.com/acme/invoicer/issues/31
State: OPEN
Parent: https://github.com/acme/invoicer/issues/30

Build the CSV export of invoices (ADR-3).

Design: docs/rfc/0018-export.md

## Comment 1

The first PR is up.

## Comment 2 (minimized)

An off-topic remark.
```

<!-- DES-118 example illustrates:DES-114 -->

The item above is the same item as this JSON:

```json
{"url": "https://github.com/acme/invoicer/issues/31", "state": "OPEN",
 "parent": {"url": "https://github.com/acme/invoicer/issues/30"},
 "body": "Build the CSV export of invoices (ADR-3).\n\nDesign: docs/rfc/0018-export.md",
 "comments": [{"body": "The first PR is up.", "isMinimized": false},
              {"body": "An off-topic remark.", "isMinimized": true}]}
```

<!-- DES-117 interface serves:issue-hints/R1 builds-on:DES-94 -->

**Items out of the CI token's reach.** The committed config may name the
work items that the CI token cannot read, in the list `items-out-of-reach:`
of `.assuredloop/config.yaml`. Each entry is a repository `owner/repo`,
which names every item of it, or one item in a form of a task's `ref`
above. With `--issues`, a task's item that the list names and that is not
in the folder gets no `issue-missing` and no `issue-changed`. In their
place, `al check` gives one line for all of them:
`info issues-out-of-reach - - <n> items out of the CI token's reach (items-out-of-reach in .assuredloop/config.yaml) are not in <folder>, so they are not checked, and al cannot tell whether they changed since the change relied on them: <item> (<request>/<task>, …), …`.
For one item, the line says "1 item … is not in <folder>, so it is not
checked, and al cannot tell whether it changed". It names each item once,
ignoring case, in the form of the first task that names it, with every
task that names it, and the folder as the caller wrote it. Another
tracker's key in the list is out of reach for each task whose `ref` holds
it as a whole word, when no item in the folder has exactly it as its
`ref` (the match that finds an item by its `ref` is case-sensitive), also
when the same `ref` names another item that is in the folder. A task whose
`ref` names no item in the folder keeps its `issue-missing` and its
`issue-changed`, unless its `ref` holds one or more other trackers' keys
of the list, and nothing else but white space and punctuation. An item that the list names and that is in the folder
is read as usual. A value that is not a list of texts that are not empty
stops `al check` with exit 2.

<!-- DES-130 flow serves:light-design/R3 builds-on:DES-91 -->

**A work item that changed** (C7). `al check --issues <folder>` gives the
hint `issue-changed` for a work item whose text differs from the text that
`al` kept when the change relied on it. The text is the item's body and
each comment that is not minimized, in order, with line ends made LF; its
state is not text. `al index --issues <folder>`, which `al check --issues`
runs, keeps the SHA-256 of a JSON list of these texts in the request's
record, by itself; no person and no AI writes or reads it. It keeps it only
at a moment that is now: when the record at HEAD has no task that names the
item (the request names it in this edit), and at the first sign-off after
the naming, while that sign-off is not at HEAD. The text at that sign-off
is the one that counts, else the text at the naming. A moment that is past
is not kept.
- The hint says "not known whether it changed", never "unchanged", for an
  item named in an earlier commit with no text kept, for a sign-off after
  the naming with no text kept at it, and for an item that is not in the
  folder or cannot be read.
- `al` cannot know when the caller saved a file, so each
  `al check --issues` says so in its `Not known` line. The caller saves the
  items again before a check.
- A closed item gets the same hint (DES-91): C7 compares the item with its
  own text at the moment of reliance, which is what held then. An archived
  request is not checked. Without `--issues`, no line is about items
  (DES-92).
- The hint clears by a recorded judgement that the change was read:
  `al record <name> judgement --hint issue-changed --on <item> --reason <why> --issues <folder>`
  keeps the hash of the item's text with the judgement, and the moment of
  reliance that held then. The hint comes back when that text changes again, or
  when a later sign-off becomes the moment of reliance. The other hints take
  the judgement of section 3.
- It is a hint in every mode, and never a `not ok`.

<!-- DES-131 rationale explains:DES-130 -->

Why the moment counts, and not today: each thing is judged by its own time.
A record of the past, such as a closed work item or an archived request, is
judged by what held when it was written. Only open work is checked against
what holds now.

<!-- DES-109 interface serves:own-item/R1,closed-items/R1 builds-on:DES-91 -->

**The JSON Schema of the files.** The README gives a JSON Schema (draft
2020-12) for each of the two kinds of file, so that a person or an AI can
write them and check them. The schema of an item file, which says what
"The format of an item" says:

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

<!-- DES-110 interface serves:own-item/R1 builds-on:DES-91 -->

The schema of `assuredloop-requests.json`:

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

<!-- DES-111 example illustrates:DES-107 -->

An `assuredloop-requests.json` for two requests, one with a GitHub issue
and one with an item of another tracker:

```json
{
  "format": "assuredloop-items/1",
  "requests": {
    "invoice-exports": "https://github.com/acme/invoicer/issues/30",
    "pay-run": "PROJ-1"
  }
}
```

<!-- DES-112 rationale explains:DES-95 -->

Why a file in the folder: an origin source's `url` is free text, for
example "a work session for acme/invoicer#46". An issue number in it was
read as the request's own item, so each task was reported as not a child
of it (issue #3). Only the caller knows which item is the request's own,
and the caller already prepares the folder. So the folder names it, in one
file, and `al` guesses nothing. The item files stay as `gh` prints them.

<!-- DES-53 note -->

## 9. Checks of rules, and results

<!-- DES-54 rationale explains:DES-55 -->

Why: a rule with no check is a wish, but how to check belongs to the project
(R11). Coverage builds up slowly in real specs: the Rust Reference had test
links for about 5.4% of its rules after two years (its test summary,
2026-10-09), and the Ferrocene spec asks for one test per section. So a hint
on every old rule would only make noise.

<!-- DES-55 rule serves:assuredloop-v4/R8,assuredloop-v4/R11 -->

- Each `rule` stays visible on its own: `al context` lists its checks, or
  "none". One checked rule never hides an unchecked one.
- There is no "rule with no check" hint. It would fire on every new rule before the rule's check exists.
- `al context` shows a summary per section, as information: rules, checks,
  uncovered rules, and a percentage. The summary groups the per-rule list; it
  does not replace it.
- Three facts stay apart: a check exists; a result exists; the result applies
  to the selected material. A result records the commit it ran at and the
  hashes of its declared inputs. The exact fact the tool shows is "declared
  inputs unchanged since C1". That the declared inputs cover everything the
  check depends on is a claim, and is shown as a claim: a test can also read
  an undeclared config file.
- When a declared input changed, the old result is shown with its commit as
  "does not apply to the current text". When inputs are not given or not
  available (for example an output repo that is not present), it shows
  "applicability unknown". A result at a commit that the clone does not have
  shows the same. The tool never infers that an unlisted changed file is
  unrelated, and builds no dependency graph.
- Result files live where the project's `results:` setting says. A result may
  carry `by`, `source` and `note`, and `commit: unknown` when nobody recorded
  it. Commit IDs resolve through git, so a short and a full hash of one commit
  match.
- For a report review, the report's own bytes can be the whole checked
  object. For a code test, a project may declare a wide scope (the tested repo
  trees and declared outside inputs) or a narrower one. A commit that only
  adds or changes the result file never changes the checked object. Unchanged
  inputs never count as a fresh run.

<!-- DES-56 note -->

## 10. Records

<!-- DES-57 rationale explains:DES-58 -->

Why: the owner wants the records "checked in, so it is easy to rebuild the
rag when needed" (input 123). The AI only fills the schema; the owner and the
architect design it (input 96). AI output varies between runs and models, so
AI fields stay hints: the same prompt at fixed settings gave accuracy that
varied by up to 15% over ten runs (arXiv 2408.04667), and a change of model
moved the main tag on close to half of the notes in one study (arXiv
2606.05970).

<!-- DES-58 rule serves:kb-search/R10,assuredloop-v4/R12,promise-design-split/R1,hints-and-blocks/R2 -->

- `.assuredloop/schema.yaml`: the schema, with a version. The owner and the
  architect design it. A user's extension gets the same careful review.
- `.assuredloop/records/`, committed to git:
  - one record per request: the chain of that change, its bindings (section
    4) and its close lines (section 5). Mostly that change's own PRs touch
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
  project fills AI hints only where its `search` setting names a model (level 2). Why: a PR must not depend on them, and keeping them costs tokens.
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

<!-- DES-90 rule serves:hints-and-blocks/R4,origin-elsewhere/R1 -->

**Record evidence.** Each file that a request's record lists with a hash
still has that hash: each origin file under `sources:`, and the `file` of
each sign-off. One reader gives each such file one result, and every
reader of original files uses it: the record checks (`record-evidence`),
the sign-off state, `unsigned-requirement`, `signoff-coverage`,
`al context` and `al conclude`. The result is one of three:
- verified: the snapshot's text after its separator has the recorded
  SHA-256, as `al record` hashed it. The separator is the first line that
  is `---` or `--- signed text ---`. A sign-off's file has only
  `--- signed text ---`;
- not checked: the project keeps its files outside, the file is not in the
  repo, and no place is set (DES-120);
- failed, with the reason: missing, unreadable, a folder or a link where a
  file should be, no separator, or a different SHA-256.

<!-- DES-127 rule serves:hints-and-blocks/R4,origin-elsewhere/R1 builds-on:DES-90 -->

The repo copy is read first: `requests/<request>/origin/<file>`, or at a
commit, that commit's file. Only a file that does not exist there goes on
to the place. A repo copy that exists but cannot be read, or that is a
folder, is failed, also when the place holds a good copy. A link at
`<folder>/<request>` or at the file is failed. A failed file, or an entry
with no file or no hash, is `not ok record-evidence`, for open and archived
requests. Its message names a file kept outside as
`originals:<request>/<file>`, never by the folder's path. A not checked
file gives one line for each request that names its files:
`info originals-not-checked <record> <request> no place is set on this
machine for "<name>": <files>`. The `Not known` line names the files and
the requirements that depend on them. A not checked file alone gives no
`not ok`, so `al check --strict` passes where the files cannot be reached,
such as on CI. A result file's inputs are not record evidence: when one
changes, the result "does not apply to the current text", as section 9
says.

<!-- DES-120 data serves:origin-elsewhere/R1 -->

**Original files outside the repo.** The committed config may say that the
project keeps the original files of its requests outside the repo
(schema.md, `originals`). Each worker maps the config's name to a folder on
its own machine, in `assuredloop/places.yaml` in the user's config folder
(`$XDG_CONFIG_HOME`, else `~/.config`): one line for each name,
`<name>: <folder>`. The folder is an absolute path of an existing folder.
Every clone on the machine finds the same folder, with no setup in the
clone. In the folder, the files keep the layout of the repo:
`<folder>/<request>/<file>`, with the same file names as in `origin/`. A
worker with several projects has one line for each.

<!-- DES-121 choice serves:origin-elsewhere/R1 -->

No places file, or no line for the name, means that no place is set. A
places file that cannot be read or is not valid YAML, and a line that is
empty, relative or names no existing folder, make the command refuse with
the reason. Such a setting does not count as "no place set", so a broken
setting cannot pass a strict check. The commands that read the working
tree's records (`al check`, `al conclude`, `al context`) and the three
writers of DES-123 read the places file. `al export` does not read it.

<!-- DES-122 rationale explains:DES-120,DES-121 -->

Considered and not taken: one environment variable (each shell and each
session launch must set it); a git-ignored file in each clone (each new
clone needs it).

<!-- DES-123 rule serves:origin-elsewhere/R1 -->

**Writing an original file outside.** `al new`, `al record <name> origin`
and `al record <name> signoff`, in a project that keeps its files outside:

1. Find the place. With no place set, refuse and write nothing. The
   previews of `al record origin` and `al record signoff` refuse too; a
   request with nothing to sign says so first.
2. Choose a name that is free in `origin/` in the repo and in
   `<folder>/<request>/`, and that the record does not name. Create the
   file there only if it does not exist yet. If another clone wrote it
   first, choose the next free name and try again.
3. If the write fails, refuse with the reason, and write nothing else.
4. Then write the record, and for a sign-off the `Signed off:` line in
   `request.md`. Both name the file by its name only (`origin/<file>`). The
   command's output names it as `originals:<request>/<file>`.

<!-- DES-128 rule serves:origin-elsewhere/R1 builds-on:DES-123 -->

A file written in step 2 whose record then fails to write stays in the
folder, named by no record. That is no false record. A project that keeps
its files in the repo keeps the rule that the name is free in `origin/`.

<!-- DES-124 data serves:origin-elsewhere/R1 -->

A structured source that is a path inside the folder (`--url` of
`al record origin`, `--source` and `--presented` of `al record signoff`;
absolute, `~/`, or relative to the current folder) is recorded as
`originals:<path in the folder>`. The folder's path anywhere else in such a
value becomes `originals:`. This happens before the record is written and
before a file name is made from the value. The full value of `--url` or
`--source` stays in the snapshot, which is outside the repo. A
`--presented` value is kept only as the record holds it. `--words` is kept
as given.

<!-- DES-82 data serves:kb-search/R10,assuredloop-v4/R12,promise-design-split/R1 -->

A quote is scoped to its paragraph ID and the paragraph's source version.
It holds the exact text by default. It adds `prefix` and `suffix` (the W3C
Web Annotation TextQuoteSelector form) only when the exact text occurs more
than once in that paragraph. A fuzzy re-anchor stays a hint.

<!-- DES-83 choice serves:kb-search/R10,assuredloop-v4/R12,promise-design-split/R1 -->

The search command may use a local SQLite index (section 11); no check
depends on it. `al` may use a pinned YAML library; zero dependencies is the
least important goal (input 99).

<!-- DES-59 note -->

## 11. Search and the export

<!-- DES-60 rationale explains:DES-61,DES-62 -->

Why: the owner wants search at a strength the user chooses, where "all cases
must work, it just provides different strength" (input 131). The evidence
for free text of this size: structure beats clever methods; word search is a
strong base; and old text must be filtered out, not ranked down.
- Ranking alone still lets nearly half of queries retrieve an outdated
  document among the top five results, even with recency weighting (HoH,
  arXiv 2503.04800). Version-aware retrieval did much
  better on versioned technical documents (VersionRAG, arXiv 2510.08109). So
  search filters by role.
- Graphs built by an LLM did no better than plain retrieval on direct
  questions, missed facts and cost far more to build (GraphRAG-Bench, arXiv
  2506.05690); a deleted document can stay retrievable after an incremental
  update (GraphRAG issue #2590). So the script exports the declared links as
  the graph.
- An agent that greps files does well on small corpora, and word search
  (BM25) overtakes it near 10 million tokens (arXiv 2607.26497).

<!-- DES-61 interface serves:kb-search/R10,origin-elsewhere/R1 -->

**The export.** `al export` writes one deterministic JSONL row per paragraph
version, built from the committed docs and records. It is not committed;
anyone rebuilds it. Fields: `repo, doc_or_request, id, version, role, file,
heading_path, kind, serves[], builds_on[], changes[], valid_from,
superseded_by, commit, sha256, text`, and the AI hints (`summary, tags`) in
fields marked as hints. The version key is repo + document or request +
paragraph ID + version. Local RAG tools do not read HTML-comment markers, so
the local index and a team's own knowledge base (`search: {own: <name>}`)
read this export.
- History comes from git. The export walks the first-parent history to the
  selected commit, through only the commits that touched the docs in scope,
  and reads only the files that changed. Every paragraph or requirement
  version that is not at the selected commit is a `history` row.
- `valid_from` and `superseded_by` are commits. The edges name the change
  that replaced a version.
- Output files and results add `evidence` rows, in the central repo and in
  the output repos (section 12).
- An original file kept outside the repo (DES-120) gets no row, and the
  export does not read the folder. The rows of a selected commit still come
  from that commit, and every row has its text. Each file kept outside is
  named, with its request, its name and its recorded SHA-256: on standard
  error when the export goes to standard output, and in the summary with
  `--out`. Search uses the same rows.

<!-- DES-62 definition serves:kb-search/R10 -->

**Roles.** "Latest version" does not mean "the current system": a baseline
paragraph, an open proposal for it and a spike candidate can each be their
source's newest version. The script derives one role for each row from the
existing records:
- `baseline`: consolidated spec text at the selected central commit;
- `proposal`: text of an open change spec;
- `spike`: exploratory text of a spike;
- `source`: the owner's words, the requirement and question versions, and
  decisions;
- `evidence`: results and outputs;
- `history`: removed and superseded text, and closed changes;
- `file`: one row for each file that git tracks at the selected commit, in
  the central repo and in each output repo, with its path and a rough kind
  from the path alone (code, test, doc, config or other). It is in the local
  index only, not in the export.

<!-- DES-63 rule serves:kb-search/R10 -->

These are retrieval labels, not work states. When a row fits two roles,
`history` wins, and the row keeps its original source type (for example a
closed spike, or a replaced requirement version).

<!-- DES-64 rule serves:kb-search/R10,promise-design-split/R1 -->

**Queries:**
- The default query is the current system: `baseline` rows at the selected
  central commit, and the `file` rows of each repo at its selected commit.
- A change-context query, for one selected change, adds its live `proposal`
  and `spike` text, its `source` rows and its `evidence` rows to the default
  query, so all `baseline` rows stay in.
- A history query adds `history` rows, never shown as current promises. A
  `file` row is never history.
- `file` rows are in word search only: level 2 does not embed them. Code is
  not indexed by syntax unit: agents grep code, and code navigation belongs
  to code tools.
- Each hit shows its role and its commit. All roles stay in the level 1
  full-text index, so they can be found by their words even where level 2
  does not embed them.
- IDs resolve exactly, in their own column, never through search.

<!-- DES-87 component serves:kb-search/R10,promise-design-split/R1 -->

- A chunk is one paragraph version, the unit that carries the ID, with a fixed
  header (file title, heading path, kind, ID). The parent section is returned
  on request.
- A rebuild compares paragraph hashes with an index manifest (model, chunk
  rule), embeds only new or changed rows, and rebuilds everything when the
  manifest changes. It removes from the current index every row missing from
  the commit's full listing; the history index keeps every version. An
  incremental index walks only each repo's commits after the last one in the
  manifest.
- The index is one SQLite file in the repo's git folder
  (`$(git rev-parse --git-path assuredloop)/search.sqlite`), never committed.
  One index serves the central repo and its output repos.
- No `llms.txt`: it has no measured benefit.

<!-- DES-65 rule serves:kb-search/R10,level2-peer/R1,promise-design-split/R1 -->

**The search setting** (kb-search/R10): the user chooses the source of
search with one committed setting (schema.md 7), so every agent of the team
and CI read the same choice.

| Setting | What `al search` does | Level |
|---|---|---|
| `none` | No search: it says so; the agent reads the files (grep). | 0 for the agent; `al` searches nothing |
| `{own: <name>}` | The team's own knowledge base, an MCP server or a skill: it names it and says to ask it. `al export` gives it `al`'s rows. | the team's |
| `local` | Local full text: `al export` into an index, with the ID in its own exact column, and one row for each file. | 1 |
| `{local: <row>}` | Level 1 plus one row of the measured table: an embedding model; vectors stored beside the text; word and vector results fused; the same roles and queries. | 2 |
| (later) | Mixed: the local index of level 2, with embeddings from a hosted service, preferably on Google Cloud; a hosted shared index may follow. | 3, future |

- No setting is a default (LD-64). Until the setting is there, `al search`
  searches nothing: it gives the choices, what each costs on this computer,
  the measured figures with their limits, and a recommendation (DES-166).
- The checks never use search. `al check` does not read the setting, so its
  exit code and its output do not change with it.
- Every choice works; a choice changes only the strength. Every level keeps
  exact-ID lookup, the roles, the commit identity and the history scope.
  `--level` may ask for a lower level; `--level 2` with `local` is refused.
- A wrong form of the setting, a row not in the table, a row that this
  version cannot run yet and an excluded row are refused (exit 2), with the
  rows that it runs.
- Level 1 needs no new dependency. It lives in `al` itself, as `al search`,
  and stays deterministic and offline. Without `node:sqlite` with FTS5 it
  scans the export (level 0), and says which level answered.
- Level 2 is optional: its library is installed by the user (DES-80).
  Without the library, `al search` answers at level 1, and a `Not known`
  line says how to add it. A set row that does not fit this computer still
  runs, and a `Not known` line says what it needs and what the computer has.
- The only data that leaves the machine is the model download. Before it,
  `al` writes the row and its download size to standard error.
- All levels read the same export and rebuild the same way, so a user moves
  between levels with no change to the records.

<!-- DES-88 component serves:kb-search/R10,promise-design-split/R1 -->

- Level 1 is a SQLite FTS5 (BM25) index. Node's built-in `node:sqlite` has
  FTS5 (checked on Node 24.21.0 and 26.11.1, with SQLite 3.53.4). The package
  declares Node 24 or newer, and CI tests level 1 on Node 24.
- The fusion is reciprocal rank fusion over the rows that have vectors. A row
  with no vector keeps its level 1 place, because the vector list gives it no
  vote and must not push it down.
  The models are the rows of the measured table (DES-166). At this size a
  plain scan of the stored vectors is fast enough, so no vector database is
  needed (an estimate: 20,000 rows of 384 numbers per query).
- Level 3: candidates on Google Cloud: Gemini or Vertex AI embeddings for the
  mixed setup; later a hosted index (for example Vertex AI RAG Engine, Vertex
  AI Vector Search, or pgvector on Cloud SQL or AlloyDB). Prices and data
  terms are not checked yet.
- The tool's tests run the search tests at levels 0, 1 and 2: level 2 with a
  small fixed test embedder for exact results, plus one smoke test with a real
  model. The recall of each row against level 1 is the measured figure of the
  table (DES-166), not a run of the tests.

<!-- DES-80 component serves:kb-search/R10,level2-peer/R1 -->

Where level 2 lives: its code is in `al`; its library,
`@huggingface/transformers` pinned at 4.3.1, is not our code and is no
package of ours. `al` names the library as an optional peer dependency, so
npm installs it only when the user asks:
`npm install --global @assuredloop/cli @huggingface/transformers@4.3.1`.
`al` finds it by normal Node resolution: the project first, then beside
`al`. Only `al search` loads it, at its first embed. The model is the row
that the setting names: its model repo pinned by its commit, with the row's
precision and device, embedded as the row was measured.

<!-- DES-166 component serves:kb-search/R10 builds-on:DES-65 -->

**The measured table and the recommendation.** The table in `al` holds each
model, precision and runtime that issue #28 measured for `al search` on one
Mac, 2026-10-21 to 2026-10-23, on 50 questions from one repo: the
embedding rows (transformers.js on the CPU, WebGPU and CoreML; llama.cpp on
the Metal GPU and the CPU) and the reranker rows. A row is named
`<model> <precision> <runtime>`, for example `bge-small-en-v1.5 q8 tjs-cpu`.
- Each row keeps its figures: the model files with their bytes, the peak
  memory, the index speed, the time of one search, recall@10 with its 95%
  interval, the gain over word search with its interval, and a published
  score where there is one. No figure of a row comes from a run of `al`.
- A row is in one state: it runs in this version and fits this computer;
  it runs and does not fit; this version cannot run it yet (the llama.cpp
  runtime and reranking, #100); or it is excluded, with the reason that the
  measurement found.
- It fits when the available memory is at least its peak memory plus 1 GB,
  the free disk at least its download plus its vectors (4 bytes × its
  dimension × the paragraphs to embed), and, for a Metal, WebGPU or CoreML
  row, the computer is macOS on arm64. The available memory is the free,
  inactive, speculative and purgeable pages of `vm_stat` on macOS, and
  `os.freemem` elsewhere.
- The recommendation, from code with no model: of the rows that this `al`
  runs and that fit, keep those whose gain has its interval above zero; of
  those within 0.05 of the best recall, recommend the smallest download.
  When none is left, recommend `local`. `al` never recommends `own` or
  `none`; the skill asks about a knowledge base first.
- With no setting, the answer names each of the rows once: one line for
  each row that fits, then the others grouped by state with their reasons;
  `--full` gives every row on its own line, and `--json` every row.
- Sizes are in MB and GB of 10^6 and 10^9 bytes. The first index times are
  estimates: the paragraphs to embed, at about bytes / 4 tokens, over the
  measured speed; for word search, the speed of the scale run's full index.
- The limits go with the figures: one Mac; 50 questions from one repo; a
  difference under about 0.05 is no difference; Linux, Windows and NVIDIA
  GPUs not measured; the thresholds of fit inferred; available memory
  changes from moment to moment.

<!-- DES-66 rule serves:assuredloop-v4/R13 -->

**Scale** (input 132): up to 1,000 change specs in one repo, and one search
across up to 20 repos. These are estimates, at about 100 tokens a paragraph:
- History is large and the current text is small. 1,000 archived change specs
  of about 100 paragraphs each are about 10 million tokens a repo; 20 repos
  are about 200 million. The current specs and the open change specs are a
  small part of that.
- So level 2 embeds only `baseline` and `proposal` rows. History goes into
  the level 1 full-text index, and search shows it only in a history query.
  No first full embedding of history is needed.
- At this size level 0 is weak, and level 1 or 2 carries the search.
- `al check` must stay fast at 1,000 requests. It still reads every
  record, because its checks of the records cover the archived requests
  too. So it parses each record and each spec doc only once in a run.

<!-- DES-67 note -->

## 12. One central spec repo, and output repos

<!-- DES-68 rationale explains:DES-69 -->

Why: "many of our solutions are using multi repos" (input 134); "so far
let's assume the spec stay in the central repo" (input 133). Links from output
repos are a must.

<!-- DES-69 rule serves:assuredloop-v4/R8,assuredloop-v4/R13,promise-design-split/R1 -->

- The central repo holds the spec (`specs/`, `specs/adr/`), the requests and
  the records. Its `config.yaml` lists the output repos, each with a name,
  the path of a local clone, and a selected or pinned commit. A URL is only a
  note for people: `al` never fetches.
- An output repo holds code, tests and user documents only: no spec and no
  requests. Its config names the central repo, so `al` there can resolve
  central IDs for hints.
- Output links to the central spec with qualified IDs, both ways: code and
  tests in an output repo cite central IDs (`central:INV-41`,
  `central:invoice-exports/R3`), and a central request's task names the output
  repo's PR (`invoicer-web#57`). A binding records the output repo's commit,
  so the evidence stays exact.
- The sign-off stays in the central repo. An output-repo PR that changes a
  promise names the central request that covers it; a fix says
  `Tier: 0 — restores central:INV-41`.
- `al` in the central repo derives the cross-repo links (cites, rough links
  from git, results) from local clones of the output repos at known commits. A
  repo that is not present gives "unknown", never a guess.
- The central `config.yaml` lists `outputs:`, each with `name`, `path`, and an
  optional `url` and `commit`. With no `commit`, `al` uses the clone's HEAD and
  shows that commit. An output repo's config names `central: {path, commit}`.
  A repo is the central repo, so that `central:X` means its own X, only when
  its config lists outputs.
- `al` reads another repo only through git at the resolved commit, never its
  working tree, and it never fetches. A repo with no path, no clone or a
  commit that does not resolve is "unknown", with the reason.
- The links from an output repo are those of schema.md 6. A commit message
  that names a central task (`central:<request>/T1`) is a `named by` link.
  Other IDs in commit messages make no link.
- `al` shows "merged at <sha>", or "no merge found" as unknown, never "not
  merged".
- In an output repo, `al check` looks up the central IDs that the branch's
  changed files cite.

<!-- DES-84 flow serves:assuredloop-v4/R8,assuredloop-v4/R13,promise-design-split/R1 -->

Git maps a PR reference such as `invoicer-web#57` to its merge: "Merge pull
request #57", or a subject that ends in "(#57)", in the first-parent history
at the selected commit. One function does this for the central repo and the
output repos.

<!-- DES-70 data serves:assuredloop-v4/R8 -->

**Output rows.** An output file is a file that a record declares, or a file
that names a known ID: `central:<ID>` in any repo, or a bare ID of the
central export in the central repo. The spec's own files are not outputs:
the spec docs in scope, `specs/adr/`, `requests/`, `.assuredloop/` and the
results folder. An output row in the export holds the repo, the commit, the
path, the IDs that it cites, the records that declare it, and each line that
names an ID, with its line number. It never holds the whole file: `al` is a
trace tool, not a code search engine, and agents search code well with grep.
A cited file shows `how: exact`, which proves only that the ID is named; a
declared one shows `how: declared`. One cite finder serves every repo.
- The index tags each row with its repo and commit. A result that combines
  repos shows the selected central and output commits. A pinned output commit
  proves that snapshot only, not that the repo has no newer work.
- Later, not now (input 133): implementation specs in output repos that
  refine the central spec. The qualified-ID form leaves room for a `refines`
  link.

<!-- DES-79 choice serves:assuredloop-v4/R14 -->

**Projects that are not code.** No record needs code. A spec is Markdown;
an output is any file that a record declares or that names an ID; a result
is any named check with its outcome. So a project of documents or research
keeps the same requests, change specs, records and paths, and its documents
are its outputs.

<!-- DES-71 note -->

## 13. Commands

<!-- DES-72 interface serves:assuredloop-v4/R9,issue-hints/R1 -->

| Command | What it does |
|---|---|
| `al new` | starts a request and snapshots the owner's words |
| `al record origin`, `signoff`, `decision` | record later owner's words, a sign-off and a decision |
| `al record close` | records a close line (section 5) |
| `al record judgement` | records a one-line judgement, with its reason, that clears a hint (section 3); `--hint issue-changed` keeps its form with `--issues <folder>` (section 8) |
| `al spec` | lists IDs, display numbers and kinds; `--add-ids` marks every paragraph |
| `al context` | with no argument, where the project stands; `al context <name>`, where a request stands and what comes next, and with `--audit` its whole trace; `al context <ID>`, one paragraph, requirement or ADR (below). `--full` adds the text of each citing line, and `--at <commit>` answers as of that commit. `--diff` and `--for` refuse and name `al check` |
| `al check` | the one command for a change and its review: the checks in sections 3-10, the list, the review section and the map (section 15). `--full` shows the text of every item and of each changed paragraph; `--at <commit>` answers as of that commit; `--all` is the audit; `--issues <folder>` also checks the work items that the caller saved for the tasks of the open requests (section 8); `--strict` exits 1 on a `not ok` |
| `al conclude` | the close rule. It refuses with exit 1 and a `refused:` line for each reason. Without `--yes` it shows what it would do. With `--yes` it writes the Outcome, which shows the evidence and what is unknown, and moves the request to `requests/archive/` |
| `al index` | writes derived facts and new bindings; `--issues <folder>` keeps the text of the work items (section 8); lists the hints that the agent must refresh. `al check` runs it. `--align` is removed: it refuses and names `al record <name> judgement` |
| `al export` | the export: one JSONL row per paragraph version, output file or result, with its repo, role, version, commit and edges; not committed |
| `al search` | search at levels 0-2 across the central repo and its output repos, with the current-system, change-context and history queries; it shows each hit's repo and commit |

<!-- DES-132 interface serves:light-design/R1,light-resign/R1 builds-on:DES-72 -->

**`al check` for a change and its review.** `al check` runs `al index`
first, and writes what `al index` writes, so `al index` need not be run by
hand. It names in one line each record file that it wrote, so that the
author commits them with the change. It names in a second line each record
file that it wrote for a request that is not the change's own (section 15),
because that record was not up to date; the author decides whether to
commit it. Each other line of `al index` shows as one line for each kind. An
`al check` run does not change which requests are the change's own.
- `al check --at <commit>` reads the commit's spec, records and change from
  git, in a temporary worktree outside the project, and writes nothing. A
  review of another range uses `--at` for a past head, and `git diff` for
  what changed since an earlier review.
- The map names each paragraph that the branch added, changed, moved or
  removed, in `specs/`, the open change specs and the ADRs, with its place,
  its kind and its change, a change of its kind included. Two or more
  paragraphs with the same change are one line. `al check --full` gives each
  one its own line, and adds under it its text, each requirement that it
  serves with its version, its sign state and its text, the text at the base
  of each paragraph that it builds on, changes or removes, and, for a spec
  paragraph, each ADR that governs it, with its status.
- On an ordinary change, with no finding, `al check` shows the list, the
  review section, the map, and one line that names each check that ran and
  found nothing: `ok: nothing found by <code>, ...`. A check that a
  `Not known` line or a finding says did not run on all that it covers is
  not in that line.
- An answer gives a `Next` line only when it names a step that follows from
  the answer's facts.

<!-- DES-164 interface serves:assuredloop-v4/R9,light-resign/R1 builds-on:DES-72 -->

**The full trace.** `al context <name> --audit` adds the whole trace of a
request to the answer of `al context <name>`, after its coverage lines.
Each entry of the request's record has a line of its own, so that none is
left out. Under `--audit`, the `Records` line also names the bindings and
the judgements when the record holds them, because only `al`'s record holds
these facts. The `Hints` section of `al context`, with or without
`--audit`, shows the hints that `al check` gives after its judgements
(DES-163). The lines of the trace, in this order:
- `Source`: each source of the owner's words, with its file, its hash, and
  when and where it was taken.
- `Version`: each requirement version, with its hash.
- `Replaced`: each requirement of the request that a requirement of another
  request replaces (DES-129).
- `Sign-off`: each sign-off, with its file, its hash and the versions that
  it covers.
- `Output`: each output file and each ID that it claims to implement,
  verify or document. It is a claim, and the trace does not show it as
  proven.
- `Binding`: each binding, with its holder, link and target, both hashes,
  and `judged target <hash>` and `judgement J<n>` where the record holds
  them. Its state is bound, stale, target not found, or cross-repo. The
  state compares the target with `judged_target_sha256` when the record
  holds it, else with `target_sha256`, as `stale-base` does. So a binding
  that a judgement cleared is not shown as stale. For a `changes` or
  `removes` link of a change paragraph, the map and `al conclude` still read
  `target_sha256` (DES-160), so "bound" there does not say that the target
  is unchanged since the change linked it.
- `Judgement`: each entry of the record's `judgements:`, in record order,
  with its ID, hint code, `--on`, when it was recorded, its line in the
  record, its state and its reason. The state is the one that `al check`
  gives (DES-163, DES-130): current; stale, with what changed since it;
  history, with the newer judgement on the same hint code and `--on`; shown
  on a `not ok`, which it does not clear; or no hint now, when `al check`
  gives no such hint. A judgement that is stale on one of its hints is
  stale, as on the `info judged` line, and each thing that changed is named
  once. A binding judgement is current while no binding that names it gives
  a hint, and history when no binding names it. For
  `issue-changed`, `al context` does not read the items. So the newest
  judgement at the moment of reliance says that it is not known whether the
  item changed, and names `al check --issues <folder>`. It is stale when a
  later sign-off became the moment of reliance, and history when a newer
  one covers the same item and moment. The judgements of an archived
  request are recorded and not checked. At `--at`, their state is not
  known. An entry with no hint code or no `--on` is not checked.
- `Disp.`: each disposition of an old record, as recorded; `al` no longer
  checks it (DES-136).
- `Close`: each close line of the record, with what it names.
- `Result`: each result file, with its outcome and whether it applies; not
  at `--at`.

<!-- DES-133 interface serves:light-resign/R1,assuredloop-v4/R9 builds-on:DES-72 -->

**`al context <ID>`.** The ID may name a paragraph, a requirement or an ADR
(`ADR-2`). The answer gives its text, its file and line, its status, what
replaced what, its last signed version where it has one, the paragraphs
that build on, explain or illustrate it, the open changes that name it, and
the places that cite it. It groups the citing places by file: one line for
each file, marked current or historical, with the count and every line
number, so that no place is left out. A marker's own ID is no citation; the
IDs of its links are. `al context <ID> --full` adds the text of each citing
line.

<!-- DES-125 interface serves:light-resign/R1 -->

**Answers.** An answer of `al` puts repeated output on one line, for
example the IDs of the items in force by their state, and names each of
them there. `al check --full` shows the text of every item in force, and
`al context <ID>` shows one item in full, with its file and line. A line
about one paragraph, requirement, decision or judgement names its file and
line, with the ID beside it only as a label. A hint names the place that
it is about: a file and line, a file, or a folder, or `-` when it is about
no file, for example a missing `Tier:` line. `al context <name>` names a request's folder, and a
coverage line names its file and section.
A fact that only `al`'s records hold says so and names the record. An
answer shows its hints, which are inferences, apart from the project's
evidence and from the records, and it names what it does not know on a
`Not known` line.

<!-- DES-134 component serves:light-design/R2,light-resign/R1 -->

**The skill.** `skills/assuredloop/SKILL.md` guides the user's AI through
the judgements; `al` keeps the facts. The AI reads the skill on every task,
so it stays short, and it leaves out what a hint or an answer of `al`
already says when it is needed. Its steps: the start of a task (run
`al check`, read the list); writing a change spec; consolidating (section
5); reviewing, in nine steps that start from the change's behaviour, ask one
search question, judge only the items that apply, write one consolidation
judgement for each piece, and find the tests and the user documents; a large
spec or other words; every answer, which a reader can check; and an audit,
only on request (`al check --all`). After the steps, one short section names
what differs by path: the records, the owner's sign-off, the close line and
`al conclude`. The skill names each `al` option beside its command, so that
a code test can check that `al` accepts each one.

<!-- DES-73 note -->

## 14. Migration and adoption

<!-- DES-74 rationale explains:DES-75 -->

Why: "no need to take care of nbackward copatibility" (input 98).

<!-- DES-75 rule serves:assuredloop-v4/R9 -->

- v4 is a breaking release. It does not read 0.1.0 records.
- History: `--at` works on commits made under v4. Older records stay readable
  as files, and the pinned 0.1.0 runs at those commits (input 123).
- Adopters pin 0.1.0, so nothing breaks until they move. An adopter with an
  open 0.1.0 request finishes it on its pinned copy, or restarts it under v4.
- Adding markers changes a file's bytes. A spec whose signed requirement
  binds its whole text by SHA-256 needs a new approval after conversion.
  Validation uses a scratch copy, never an adopter's live record.
- Adoption: `al spec --add-ids` marks every paragraph, and the baseline is
  captured as `source: adoption` with its commit and hash (section 5). The
  command writes that adoption record itself, because every adopter needs it
  (T17 builds it).

<!-- DES-135 note -->

## 15. A change and its review: what is in force, the judgements and the map

<!-- DES-136 rationale explains:DES-138,DES-153,DES-157 -->

Why: AssuredLoop finds misalignment and keeps the coding agent focused on
its change. The user's AI, mainly the review agent, asks small questions
and gets the right answer with the least added tokens, cost and time. Most
of the spec is derived design, and consolidation is a judgement, not a
mechanical merge. So the skill guides the judgements: how to write a
change's design, how to consolidate it, and how to review it. `al` keeps
only the facts that an AI forgets or invents: the signed text and its
changes, the items in force for a change, the spec paragraphs that a change
named and the ones that it changed, the quotes of a review judgement, and a
work item that changed. It may keep exact records (hashes, versions,
bindings) that no person and no AI writes or reads. What a person or an AI
must write or read is cut to what a check needs. A cut must not force a
rewrite and must not lose a fact: old records that hold dispositions or
wording decisions stay readable (`al context <name> --audit` shows them as
recorded, and `al` no longer checks them), and a command that goes still
answers, and says what replaces it. Audit questions run
only on request. `al` calls no model.

<!-- DES-137 rationale explains:DES-143 -->

Why the list reads the change itself: in one adopter project, no code file
names a spec ID, and 1 of about 30 test files does. A check that waits for
code or tests to name an ID sees almost nothing there. So `al` lists, in
plain code, the requirements and decisions in force that may govern a
change, and says the limits of the list. The user's AI judges the ones that
apply, and `al` checks the evidence that the AI quotes.

<!-- DES-138 data serves:light-design/R1 -->

**What is in force** for the selected change, at the selected commit. "In
force" is `al`'s own term; the kind `rule` keeps its meaning as one of the
promise kinds. `al` reads it from the records that exist: sign-offs, status
lines, supersede links and `specs/`. No record is added for it.
- The promise and design paragraphs in `specs/`, but not `approach`. An
  archived request's text is history; its result is in `specs/`.
- The ADRs whose status is accepted and that no accepted ADR replaces by
  `supersedes:`, each with its `decides` links. An ADR's text also names the
  alternatives that were considered (schema.md 5), so the review reads which
  part is the decision; `al` marks no part as binding.
- The change's own signed requirements and its proposed design, shown as
  "proposed", apart from what already holds. An unsigned requirement of the
  change's own request is not listed; the limits name it.

<!-- DES-139 data serves:light-design/R1 builds-on:DES-138 -->

**The change's own request** is an open request whose folder or record the
change touches, or whose name a commit message of base..HEAD names. A change
touches a request's record only in what `al index` does not derive, such as
the owner's words and sources, sign-offs, tasks, decisions, close lines and
judgements. What `al index` derives by itself (requirement versions,
bindings, judgement identities, the kept hashes of work items, and the
versions that the map keeps) does not make a request the change's own.

<!-- DES-140 data serves:light-design/R1 builds-on:DES-138 -->

Not in force: another open request's proposal, which the list shows as an
open proposal beside the item that it changes or removes; a replaced ADR; a
replaced requirement (section 6); and `approach`, informative, change-only
and note paragraphs. An accepted ADR whose text changed keeps its hint
(schema.md 5), and the list marks it "text changed, review open".

<!-- DES-141 data serves:light-design/R1 builds-on:DES-10 -->

**The change's proposed design.** Besides its change spec, a change may name
a project document as its design, by a design line. In the request's
`request.md`, or in the body of a saved work item, a design line is a line
that starts with `Design:` and holds one path from the repo's root, for
example `Design: docs/rfc/0018-streaming-http-api.md`. In a saved work item
in JSON or YAML, the field `design` holds one path or a list of paths.
`<repo>:<path>` names a document of an output repo in the configuration,
read at its selected commit. A saved work item gives a design only when a
task of the change's own request names it, and only with `--issues`. A
plain mention, or a link for comparison or for history, does not make a
document the change's design.

<!-- DES-142 data serves:light-design/R1 builds-on:DES-141,DES-10 -->

`al` reads the named document at the selected revision. The list shows the
design line's place, the document's state as `al` reads it (an ADR's status;
for another document, a first line `Status: <state>`, or "state unknown"),
and that it is the proposed design of this change. A document with paragraph
markers is read as design paragraphs of the change, and the list shows each
of its promise and design paragraphs. A document with no markers is
supporting evidence: the list shows it, and the change spec holds the trace
(the `serves`, `builds-on`, `changes` and `removes` links). A design line
whose document is missing or cannot be read gives the hint `design-doc`; an
output repo that `al` cannot read gives an info line. The document is the
change's proposal, shown beside its change spec and never in force. When it
conflicts with an item in force, both are shown, and the item in force
stays in force. The design that lasts goes into `specs/` by consolidation
(section 5).

<!-- DES-143 flow serves:light-design/R1 builds-on:DES-138 -->

**The list** for a change, in plain code, with no model. It is the same
with or without search. The change is what `al check` selects: its base to
the working tree, with the untracked files that git does not ignore, and
with `.assuredloop/` left out. With no base, or an empty change, the list
says "no change selected". The list shows, each with its ID, its place, its
basis and its text in one line:
- the items in force that the change edits, and the ones that it cites: a
  line that the change adds or removes names the ID as a whole word. A
  paragraph's own ID in its marker line is no citation, and neither is an ID
  in a review note: the note is the review's output, not part of the
  change;
- the items whose file scope matches a file that the change adds, changes,
  renames or deletes, and the items whose scope the change edits, so that a
  narrower scope cannot move an item out of view;
- the items whose scope is all files;
- the change's own signed requirements and proposed design.

<!-- DES-144 flow serves:light-design/R1 builds-on:DES-143 -->

Every other item in force is named in one grouped line, with exact counts:
"N further items in force: U with no known scope: <IDs>; K with a scope that
does not match this change: <IDs>". Their text is not shown;
`al check --full` shows it. No item is left out. `al check --all`, the
audit, shows each item in force on its own line, an item that the change
does not touch with the basis `audit`, also when no change is selected. It
gives no judgement.

<!-- DES-145 flow serves:light-design/R1 builds-on:DES-143,DES-69 -->

In an output repo, the items in force are the central repo's at its
selected commit. The list shows the ones that the change cites as
`central:<ID>` and the ones whose scope is all files, and names the rest in
the grouped line. File scopes name files of the central repo, so they are
not matched there, and the limits say so. The change's own request is not
read in an output repo. When the central repo cannot be read, the limits
give the reason, and the list does not say that no item is in force.

<!-- DES-146 rationale explains:DES-144 -->

Why the rest is named and not shown: the full text of every item in force,
on every check, repeats long text, costs tokens and hides the items that
matter for the change. The names keep every item in view, and `--full`
shows the text.

<!-- DES-147 flow serves:light-design/R1 builds-on:DES-143 -->

The list says the basis of each item that it shows (changed by this change,
cited, scope changed in this change, by scope, all files, proposed, or replaced), the
way to the text that it does not show, and its limits. It does not say that
an item that it does not show in full cannot apply. A scope that does not
match is not proof that the item cannot apply: new behaviour can make an old
scope incomplete. The search question of the review covers the shown items
and the grouped ones.

<!-- DES-148 data serves:light-design/R1 builds-on:DES-143 -->

**File scope**, optional. An item in force may say which files it concerns,
or all files, in its marker line: `files:` and one or more globs from the
repo's root, joined by commas, for example `files:src/export/**,test/**`.
`**` matches any number of folders, `*` matches within one folder name, and
`?` matches one character. A space or a comma in a path is written as `?`.
All files is `files:**`. The author writes the token. It is not part of the
item's text and is no link: adding, changing or removing it changes no hash
and gives no marker hint. A scope helps the list; it does not prove that other
files cannot affect the item. A scope that matches no file at the selected
revision gets the hint `scope-no-file`.

<!-- DES-149 choice serves:light-design/R1 builds-on:DES-143 -->

Search only adds. The search question of the review adds candidates for the
review to read. It does not add to or remove from the list, which stays the
same with or without search, and it does not change the result of a check.
The quote check catches an invented quote, not a wrong reading; the meaning
stays the review's judgement.

<!-- DES-150 data serves:light-design/R2 -->

**The judgements.** The review judges the items that apply to the change,
conflict with it, or that it is not sure of, however it found them. It
writes no routine "not applicable" judgement, and earlier judgements stay.
Each judgement holds:
- the item's ID; `al` adds the item's version;
- complies, violates or unclear (and, in an audit, not applicable), with the
  reason in one sentence;
- a quote of the item's text, and a quote of the code or test with its repo
  and file, from the head of the change, or from its base when the change
  removed the text (a removed guard is quoted from the base);
- the test evidence apart: the assertion that checks the item, or "no test
  found", or "tests not examined".

<!-- DES-151 data serves:light-design/R2 builds-on:DES-150 -->

A judgement of absence ("no test found", "the guard was removed") says so,
and needs no quote from the head. A judgement for every item in force is an
audit: it runs only on request (`al check --all` with the skill's audit
step), not on an ordinary change.

<!-- DES-152 data serves:light-design/R2 builds-on:DES-150 -->

**The review note** is `requests/<name>/review.md` of the change's own
request. One judgement is one top-level list item, as Markdown reads it: a
bullet or a numbered item, indented up to three spaces. Its first line is
`<ID> <verdict>: <reason>`, and each line under it holds one quote:
`Item: "<quote>"`, `Code (<path>): "<quote>"` or `Test (<path>): "<quote>"`.
A path is from the repo's root, at the head; `, base` after it names the
base, and `<repo>:<path>` names a file of an output repo. A quote is the
text between the first and the last double quote of its line. The test
evidence may also be `Test: no test found` or `Test: tests not examined`. A
consolidation judgement is one with a line `Spec (<ID>): "<quote>"` for each
spec paragraph that it names, quoted from the head, or from the base with
`, base` after the ID. Its first line may name several items, joined by
", " or " and "; then each item quote names its item:
`Item (<ID>): "<quote>"`. A top-level list item that `al` cannot read as a
judgement is shown as not read, not left out. Other text in the note is
free, and `al` does not read it.

<!-- DES-153 flow serves:light-design/R2 builds-on:DES-152 -->

**C8, the evidence check**, with no model. For each judgement in the note of
each own request, `al check` shows, in its review section, whether the
item's quote is in that item's text, wherever `al` can find the item, and
whether each code, test or spec quote is in the file or the spec paragraph
that it names, at the head or at the base. A result is "quote found", "quote
not found", or "item not found" for an item that `al` cannot find. A found
quote is not shown as "complies": the meaning is the AI's judgement.
Beside the result, `al` shows the item's state: in force; proposed by this
change; draft (another open request's text, an unsigned requirement, a
proposed ADR); replaced (a superseded or replaced ADR); or not in force (any
other kind or status).

<!-- DES-154 flow serves:light-design/R2 builds-on:DES-153,DES-37 -->

`al` also keeps, by itself, the identity of the reviewed change for each
judgement: in each repo that it considered, the base commit and a hash of
the change's diff from that base, with the review notes and `al`'s own
records left out; and the item's version. A judgement is current only while
the selected change has the same base, the same diff hash and the same item
version. So a commit that only saves review notes or `al`'s records keeps it
current, and a commit that changes any other file of the change, quoted or
not, in any repo, makes it "stale: judged at <head>". A stale judgement
needs a new judgement or a renewed review, even when every quote is still
there. A judgement of an earlier PR of the same request has another base, so
it shows as stale. C8 gives no `not ok` and changes no exit code. A
judgement never clears or hides a `not ok` or a refusal of `al conclude`,
and it never blocks.

<!-- DES-155 flow serves:light-design/R2 builds-on:DES-153 -->

The rules of the check. A quote matches word for word, with each run of
white space taken as one space, so that a quote of a wrapped paragraph
matches. The change in this repo is the one that `al check` selects. In an
output repo of the configuration, it is the change from the merge-base of
the selected commit with `main` to that commit. A repo that `al` cannot
read, now or when judged, does not count as unchanged, so the judgement is
"not known: <repo> cannot be read (<reason>)" unless another part makes it
stale. The diff hash is taken over each changed path, its git mode and the
hash of its bytes, in the same form at a commit and in the working tree, so
it does not depend on git's diff settings. The item's version is the hash
of its text. A judgement of a requirement is current only when the
requirement's text is its latest recorded version, and that version is the
one that the identity holds; an identity with no recorded version is not
current. An item of the own request's design documents is found as the list
reads them.

<!-- DES-156 flow serves:light-design/R2 builds-on:DES-154 -->

`al index` keeps the identity in the request's record, once for each
judgement, and does not write it again; `al check --at` writes nothing. A
judgement that is not in the note at HEAD is judged now. One that is
already committed when `al index` first sees it takes the identity of the
earliest commit of the branch whose note holds it, with the requirement
version read only from the record as committed there. When the history
cannot tell, for example because a shallow clone cuts it at that commit,
the judgement is "not known when judged", not current. A rewritten
judgement, for example with a new reason, gets a new identity. A judgement
with no identity yet says "identity not kept: run al index".

<!-- DES-157 flow serves:light-resign/R5 builds-on:DES-29 -->

**The map.** On a branch with an open change of path 2 or 3, `al check`
shows the change against its base, from facts only. Such a change is an
open request of the change's own that is not a spike, and whose tier is not
0, 1 or 1d; with none, the map says so in one line. Entries of one kind with
the same fact are one line, which names each ID with its place, so no entry
is left out. Beside the paragraphs that the branch changed (section 13),
the map shows:
- each spec paragraph that the branch added, changed or removed, with the
  own change paragraphs that name it by `changes`, `removes` or
  `builds-on`, and the consolidation judgements whose Spec lines name it.
  Another open request's `changes` or `removes` link to it shows as an open
  proposal;
- each `changes` or `removes` link of an own change paragraph, with the
  state of its target: unchanged since the link, changed since the link, or
  removed;
- each own change paragraph that goes into `specs/`, with its consolidation
  judgement: current, stale or none.

<!-- DES-158 flow serves:light-resign/R5 builds-on:DES-157,DES-26 -->

The states are facts. "Unchanged since the link" means that the named
paragraph still has the version that it had when the change first linked
it: the version that the link's binding holds (section 4). No judgement
moves that version. "Changed since the link" and "removed" say only that the
text changed or left `specs/`. Whether the change's effect is in it is the
review's judgement. So a lost edit, and a revert to the linked text, show as
unchanged; a revert in other words shows through a stale consolidation
judgement. A link with no binding yet is "not known". `al` compares no text
with text.

<!-- DES-159 flow serves:light-resign/R5 builds-on:DES-26 -->

How a link of the map is bound. A new `changes` or `removes` link of a
change spec binds the target's text at the base, when the target is there,
so a link that a branch adds after it changed the target shows "changed
since the link". `al index`
keeps a fact at a moment that is now only for what the working tree adds
against HEAD. For what HEAD already holds with no record, it takes the
moment from the branch history: the earliest commit of base..HEAD that
holds it. So a link that HEAD declares with no binding gets the holder's
and the target's text at the first commit that declares it; a `changes` or
`removes` link gets the target's text at the base of that commit; a
requirement gets the version whose text it had there. Where the history
cannot tell (a shallow clone), the link gets no binding, and the fact stays
not known.

<!-- DES-160 flow serves:light-resign/R5 builds-on:DES-158 -->

When the change's own branch changes a paragraph that an own change
paragraph names by `changes` or `removes`, `al index` keeps that version in
the request's record; no person and no AI writes or reads it. It is the
paragraph's text in the working tree when the tree changes it against HEAD;
else its text at the latest commit of base..HEAD that is not a merge and
that changed it. A merge commit gives none, because it can hold the edit of
other work, and so does a commit where a shallow clone cuts the history. A
later edit of that paragraph by other work gives the parallel-work hint
`stale-base` (section 4); the change's own consolidation does not. A
`builds-on` link to that paragraph still gets the hint.

<!-- DES-161 flow serves:light-resign/R5 builds-on:DES-29,DES-152 -->

**The consolidation judgement.** The review writes it as an ordinary
judgement, in the same note, one for each piece that it consolidates
(section 5). Its items are the change paragraphs of that piece. Its Spec
lines name the spec paragraphs that hold them now. It says complies,
violates or unclear with the reason, and quotes the change paragraph and
the spec text. It may name several change paragraphs and several spec
paragraphs, so a split or a join needs one judgement. C8 checks its quotes.
`al index` keeps, by itself, the version of each paragraph that the
judgement names. The map judges a consolidation judgement by those versions
alone: "current: its named paragraphs are unchanged", or stale, naming each
paragraph that changed since it was judged. So a later rewrite that loses
an effect of a consolidated piece, by this change or by other work, makes
the judgement stale and shows it again. No record is written for each
paragraph. The review section shows the same judgement with the identity of
C8, which a later commit of another file makes stale.

<!-- DES-162 flow serves:light-resign/R5 builds-on:DES-157,DES-37 -->

The hints of the map: `map-unnamed`, for a spec paragraph that the branch
added, changed or removed and that no own change paragraph names; and
`map-consolidation`, for the change paragraphs that go into `specs/` with no
current consolidation judgement. A spec paragraph is named when an own
change paragraph names it by `changes` or `removes`, or when the Spec line
of a consolidation judgement names it; a `builds-on` link alone does not.
Each clears by a fix: a link, or a new judgement. `al conclude` shows them
again before it closes, and they never refuse.

<!-- DES-76 note -->

## 17. Building v4

<!-- DES-77 limit serves:assuredloop-v4/R12,promise-design-split/R1 -->

- Node 24 or newer.
- Every dependency is pinned, and no release newer than 24 hours is used.

<!-- DES-85 choice serves:assuredloop-v4/R12,promise-design-split/R1 -->

T13 tests `node:sqlite` with FTS5 on the minimum version; if Node 24 lacks
it, the minimum goes up.

<!-- DES-78 rule serves:assuredloop-v4/R2,assuredloop-v4/R3,promise-design-split/R1,adr-numbers/R1 -->

Build decisions (the architect, 2026-10-10, recorded in the build PRs too):
- Which files carry markers: every `*.md` under the spec root except
  `specs/adr/`, which has its own form (below); the files that config's
  `docs:` list names, each with its prefix; and every
  `requests/<name>/spec.md`, with prefix `SP` and IDs local to that request.
  User documents in `docs/` are outputs and carry no markers unless config
  names them.
- Display numbers: a single leading H1 is the title and is not numbered; H2
  is 1, 2, ...; H3 is 1.1, and so on. A paragraph shows as
  "INV-41 (2.3:4, in Export links)".
- ADRs: `specs/adr/<n>-<slug>.md`, with `Status: proposed|accepted|superseded`
  at the top. A Markdown file in `specs/adr/` is an ADR when its name starts
  with one or more digits and a dash. Its number is the value of those
  digits: `001-x.md` is ADR-1, `0040-y.md` is ADR-40. Two ADR files with the
  same number give a hint. When `specs/adr/` holds Markdown files and `al`
  reads none of them as an ADR, `al check` says so once. The heading's
  marker holds the ADR's own ID `ADR-<n>` and its `decides`, `source` and
  `supersedes` links; the other paragraphs take `ADR-<n>-<k>`.
- A requirement in `request.md` carries a hidden marker too, with its links
  to the owner's words: `<!-- R2 from:<snapshot file name> -->`. Each
  requirement version is kept; a sign-off records the versions it covers,
  and may name what the owner was shown (`presented`) and who wrote the
  owner's words down (`transcribed_by`).

<!-- DES-113 choice serves:adr-numbers/R1 builds-on:DES-78 -->

Two ADR files with the same number (adr-numbers/R1): `al` reads each
file, and runs the checks of one ADR file on each of them: `adr-status`,
`adr-marker`, `adr-links`, `adr-supersede`, `adr-changed`,
`superseded-status`, and `superseded-cited` in its own text. `adr-changed`
compares a file with the same file at the base. When the number has one file
at the base and one file now, it compares those two, also after a rename.
Else a file that is gone gets the hint that its file is gone. A link whose
holder is an ID of several files has as its holder the paragraph with the
bound text. Else it is the paragraph that declares the link and names the
request whose record holds the binding. When that leaves more than one,
the hint says that it is unclear, and names each file. Where `al` looks an ADR up by its number (a link, a citation, a
status line or a `supersedes:` that names it, the `Governed` line of
`al context`), it uses the first of those files in name order. The hint
`adr-number` names each file of the number and the file that `al` uses. When `specs/adr/` holds
Markdown files and `al` reads none of them as an ADR, `al check` gives the
hint `adr-none` once.

<!-- DES-86 data serves:assuredloop-v4/R2,assuredloop-v4/R3,promise-design-split/R1 -->

A paragraph's hash is the full SHA-256 of its text after line endings are
normalized and the marker framing is removed. The YAML library is `yaml`
2.9.1, pinned.
