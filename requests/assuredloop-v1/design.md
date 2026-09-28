# AssuredLoop: design v3.4

2026-09-27. Architect, assuredloop. Status: **the owner walked through it part
by part and said "looks good so far" (input 46).** v3.4 adds the owner's
walkthrough changes (inputs 40-45; §2c) to v3.3. v3.3 folds in the independent re-test of the rules
(`case-tests/R1`, 154 checks) and the second fresh-reader run
(`case-tests/R2`); see §2b. The owner's decisions 1-5 are in (inputs 35-38). It takes in the adversary's six findings on v3.1
(`adversary-challenge-v3.1.md`), and section 2a says what changed. Changed
predicates are re-tested before this goes to the owner as final. It replaces
`design-v3.1.md`, which replaced `design-v3.md`. v3 was walked through 23 cases on scratch
git repos by five independent testers (`case-tests/G1`-`G5`). Section 2 lists
each break they found and its fix. Every borrowed idea and its decision is in
`borrowed-ideas.md`. The owner's inputs are 1-34 in
`../research/owner-inputs.md`. Command names are placeholders.

## 1. In one page

**The problem.**
- After a while an AI session loses where the work stands and what the right
  design is. With 30 change specs no one can tell.
- Decisions made after the request get lost, and things rot fast.
- The AI writes the tests as well as the code, so tests alone cannot anchor the
  work.

**The answer: the OpenSpec way, traceable and light.**
- **The current design.** `specs/` on main is the consolidated baseline, plain
  Markdown. Every section a change touches carries a short bracketed ID, for
  example `## [INV-3] Dates`.
- **The request record.** One folder per request, `requests/<name>/`, holding:
  - the original words, captured or linked;
  - the organized requirement, as R-lines with MUST/SHOULD/MAY. The owner signs
    it off, and until then the request is **blocked**;
  - the decisions, append-only;
  - the parts;
  - at the end, the outcome.
- **The change spec for bigger work.** `change.md` holds the why and the
  design, and for each section it touches, what the section says now ("was")
  and what it will say ("now").
  - It is merged to main once the requirement is signed off; the baseline stays
    as it is. The spec text itself is not signed: the was/now check and PR
    review cover it.
  - Parts land citing it. Partial consolidation is allowed while nothing
    deviates.
  - A concluding PR consolidates the rest and archives the request.
- **One comparison checks everything.** For each held section, the baseline says
  "was" (pending), "now" (consolidated), or neither (differs: align). That gives:
  - partial consolidation without deviation;
  - "anything starting in the middle must align";
  - the forced conclusion.
- **Hints, not a harness.**
  - Output is layered, with a full Outcome at the end.
  - Rough links come from git, each with its reason.
  - `conclude` and `consolidate` refuse only for their own request.
- **Tiers keep it flexible.**
  - **0.** A fix changes no promise: no record.
  - **1.** A fix or small story that amends a promise: a record of about 7
    lines, and the baseline edit in the same PR.
  - **2.** Work that needs a design: a change spec.
  - **3.** An epic: the change spec is on main while others work alongside.
  - **S.** A spike: findings, with no spec change.
- **The budget.** It is a projection until measured on a real run. Against the
  real sizes of the owner's own work (section 10), and counting the skill read:
  - about 8-24% for a small amend (cold) and about 5% at the median;
  - about 12% for a 4-part epic over 6 sessions.

  The quick-path skill (15 lines) is aimed at the cold small amend.

**The boundary** (owner input 48).
- **The bots own the way of working:** tests-first, independent review, the
  PR flow, who does what. That lives in the kit's rules and skills.
  AssuredLoop does not enforce it.
- **AssuredLoop absorbs the way of writing:** the owner's words, the organized
  requirement and its sign-off, the spec, the change spec, the tiers (which
  records to write), and the record links (ADRs included). Its skill teaches
  that writing, and its own commands check those records.

**Out of scope.**
- How to shape, test and review work: the kit's skills own that.
- Roles, approval machinery, policy or trust layers, routing, test running.
- Branches holding state, databases, and LLM or network calls in the script.

## 2. What the case tests broke, and the fix

| # | Found (tester) | Fix in v3.1 |
|---|---|---|
| 1 | A section included its subsections: a new sub-heading made the parent "differ"; an H1 title spanned the file (G1, G4) | A section is its own heading plus the text up to the next heading of **any** level (§5.1) |
| 2 | IDs were ambiguous: `UTF-8` and `COVID-19` read as IDs; `INV-3.1` read as `INV-3`; repeated headings shared a key; concurrent adds made duplicate IDs (G1, G4, G5) | IDs are bracketed at the heading start, `[INV-3.1]`, and dots are allowed. Only a section with an ID can be held by a change. Duplicate IDs are `not ok`. Next ID = the highest + 1, never reused (§5.1) |
| 3 | After a file split, a remove read "consolidated" and an add "pending"; a renamed ID had no candidate; heading demotion read "differs"; a pure move cost about 25% to align (G4) | Sections are found **by ID anywhere in the baseline root**; the path in `change.md` is only a hint, so a move costs nothing. The heading level is ignored when comparing. A remove is consolidated only when the ID is gone everywhere. A missing ID gets candidates by matching body text (§5.2) |
| 4 | "Builds on" was stuck: if B consolidated first, A read "differs" forever; a dropped A was reverted over B's work; waiting and stale looked alike (G3, G4) | Written rules: B's "was" is A's "now". New states "waiting on A", "carried by B" (counts as consolidated for A) and "base revised" or "base dropped: re-base". A cannot revert a section a successor carries (§5.3) |
| 5 | A section marked dropped after it had been consolidated passed `conclude`; "dropped" read two ways (G3) | "Dropped" means this change will not be applied, so the baseline must hold "was". Otherwise: `kept` with a decision, or revert (§5.4) |
| 6 | A consolidated section could not be revised later (G3) | `record section` again re-bases "was" onto today's text, with a decision. Earlier versions stay in git (§5.4) |
| 7 | `conclude`'s rules and the sign-off binding held only while `conclude` ran; edits made after it in the same PR were invisible after a squash (G2) | `check` re-runs `conclude`'s rules for every request the branch moves into `archive/`, and checks append-only **per commit** over `main..HEAD`. The limit: this binds only if `check` runs on the PR (the reviewer or CI) (§5.5, §8) |
| 8 | The Outcome froze branch commit IDs that vanish after a squash (G2, G3) | The Outcome holds no commit facts; commits are derived when read (§5.5) |
| 9 | A tier-1 sign-off covered the R-lines but not the spec edit (G1) | **One sign-off binds the requirement and the spec change together.** For tiers 2-3 that is `change.md`'s Spec changes; for tier 1, the text of the baseline sections the PR changes. Separate "acceptance" is gone (§4) |
| 10 | Sign-off on every tier-1 amend stalls AI-found bugs; a spike needed a sign-off for a question (G1, G2, G5) | **Owner decisions 3 and 4** (§12). The defaults proposed: tier 1 may merge "awaiting sign-off" and the owner signs in batches; spikes need no sign-off |
| 11 | R-lines could fall out of the baseline at conclusion (G1) | The Outcome lists each R-line that no consolidated section contains or cites (`for R3`) as `not ok` (a hint; owner decision 5) |
| 12 | Two tier-1 amends to one section merged into a contradiction silently (G1) | Hint: "INV-3 changed on origin/main since this branch forked (by <request>): re-read" (§7) |
| 13 | A split epic had no parent-child link: the parent concluded while a child was open, and a delegated section read "dropped" (G3) | A Parts line may name a request (`2. CSV export: request csv-export`). Its done state comes from that request. The parent's `conclude` refuses while a named child is open. A child cites the parent's R-lines and sign-off instead of copying them (§4) |
| 14 | Links were fragile: git's default squash message indents `Request:`; `Fixes #12` hides trailers; commits citing `#31` were unlinked; tier 0 could not say `Follows:` (G1, G3, G5) | `Request:` and `Follows:` lines are read anywhere in a message. Issue numbers link to the request whose Original lists that issue. Tier-0 commits may carry `Follows:`. A commit touching more than one request folder is "ambiguous" (§7) |
| 15 | `git blame -C` misdated consolidation (G3); `--follow` walked into the wrong history across the archive move (G3) | Blame without `-C` for `specs/` (and `git log -L` for "when"); `-C` only for code. A request's history is looked up by name over both paths, never with `--follow` (§7) |
| 16 | A negative spike was never found when the idea came back; nothing pointed from an old request to what replaced it; `Follows:` showed in no view (G2) | Related history: any view of a change lists open and archived requests citing the same section IDs, rejected ones first. Archived requests show "as at conclusion; since changed by X". `Follows:` appears in the header (§6) |
| 17 | Code that landed for a dropped section or request was never shown (G3) | Hint: "code from this request still on main: src/export.js (13 lines)", from blame on the current tree to the request's commits (§7) |
| 18 | A link-only issue left the owner's scope-change comment out of the repo, with no prompt (G2) | `new --from <URL>` prints the capture command. A link-only original adds a Not known line: "not auditable offline; may have changed since <date>" (§8) |
| 19 | No adoption path or empty state, so a big-bang baseline was likely; `specs/` collided with spec-kit (G5) | The empty state is defined: the baseline grows request by request, and a partial baseline says which areas it covers. The root is configurable with one line (§3, §6) |
| 20 | Non-code work: it was unsaid what `specs/` holds; a 3-line doc edit cost 82 lines of was/now (G5) | `specs/` holds **promises about the deliverable, never the deliverable itself**. For a docs project the docs are the "code" (§3) |
| 21 | Tier 1 promised 5 lines, but the format gave 26 over 3 files; the skill read was left out of the budget, and it was the biggest cost (G1, G5) | A tier-1 skeleton of about 7 lines and no empty sections. `conclude` prints 3 lines or fewer. A skill core of 40 lines or fewer, with detail on demand. C11 counts the skill (§4, §10) |
| 22 | Parts and "all parts done" formed a progress loop (G5) | Parts are optional free text. "Not reported" and the "all parts done" hint are dropped (§3) |
| 23 | A hotfix was told it "must align", so it waited on paperwork (G4) | A hotfix may land at once. The held change carries the alignment: it reads "differs" and cannot conclude until re-based. The hotfix gets only a note (§4) |
| 24 | Right after `record section`, was = now read "consolidated" (G2) | The state is "no change yet", and `conclude` refuses it (§5.2) |
| 25 | The C11 measure mixed units and toy sizes decided the verdict (all five testers) | Units are defined, and the measure is against real change sizes from the owner's repos (§10) |
| 26 | Default views were unclear: hints were missing, originals were hidden, parts showed as numbers only (G3, G4) | The default view shows at most 3 hints, the newest originals first, part titles, and other changes holding sections in the same file (§6) |

Rows 9, 10, 13 and 21 are superseded by §2a (A, B, J, I).

**The C10 fresh-reader run (G3, on v3's output).** Given only v3's level-1
`context` output at the midpoint of an epic with a reversal, a fresh agent got
the drop and the sign-off drift right. It only guessed that the dropped email
link's code was still live on main. It wrongly read INV-8 as unapproved,
confused by "spec changes edited since acceptance". So the output said where
things stood, but not what to do. v3.1 answers both, in rows 17 and 9. The
tester judged the run itself, not an independent judge as C10 requires.

## 2a. What changed from v3.1 (the owner's decisions, and the adversary's challenge)

| # | Point | Change |
|---|---|---|
| A | Owner decision 3: the requirement sign-off is **blocking**; the spec is not signed | Sign-off binds only the Requirement part (R-lines and Out). Until it is signed, the request is **blocked**: `consolidate` and `conclude` refuse, `context` says so first, and `check --strict` is `not ok` for a branch serving it. A tier-1 PR waits for the sign-off; there is no sign-off after merge (§4) |
| B | Owner decisions 4 and 5 | Spikes need no sign-off. An R-line in no section at conclusion is a `not ok` hint in the Outcome, not a refusal |
| C | Adversary 1: "carried by" breaks for chains, and states overlap | States are a two-step procedure. **First the link is checked, then the content.** "Carried" goes transitively along a valid chain of versions of the same section, archived successors included. Cycles are rejected. `consolidate` writes only on a positive list (§5.2, §5.3) |
| D | Adversary 2: dropping could keep an unsigned change | `Kept` needs the section's text to trace to a **signed** R-line (`for R2`) or to an owner decision (source: the owner). A drop with no retained change needs no sign-off. `Kept` is a disposition of content that was checked, never an override for "differs" (§5.4) |
| E | Adversary 3: ignoring whitespace erases real changes in code blocks | The comparison is exact text. Normalized: line endings, trailing spaces, blank lines at the section's edges, and the heading's `#` count. Code blocks and list structure are kept exact. A move under a different parent heading can change meaning, and that is stated as outside the check (§5.1) |
| F | Adversary 3: ID allocation per file collides across files | Next ID per prefix = the highest ever used in the root: the baseline plus every open and archived `change.md`. Never reused. References are `(root, ID)` when there are several roots. Duplicates are detected before any write (§5.1) |
| G | Adversary 4: the audit claim is too wide | Audit scope stated: every original supplied, every sign-off, every decision, and every version of `change.md` **that reached main**. Drafts inside one PR are not kept. Final-state rules are checked on the final state; only append-only is checked per commit (§5.5, §8, C7) |
| H | Adversary 5: a hotfix still fails `check --strict` | `--strict` counts only diagnostics owned by the requests this branch serves or archives. Other requests' alignment debt is shown as information. A test covers the actual exit code (§7, C3) |
| I | Adversary 6: the budget was stated as met | The budget is a projection: the skill read is included, cold and warm. A 15-line quick path at the top of the skill is for tiers 0 and 1. Measured on a real run before it is claimed (§10) |
| K | Owner input 39: "writing ADR is part of the game" | Decision records are part of the loop (§3a): the spec says **what** holds, ADRs say **why** it was chosen, requests say **how it changed**. AssuredLoop links, shows and checks ADRs; the kit's `obk-arch` skill owns how to write them. This design's own decisions are ADRs (`adr/`) |
| J | Adversary 6: blocking on a named child is a PM gate | An open named child is a hint to the parent, not a refusal. A child reusing the parent's signed text word for word needs no second sign-off of that text. Decision kinds become a writing convention (§3, §4) |

## 2b. What changed from v3.2 (the rules re-test R1, and the fresh-reader run R2)

R1 built a literal model of v3.2's rules and ran 154 checks. 131 held. The rest,
and their fixes (P = R1's problem number; A = its ambiguity):

| Kind | Found | Fix |
|---|---|---|
| break | P1: C read "differs" while A and B were pending | "Waiting" follows the chain: the baseline equals the Was of any change reachable through valid links (§5.2 row 4) |
| break | P2: the overlap hint fired on a valid chain | The overlap hint applies only when neither change reaches the other through links (§7) |
| break | P3: `consolidate` wrote a section marked Dropped | The positive list is "pending and not Dropped" (§5.3) |
| stuck | P4: a successor of a *section*-level drop waited forever | Step 1 treats "X's block is Dropped" like "X is dropped" (§5.2) |
| break | P5: a request's own revision left its open predecessor "differs" | A revision **keeps the old block** (marked `Revised <date> (Dn)`) and adds a new block that builds on it, inside the same request. Chains walk through revised blocks (§5.4) |
| break | P6: after a hotfix into a consolidated section, no truthful conclusion existed | `record section <ID> --accept`: keep Was, set Now to today's text, with a decision naming the change underneath (§5.4) |
| false pass | P7: `not ok` that no request owns never counted | Unowned `not ok` (duplicate IDs, conflict markers, Was:/Now: in the baseline, not found) counts for the branch (§7) |
| contradiction | P8: §4 blocked "conclude refuses" vs §5.4 dropping unsigned | `conclude` refuses while blocked, **except `--dropped` with nothing retained** (§4) |
| contradiction | P9: reverting was impossible while blocked | `consolidate --revert` is allowed while blocked (§5.3) |
| wording | P10: "+1" missing from next ID | fixed (§5.1) |
| break | P11: IDs that lived only in the baseline could be reused | The next ID = the highest found in the root's git history plus the open `change.md` files, + 1 (§5.1) |
| stuck | P12: a Was/Now block holding a second heading read "differs" | A block holds exactly one heading; `record` and `check` flag a second (§3) |
| contradiction | P13: "R-line in no section" failed `--strict` on every reworded tier-1 PR | It is a `note` (owner decision 5 said hint). A tier-1 record may name the sections it amends (`Amends: [INV-4]`), which counts as citing (§3, §7) |
| **owner's call** | P14: a hotfix that changes a promise is tier 1, so it waits for the sign-off, yet §4 said "at once" | Proposed: "at once" holds for tier 0 (restore promised behaviour); a promise-changing fix waits for the sign-off, or lands as tier 0 first and is followed by a tier-1 amend (§4). **Asked of the owner** |
| gap | P15: a hand edit could put a blocked request's Now into the baseline, with exit 0 | `not ok` for the branch: "a baseline section this branch changed equals the Now of a blocked request" (§7) |
| gap | P16: a builds-on section could not be dropped before its predecessor consolidated | Dropped: the baseline holds this Was, **or the section reads "waiting"** (§5.4) |
| ambiguity | A1: row 4 and adds; A2: X holds no block; A4: "loops back"; A8: X with no change | Row 4 includes "for an add: absent"; X holding no block = broken link; a loop = revisiting any request; B waiting on an X with no change yet is correct (§5.2) |
| ambiguity | A3: the normalization | Trailing whitespace includes tabs (so Markdown hard breaks are not significant). The blank lines between the heading and the body are normalized. Only ATX (`#`) headings start sections (§5.1) |
| ambiguity | A5, A6: what the sign-off binds; a child's partial reuse | The sign-off binds the whole Requirement part, compared like a section. A child inherits the parent's latest sign-off for any R-lines it copies word for word (§4) |
| ambiguity | A9, A10, A11: duplicates and writes; "not found" in `check`; reverting a remove | A duplicate ID anywhere in the root blocks all writes until fixed. "Not found" is `not ok` for the holding request. A remove block records its anchor (`remove, was after [INV-2]`), so `--revert` can put it back (§5) |
| gap | A7: Kept on a carried section needs the successor's signed R-line | Kept as written; it costs one owner round trip when `for Rn` is missing |

The adversary's final check of v3.3 found two blockers, both fixed here:
- **A revision inside a request read as a cycle** (because loops were detected
  per request) **or as "base revised"** (compared with the request's current
  "now"). Fix: every block has its own identity, `<request>/<ID>@<n>`. Links
  name a block version. Loops are detected per block. Stale bases are judged
  against the version the link names (§3, §5.2, §5.4).
- **"Nothing retained" had two definitions.** A request whose only section was
  "waiting" could be dropped section by section, but not as a whole without a
  sign-off. Fix: one definition, **established positively from content**. It
  holds only for no change, the baseline at exactly "was", or waiting.
  Everything else counts as possibly retained (§5.4).
  - My first attempt used state names. It missed a block consolidated before
    its base changed.
  - My second attempt inferred "retains nothing" from failing to match
    "now". The adversary showed a false pass: a section partly reverted by a
    hotfix.
  - Both are replaced, and the adversary's acceptance cases are in C3.

R2, the second fresh-reader run (an independent judge graded all three parts
"partly"), found four gaps in what `context` prints. They are fixed in §6:
- **Which R-lines changed.** The Require line says which R-lines changed since
  sign-off; before, the reader assumed the old sign-off covered them.
- **The R-line on each section.** The Spec line tags each section with its
  R-line and whether that R-line is signed; before, the reader thought an
  agreed section was unapproved.
- **Code as line ranges.** Hints give code as `path:lines`; before, the reader
  took "4 lines" to mean the whole file.
- **Whether a removal is planned.** The dropped-code hint says whether any part
  plans the removal.

## 2c. What changed in the walkthrough with the owner (inputs 40-45)

| Input | Change |
|---|---|
| 40 | A hotfix that changes a promise waits for the sign-off, or lands first as tier 0 and is followed by a tier-1 amend (§4) |
| 41 | **Links are always snapshotted**, with their sha256, the time fetched, and the target's last-updated time. There is no "link only" state any more. The script stays offline: the agent fetches, the script stores and hashes, and it verifies on a later re-fetch (§3, §8) |
| 41 | **The request has two sections, not a line-by-line mapping.** "Owner's words and dialog" is append-only. "Organized requirement" holds one or more requirements (R1, R2… as sub-sections), plus `Out:` and `Assumed:`. The whole organized section is signed off. Per-line provenance tags are replaced by the `Assumed:` list (§3) |
| 42 | **Spikes are signed off too**, in plain words: the question, what a useful answer looks like, and what is out. They are blocked until signed, like any other request (§4) |
| 43 | **Every PR states its tier and its claim** (`Tier: 0 — restores INV-4; no promise changes`). The tool shows the claim and the evidence, and flags the contradictions it can see (`not ok` for a tier-0 claim with a spec edit). The reviewer's duty to validate the claim is a bots' review rule, not an AssuredLoop enforcement (input 48) (§4, §7) |
| 48 | **The boundary.** The bots own the way of working (tests-first, review, the PR flow). AssuredLoop absorbs the way of writing: requirement, spec, change spec, tiers, record links (§1) |
| 44 | **Requirement before spec.** For tiers 2, 3 and S, the owner's words become the organized requirement, and it is signed off before any spec work; `record section` refuses while the request is blocked. Tier 1 may do it all in one PR. *(Replaced by input 50: work may be drafted before the sign-off and is delivered with it or after; nothing refuses drafting; see §4.)* **A full audit on demand:** `--audit` returns the whole trace (§4, §6) |
| 45 | **History:** every read command takes `--at <commit>`, and shows everything as it was at that commit (§6, §8) |

The walkthrough called the tiers "sizes"; they are the same thing.

## 3. The files

```
specs/                         the baseline (root configurable: `.assuredloop` holds one line, `root: docs/spec`)
  invoices.md                  "## [INV-3] Dates": promises, RFC 2119 words for new ones
requests/
  invoice-download/            the name is the permanent ID, never reused
    request.md                 the record
    change.md                  tiers 2-3
    findings.md                tier S: starts with "Answer:"
    origin/                    originals and sign-offs, exactly as supplied (append-only)
  archive/
    sessions-expiry/           concluded or dropped; never edited again
```

**What the baseline holds.** Promises: what must be true, in present tense,
never history ("no longer…"). In a docs or research project, the promises are
about the deliverable (what it must cover or state). The documents themselves
are the "code". The baseline starts empty and grows as requests add sections.
Existing docs are brought in area by area as requests, never in one big pass.

**`request.md`, tier 1** (the whole record, about 8 lines):

```markdown
# Invoice totals keep two decimals in JPY
Type: bug · Tier: 1 · Status: open · Follows: invoice-download
## Owner's words and dialog
- 2026-09-27 issue #58, snapshot origin/2026-09-27-issue-58.md
## Organized requirement
An invoice total MUST show two decimals for every currency, including JPY. Amends: [INV-4]
Signed off: pending
```

**`request.md`, tiers 2, 3 and S.** Two sections come first, and then the rest,
added only as needed:

```markdown
## Owner's words and dialog           (append-only, dated; long chats live in origin/)
- 2026-09-20 owner, chat: "customers keep asking to download their invoices,
  csv or pdf, and the email should have a link" (origin/2026-09-20-chat.md)
- 2026-09-20 AI asked: one invoice or a period? Owner: one invoice for now.
- 2026-09-23 issue #31 snapshot: origin/2026-09-23-issue-31.md

## Organized requirement            (signed off as a whole)
### R1 Invoice export
A customer MUST be able to export one invoice as CSV from the invoice page.
### R2 Email link
The invoice email MUST carry a link to the same CSV download.
Out: PDF export; period exports.
Assumed: Excel users in comma-decimal locales need ';' as the separator.
Signed off: 2026-09-21 owner, origin/2026-09-21-signoff.md
```

- **Owner's words and dialog.** Your original words and the AI's questions and
  your answers. This is the record; it is never rewritten.
- **Organized requirement.**
  - It is one written-up statement of what is wanted, using RFC 2119 words. It
    is not a line-by-line translation.
  - It may hold several requirements (R1, R2…), which decisions, spec blocks
    and tests can cite as "for R2".
  - `Assumed:` lists what the AI added that the owner never said, so the
    sign-off looks there first.
  - When requirements must be signed or finished separately, they become
    separate requests.
- **For a spike** the organized section is plain words:

```markdown
## Organized question
We want to know whether PDF rendering works without a native dependency.
A useful answer names one library, with a sample output, or says why none fits.
Out: layout quality.
```

- **Then, as needed:**
  - **Decisions**: numbered, append-only, each with its source (the owner, a
    review, or the agent). Kinds are a convention. A decision may supersede
    an earlier one, cite section IDs, or point to an ADR.
  - **Parts**: free text. A part may name a child request.
  - **Outcome**: written by `conclude`, never listing commit IDs.

**Snapshots of originals** (`origin/<date>-<name>.md`) begin with a header,
and the text follows exactly as fetched:

```
Source: https://github.com/o/r/issues/31
Fetched: 2026-09-23T10:14Z
Target updated: 2026-09-22T18:40Z        (when the source says)
SHA-256: 5d41402abc4b2a76b9719d911017c592...   (of the text below)
---
<the issue body and comments, exactly as fetched>
```

- The agent fetches (for example `gh issue view 31 --comments --json
  body,comments,updatedAt`). `al record <name> origin --url <u> --from -`
  stores the snapshot and computes the hash.
- Later, `al record <name> origin --verify <file> --from -`, fed a new fetch,
  reports "unchanged since" or "changed". If it changed, the new snapshot is
  appended, and the old one stays.
- Chat excerpts are snapshotted the same way, with a hash.

**The sign-off file** (`origin/<date>-signoff.md`):
- the owner's words, or a pointer to where they said it;
- after `--- signed text ---`, the exact Organized requirement (or Organized
  question) section;
- its SHA-256.

The spec text is not signed (owner decision 3).

**`change.md`**: why and design as free prose, then `## Spec changes` with one
block per version of a held section:

```markdown
### [INV-3]@1 modify          (path hint: specs/invoices.md)
Was:
    ## [INV-3] Dates
    Dates show in the customer's local format.
Now:
    ## [INV-3] Dates
    Dates MUST show in ISO 8601.

### [INV-7]@1 add after [INV-3]   for R1          (an add has no Was:)
Now:
    ## [INV-7] CSV export
    A customer MUST be able to export one invoice as CSV from the invoice page.

### [INV-3]@1 modify, builds on invoice-download/INV-3@1   (in another request)
```

- An add has no `Was:`, a remove has no `Now:`, and a modify has both.
- A block is the indented or fenced text after `Was:` or `Now:`; blank lines
  inside it are kept. **A block holds exactly one heading**; a second one is
  flagged by `record` and `check`.
- A remove records where the section stood: `### [INV-2] remove, was after
  [INV-1]`. That lets `consolidate --revert` put it back.
- **Every block has its own identity: `<request>/<ID>@<n>`.** `n` counts the
  versions of that section within that request (@1, @2…). It is written in the
  block heading, `### [INV-3]@2 modify`.
- **A revision keeps the old block** (marked `Revised <date> (Dn)`) and adds
  the next version, which builds on the previous one in the same request
  (`builds on @1`, implied).
- **`builds on` always names a block version** (`builds on
  invoice-download/INV-3@1`). `record section --builds-on <request>` writes
  that request's latest version for the section at that moment.
- Operations: `modify`, `add in <path>` (at the end of that file, created if
  needed), `add after [ID]`, and `remove, was after [ID]`.
- Markers after the operation:
  - `Dropped <date> (D4)`: this change will not be applied;
  - `Kept <date> (D5)`: already consolidated and kept although the request was
    dropped;
  - `builds on <request>/<ID>@<n>` (another request's block), or `builds on @<n>`
    (this request's earlier version).

## 3a. Decision records (ADRs)

The three kinds of record, each with one job:
- **The spec** says what holds now.
- **An ADR** says why a lasting choice was made, and what else was considered.
- **A request** says how and when things changed.

A decision that meets the kit's three tests gets an ADR:
- it is hard to reverse;
- it is surprising without its context;
- it came from a genuine trade-off.

Other decisions stay as decision lines in their request.

- **Where.** In the project's ADR folder if it has one, otherwise
  `docs/adr/NNNN-<decision>.md`. One file per decision, numbered in sequence,
  never renumbered, and a number is never reused.
- **Format.** The kit's `obk-arch` default:
  - the status: proposed / accepted / rejected / deprecated / superseded by;
  - "Decided by", Context, Decision, Alternatives considered, Consequences
    (with "Revisit if" and "Checked by"), and History.

  A change is a **new record that replaces the old one whole**. The old one
  changes only its status.
- **Links.**
  - A request's decision line points to the ADR it produced: `D4 → ADR 0012`.
  - The ADR names the request it came from (`Request: <name>`), and the spec
    section IDs it governs (`Governs: [INV-3], [INV-7]`). Both are optional
    lines.
  - Any bracketed section ID in an ADR's text counts as a rough link.
- **What AssuredLoop does with them.** It links, shows and checks. It never
  decides, and never writes the reasoning.
  - `context <section-ID>` lists the ADRs that govern the section, current
    first and superseded ones marked.
  - `context <request>` lists the ADRs the request created or superseded.
  - The review view's intent part includes the current ADRs that govern the
    changed sections, so a reviewer can ask "does this change contradict ADR
    0012?".
  - The Outcome lists the ADRs added and superseded, and any ADR the request
    left "proposed".
  - `spec --list` can show the current ADR set: accepted and not superseded.
- **Checks** (hints; §7):
  - an accepted ADR's text edited beyond its status line gives `not ok`
    (append-only, like the request record);
  - a broken or one-way `Supersedes` / `superseded by` link gives `not ok`;
  - a reused ADR number gives `not ok`;
  - a spec section or an open change citing a superseded ADR as current gives
    a note;
  - an ADR created in a request and still "proposed" at conclusion gives a note.
- **Cost.** ADRs are written only for decisions that pass the three tests, and
  the kit's skill does the writing. For most requests the cost is zero. For
  tier 2 and 3 requests it is roughly one per real architectural choice.

## 4. The way of working: tiers and decision points

| Tier | When (the agent judges; tools only hint) | Record | Spec | Sign-off |
|---|---|---|---|---|
| **0 Fix** | no promise changes: a bug restoring promised behaviour, a refactor, a chore, a pure move of spec sections | none. The commit says why; `Refs:` or `Follows:` optional | untouched, or moved with IDs kept | none |
| **1 Amend** | a small change to a promise: a bug that shows the spec was wrong or silent, a small story | ~7-line `request.md` | the baseline edited in the same PR, which concludes itself | the R-lines; the PR waits for it |
| **2 Change** | needs a design, or a look before code | `request.md` + `change.md` | was/now; consolidated by the concluding PR | the R-lines, before any part merges |
| **3 Epic** | many parts, others working alongside | as tier 2; `change.md` merged to main (first, when others work alongside) | pending on main; partial consolidation allowed | the R-lines, before `change.md` merges; again after any later change to them |
| **S Spike** | find something out | `request.md` + `findings.md` (starts with the Answer, pointing back to the question) | none; findings are not requirements | the organized question, in plain words (input 42) |

**Decision points.**
1. **Requirement sign-off: a blocking state** (owner decision 3).
   - It binds the R-lines and the Out line.
   - Until it is signed, and again after any later edit ("changed since
     sign-off"), the request is **blocked**:
     - `consolidate` and `conclude` refuse, except `consolidate --revert` and
       `conclude --dropped` when every section retains nothing (§5.4);
       drafting is never refused;
     - `context` shows `BLOCKED: awaiting owner sign-off` first;
     - `check` is `not ok` for a branch that delivers work for the request
       while it is still blocked in that branch's final state.
   - Whether implementation may start before the sign-off is a bots' rule
     (input 48). AssuredLoop shows the blocked state, and its own commands
     refuse.
   - A re-sign-off is quick: the tool shows only what changed since the last one
     (owner input 34).
   - A child that copies some of the parent's signed R-lines word for word
     inherits the parent's latest sign-off for those lines.
   - The sign-off binds the whole Requirement part, compared like a section
     (§5.1).
   - **Draft before, deliver with or after** (inputs 44 and 50). For every
     tier except 0, spec work and later work may be drafted before the
     sign-off, but are delivered with it (the same commit or PR) or after it
     (a later PR). No command refuses drafting. `check` reports `not ok` for a
     branch whose final state delivers work for a request that is still
     blocked there. A branch that brings the sign-off with the work is fine.
     A hint shows work that reached main in an earlier commit than the first
     sign-off.
2. **Conclusion.** `conclude` refuses until both hold:
   - every held section is consolidated, carried, dropped (with the baseline
     at "was"), or kept (§5.4);
   - the requirement (or question) sign-off is current.

   These, and the blocked state, are the only hard rules. An open named child
   is a hint.

**Every PR states its tier and claim** (input 43), in one line of the PR
description, for example:

```
Tier: 0 — restores INV-4 (tax rounds half-up); no promise changes
```

- **Validating the claim is the reviewer's job, under the bots' review rule,
  not AssuredLoop's** (input 48). The tool supplies the claim and the evidence:
  the spec sections near the changed code, tests whose assertions changed,
  and spec edits. A wrong claim means changes requested; the work becomes tier
  1, with a request and a sign-off.
- **The tool flags what it can see:**
  - tier 0 claimed but the baseline is edited: `not ok`;
  - tier 0 claimed but the tests of a nearby promise changed: a note for the
    reviewer;
  - no tier line: a note.

**Starting in the middle** (owner input 25).
- A new change touching a held section either **builds on** that change (its
  "was" is the other's "now"), or asks the owner to **correct** that change
  (an `approved change` decision there, only when that change is wrong).
- **A hotfix that restores promised behaviour** (tier 0) lands at once.
- **A hotfix that changes a promise** is tier 1, and waits for the requirement
  sign-off (owner decision 3). If it cannot wait, it can land first as tier 0
  (restoring the old behaviour), and a tier-1 amend follows. (Owner
  decision, input 40.)
- **When a hotfix edits a section an open change holds,** that change reads
  "differs: re-base". It cannot conclude until it is re-based, or until it
  accepts the new text (`record section <ID> --accept`, §5.4). The hotfix
  itself gets only a note, which never counts toward its own `--strict`
  result (§7).
- Pure moves of spec sections need no alignment: sections are found by ID.

**RFC 2119 keywords** go in R-lines always, and in baseline sections for new
promises. Existing docs are never rewritten for style. This is a writing rule,
not a lint.

## 5. The checks

### 5.1 Sections and IDs
- A section is one heading plus the text up to the next heading of any level.
- An ID is the bracketed token at the start of a heading: `[A-Z][A-Z0-9]*-\d+(\.\d+)*`.
- IDs are unique within a baseline root. A monorepo may have several roots.
- Only sections with IDs can be held by a change. `al spec --add-ids <file>`
  numbers the headings that have none, as a tier-0 commit.
- Duplicate IDs are `not ok`. A duplicate anywhere in the root blocks every
  `consolidate` write until it is fixed.
- The next ID for a prefix is **the highest found in the root's git history
  plus the open `change.md` files, + 1**. IDs are never reused. With several
  roots, references are `(root, ID)`.
- Only ATX headings (`#`) start sections.
- **Comparison is exact text, with a small normalization:**
  - line endings;
  - trailing spaces and tabs on each line (so Markdown hard breaks are not
    significant);
  - blank lines at the start and end of the section, and between the heading
    and the body;
  - the number of `#` in the heading.

  Code blocks, indentation and list structure are compared exactly: a change
  of indentation inside a fenced example is a real change. A section moved
  under a different parent heading may change meaning. That inherited scope is
  outside the check, and the review view shows the move.

### 5.2 States of a held section: first the link, then the content

**Step 1, the link** (only for a block that `builds on` another block, X@k).
Links are between blocks, never between whole requests:

| Link check | State (the procedure stops here) |
|---|---|
| the named block X@k does not exist, or following `builds on` revisits any **block** | broken link: `not ok` |
| this block's "was" is not X@k's "now" | broken link: `not ok` (the link is wrong) |
| X@k is marked Dropped, or its request is dropped, and it was not kept | base dropped: re-base onto the baseline |
| X@k is marked Revised, and this block is **not** in X's own request | base revised: re-base onto X's newer version |
| the link is valid | continue to step 2 |

A request's own next version building on its earlier, revised version is the
normal case, and is valid. The chain walks through revised blocks.

**Step 2, the content.** The baseline section is found by ID anywhere in the
root. The first row that matches decides:

| # | Baseline text | State |
|---|---|---|
| 1 | this "was" equals this "now" | no change yet (`conclude` refuses) |
| 2 | equals "now" (for a remove: the ID absent everywhere) | consolidated |
| 3 | equals the "now" of a block that reaches this one through a valid chain of `builds on` links for the same section, open or archived | carried by <that block> (counts as consolidated) |
| 4 | builds on X@k, and equals the "was" of X@k or of any block X@k reaches through valid links (for an add: absent) | waiting on <that block> |
| 5 | equals "was" (for an add: absent) | pending |
| 6 | the ID is not found (not a remove) | not found; candidates by body text |
| 7 | anything else | differs: align (changed underneath, or the consolidation deviated) |

Because step 1 comes first, a stale link can never count as consolidated.
Chains of any length work:
- A (0→1), B builds on A (1→2), C builds on B (2→3), all consolidated in
  order, baseline 3;
- then C is consolidated, B is carried by C, and A is carried by C through B.
- The R1 model ran this chain in all six consolidation orders. There was no
  false consolidation, and every case converged once the fixes above were
  applied (R1 FIX-1).
- **The same chain, with a revision.** A@1 is 0→1. B@1 is 1→2 and builds on
  A@1. B revises: B@1 is marked Revised, and B@2 (2→3) builds on @1. B@2 is
  consolidated, so the baseline is 3.
  - B@2 is consolidated;
  - B@1 is carried by B@2;
  - A@1 is carried by B@2 through B@1.

  A and B both conclude. A true cycle of blocks (X@1 builds on Y@1, which
  builds on X@1) is a broken link.

### 5.3 Consolidate
- `consolidate <name> [--section ID] [--preview]` validates everything, then
  writes atomically:
  - for an add, after its anchor (refused while the anchor itself is pending,
    unless both are consolidated together);
  - replaces a modify;
  - removes a remove.
- It writes only on a positive list:
  - **pending, and not marked Dropped**, is written;
  - **consolidated** and **carried** are left alone (a carried section is never
    rewritten back to an earlier "now");
  - every other state refuses: no change yet, waiting, base revised or
    dropped, broken link, not found, differs, or a request still blocked on
    sign-off.
- Anyone may consolidate another request's section. The output names the
  request that owns it.
- `consolidate --revert <ID>` puts "was" back (a remove goes back after its
  recorded anchor). It is allowed while the request is blocked.

### 5.4 Revising, dropping, keeping
- **Revising a section.** The old block is kept and marked `Revised <date>
  (Dn)`. A new block builds on it, inside the same request, with an `approved
  change` decision. Chains walk through revised blocks, so a predecessor stays
  "carried".
- **Accepting a change made underneath** (for example after a hotfix).
  `record section <ID> --accept` keeps "was", sets "now" to today's text, and
  records a decision naming the change underneath. The section then reads
  "consolidated".
- **"Retains nothing"** has one definition, used everywhere. It must be
  **established positively from content**, whatever the link state; it is never
  inferred from a failure to match. A block retains nothing only when one of
  these holds:
  - its "was" equals its "now" (no change);
  - the baseline section equals its "was" exactly (for an add: the ID is
    absent), so it was never applied, or was fully reverted;
  - it reads **waiting**: the baseline equals the "was" of a block it reaches
    through valid links, so nothing along the chain was applied.

  Every other case counts as **possibly retained**: consolidated, carried,
  differs, or a stale base whose text is not "was". Such a section must be
  reverted to "was", or aligned: the current text is accepted with
  `record section --accept` and then `Kept` under the rule below.
- Examples:
  - **Partly retained.** A request changed Format CSV→PDF and Dates
    local→ISO, and was consolidated. A later hotfix restored only CSV, so the
    baseline reads (CSV, ISO): neither "was" nor "now". That is possibly
    retained, because ISO remains, so a drop refuses until it is handled.
  - **Stale base.** A block consolidated before its base changed reads "base
    revised" and still holds its text. That is possibly retained, and refuses.
  - **Waiting.** An unsigned B waiting on a pending A retains nothing, and
    drops without sign-off. The baseline and A are untouched.
- **Dropping a section.** It is marked `Dropped <date> (Dn)`. It must retain
  nothing, or else be reverted by `consolidate --revert <ID>`, or be `Kept`.
  Dropping never touches the baseline or another request.
- **`Kept` is a disposition of checked content, never an override.**
  - It is allowed only when the section is consolidated or carried.
  - Its text must trace to a signed R-line (`for R2`, with the sign-off
    current), or to a decision whose source is the owner.
  - A section that "differs" cannot be kept; it must be aligned first.
- **A section carried by a successor** cannot be reverted, only kept. It meets
  the rule above through the successor's signed R-line.
- **Dropping the whole request.** `conclude <name> --dropped D7`.
  - When every section retains nothing, it needs no sign-off, even while the
    request is blocked.
    - Example: baseline 0; A@1 pending 0→1; unsigned B@1 builds on A@1 (1→2),
      waiting.
    - `conclude B --dropped` passes, without touching the baseline or A, and
      without calling anything Kept.
  - Every section that retains its change must be reverted or Kept, and Kept
    follows the rule above (signed R-line or owner decision).
  - A hint lists code from the request still on main.

### 5.5 Conclude, and what it leaves
- `conclude <name>` reads the working tree and names what it read. It refuses
  unless the three rules in §4 hold, and prints at most 3 lines.
- The Outcome (generated block) lists:
  - each R-line's fate: in a section, or `not ok: in no section`;
  - the sections added, modified, removed, dropped and kept;
  - the decisions, with the agent's rulings apart;
  - any dropped work whose code is still live.
- It lists no commits; views derive them from main.
- It sets `Status: concluded` or `dropped`, and moves the folder to
  `requests/archive/<name>/`.
- A request archived **in the same branch** may still be edited before merge.
  `conclude` re-runs and regenerates the Outcome.
- **"Concluded on main"** is the main commit that added
  `requests/archive/<name>/request.md`, derived.
- `check` on a PR re-runs these rules **on the final state** for every request
  the branch archives. Intermediate commits may be unfinished. Only the
  append-only rule is checked per commit (§8).
- A check certifies only the snapshot it read: a later push, or a
  conflict resolution, needs another run. Nothing is called "verified on main"
  because an archive folder exists.

**Stated limit.** Comparisons are textual. Two changes to different sections
can each consolidate cleanly and still contradict each other. The views show
every open or recent change in the same file, and the contradiction is for
judgment.

## 6. What it shows

- **`al context`**, with no name: one line per open request, showing its state.
  It lists first the requests that are **blocked on the owner's sign-off**. On
  a repo with no baseline: "no baseline yet; requests add sections as they go".
- **`al context <name>`** (level 1, 12 lines or fewer):

```
invoice-download  Customers can download their invoices   story · tier 2 · open · follows sessions-expiry
Words     09-20 owner chat · 09-23 issue #31 snapshot (source updated since: not re-checked)
Require   R1-R3 · signed off 09-21 · unchanged since   (else: BLOCKED: awaiting owner sign-off · R2 changed since 09-21 · R1, R3 as signed)
Decided   D3 09-25 implementation-only: ';' separator (agent ruling)  · D2 09-24 approved change: ISO dates
Spec      INV-3 pending (R2, signed) · INV-7 consolidated (R1, signed) · INV-2 dropped (D1)
Parts     1 CSV export (#40 merged) · 2 Date format · 3 Email link
Same file cancel-invoices holds INV-5 in specs/invoices.md (pending)
Hints     note: src/export.js:40-58 changed since INV-7 consolidated; its test did not
Next      al context invoice-download --spec | --decisions | --links | --history | --full
Not known whether the code meets the spec (tests and review judge that); issue #31 may have changed since 09-23
```

- **`al context <section-ID>`** shows everything about one section: its text, the
  open changes holding it, the requests that shaped it (blame), the decisions
  citing it, and the linked code and tests with the reasons.
- **`al context --diff main...HEAD`** shows the request(s) a branch serves, the
  sections it changes with their states, the nearby sections, the linked tests,
  the related history (requests citing the same IDs, rejected first) and the
  hints.
- **`--for review`** splits it into two views:
  - **intent**: the signed-off requirement verbatim, the spec changes, the
    decisions (agent rulings apart), and which part this PR says it covers;
  - **evidence**: for each R-line, the evidence found or none; changed files
    with no link to the request; linked tests; test results with their
    provenance (base vs head when both exist); the hints.
- **`al spec [--list]`** shows the design as it stands now: the section map
  first, then the text, with each open change's "now" under the section it
  holds. A partial baseline states which areas it covers.
- **Archived requests** show "as at conclusion; since changed by <request>
  (<date>)" for each section, and "followed by" for later requests.
- **`--audit`**, on any target (a request, a section ID, or `path:line`),
  returns the whole trace with nothing capped:
  - the owner's words and dialog, and every snapshot, each with its sha256
    re-checked against its text;
  - every sign-off, with the text signed, re-checked;
  - every decision;
  - every `request.md` and `change.md` version that reached main;
  - when each section was consolidated (from `git log -L` on the section);
  - the linked commits and tests, and the ADRs;
  - the Outcome.

  Started from a code line, it walks: blame, the request, its requirement and
  sign-off, the decisions, the change, when the section landed. That is the
  path for "something is wrong, found later".
- **`--at <commit>`** on every read command evaluates everything as it was at
  that commit: the baseline, the requests, the states, the links. It reads that
  commit's tree through git instead of the working folder. It answers "what
  did the AI see then?" and "when and why did this promise change?".
- Every output names the refs it read (no `origin/main` means local main is
  read, and says so). It ends with Next and Not known.

## 7. Links and hints

**Links**, strongest first, each shown with its reason:
1. A bracketed ID near the change, in code or a test name (a convention, and
   the owner wants it in big mixed files).
2. Blame, then the request:
   - blame on the old side for changed or deleted lines;
   - `-w -M -C` for code, and no `-C` for `specs/`;
   - `.git-blame-ignore-revs` is honoured;
   - the commit maps to its request through a `Request:` line anywhere in the
     message, else the request folder the commit touched (more than one folder
     means "ambiguous"), else an issue number listed in a request's Original.
3. Co-change. Commits touching more than 30 files are skipped and counted.
4. Words shared between section headings and code or test names. The weakest.

Test files are found by common path patterns, or by the paths the project
names. Results come from files the project names. When none are found, the
output says so.

**Hints.** At most 3 in the default view and 5 in `check`, ranked, with "N
more". Each is worded as an observation that names a command.

| Hint | Kind |
|---|---|
| A held section reads "differs" / "base revised" / "base dropped": re-base | not ok (on the holding change) |
| Two open changes hold one section and neither reaches the other through `builds on` links | not ok |
| A baseline section this branch changed equals the "now" of a request that is blocked on sign-off | not ok (counts for the branch) |
| The branch's final state delivers spec work or other work for a request still blocked in that state (ADR 0011); the sign-off in the same branch clears it | not ok (counts for the branch) |
| A held section's ID is not found | not ok (for the holding request) |
| An append-only part (the Original and Decisions lines, `origin/`, `archive/` beyond this branch's own archive) was edited, per commit | not ok |
| Conflict markers, or Was:/Now: blocks, in the baseline | not ok |
| Duplicate IDs, or a cited ID / request / R-line that does not exist | not ok |
| A request archived in this branch no longer meets `conclude`'s rules | not ok |
| An R-line in no consolidated section, at conclusion (owner decision 5); `Amends:` counts as citing | note |
| An accepted ADR edited beyond its status; a broken or one-way supersede link; a reused ADR number | not ok |
| A superseded ADR cited as current; an ADR left "proposed" at a request's conclusion | note |
| A hotfix edited a section another change holds (that change must re-base) | note |
| Tier 0 claimed, but the baseline is edited | not ok |
| Tier 0 claimed, but the tests of a nearby promise changed (for the reviewer to validate) | note |
| No tier line in the PR or commit | note |
| A snapshot's text no longer matches its recorded sha256 | not ok |
| A snapshot not re-checked since <date>, or its source updated since | note |
| Work for a request reached main in an earlier commit than its first sign-off | note |
| A section this branch edits changed on origin/main since the fork (by <request>): re-read | note |
| Baseline sections changed with no request linked (fine for tier 0; say why) | note |
| Code changed; its linked tests did not | note |
| Assertion count changed, in a supported syntax, with no linked code or spec change | note |
| Code from a dropped section or request still on main, given as `path:lines`, and saying whether any part plans its removal | note |
| A sign-off pending, or the requirement changed since it: the request is blocked | note |
| A named child request is still open when the parent is about to conclude | note |
| A test result with an unknown or older revision: not evidence for this change | note |

**Exit codes.**
- `0` from `context`, `spec` and `check`.
- `check --strict` exits `1` on any `not ok` **owned by a request this branch
  serves or archives** (found through the branch's `Request:` lines and changed
  request folders). It is opt-in, for CI.
  - Other requests' alignment debt that this branch caused (a hotfix into a
    held section) is shown as information and never counts.
  - A `not ok` that **no request owns** (duplicate IDs, conflict markers,
    Was:/Now: blocks in the baseline) counts for the branch.
  - Those requests meet it themselves: in their own `check`, and when
    `consolidate` or `conclude` refuses.
  - A project may choose stricter CI rules, but then this design no longer
    promises that hotfixes pass.
- `conclude` and `consolidate` exit `1` when they refuse.
- `2` when the tool itself fails (for example a malformed record or an
  unknown request).

## 8. Audit

- **Audit scope.** A plain clone of main audits offline:
  - every original supplied;
  - every sign-off, with the exact text signed;
  - every decision;
  - every version of `request.md` and `change.md` **that reached main** (one
    per merged PR).

  Drafts inside one PR are not kept (a squash leaves only the PR's final
  state). The why of a change is kept by its decisions, not by draft history.
  To keep more, merge with merge commits instead of squash. That is the
  project's choice; the design does not require it.
- `check` verifies append-only per commit over `main..HEAD`. So an edit to a
  sign-off file or a decision within one PR is caught, **if `check` runs on
  that PR** (the reviewer's or CI's step). After a squash, only the PR's final
  state is on main. This limit is stated, not hidden.
- **Originals are always snapshotted**, with a sha256, the time fetched, and
  the target's last-updated time. Re-fetches are verified, and changed text is
  appended as a new snapshot (§3).
- `--audit` re-checks every hash, and `--at <commit>` replays any past state
  (§6).
- The script cannot verify who spoke. It shows the recorded source.

## 9. Commands (7)

`new` · `context` · `spec` · `check` · `record` · `consolidate` · `conclude`

- `record <name> decision|signoff|part|section|origin [...]` writes only its own
  section, shows the diff, and writes on OK.
- `record origin --url <u> --from -` stores a snapshot with its hash;
  `--verify <file> --from -` checks a re-fetch against it.
- Every read command takes `--at <commit>` and `--audit`.
- `record section <ID> [--builds-on X]` copies "was" from the baseline, or from
  X's "now".
- `record signoff` shows what changed in the Requirement since the last
  sign-off, and writes the sign-off file with the owner's words and the exact
  Requirement text.
- **Stack:** Node ESM, zero runtime dependencies, `node --test`, and git.

## 10. The formality budget: a projection, until a real run measures it

**Per event** (from the case tests, in line equivalents: each line the AI
writes, each command, each output line read):
- **Tier-1 amend.** About 40 as tested. The target is about 25, from the 7-line
  skeleton and the 3-line `conclude`; that target is not yet shown.
- **Epic.** About 58 fixed, plus about 17 per part.
- **Skill read, per cold session.** 15 lines for the quick path (tiers 0 and 1,
  at the top of the skill), or 40 for the full core. In a warm session, where
  the skill is already read, 0.
- **Owner round trips** (sign-off, re-sign-off) are counted separately, not in
  the share. With the blocking sign-off (decision 3), a tier-1 PR has one.

**Real sizes** (the owner's orca-bot-kit, 133 commits, measured 2026-09-27):
- the median change is 118 lines, in files of 649 lines;
- the 25th percentile is 8 lines changed, in files of 260 lines.

This is a proxy: file size stands in for what the AI reads, and commits are not
PRs. "The AI reads more" is not measured, and is not relied on.

| Work | Cold (skill read) | Warm | Real change + read (proxy) | Share cold / warm |
|---|---|---|---|---|
| Tier 1, small (p25), quick path | 25 + 15 | 25 | ~270 | ~15% / ~9% |
| Tier 1, small (p25), full skill | 25 + 40 | 25 | ~270 | ~24% / ~9% |
| Tier 1, median, quick path | 25 + 15 | 25 | ~770 | ~5% / ~3% |
| Epic, 4 parts over 6 cold sessions | 126 + 6×40 | 126 | ~3,000 | ~12% / ~4% |

A change that really amends a promise stays tier 1 even when it is tiny. It is
never reclassified as tier 0 to improve the ratio. On the smallest amends the
share can exceed 20%; this is stated, and not hidden.

**C11.** The unit is the line equivalent, and the skill read counts, cold and
warm apart. It is measured on a representative run of real PRs: actual reads
and writes, commands, retries, sign-off revisions and sessions, with owner
round trips shown separately. Until that run, every number here is a
projection. A tier above about 20% at typical sizes is a design bug.

## 11. Acceptance checks

Each is an end-to-end test on throwaway git repos, written by a different
author from the code. The case-test fixtures in `case-tests/`, and R1's 154
model checks (`case-tests/R1-v3.2-rules.md`), seed the first tests. Each is
re-derived from this document's text, not from R1's model code.

- **C1, context.** Only supported claims. The fixtures: squash with default
  messages, `Fixes #12` next to `Request:`, issue-number links, a shallow
  clone, no `origin/main`.
- **C2, conclude and dropping.**
  - Refusals: pending, differs, not found, no change yet, dropped-but-
    consolidated, requirement unsigned or changed since sign-off (blocked).
  - An open named child gives only a hint.
  - `Kept` refused for a section that differs, or whose text traces to no
    signed R-line and no owner decision.
  - `--dropped` with nothing retained passes without sign-off; with a kept,
    unsigned change, it refuses.
  - Passes: after fold, revert and re-fold; with a separate consolidation PR.
  - `--dropped` with kept and reverted sections; a successor-carried section
    that cannot be reverted.
  - Edits after `conclude` in the same PR, caught by `check`.
  - After a squash, the concluding commit is derived and the Outcome holds no
    dead IDs.
- **C3, sections and alignment.**
  - Subsection adds, dotted IDs, repeated headings, duplicate IDs.
  - A file split and an ID rename (candidates offered), heading demotion.
  - "Builds on" in every order: B first, A revised, A dropped.
  - A three-request chain: A → B → C consolidated in order. All three count
    as consolidated or carried; none reads "differs".
  - A revised predecessor whose successor's text still matches the baseline
    reads "base revised", never "consolidated".
  - A dropped predecessor that kept the section: the successor's link is
    still valid.
  - A `builds on` cycle of blocks reads "broken link".
  - A revision inside a request (A@1 ← B@1 ← B@2): B@2 is consolidated, B@1 and
    A@1 are carried, and both requests conclude. No false cycle, and no false
    "base revised".
  - Another request built on B@1 reads "base revised" once B@2 exists.
  - An unsigned B, only waiting on a pending A, is dropped whole without
    sign-off, and the baseline and A are untouched.
  - A section partly reverted by a hotfix (baseline: old Format, new Dates)
    is "possibly retained", and a drop refuses until it is reverted or
    accepted and kept.
  - A block consolidated before its base changed refuses a drop the same
    way.
  - `consolidate` never writes outside the positive list, and never rewrites
    a carried section back.
  - A hotfix into a held section. Its actual `check --strict` exit code is 0,
    and the holder's own `check --strict` is 1.
  - Two fenced code examples with the same tokens but different indentation
    compare as different.
  - IDs allocated across two files never collide, and a retired ID is not
    reused.
  - Two tier-1 amends to one section.
  - A clean cross-section contradiction, shown as the stated limit.
- **C4, tiers.**
  - Tier 0 with `Follows:`; tier 1 with the skeleton.
  - A spike with its signed question, and an Answer pointing back to it.
  - A split epic with named children.
  - Tier-claim fixtures:
    - tier 0 with a spec edit gives `not ok`;
    - tier 0 with a nearby promise's test changed gives a note;
    - no tier line gives a note.
  - Drafting is allowed while blocked. A branch whose final state delivers
    work for a still-blocked request gives `not ok`; the sign-off in the same
    PR clears it. Work on main in an earlier commit than the first sign-off
    gives a hint.
- **C5, links.** The G1-G5 link fixtures, plus related history finding a
  negative spike.
- **C5a, ADRs.**
  - A section governed by two ADRs, one superseding the other: `context`
    lists the current one first.
  - An accepted ADR edited in place gives `not ok`.
  - A one-way supersede link gives `not ok`.
  - A request concluding with an ADR still "proposed" gives a note, and its
    Outcome lists the ADRs it added or superseded.
- **C6, tests.** Observed, not judged. Results carry their provenance, with
  base vs head.
- **C7, audit and offline.**
  - Per-commit append-only.
  - A link-only capture prompt.
  - A fresh single-branch clone audit of what the scope in §8 promises:
    originals, every sign-off with its text, decisions, every `change.md`
    version that reached main, the concluding commit, and baseline line →
    request. Drafts inside one PR are not expected.
  - Final-state rules are checked on the final state only; append-only is
    checked per commit.
  - Snapshots:
    - a tampered snapshot text gives `not ok`;
    - a verified re-fetch reads "unchanged since";
    - a changed source appends a new snapshot and keeps the old one.
  - `--audit` from a code line reaches the request, the signed text and the
    decisions.
  - `--at <commit>` reproduces the states shown at that commit.
- **C8, non-blocking.** Exit codes; nothing in git hooks.
- **C9, cost.**
  - No runtime dependencies.
  - Under 3,500 lines of CLI source: every line of `src/*.js` and `bin/*.js`
    (ADR 0012; the first target, 2,000, was an estimate made before any code).
  - A skill with a 15-line quick path and a core of 40 lines or fewer.
- **C10, fresh reader.**
  - A fresh agent gets only the tool's output at the midpoint of an epic that
    has a reversal and live code for a dropped part.
  - It must state the agreement, what is uncertain, and the next action.
  - It is judged by an agent that wrote neither.
  - Runs so far: on v3's output, partly (G3); on v3.2's output, with an
    independent judge, "partly" on all three parts (R2). The four output gaps
    R2 found are fixed in §6. C10 is re-run on the built tool's real output,
    and passes only when the judge grades all three parts correct.
- **C11, budget.** As section 10.

## 12. The owner's decisions (inputs 35-37), and what is left

| # | Decision | Answer |
|---|---|---|
| 1 | Format | the light was/now format ("ok") |
| 2 | Where it is built | **the current `guwenqing/assuredloop`, cleared** (input 38; this replaced "new repo"). Done 2026-09-27: a local mirror of the old repo is kept, the old main is on the `legacy` branch (`baa2ba0`), and `main` restarted with a README (`08a6d9f`). With the owner's explicit OK, the 25 old `codex/*` branches were removed from GitHub, after each was checked in the mirror |
| 3 | Sign-off timing | the requirement sign-off (not the spec) is a **blocking state** |
| 4 | Spikes | no sign-off ("ok"); **revised by input 42, see below** |
| 5 | An R-line in no spec section at conclusion | a hint in the Outcome, not a refusal ("ok") |
| 4, revised | Spikes (input 42) | signed off too, in plain words; supersedes the earlier "no sign-off" |
| 6 | A hotfix that changes a promise (input 40) | waits for the sign-off, or lands as tier 0 first |
| 7 | Walkthrough changes (inputs 41, 43, 44, 45) | link snapshots with sha256; the two-section request; tier claims validated in review; requirement before spec; `--audit`; `--at` |

**Left for the owner, before any code:**
- R1 P14 is decided (input 40): a hotfix that changes a promise waits for the
  sign-off, or lands as tier 0 first;
- agreement to this design (v3.3) and its ADRs (`adr/0001`-`0011` (0004 and 0010 superseded)) as final.
  The rules re-test (R1) and the fresh-reader run (R2) are done, and their
  fixes are in.
