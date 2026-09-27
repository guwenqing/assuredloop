# Change: AssuredLoop v1

Request: assuredloop-v1 (signed off 2026-09-27, `origin/2026-09-27-signoff.md`).

## Why and design

The why is the signed organized requirement in `request.md`. The design is in
`design.md` in this folder: the model, the tiers, the states, the views, the
links, the hints, the acceptance checks, and how each earlier break was fixed.
The lasting decisions are ADRs 0001-0010 in `docs/adr/`.

The baseline starts empty. This change adds the product's own promises in
seven spec files:
- `specs/records.md`: the request record;
- `specs/spec-model.md`: the baseline and the change spec;
- `specs/states.md`: states, consolidation and conclusion;
- `specs/views.md`: what the tool shows;
- `specs/links.md`: links, tests and ADRs;
- `specs/hints.md`: hints and exit codes;
- `specs/tool.md`: the commands and limits.

Each block names the requirement it serves (`for R<n>`). The sections are
consolidated as the parts that build them land. Each part consolidates the
sections it makes true (partial consolidation, [STA-4]). The last part
concludes the request.

## Spec changes

### [REC-1]@1 add in specs/records.md   for R2
Now:

    ## [REC-1] The request folder
    Each request MUST live in its own folder, `requests/<name>/`. The name is the
    request's permanent ID: it MUST never change and MUST never be reused. The
    folder holds `request.md`, `origin/`, and, as the tier needs, `change.md` or
    `findings.md`. When a request concludes or is dropped, its folder MUST move to
    `requests/archive/<name>/` under the same name, and MUST NOT be edited after
    that change reaches main.

### [REC-2]@1 add after [REC-1]   for R2
Now:

    ## [REC-2] The owner's words and dialog
    `request.md` MUST open with a section "Owner's words and dialog". It holds the
    owner's words and the questions and answers that clarified them, as dated
    entries. It is append-only: an entry is never edited or removed, and a
    correction is a new entry. Long material lives in `origin/` and is referenced
    from an entry.

### [REC-3]@1 add after [REC-2]   for R2
Now:

    ## [REC-3] Snapshots of originals
    Every original that a request relies on, whether a link, a chat or a document,
    MUST be kept as a snapshot in `origin/`. A snapshot starts with a header:
    `Source:` (where it came from), `Fetched:` (when), `Target updated:` (the
    source's own last-updated time, when the source gives one) and `SHA-256:` (of
    the text after the header). The text then follows exactly as fetched. The tool
    MUST NOT fetch anything itself: the agent fetches, and the tool stores,
    hashes, and later verifies a re-fetch. When a re-fetch differs, a new snapshot
    MUST be appended; the old one stays.

### [REC-4]@1 add after [REC-3]   for R2, R3
Now:

    ## [REC-4] The organized requirement
    After the owner's words, `request.md` MUST hold an "Organized requirement". It
    is one written-up statement of what is wanted, not a line-by-line translation.
    It holds one or more requirements as sub-sections (R1, R2…) using RFC 2119
    keywords, an `Out:` line for what is excluded, and an `Assumed:` list for what
    the AI added that the owner did not say. A spike holds an "Organized question"
    instead, in plain words: what we want to find out, what a useful answer looks
    like, and what is out. Requirements that must be signed or finished
    separately SHOULD be separate requests.

### [REC-5]@1 add after [REC-4]   for R3
Now:

    ## [REC-5] The owner's sign-off
    The owner MUST sign off the whole organized section (requirement or question)
    of every request except a tier-0 fix. The spec text is not signed. A sign-off
    MUST be recorded as a file in `origin/` holding the owner's words (or where
    they said it), then a line `--- signed text ---`, then the exact organized
    section as signed, and its SHA-256. `request.md` MUST point to it with a
    `Signed off:` line. The latest sign-off counts. A child request that copies
    some of the parent's signed requirements word for word inherits the parent's
    latest sign-off for them.

### [REC-6]@1 add after [REC-5]   for R3
Now:

    ## [REC-6] The blocked state
    A request is **blocked** while its organized section has no sign-off, or
    differs from the text last signed off. While a request is blocked:
    `consolidate` and `conclude` MUST refuse for it, except `consolidate
    --revert` and `conclude --dropped` when every section retains nothing
    ([STA-3]); `record section` MUST refuse for it; `context` MUST show the
    blocked state first; and `check --strict` MUST count it as `not ok` for any
    branch serving the request. `record signoff` MUST show only what changed
    since the last sign-off.

### [REC-7]@1 add after [REC-6]   for R2
Now:

    ## [REC-7] Decisions
    Decisions made after the request MUST be recorded in `request.md` as numbered,
    dated, append-only entries (D1, D2…), each with its source: the owner, a
    review, or the agent. A decision MAY supersede an earlier one, cite the
    section IDs it concerns, or point to the ADR it produced. The kinds (scope,
    approved change, implementation-only, rejected) are a writing convention; no
    check depends on them.

### [REC-8]@1 add after [REC-7]   for R6
Now:

    ## [REC-8] Parts
    A request MAY list its parts as free text. A part MAY name a child request,
    whose state is then shown on the parent as a hint. The tool MUST NOT claim a
    part is done from the commits it finds; completion is only what someone
    reported.

### [REC-9]@1 add after [REC-8]   for R4
Now:

    ## [REC-9] The Outcome
    `conclude` MUST write an Outcome section: a generated block, followed by any
    notes people add, which are kept when it is regenerated. The generated block
    MUST hold content facts only: each requirement's fate (in which sections, or
    in none), the sections added, modified, removed, dropped and kept, the
    decisions (with the agent's own rulings listed apart), the ADRs added or
    superseded, and any code still live for dropped work. It MUST NOT list commit
    IDs; views derive commits from history.

### [REC-10]@1 add after [REC-9]   for R6
Now:

    ## [REC-10] Tiers
    Every change of work MUST fit one tier, chosen by the agent:
    - **0, fix**: no promise changes; no record; the commit says why.
    - **1, amend**: a small change to a promise; a short `request.md` and the
      baseline edit in the same PR, which concludes itself once signed off.
    - **2, change**: needs a design; `request.md` and `change.md`.
    - **3, epic**: as tier 2, with `change.md` on main while parts land.
    - **S, spike**: a signed organized question and `findings.md`, which starts
      with its Answer; no spec change.

    For tiers 2, 3 and S, the organized section MUST be signed off before any
    spec work. Tier 1 MAY do everything in one PR.

### [REC-11]@1 add after [REC-10]   for R6
Now:

    ## [REC-11] The tier claim
    Every PR MUST state its tier and its claim in one line, for example
    `Tier: 0 — restores [INV-4]; no promise changes`. The tool MUST show the claim
    with its evidence (the spec sections near the changed code, the tests whose
    assertions changed, the spec edits) and flag what contradicts it: a tier-0
    claim with a baseline edit is `not ok`. Validating the claim is the
    reviewer's job under the bots' own review rule, not the tool's.

### [REC-12]@1 add after [REC-11]   for R2, R4
Now:

    ## [REC-12] Append-only records
    The owner's words and dialog, the decisions, everything in `origin/`, and
    everything in `archive/` are append-only. A request archived in the same
    branch MAY still be edited before that branch merges. `check` MUST verify
    append-only per commit over `main..HEAD`, and say that this protects a PR
    only when `check` runs on it.

### [SPC-1]@1 add in specs/spec-model.md   for R1
Now:

    ## [SPC-1] The baseline
    The baseline is the consolidated current spec on main: plain Markdown, split
    by area, under a root that is `specs/` by default and MAY be set by one line
    in `.assuredloop` (`root: <path>`). It holds promises in the present tense,
    never history. In a non-code project the promises are about the deliverable,
    and the documents themselves are the "code". The baseline starts empty and
    grows request by request.

### [SPC-2]@1 add after [SPC-1]   for R1
Now:

    ## [SPC-2] Sections and IDs
    A section is one ATX heading (`#`) and the text up to the next heading of
    any level. Its ID is the bracketed token at the start of the heading, matching
    `[A-Z][A-Z0-9]*-\d+(\.\d+)*`, for example `## [INV-3] Dates`. IDs are unique
    within a root; with several roots, references are `(root, ID)`. Only a section
    with an ID can be held by a change. `spec --add-ids <file>` numbers the headings
    that have none.

### [SPC-3]@1 add after [SPC-2]   for R1
Now:

    ## [SPC-3] Allocating IDs
    The next ID for a prefix MUST be one more than the highest found in the root's
    git history and in the open `change.md` files. An ID MUST never be reused. A
    duplicate ID anywhere in the root is `not ok`, and blocks every `consolidate`
    write until it is fixed.

### [SPC-4]@1 add after [SPC-3]   for R4
Now:

    ## [SPC-4] Comparing sections
    Sections MUST be compared as exact text, after normalizing only: line endings;
    trailing spaces and tabs on each line; blank lines at the start and end of the
    section and between its heading and body; and the number of `#` in the
    heading. Code blocks, indentation and list structure MUST be compared exactly.
    Scope inherited from a parent heading is outside the comparison.

### [SPC-5]@1 add after [SPC-4]   for R4
Now:

    ## [SPC-5] The change spec
    `change.md` holds the change's why and design as prose, then `## Spec changes`
    with one block per held section. A block's heading is `### [ID]@<n> <op>`,
    where `<n>` counts that section's versions within this request, and `<op>` is
    `modify`, `add in <path>` (at the end of that file, which is created if
    needed), `add after [ID]`, or `remove, was after [ID]`. Its text is `Was:` and
    `Now:`, each an indented or fenced block holding exactly one heading. Markers
    after the op: `builds on <request>/<ID>@<n>` (or `builds on @<n>` within the
    request), `Dropped <date> (Dn)`, `Kept <date> (Dn)`, `Revised <date> (Dn)`,
    and optionally `for R<n>`.

### [STA-1]@1 add in specs/states.md   for R4, R5
Now:

    ## [STA-1] The link check
    For a block that builds on another block X@k, the link MUST be checked first,
    and the check stops at the first row that holds:
    - X@k does not exist, or following `builds on` revisits a block: **broken
      link** (`not ok`);
    - this block's "was" is not X@k's "now": **broken link**;
    - X@k or its request is dropped and it was not kept: **base dropped**,
      re-base onto the baseline;
    - X@k is marked Revised and this block is in another request: **base
      revised**, re-base onto the newer version;
    - otherwise the link is valid.

### [STA-2]@1 add after [STA-1]   for R4, R5
Now:

    ## [STA-2] The content states
    With a valid link (or none), the baseline section, found by ID anywhere in the
    root, decides the state. The first row that holds wins:
    1. this "was" equals this "now": **no change yet**;
    2. the baseline equals "now" (for a remove: the ID absent everywhere):
       **consolidated**;
    3. it equals the "now" of a block that reaches this one through valid links:
       **carried** by that block (counts as consolidated);
    4. it equals the "was" of a block this one reaches through valid links (for an
       add: absent): **waiting** on that block;
    5. it equals "was" (for an add: absent): **pending**;
    6. the ID is not found: **not found**, with candidates by body text;
    7. anything else: **differs**, align.

### [STA-3]@1 add after [STA-2]   for R4
Now:

    ## [STA-3] Retains nothing
    A block **retains nothing** only when this is shown positively from content,
    whatever the link state: its "was" equals its "now"; or the baseline equals
    its "was" exactly (for an add: the ID is absent); or it is **waiting**. Every
    other case is **possibly retained**, and MUST be reverted, or accepted and
    kept ([STA-6]). Retaining nothing MUST NOT be inferred from a failure to
    match "now".

### [STA-4]@1 add after [STA-3]   for R4
Now:

    ## [STA-4] Consolidate
    `consolidate <name> [--section ID] [--preview]` MUST validate everything first
    and then write atomically. It writes only sections that are **pending** and not
    marked Dropped: an add after its anchor (refused while the anchor itself is
    pending, unless both go together), a modify in place, a remove. It leaves
    **consolidated** and **carried** sections alone, and refuses every other
    state, and every request that is blocked. `consolidate --revert <ID>` puts "was"
    back, a remove after its recorded anchor, and is allowed while blocked. Anyone
    MAY consolidate another request's section; the output names its owner.

### [STA-5]@1 add after [STA-4]   for R4
Now:

    ## [STA-5] Revising and accepting
    Revising a section MUST keep the old block, marked `Revised <date> (Dn)`, and
    add the next version, which builds on it within the same request. Chains walk
    through revised blocks. `record section <ID> --accept` MUST keep "was", set
    "now" to the baseline's current text, and record a decision naming the change
    underneath.

### [STA-6]@1 add after [STA-5]   for R4
Now:

    ## [STA-6] Dropping and keeping
    A section is dropped by marking it `Dropped <date> (Dn)`. It MUST retain
    nothing ([STA-3]) or be reverted, or be kept. `Kept <date> (Dn)` MUST be
    allowed only for a section that is consolidated or carried, and whose text
    traces to a signed requirement (`for R<n>`, with a current sign-off) or to a
    decision whose source is the owner. A section that differs MUST be aligned
    before it can be kept. A section carried by a successor MUST NOT be reverted,
    only kept. Dropping never touches the baseline or another request.

### [STA-7]@1 add after [STA-6]   for R4
Now:

    ## [STA-7] Conclude
    `conclude <name>` MUST read the working tree and name what it read. It MUST
    refuse unless the organized section's sign-off is current and every held
    section is consolidated, carried, dropped while retaining nothing (or
    reverted), or kept. On success it writes the Outcome, sets `Status: concluded`,
    and moves the folder to `requests/archive/`. `conclude <name> --dropped Dn` sets
    `Status: dropped`; when every section retains nothing it needs no sign-off,
    and otherwise every retained section must be reverted or kept. It prints three
    lines or fewer.

### [STA-8]@1 add after [STA-7]   for R4, R7
Now:

    ## [STA-8] Concluded, in history
    Whether a request is concluded on main MUST be derived from main's history:
    the commit that added `requests/archive/<name>/request.md`. No commit ID is
    recorded as evidence. A closed request MUST never be re-checked against
    today's baseline; today's baseline and blame answer whether it still holds.
    `check` MUST re-run `conclude`'s rules on the final state of every request a
    branch archives, and a check certifies only the snapshot it read.

### [VW-1]@1 add in specs/views.md   for R7
Now:

    ## [VW-1] Where the project stands
    `al context` with no name MUST list the open requests, one line each with its
    state, blocked ones first. On a repo with no baseline it MUST say so, and that
    requests add sections as they go.

### [VW-2]@1 add after [VW-1]   for R7
Now:

    ## [VW-2] Where a request stands
    `al context <name>` MUST print twelve lines or fewer: the request's title,
    tier and state; its owner's words and snapshots, with whether each was
    re-checked; its sign-off state, and which requirements changed since, if any;
    the decisions, newest first, with agent rulings marked; each held section
    with its state and its requirement; the parts; other changes holding sections
    in the same file; at most three hints; then a Next line (the command to run)
    and a Not known line (what could not be checked).

### [VW-3]@1 add after [VW-2]   for R7, R9
Now:

    ## [VW-3] Everything about one section
    `al context <ID>` MUST show the section's text, the open changes holding it,
    the requests that shaped it (from blame), the decisions and ADRs citing it,
    and the linked code and tests with the reason for each link.

### [VW-4]@1 add after [VW-3]   for R7, R8
Now:

    ## [VW-4] A branch, and the review view
    `al context --diff <range>` MUST show the requests a branch serves, the
    sections it changes with their states, nearby sections, linked tests, related
    history (requests citing the same IDs, rejected ones first) and hints.
    `--for review` MUST split this into an **intent** view (the signed
    requirement verbatim, the spec changes, the decisions, the tier claim) and an
    **evidence** view (each requirement with the evidence found or none, changed
    files linked to no request, linked tests, test results with their provenance,
    and hints).

### [VW-5]@1 add after [VW-4]   for R1
Now:

    ## [VW-5] The design now
    `al spec [--list]` MUST show the design as it stands: the section map first,
    then the text, with each open change's "now" and state under the section it
    holds. A partial baseline MUST say which areas it covers.

### [VW-6]@1 add after [VW-5]   for R7
Now:

    ## [VW-6] Archived requests
    An archived request MUST show each of its sections "as at conclusion", and
    what has changed it since (from blame), and MUST list the later requests that
    follow it.

### [VW-7]@1 add after [VW-6]   for R7
Now:

    ## [VW-7] Audit on demand
    `--audit`, on a request, a section ID or `path:line`, MUST return the whole
    trace with nothing capped: the owner's words and every snapshot, with each
    SHA-256 re-checked; every sign-off, with its text re-checked; every decision;
    every version of `request.md` and `change.md` that reached main; when each
    section was consolidated; the linked commits and tests; the ADRs; and the
    Outcome. From a code line it MUST walk from blame, to the request, to the
    signed requirement, the decisions and the change.

### [VW-8]@1 add after [VW-7]   for R7
Now:

    ## [VW-8] History at any commit
    Every read command MUST take `--at <commit>`, and evaluate the baseline, the
    requests, their states and the links as they were at that commit, reading
    that commit's tree through git.

### [VW-9]@1 add after [VW-8]   for R7
Now:

    ## [VW-9] Every output says what it read and what is next
    Every output MUST name the refs it read (working tree, `origin/main` and the
    fetch's age, or local main when there is no remote). It MUST end with a Next
    line and a Not known line. A shallow or single-branch clone that lacks
    history MUST say "history unavailable", never "nothing found".

### [LNK-1]@1 add in specs/links.md   for R8
Now:

    ## [LNK-1] Rough links, with reasons
    Links MUST be derived when read, never kept as a required list, strongest
    first, each shown with its reason:
    1. a bracketed ID near the change, in code or a test name;
    2. blame of the changed lines (the old side for changed or deleted lines),
       with `-w -M -C` for code, without `-C` for the baseline, honouring
       `.git-blame-ignore-revs`, then the commit's request ([LNK-2]);
    3. files changed in the same commits, skipping (and counting) commits that
       touch more than 30 files;
    4. words shared between section headings and code or test names.

### [LNK-2]@1 add after [LNK-1]   for R8
Now:

    ## [LNK-2] From a commit to its request
    A commit MUST map to a request through a `Request:` line anywhere in its
    message; else through the request folder it touched ("ambiguous" when it
    touched more than one); else through an issue number listed in a request's
    owner's words. `Follows:` lines link a later request to an earlier one.

### [LNK-3]@1 add after [LNK-2]   for R8
Now:

    ## [LNK-3] Tests and their results
    Test files MUST be recognised by common path patterns or by paths the project
    names. Test results MUST be read only from files the project names, and
    reported with their provenance: a result with an unknown or older revision is
    not evidence for this change. When both exist, results at the base and the
    head MUST be compared, so failures that were already there are not blamed on
    the change. Assertion counts MUST be reported only for supported test syntax,
    as observations, and unsupported files as skipped.

### [LNK-4]@1 add after [LNK-3]   for R9
Now:

    ## [LNK-4] Decision records
    ADRs live in the project's ADR folder, or `docs/adr/NNNN-<decision>.md`, in
    the kit's format, where a change is a new record that replaces the old one
    whole. A request's decision MAY point to an ADR; an ADR MAY name its request
    (`Request:`) and the sections it governs (`Governs:`). The tool MUST show the
    governing ADRs of a section (current first), list the ADRs a request added or
    superseded, and flag: an accepted ADR edited beyond its status, a broken or
    one-way supersede link, and a reused ADR number (`not ok`); a superseded ADR
    cited as current, or an ADR left proposed at a request's conclusion (note).

### [HNT-1]@1 add in specs/hints.md   for R10
Now:

    ## [HNT-1] How hints are written
    Hints MUST be ranked, at most three in a default view and five in `check`,
    with "N more hidden, --all". Each MUST be worded as an observation, name the
    section, file or line range involved, and name the command that addresses it.
    A hint is `not ok` (something to fix or explain) or `note` (worth a look).

### [HNT-2]@1 add after [HNT-1]   for R5, R6, R8, R10
Now:

    ## [HNT-2] The hints
    The tool MUST give at least these hints. `not ok`:
    - a held section that differs, has a base revised or dropped, or has a broken
      link;
    - two open changes holding one section when neither reaches the other through
      links;
    - an edit to an append-only record;
    - conflict markers, or Was:/Now: blocks, in the baseline;
    - duplicate IDs, or a cited ID, request or requirement that does not exist;
    - a held ID not found;
    - a request archived on the branch that no longer meets `conclude`'s rules;
    - a baseline section changed on the branch that equals the "now" of a
      blocked request;
    - a tier-0 claim with a baseline edit;
    - a snapshot whose text no longer matches its SHA-256.

    `note`:
    - a hotfix into a section another change holds;
    - a section this branch edits that changed on main since the fork;
    - baseline sections changed with no request linked;
    - code changed while its linked tests did not;
    - an observed assertion change with no linked code or spec change;
    - code still live for dropped work, as `path:lines`, and whether a part plans
      its removal;
    - a sign-off pending or changed since;
    - a snapshot not re-checked, or whose source was updated since;
    - a test result that is not evidence for this change;
    - a tier-0 claim where a nearby promise's tests changed;
    - a missing tier line;
    - a change spec that reached main before its first sign-off;
    - a requirement in no section at conclusion;
    - an open child request when the parent concludes.

### [HNT-3]@1 add after [HNT-2]   for R10
Now:

    ## [HNT-3] Exit codes and strict mode
    `context`, `spec` and `check` MUST exit 0. `check --strict` MUST exit 1 on any
    `not ok` that is owned by a request the branch serves or archives, or that no
    request owns (such as duplicate IDs or conflict markers). Other requests'
    alignment debt caused by this branch MUST be shown as information and MUST
    NOT count. `conclude` and `consolidate` MUST exit 1 when they refuse. The tool
    MUST exit 2 when it fails itself. Nothing is installed in git hooks.

### [TL-1]@1 add in specs/tool.md   for R7
Now:

    ## [TL-1] Commands
    The tool MUST offer seven commands: `new`, `context`, `spec`, `check`,
    `record`, `consolidate` and `conclude`. `new` MUST accept the owner's words
    from a file or standard input. `record <name>
    decision|signoff|part|section|origin` MUST write only its own part of a
    record, show the diff, and write on OK. `record section <ID> [--builds-on
    <request>]` MUST copy "was" from the baseline, or pin the named request's
    latest version. `record origin --url <u> --from -` MUST store a snapshot with
    its hash, and `--verify <file> --from -` MUST check a re-fetch.

### [TL-2]@1 add after [TL-1]   for R11
Now:

    ## [TL-2] Deterministic and plain
    The tool MUST make no network calls, no AI calls, and keep no database or
    cache that holds unique truth. It is Node ESM with no runtime dependencies
    beyond Node and git, tested with `node --test`. The same inputs MUST give the
    same output.

### [TL-3]@1 add after [TL-2]   for R10
Now:

    ## [TL-3] What is enforced, and by whom
    The tool's documentation MUST include a short table of what the tool checks,
    what its skill asks of the agent, and what the owner decides, so no reader
    takes a hint for a guarantee. The way of working (tests-first, review, the PR
    flow) belongs to the bots and is out of this table.

### [TL-4]@1 add after [TL-3]   for R11
Now:

    ## [TL-4] The formality budget
    The formality a request costs the AI (records written, commands run, output
    and skill read) SHOULD stay at or below about a fifth of the change (the lines
    changed plus the lines read to make them) at typical sizes. It MUST be
    measured on real work, with owner round trips reported apart. The skill MUST
    open with a quick path of fifteen lines or fewer for tiers 0 and 1.

### [TL-5]@1 add after [TL-4]   for R12
Now:

    ## [TL-5] Beyond code
    The records, states, links and hints SHOULD work on a repo of documents alone.
    There, "tests" are named checks of a kind (a deterministic check, a
    checklist, or a review), and results are the files those checks write.
