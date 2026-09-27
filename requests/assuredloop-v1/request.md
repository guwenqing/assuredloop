# AssuredLoop v1: keep an AI focused on one change, with the current design, the owner's signed requirement and the trace together

Type: epic · Tier: 3 · Status: open

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
