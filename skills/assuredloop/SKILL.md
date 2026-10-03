---
name: assuredloop
description: >-
  Writing the records of a change with AssuredLoop's `al`: the owner's words,
  the signed organized requirement, the baseline spec, the change spec and the
  decisions. Use in a project whose AGENTS.md names AssuredLoop, before work
  that changes a promise, and whenever you need to know where a request stands.
---
## Quick path (tiers 0 and 1)
1. Run `al context`. Its hints (observations, not verdicts) and Next line say what to do.
2. No promise in the baseline (`specs/`) changes: tier 0. Write no record. A commit
   message (`al check` reads it there) and the PR say `Tier: 0 — <what it restores>`.
3. A small change to a promise: tier 1, several small ones in one request for
   one sign-off. `al new <name> --tier 1 --from -`, the owner's words on stdin.
4. In its `request.md`, add `## Organized requirement` in plain words the owner
   reads, no jargon: a line each, `R1: <MUST/SHOULD/MAY …>. Amends: [ID]` (or
   `### R1` sub-sections); `Assumed:` for anything you added, `Out:` if needed.
5. Show it to the owner. The owner signs, not you: only on their OK, run
   `al record <name> signoff --source <where> --words "<their words>" --yes`.
6. Edit the baseline section, then `al conclude <name>`. The commit message and
   the PR say `Tier: 1 — <claim>`. Moves and IDs: al's README, "Common situations".
7. Before review, run `al check`. Fix or explain each `not ok`; read each `note`.
`al new` writes at once. Other commands that write show first; add `--yes` to write.

## Larger work: tier 2 needs a design, 3 lands in parts, S is a spike
- `al new <name> --tier <2|3|S> --from -`, then step 4's `## Organized requirement`, with
  `### R1` sub-sections, `Out:` and `Assumed:` (one-line `R1:` is tier 1 only). S writes
  `## Organized question` instead, then `findings.md` opening with its Answer, and no spec
  change. The owner signs (step 5). Draft freely; deliver with the sign-off or after it.
- `change.md` holds the design, then `## Spec changes`: a block per section. End each
  heading with `for R<n>`, so the Outcome links R<n> to it (an `Amends: [ID]` under R<n>
  also does). `al record <name> section <ID>` copies a section into "was" and "now"; edit
  "now". `--builds-on <request>` starts from another request's version. For a new section,
  write `### [PAY-1]@1 add in specs/pay.md` (or `add after [ID]`), then `Now:` and the
  section, indented. Its ID is one more than the highest ever used for that prefix.
- Each later decision (D1, D2…): `al record <name> decision --source <who> --text <it>`.
  Snapshot every link or chat you rely on: `al record <name> origin --url <u> --from -`,
  with `--updated <time>` when the source shows when it last changed.
- `al consolidate <name> --section <ID>` writes a part's "now" into the baseline.
  `al conclude <name>` needs each section consolidated; carried (a later block built on
  it is in the baseline; if dropped, keep it, never revert); `Dropped <date> (Dn)`, with
  applied text also reverted by consolidate's `--revert <ID>`; or `Kept <date> (Dn)`, for
  a consolidated or carried section with `for R<n>` or Dn from the owner.

## Reading where things stand
- `al context <name>`: a request in twelve lines. `al context <ID>`: one section, with
  its links. `al spec`: the design now. `--audit` gives the whole trace; `--at <commit>`,
  any past state. `al context --diff main...HEAD --for review`: what a reviewer reads.
