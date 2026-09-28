# AssuredLoop v1: keep an AI focused on one change, with the current design, the owner's signed requirement and the trace together

Type: epic · Tier: 3 · Status: concluded

## Owner's words and dialog

- 2026-09-26: the bot's charter, which states the goal: a lightweight way to
  keep an AI focused on one change, by holding together the requirement, the
  spec changes and final form, the decisions, the work order, the change set
  and the tests. The scripts make the AI focus; they do not block. Snapshot:
  `origin/2026-09-26-charter.md`.
- 2026-09-26 to 09-27: the owner's inputs 1-48, in the owner's own words and
  kept verbatim where quoted, recorded as the dialog went. Snapshot:
  `origin/2026-09-27-owner-inputs.md`.
- The dialog in brief:
  - The AI researched spec-driven tools and the owner's three earlier
    attempts.
  - It proposed designs; an adversary challenged each one; five testers and
    two independent re-tests walked them through 23 cases.
  - The owner decided:
    - the format ("ok");
    - the repo: reuse and clear it;
    - the requirement sign-off as a blocking state;
    - spikes signed too;
    - a requirement in no section is a hint;
    - hotfixes wait for the sign-off, or land as tier 0 first.
  - The owner walked the design through part by part and added:
    - link snapshots with sha256;
    - the two-section request;
    - reviewer-validated size claims;
    - requirement before spec;
    - audit on demand, and history at any commit;
    - the boundary: the bots own the way of working; AssuredLoop owns the way
      of writing.
  - Then: "Looks good so far", and "follow the same method for this
    development as well, even though no tool yet".
- 2026-09-27: the owner signed off the organized requirement below: "Signed".
  Record: `origin/2026-09-27-signoff.md`, with the exact text and its SHA-256.
- 2026-09-27: the review of PR #56 found that R10 ("only consolidate and
  conclude refuse") conflicts with R3 ("signed off before any spec work"),
  which the design enforces by also refusing `record section` while
  unsigned. The AI proposed amending R10 to name that refusal, and asked the
  owner to re-sign. Until then this request is blocked.
- 2026-09-27: the owner re-signed with R10 amended: "Yes this is strict but one
  clarification. One can include their spec work and the sign off in one
  commit. Or they can sign off first and then separate pr after". Record:
  `origin/2026-09-27-signoff-2.md`. The clarification is taken into the spec as
  the meaning of "before" ([REC-6], [REC-10]) and into ADR 0011.
- 2026-09-27: the owner clarified: "So people can work on the spec work before
  sign off but the spec work or any later work have to be delivered as part of
  sing-off or after." That changes the text again. R3 now allows drafting
  before the sign-off and requires delivery with it or after it. R10 returns
  to its first-signed wording, with no refusal to start spec work. A new
  sign-off is needed; until then this request is blocked.
- 2026-09-27: after consolidate and conclude were explained, the owner signed
  the amended requirement: "Signed in best my knowledge". Record:
  `origin/2026-09-27-signoff-3.md`. The request is no longer blocked.
- 2026-09-27: a new snapshot of the owner's inputs, now 1-53, including the
  clarifications that changed R3 (inputs 49-50) and the later decisions
  (51-53). Snapshot: `origin/2026-09-27-owner-inputs-2.md`. The earlier
  snapshot (inputs 1-48) is kept.

## Organized requirement

### R1 One current design
The project MUST keep one consolidated current spec on main, in plain
Markdown, with each promise in a section with a short ID. A reader, human or
AI, MUST be able to tell the right design now without reading past changes.

### R2 A record of each request
Work that changes a promise MUST have a request record. It keeps the owner's
words and the dialog as given, with every link or chat snapshotted with its
SHA-256, the time fetched and the source's last-updated time. It also holds an
organized requirement written from them.

### R3 The owner signs off first
The organized requirement (for a spike, the organized question) MUST be signed
off by the owner. Spec work and any later work MAY be drafted before the
sign-off, but MUST be delivered together with the sign-off or after it. The
sign-off MUST bind the exact text. Any later change MUST need a new sign-off,
showing only what changed. Until it is signed, the request MUST be blocked
from consolidation and conclusion.

### R4 The change, and closing it
Larger work MUST describe its spec change per section as what it says now and
what it will say. The current spec MUST stay unchanged until the request
concludes, except for early consolidation that does not deviate. Concluding
MUST require the whole change to be in the current spec or explicitly
dropped. Nothing applied may be dropped silently.

### R5 Parallel work aligns
Changes to the same section MUST align: build on each other, or correct the
earlier one. The tool MUST show overlaps, and MUST never silently overwrite.

### R6 Light paths for each size of work
There MUST be paths for:
- a fix with no record;
- a small amend in one PR;
- a change;
- an epic landed in parts;
- a spike.

Every PR MUST state its size and its claim. The tool MUST show the evidence,
and flag the contradictions it can see.

### R7 Bringing the AI back, and full audit
One command MUST show, in about a dozen lines, where a request stands and what
to do next. On request it MUST return the full trace for an audit, including
as of any past commit.

### R8 Rough links, code and tests chained
The tool MUST link requests, spec sections, code and tests from git history
and IDs, say why each link was made, and chain code changes with test changes
as hints.

### R9 Decision records
Lasting decisions MUST be recorded as ADRs in the kit's format. The tool MUST
show the ADRs that govern a section, and flag broken supersede links.

### R10 Hints, not a harness
The tool MUST give hints in its output. It MUST NOT block commits or merges:
only its own consolidate and conclude refuse, and a strict mode is opt-in. It
MUST NOT enforce the way of working (tests-first, review, the PR flow), which
belongs to the bots.

### R11 Light and plain
The tool MUST run offline and deterministically, with no database and no AI
calls. Its formality SHOULD cost no more than about a fifth of the change at
typical sizes.

### R12 Beyond code
The same records SHOULD work for non-code projects, such as docs and
research.

Out:
- how to develop, test and review (the kit's skills and the bots' rules);
- roles, and approvals beyond this sign-off;
- project management;
- an OpenSpec importer (later);
- fetching links inside the tool.

Assumed:
- Node ESM with zero runtime dependencies, tested with `node --test`, as the
  kit is.
- The design detail (states, formats, commands) is the change spec's job, not
  this requirement's. The working design is `design-v3.4.md` in the bots repo.
  It moves into this request's change spec after the sign-off.

Signed off: 2026-09-27 owner ("Signed in best my knowledge"), origin/2026-09-27-signoff-3.md (the latest; earlier: signoff.md, signoff-2.md)

## Decisions

- D1, 2026-09-27. Source: the review of PR #68 (assuredloop/reviewer); ruling
  by the agent (architect). Approved change to [VW-9]: it promised "the time
  it was last fetched" for `origin/main`, which git cannot give exactly.
  FETCH_HEAD mixes fetches under one time, and a fetch that finds nothing new
  leaves no record. [VW-9]@2 promises the latest time git recorded for
  `origin/main` instead. No requirement changes; R7 is untouched, so no new
  sign-off.
- D2, 2026-09-27. Source: the agent (architect), before part 5. One habit for
  commands that change files: show what would be written, and write only with
  `--yes`. [TL-1] said this for `record` ("write on OK"), while [STA-4] had
  `consolidate` write by default with `--preview`. Parts 1-4 built `--yes` for
  `record` and `spec --add-ids`. [TL-1]@2 states it for every writing command
  except `new`, and [STA-4]@2 replaces `--preview` with `--yes`. No requirement
  changes, so no new sign-off.
- D3, 2026-09-27. Source: the agent (architect), from the developer's part 5
  questions. [STA-7] said `conclude` "prints three lines or fewer", while
  [VW-9] makes every output also name what it read and end with Next and Not
  known, which is three lines on its own. [STA-7]@2 says three lines or fewer
  plus those. No requirement changes, so no new sign-off.
- D4, 2026-09-28. Source: the owner (snapshot
  origin/2026-09-28-chat-with-the-owner-architect-session-claude-code.md).
  The size check C9 is raised from under 2,000 to under 3,500 lines of CLI
  source, counted as every line in `src/` and `bin/`. After 6 of 10 parts the
  source was 2,115 lines, and about 3,000 are expected at the end. Recorded as
  ADR 0012, which supersedes ADR 0009. No requirement changes.
- D5, 2026-09-28. Source: the agent (architect), from the developer's part 9
  questions. [VW-2] said `context` shows "each held section with its state and
  its requirement". For a request of 50 blocks that no longer fits twelve
  readable lines, which R7 asks for. [VW-2]@2 keeps the full list while it fits
  on one line; otherwise it shows the count in each state, naming every section
  except those consolidated, carried or pending. No requirement changes, so no
  new sign-off.
- D6, 2026-09-28. Source: the agent (architect), from the C10 re-run in part 10. Reading of [HNT-2]: "a cited requirement that does not exist" skips blocks marked Dropped. A dropped block citing an R-line that moved to Out is the record of the drop, not an error: it retains nothing and touches nothing ([STA-6]). Kept blocks stay checked, since [STA-6] makes them trace to a signed R-line or an owner decision. No requirement changes, so no new sign-off.
- D7, 2026-09-28. Source: the owner (snapshot origin/2026-09-28-chat-with-the-owner-architect-session-claude-code-2.md). C11 was measured on the 22 build PRs: 18-19% for the whole request with design.md and the ADRs counted as design, 34% with every record counted; tier 0's median PR 29%. All of it is confounded by records read by hand before the tool existed. The request concludes with [TL-4] as it is, and C11 is re-measured on the first real project that uses the tool; if it is still over a fifth then, that is a new request. No requirement changes.

## Outcome

- R1 One current design: in [SPC-1], [SPC-2], [SPC-3], [VW-5]
- R2 A record of each request: in [REC-1], [REC-2], [REC-3], [REC-4], [REC-7], [REC-12]
- R3 The owner signs off first: in [REC-4], [REC-5], [REC-6]
- R4 The change, and closing it: in [REC-9], [REC-12], [SPC-4], [SPC-5], [STA-1], [STA-2], [STA-3], [STA-4], [STA-5], [STA-6], [STA-7], [STA-8]
- R5 Parallel work aligns: in [STA-1], [STA-2], [HNT-2]
- R6 Light paths for each size of work: in [REC-8], [REC-10], [REC-11], [HNT-2]
- R7 Bringing the AI back, and full audit: in [STA-8], [VW-1], [VW-2], [VW-3], [VW-4], [VW-6], [VW-7], [VW-8], [VW-9], [TL-1]
- R8 Rough links, code and tests chained: in [VW-4], [LNK-1], [LNK-2], [LNK-3], [HNT-2]
- R9 Decision records: in [VW-3], [LNK-4]
- R10 Hints, not a harness: in [HNT-1], [HNT-2], [HNT-3], [TL-3]
- R11 Light and plain: in [TL-2], [TL-4]
- R12 Beyond code: in [TL-5]
- Added: [REC-1], [REC-2], [REC-3], [REC-4], [REC-5], [REC-6], [REC-7], [REC-8], [REC-9], [REC-10], [REC-11], [REC-12], [SPC-1], [SPC-2], [SPC-3], [SPC-4], [SPC-5], [STA-1], [STA-2], [STA-3], [STA-4], [STA-5], [STA-6], [STA-7], [STA-8], [VW-1], [VW-2], [VW-3], [VW-4], [VW-5], [VW-6], [VW-7], [VW-8], [VW-9], [LNK-1], [LNK-2], [LNK-3], [LNK-4], [HNT-1], [HNT-2], [HNT-3], [TL-1], [TL-2], [TL-3], [TL-4], [TL-5]
- Modified: none
- Removed: none
- Dropped: none
- Kept: none
- Decisions: D4, D7
- Agent rulings: D1, D2, D3, D5, D6
- ADRs added: 0001, 0002, 0003, 0004, 0005, 0006, 0007, 0008, 0009, 0010, 0011, 0012
- ADRs superseded: 0004, 0009, 0010

Notes:

The acceptance checks C9-C11 (design §11), run in part 10 (#66), 2026-09-28.
The working material (the C10 fixture script, inputs, answers, ground truths
and judge reports; the C11 scripts and data) is in the bots repository, under
bots/assuredloop/design/case-tests/part10-proofs/.

- **C9, cost.** No runtime dependencies (`test/deps.test.js`). The CLI source,
  every line of the `.js` files in `src/` and `bin/`, is 3,056 lines, under
  3,500 (ADR 0012; 3,051 before part 10's fixes). The skill,
  `skills/assuredloop/SKILL.md`, has a body of 37 lines (40 or fewer) that
  opens with a 14-line quick path for tiers 0 and 1 (15 or fewer), after 8
  lines of frontmatter (`test/skill.test.js`).
- **C10, fresh reader.** A tier-3 epic built with the real tool, at its
  midpoint: part 1 consolidated; part 3's email-link code live on main; on a
  branch the owner drops the email link (R3 to Out, [INV-5] Dropped) and
  reverses the page dates ([INV-2]@1 Revised, @2 waiting), with the changed
  requirement not re-signed. A fresh reader got only `al context` and
  `al context invoice-download`; a separate judge that wrote neither graded
  it against a ground truth written before the run.
  - Run 1: PASS, all three parts correct, with caveats. The note on the live
    code for the dropped part was hidden behind "2 more hidden, --all", and a
    `not ok` about the dropped block's own R-line took its place, so the
    reader never saw the fixture's main hazard. The judge called the ground
    truth "arguably too lenient" there.
  - The fixes, ruled by the architect: a Dropped block's R-lines are not
    checked (D6); the live-code note ranks first among the notes; the Spec
    line shows Dropped and Kept blocks by their marker; the sign-off hint
    passes `--words`.
  - Run 2, a fresh reader and a fresh judge on the same fixture: PASS, all
    three parts correct, and the reader saw and took in the live code. The
    Next action was a close call: the reader put the live code after the
    re-sign-off without raising it with the owner or planning a part. The
    judge counted that as not silent, and noted that under the ground truth's
    literal wording that part would be "partly", and the verdict FAIL.
- **C11, formality**, measured on the 22 build PRs (#56, #67-#87) from git and
  every session's transcript (the reviewer's included). Formality = records
  written + `al` runs and their output + record reads; the share is formality
  / (lines changed + lines read), with real reads from the transcripts.
  - View (ii), design.md and the ADRs counted as design (the spec's reading):
    the whole request 18% warm, 19% cold (the skill projected at 45 lines per
    cold start); tier-3 parts 12% / 13%; the median part (#87) 7%.
  - View (i), every record counted: the whole request 34%, the parts 22%.
    Over a fifth.
  - Tier 0: 15% overall, but its median PR (#68) is 29% in both views. Over a
    fifth. Nearly all of it is the architect and reviewer reading the raw
    change.md (253 lines) over the question that became D1; the developer's
    own share was 2%.
  - On the design's read proxy (file sizes; 0 for new files, and 98 of the
    150 changed files were new) every aggregate is over: 50% (ii), 95% (i).
    The proxy undercounts reads here.
  - Record reads are the largest term (20.4k lines, against 4.0k written and
    1.2k of `al`). [TL-4]'s list does not name them; without them the whole
    request is 4.3%.
  - The confound: the records were written and read by hand while the tool
    was being built, and change.md is also the product's spec. That pushes
    the share up (whole files read where `al context` prints twelve lines)
    and down (no show-then-`--yes` double output, no skill read). Nothing
    here shows which way it nets out.
  - Owner round trips, apart: 3 sign-offs before the build (2 were re-signs
    forced by the R10 wording), and 1 owner decision during it (D4). No
    session waited on the owner.
  - The owner's answer (D7): conclude with [TL-4] as it is, and re-measure C11
    on the first real project that uses the tool; still over a fifth then is
    a new request.
- **Follow-ups, not promises** (the second C10 judge's remaining gaps):
  Require names what changed but not the old and new text; Decided shows only
  IDs and dates; the Spec count names no pending section; it does not say what
  [INV-2]@2 waits on; the live-code note names the dropped code but not its
  live caller; Next does not name the live code; and the hidden hint repeats
  the BLOCKED line. ("Delivers work" firing for a branch that changes only
  change.md is the rule as ruled in part 7: change.md is spec work.) Two more,
  seen by the developer on this request's own archived view: it lists all 46
  sections "as at conclusion" on one long line, without [VW-2]@2's
  fit-or-count; and its Next line suggests `al record … origin` on an
  archived request, which [REC-1] says is not edited once on main. Each is a
  small fix for a later tier-0 or tier-1 request.
