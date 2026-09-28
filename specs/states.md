## [STA-1] The link check
For a block that builds on another block X@k, the link MUST be checked first,
and the check stops at the first row that holds:
- X@k does not exist, or following `builds on` revisits a block: **broken
  link** (`not ok`);
- this block's "was" is not X@k's "now": **broken link**;
- X@k or its request is dropped and it was not kept: **base dropped**,
  re-base onto the baseline;
- X@k is marked Revised and this block is in another request: **base
  revised**, re-base onto the newer version;
- otherwise the link is valid.

## [STA-2] The content states
With a valid link (or none), the baseline section, found by ID anywhere in the
root, decides the state. The first row that holds wins:
1. this "was" equals this "now": **no change yet**;
2. the baseline equals "now" (for a remove: the ID absent everywhere):
   **consolidated**;
3. it equals the "now" of a block that reaches this one through valid links:
   **carried** by that block (counts as consolidated);
4. it equals the "was" of a block this one reaches through valid links (for an
   add: absent): **waiting** on that block;
5. it equals "was" (for an add: absent): **pending**;
6. the ID is not found: **not found**, with candidates by body text;
7. anything else: **differs**, align.

## [STA-3] Retains nothing
A block **retains nothing** only when this is shown positively from content,
whatever the link state: its "was" equals its "now"; or the baseline equals
its "was" exactly (for an add: the ID is absent); or it is **waiting**. Every
other case is **possibly retained**, and MUST be reverted, or accepted and
kept ([STA-6]). Retaining nothing MUST NOT be inferred from a failure to
match "now".

## [STA-4] Consolidate
`consolidate <name> [--section ID] [--yes]` MUST validate everything first,
show what it would write, and with `--yes` write atomically. It writes only
sections that are **pending** and not marked Dropped: an add after its
anchor (refused while the anchor itself is pending, unless both go
together), a modify in place, a remove. It leaves
**consolidated** and **carried** sections alone, and refuses every other
state, and every request that is blocked. `consolidate --revert <ID>` puts "was"
back, a remove after its recorded anchor, and is allowed while blocked. Anyone
MAY consolidate another request's section; the output names its owner.

## [STA-5] Revising and accepting
Revising a section MUST keep the old block, marked `Revised <date> (Dn)`, and
add the next version, which builds on it within the same request. Chains walk
through revised blocks. `record section <ID> --accept` MUST keep "was", set
"now" to the baseline's current text, and record a decision naming the change
underneath.

## [STA-6] Dropping and keeping
A section is dropped by marking it `Dropped <date> (Dn)`. It MUST retain
nothing ([STA-3]) or be reverted, or be kept. `Kept <date> (Dn)` MUST be
allowed only for a section that is consolidated or carried, and whose text
traces to a signed requirement (`for R<n>`, with a current sign-off) or to a
decision whose source is the owner. A section that differs MUST be aligned
before it can be kept. A section carried by a successor MUST NOT be reverted,
only kept. Dropping never touches the baseline or another request.

## [STA-7] Conclude
`conclude <name>` MUST read the working tree and name what it read. It MUST
refuse unless the organized section's sign-off is current and every held
section is consolidated, carried, dropped while retaining nothing (or
reverted), or kept. On success it writes the Outcome, sets `Status: concluded`,
and moves the folder to `requests/archive/`. `conclude <name> --dropped Dn` sets
`Status: dropped`; when every section retains nothing it needs no sign-off,
and otherwise every retained section must be reverted or kept. It prints three
lines or fewer, plus the Read, Next and Not known lines ([VW-9]).
