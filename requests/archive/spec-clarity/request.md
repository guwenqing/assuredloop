# Spec clean-up from the second validation
Tier: 1 · Status: concluded

## Owner's words and dialog

- 2026-10-03 the owner's words, snapshot origin/2026-10-03-owner-words.md

## Organized requirement

### R1 A change block's parts are explained
Where the spec introduces a change block, it MUST say what each part means:
the text the section changes from (`Was:`), the text it changes to (`Now:`),
the version number (`@n`), and `builds on`, which points from a later version
to the earlier one it uses. It MUST give one small worked example.

Amends: [SPC-5], [STA-1], [STA-2]

### R2 Rules already in force are written down
The spec MUST write down these rules, which the tool already follows and which
were already decided:
- undoing a change (`consolidate --revert`) is allowed even before the owner's
  sign-off; the "leaves nothing applied" condition is for dropping a request;
- `consolidate` writes `add in <path>` changes too, and skips parts marked
  Dropped;
- a small (tier-1) change is closed by running `al conclude` in the same PR
  after the sign-off; it does not close by itself;
- once on main, a finished request's record is not edited;
- there is one spec folder (root);
- the Read, Next and Not known lines count inside a view's twelve lines;
- misusing a command exits 2.

Amends: [REC-6], [STA-4], [REC-10], [REC-1], [SPC-1], [VW-2], [HNT-3]

### R3 A fix may number or move sections
A fix (tier 0) MAY add section IDs, or move a section without changing its
text, without the owner's sign-off, because no promise changes. `al check`
MUST NOT flag such a fix.

Amends: [REC-10], [REC-11], [HNT-2]

### R4 Commands and settings are given in the form that works
Where the spec names a command, setting or line, it MUST give the form that
works: `al spec --add-ids <file> --prefix <P>`; the ADR folders (`docs/adr`,
plus each folder named by an `adrs:` line in `.assuredloop`); the `revision:`
line a results file needs to count as evidence; and where `Follows:` is
written.

Amends: [SPC-2], [LNK-4], [LNK-3], [LNK-2]

### R5 Lightweight means the overhead on people
The formality budget MUST be the overhead the method puts on people: the
agents' extra work (records written, commands run, output and skill read) at
or below about a fifth of the change, with the owner's round trips reported
beside it.

Amends: [TL-4]

Out: any other change in what the tool does (tier-0 fixes #136-#140); the
accepted ADR files; README and skill wording (PR #135).

Assumed: the wording of the spec edits is the architect's.
Signed off: 2026-10-03 owner, origin/2026-10-03-signoff-2.md

## Outcome

- R1 A change block's parts are explained: in [SPC-5], [STA-1], [STA-2]
- R2 Rules already in force are written down: in [REC-6], [STA-4], [REC-10], [REC-1], [SPC-1], [VW-2], [HNT-3]
- R3 A fix may number or move sections: in [REC-10], [REC-11], [HNT-2]
- R4 Commands and settings are given in the form that works: in [SPC-2], [LNK-4], [LNK-3], [LNK-2]
- R5 Lightweight means the overhead on people: in [TL-4]
- Added: none
- Modified: [HNT-2], [HNT-3], [LNK-2], [LNK-3], [LNK-4], [REC-1], [REC-6], [REC-10], [REC-11], [REC-12], [SPC-1], [SPC-2], [SPC-5], [STA-1], [STA-2], [STA-4], [TL-4], [VW-2]
- Removed: none
- Dropped: none
- Kept: none
- Decisions: none
- Agent rulings: none
- ADRs added: none
- ADRs superseded: none

Notes:
