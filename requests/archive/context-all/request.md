# context groups its output, and --all shows everything
Tier: 1 · Status: concluded

## Owner's words and dialog

- 2026-09-29 the owner's words, snapshot origin/2026-09-29-owner-words.md

## Organized requirement

### R1 Grouped by default, everything on request
`al context <name>` MAY group repeated output, for example section IDs by
state, but MUST NOT leave out a section. `al context <name> --all` MUST show
everything in full: each held section on its own line with its state and its
requirement, each decision with its text, and every hint.

Amends: [VW-2], [VW-6]

Out: `--audit`, which already gives the whole trace and is unchanged.

Assumed:
- `--all` is the verbose mode. The default view already offers it for hidden
  hints ("N more hidden, --all"), so it adds no new switch.
Signed off: 2026-09-29 owner, origin/2026-09-29-signoff.md

## Outcome

- R1 Grouped by default, everything on request: in [VW-2], [VW-6]
- Added: none
- Modified: none
- Removed: none
- Dropped: none
- Kept: none
- Decisions: none
- Agent rulings: none
- ADRs added: none
- ADRs superseded: none

Notes:

R1's fate first read "in no section", since `Amends:` counted nowhere; fixed by the tier-0 PR #93 before this merged.
