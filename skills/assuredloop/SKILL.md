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
   the PR say `Tier: 1 — <claim>`.
7. Before review, run `al check`. Fix or explain each `not ok`; read each `note`.
`al new` writes at once. Other commands that write show first; add `--yes` to write.

## Larger work (tiers 2, 3 and S)
- Tier 2 needs a design; tier 3 lands in parts; S is a spike that answers a question.
  `al new <name> --tier <2|3|S> --from -`, then `### R1` sub-sections, `Out:` and
  `Assumed:` (one-line `R1:` is tier 1 only); for S, an `## Organized question`. The
  owner signs it (step 5). Draft freely; deliver the work with the sign-off or after it.
- `change.md` holds the design, then `## Spec changes`: a block per section, its heading
  ending in `for R<n>` (else `al conclude` reports R<n> in no section). To change a
  section, `al record <name> section <ID>` copies it into "was" and "now"; edit "now".
  `--builds-on <request>` starts from another request's version instead. For a new
  section, write `### [PAY-1]@1 add in specs/pay.md` (or `add after [ID]`), then `Now:`
  and the section, indented. Its ID is one more than the highest ever used for that prefix.
- Each later decision (D1, D2…): `al record <name> decision --source <who> --text <it>`.
  Snapshot every link or chat you rely on: `al record <name> origin --url <u> --from -`,
  with `--updated <time>` when the source shows when it last changed.
- As a part lands, `al consolidate <name> --section <ID>` writes its "now" into the
  baseline. `al conclude <name>` needs each section consolidated; carried (a later block
  built on it is in the baseline); `Dropped <date> (Dn)` on its heading, reverted if applied
  (consolidate's `--revert <ID>`); or `Kept <date> (Dn)`: Dn from the owner, or `for R<n>`.
- A spike writes `findings.md`, starting with its Answer, and changes no spec.

## Reading where things stand
- `al context <name>`: a request in twelve lines. `al context <ID>`: one section, with
  its links. `al spec`: the design now. `--audit` gives the whole trace; `--at <commit>`,
  any past state. `al context --diff main...HEAD --for review`: what a reviewer reads.
