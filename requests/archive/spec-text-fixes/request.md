# Three spec corrections from the validation
Tier: 1 · Status: concluded

## Owner's words and dialog

- 2026-09-29 the owner's words, snapshot origin/2026-09-29-owner-words.md

## Organized requirement

### R1 A section number is never used twice
When the tool picks the number for a new section, it MUST count every number
already used: in the spec's history and in every change file, open or
finished. (#112; the tool already does this, but the spec text says less.)

Amends: [SPC-3]

### R2 Dropped work is not flagged for its own requirement
A part of a change that was deliberately dropped MUST NOT be flagged because
the requirement it served was removed. A part that is kept is still checked.
(#113; this is decision D6, which lived only in the archived request.)

Amends: [HNT-2]

### R3 The first section of a file can be removed
A change MUST be able to remove the first section of a spec file, and undoing
that removal MUST put the section back first in that file. (#106, part b.)

Amends: [SPC-5], [STA-4]

Out: the other validation findings, which are fixed without changing any
promise (tier 0).

Assumed:
- The exact wording in the spec sections is written to match R1-R3.
Signed off: 2026-10-02 owner, origin/2026-10-02-signoff.md

## Outcome

- R1 A section number is never used twice: in [SPC-3]
- R2 Dropped work is not flagged for its own requirement: in [HNT-2]
- R3 The first section of a file can be removed: in [SPC-5], [STA-4]
- Added: none
- Modified: [HNT-2], [SPC-3], [SPC-5], [STA-4]
- Removed: none
- Dropped: none
- Kept: none
- Decisions: none
- Agent rulings: none
- ADRs added: none
- ADRs superseded: none

Notes:
