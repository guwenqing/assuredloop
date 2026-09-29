---
name: assuredloop
description: >-
  Writing the records of a change with AssuredLoop's `al`: the owner's words,
  the signed organized requirement, the baseline spec, the change spec and the
  decisions. Use in a project whose AGENTS.md names AssuredLoop, before work
  that changes a promise, and whenever you need to know where a request stands.
---

## Quick path (tiers 0 and 1)
1. Run `al context`. Read its hints and its Next line; they say what to do.
2. No promise in the baseline (`specs/`) changes: tier 0. Write no record. The
   PR says `Tier: 0 — <what it restores>; no promise changes`.
3. A small change to a promise: tier 1. `al new <name> --tier 1 --from -`,
   with the owner's words on standard input.
4. In its `request.md`, add `## Organized requirement` with `### R1 <title>`:
   what is wanted, in MUST/SHOULD/MAY words, and `Amends: [ID]`; then the
   `Out:` and `Assumed:` lines. Show it to the owner.
5. On their OK: `al record <name> signoff --source <where> --words <quote>`.
6. Edit the baseline section. Then `al conclude <name>`, and the PR says
   `Tier: 1 — <claim>`.
7. Before review, run `al check`. Fix each `not ok`, or say why it stands.
Commands that write show first, and write only with `--yes`.

## Larger work (tiers 2, 3 and S)
- Tier 2 needs a design; tier 3 lands in parts; S is a spike that answers a
  question. Start with `al new` as above, and have the owner sign the
  organized requirement (for a spike, the organized question).
- Draft freely, but deliver the work with the sign-off or after it.
- In `change.md`, `al record <name> section <ID>` copies "was" from the
  baseline; write "now" under it. `--builds-on <request>` builds on another
  request's version. A new section is an `add after [ID]` block.
- Record each later decision: `al record <name> decision --source <who> --text <it>`.
  Snapshot every link or chat you rely on: `al record <name> origin --url <u> --from -`.
- As a part lands, `al consolidate <name> --section <ID>` writes its "now" into
  the baseline. `al conclude <name>` needs every section consolidated,
  carried, dropped or kept.
- A spike writes `findings.md`, starting with its Answer, and changes no spec.

## Reading where things stand
- `al context <name>`: a request in twelve lines. `al context <ID>`: one
  section, with its links. `al spec`: the design now.
- `al context --diff main...HEAD --for review`: what a reviewer reads.
- `--audit` gives the whole trace; `--at <commit>`, any past state.
- A hint is an observation, not a verdict: `not ok` is to fix or explain,
  `note` is worth a look.
