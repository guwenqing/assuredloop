<!-- SP-1 note -->

# Design links and task references: the change spec

<!-- SP-2 note -->

This change serves R1 in `request.md`. It changes three paragraphs of
`specs/design.md`: DES-16 (what the links mean), DES-22 (what the script
checks) and DES-26 (what `al context <ID>` shows). Each section has the
promise paragraph first, then the design that keeps it.

<!-- SP-3 note -->

## Links to a promise of the same change spec

<!-- SP-4 definition serves:R1 changes:DES-16 -->

**Links:**
- `serves R<n>`: a promise or design paragraph, to the requirement;
- `builds on <ID>` or `changes <ID>`: to a consolidated paragraph. In a
  change spec, `builds on` may also name a promise paragraph of the same
  change spec, from the design that keeps it;
- `removes <ID>`: a change declares that it removes a spec paragraph (see
  section 5 for promise kinds);
- `for <task>`: optional, for a project that uses tasks;
- `explains`, `illustrates`, `resolved by`, `governed by <ADR>`.

<!-- SP-5 note -->

## The two hints

<!-- SP-6 rule serves:R1 changes:DES-22 -->

**What the script checks** (no AI):
- A paragraph with no ID: `not ok`. A promise or design paragraph with no kind
  or no link: a hint; under opt-in `--strict`, `not ok`. An adopted paragraph
  (section 5) gets no link hint while its text equals the captured text.
- A link to an ID that does not exist: `not ok`. When another change removed
  the target, the link gets the hint "target removed" instead, and the open
  change aligns.
- Two headings with the same text under the same parent (the same heading
  path): a hint. The same text under different parents is valid. Why: two headings with the same path make a reference ambiguous.
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
  a paragraph with no ID, which is `not ok`. In `specs/` and in an archived
  change spec, a lost ID is `not ok`.
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
- The exit code is 0 by default, even when `not ok` lines print. Under
  `--strict`, the exit is 1 when any `not ok` prints. `--strict` raises only
  the findings that need no judgment: no kind, no link, an invalid
  disposition, and the marker lints. The hints that need judgment stay hints
  under `--strict`: near match, "promise kind?", the typo mark, overlap,
  stale base, a stale AI hint, an ADR that governs, a removed target, a
  paragraph deleted from an open request's change spec, "which promise does
  it keep?", and a `for` that names no task.

<!-- SP-7 approach serves:R1 builds-on:SP-6 -->

`al check` reads each open request's change spec. For each paragraph of a
design kind or `approach`, it takes each requirement that the paragraph
serves. It collects the promise paragraphs of the same change spec that
serve that requirement. When there is one or more, and the paragraph links
to none of them by `builds-on` or `changes`, it prints the hint
`design-link`. It prints one hint for each such requirement, also under
`--strict`.

<!-- SP-11 approach serves:R1 builds-on:SP-6 -->

The project uses tasks when the record of any request, open or concluded,
has a task in `tasks:`. Then each `for:` in an open change spec that names
no task in its request's record gets the hint `unknown-task`. A bare task
ID names the paragraph's own request. It is a hint, also under `--strict`.

<!-- SP-8 note -->

## What `al context <ID>` shows

<!-- SP-9 rule serves:R1 changes:DES-26 -->

- A change paragraph that relies on a spec paragraph says `builds on <ID>`.
  One that replaces it says `changes <ID>`. It holds no copy of the old text.
- **Bindings.** When a link is first indexed, the script records a binding in
  the request's record: the target's version or text hash at that time, and
  the source paragraph's text hash. Both ends are hashed.
  - Ordinary indexing never advances a binding.
  - Only an explicit align step (`al index --align <ID>`) advances it, after
    the agent has checked the change against the new target. The PR diff then
    shows the old and the new binding.
  - A newly declared link (not in the marker at the base commit) gets its
    first binding when it is first indexed. A link that was in the marker at
    the base commit but whose binding record is gone stays "binding unknown".
    The script never fills a lost binding with today's value.
  - The same rules hold for `serves R<n>` (the requirement version), for
    `from` (the owner's-words snapshot), and for declared outputs where a
    project declares them. Where a project declares no outputs, the tool
    cannot say that an output's declared claim went stale; the context view
    says which holds.
- When a bound target changes, the source paragraph gets a hint until it is
  aligned: "your change builds on INV-41, which change X changed on <date>.
  Align it." Running the index again does not remove the hint.
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

<!-- SP-10 approach serves:R1 builds-on:SP-9 -->

`al context <ID>` gets a `Linked` line: each paragraph of `specs/` or of
an open change spec whose marker builds on, explains or illustrates the ID,
for example `Linked    DES-20 explains it · design-links/SP-7 builds on it`.
With none, it says `no paragraph builds on, explains or illustrates it`.
