# adr-edits
Tier: 1 · Status: concluded

## Owner's words and dialog

- 2026-10-19 the owner's words, snapshot origin/2026-10-19-owner-words.md

## Organized requirement

<!-- R1 from:2026-10-19-owner-words.md -->

### R1 Hidden text in an ADR's marker line
When someone changes the marker line of an accepted or replaced ADR in any way other than adding links, `al check` MUST give a hint. A marker line that holds anything other than links MUST also get a hint.

<!-- R2 from:2026-10-19-owner-words.md -->

### R2 An ADR without a clear status
When the first line of an ADR is not a status that `al` knows (proposed, accepted, or replaced by other ADRs), `al check` MUST give a hint.

Out: these cases give a hint and never block.
Signed off: 2026-10-19 owner, origin/2026-10-19-signoff.md

## Outcome

Concluded 2026-10-19 with al conclude, on the working tree at 1170b25.

- R1 Hidden text in an ADR's marker line, version 1, signed in S1:
  - SCH-22 rule: in specs/schema.md, serves it
- R2 An ADR without a clear status, version 1, signed in S1:
  - SCH-22 rule: in specs/schema.md, serves it
- Not known: whether the code, tests and documents do what the paragraphs say; whether the work has ended: the tool does not take a merged task or a reconciled spec as evidence of that.
