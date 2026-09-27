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
