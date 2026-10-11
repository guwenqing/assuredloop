# ADR 0002: Follow the OpenSpec way, with a light was/now change spec of our own

Date: 2026-09-27.
Status: accepted.
Decided by: the owner (input 35: "1: ok"). Consulted: the adversary (three
rounds), five case testers.

## Context

- **The pain.** Spec-driven toolkits leave thousands of one-time change specs
  behind. With 30 specs an AI cannot tell the right design (inputs 5 and 20).
  The owner wants a consolidated current spec, plus a change spec per request,
  folded in when the request concludes (inputs 6-7 and 22-27). That is
  OpenSpec's model (input 27).
- **OpenSpec as a tool, checked on 1.13.2.**
  - It keeps no record of what a modified requirement said before, so two
    changes to one requirement both archive and the second silently wins
    (reproduced).
  - Its archive step can be skipped, and nothing notices.
  - Requirements must be in SHALL/Scenario form.
  - Its lead maintainer is exploring removing archive (#1968).
  - Attempt 2 was built on it and suffered from pinning its internals.
- **Rejected by the owner.** Pending spec changes on git branches (input 26).
- **What the evidence says.** No tool in the research concludes a request made
  of several changes, or keeps the changing intent (`research/SYNTHESIS.md`).

## Decision

We will follow the OpenSpec way with a format of our own.

- `specs/` on main is the consolidated baseline: plain Markdown, with bracketed
  section IDs.
- Each request has a folder on main. Larger requests carry `change.md`, which
  gives for every section it touches what the section says now ("was") and
  what it will say ("now").
- The baseline stays unchanged until the request concludes. Partial
  consolidation is allowed while nothing deviates.
- Small changes may edit the baseline directly.
- Concluding consolidates everything and archives the request folder, which is
  kept.

## Alternatives considered

- **OpenSpec's own files and CLI, with our checks added on top.** Its format
  cannot show deviation without an added base. It brings a changing dependency
  and a heavy requirement form. Rejected by the owner's "ok" to our format.
- **Whole-file copies merged with git's three-way merge** (draft v0). This
  needed a path, rename and refresh layer of our own (adversary, v0).
- **Pending spec changes on branches** (draft v1). The owner rejected it: "I
  never mean to keep something in a normal git branch".
- **Direct edits to the baseline only, with no change spec.** This cannot hold a
  pending design while an epic runs. It is kept as the path for small changes.

## Consequences

- Good:
  - one current design;
  - the change is readable as was/now;
  - deviation is detectable (ADR 0003);
  - it works for non-code projects;
  - no dependency.
- Bad:
  - a new format to learn;
  - OpenSpec projects would need an importer (not in v1);
  - was/now for large sections is verbose, so sections are kept small.
- Revisit if: OpenSpec ships a stored base for modified requirements and a
  non-skippable fold. Confidence: high on the model, medium on the exact
  format.
- Checked by: acceptance checks C2 and C3 (`design-v3.2.md` §11).

## History

- None. This is the first record. Earlier drafts: `design-draft-v0.md`, `-v1.md`
  and `-v2.md`.
