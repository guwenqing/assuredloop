# ADR 0008: Tiers decide which records to write; ADRs are part of the records

Date: 2026-09-27.
Status: accepted.
Decided by: the owner ("Accept", input 52). Proposed by: the architect.
Consulted: the adversary, the case testers.

## Context

- The owner wants "a formal wow that can be traced", with flexibility: for
  example, a bug fix that needs a small amendment to the spec (input 29).
- The owner does not want bug fixes to become a way to sneak changes in
  (input 43).
- The way of working belongs to the bots; the way of writing is AssuredLoop's
  (input 48).
- Some way of working is unavoidable, but it should be as little as possible
  (input 10).
- How to develop, test and review belongs to orca-bot-kit's skills (input 2).
- ADRs are "part of the game" (input 39).
- The formality should cost at most about a fifth of the change (input 31).
- Attempt 2 failed partly because it took in methodology, roles and a
  project-management loop (G).

## Decision

**The tiers.** The agent picks the tier, and the tools only hint.
- **0, Fix.** No promise changes. No record; the commit says why.
- **1, Amend.** A small change to a promise. A ~8-line `request.md`; the
  baseline is edited in the same PR, which concludes itself once the
  requirement is signed off.
- **2, Change.** Needs a design. `request.md` plus `change.md`, consolidated by
  the concluding PR.
- **3, Epic.** As tier 2, with `change.md` on main while others work alongside.
  Partial consolidation is allowed.
- **S, Spike.** A signed organized question in plain words, and `findings.md`
  starting with its Answer. No spec change.

**Every PR states its tier and its claim** (`Tier: 0 — restores INV-4; no
promise changes`). The tool shows the claim with its evidence, and flags the
contradictions it can see: `not ok` for a tier-0 claim with a spec edit.
Validating the claim is the reviewer's job under the bots' review rule.

**The boundary** (owner input 48). The tiers are a way of **writing records**,
and AssuredLoop absorbs that. The way of **working** belongs to the bots and
the kit's rules and skills: tests-first, independent review, the PR flow, who
does what. AssuredLoop does not enforce it.

**ADRs** record the decisions that pass the kit's three tests: hard to
reverse, surprising without context, a genuine trade-off. They use the kit's
`obk-arch` format, and a change is a new record that replaces the old one
whole. Requests link to their ADRs, ADRs name the sections they govern, and
AssuredLoop shows and checks those links. The kit's skill writes them.

**What the way of working does not contain:** roles, phases, approvals beyond
the requirement sign-off, task lists, or progress tracking. Parts are
optional free text.

## Alternatives considered

- **One path for all work, as OpenSpec does** (always a change). Too heavy for a
  bug fix. The owner allows direct small edits (input 27).
- **Tracks with phases and gates** (BMAD, AI-DLC, GSD). A project-management
  loop that the owner rejects.
- **No ADRs, with decisions only in requests.** Decisions that outlast a change
  would then be scattered across archived requests. The owner asked for ADRs.

## Consequences

- Good:
  - the right weight for each size of work;
  - a trace for every promise change;
  - decisions findable by the section they govern.
- Bad:
  - choosing the tier is a judgment call, and it can be wrong; the hints catch
    some errors, such as spec edits with no request;
  - ADR writing takes time when it is due.
- Revisit if: C11 on a real run shows a tier above about 20% at typical sizes.
  Confidence: medium.
- Checked by: C4 (tiers), C5a (ADRs), C11 (budget).

## History

- None. This is the first record.
