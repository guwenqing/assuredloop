# Findings are hints, except three exact rules that block
Tier: 2 · Status: open

## Owner's words and dialog

- 2026-10-17 the owner's words, snapshot origin/2026-10-17-owner-words.md:
  issue #238 on GitHub, its title and body as the owner filed them.
- The dialog in brief: the owner filed issue #238. It corrects #234, which
  0.2.4 delivered. #234 kept the rule that an accepted ADR's text never
  changes, and made a missing `source:` or `decides:` a `not ok` under
  `--strict`. The owner wants the findings of `al check` to be hints for the
  review, except for exact rules that block. SCH-22, DES-9, DES-22 and other
  paragraphs change, so this is a promise change on path 2. The architect
  gave the organized requirement below, and asked the owner to sign it.

## Organized requirement

From issue #238, which corrects #234.

<!-- R1 from:2026-10-17-owner-words.md -->

### R1 A rewrite that keeps the meaning
Any text may be rewritten in other words when its meaning stays the same. This holds for an accepted or superseded ADR as for a spec or any other document. A new ADR is needed only when the decision changes, in whole or in part. The review judges whether a rewrite keeps the decision; a tool does not. So a changed ADR text, or a changed or removed link in an ADR's marker, is a hint: "ADR-3's text changed: check that its decision is unchanged; if the decision changed, write a new ADR that supersedes it." After a superseded ADR is rewritten, `al index --align <ID>` refreshes the bindings to it, as it does for an accepted ADR.

<!-- R2 from:2026-10-17-owner-words.md -->

### R2 Findings are hints for the review
`al check` gives the AI review hints, and the review decides. A finding is `not ok` only for a rule that meets two tests: breaking it lets an unapproved or wrong decision be built, and an exact check of the records, hashes and links decides it, with no judgement. R3, R4 and R5 are these rules today. Every other finding is a hint in every mode, `--strict` included, for example `adr-changed`, `adr-links` and the marker lints. Under `--strict`, `al check` exits 1 when it prints a `not ok`, as today. The schema, the README and the skill say this.

<!-- R3 from:2026-10-17-owner-words.md -->

### R3 Unsigned requirement
The latest version of each requirement is covered by a valid sign-off. A sign-off is valid only when its `covers` entry matches the requirement's id, version and `sha256` exactly, with no case folding; its file is in the request's `origin/` folder, and the hash of that file's signed text equals the sign-off's `sha256`; and it records when it was signed and the signer's words. A requirement or sign-off entry that `al check` cannot read is `not ok`, not skipped. The result depends on the record's content, not on its YAML layout. A promise paragraph that changes with no signed requirement that covers it also stays `not ok` (`signoff-coverage`).

<!-- R4 from:2026-10-17-owner-words.md -->

### R4 Changed record evidence
Each file that a record lists with a hash still has that hash: each origin file under `sources:` and each sign-off file. A changed, missing or unreadable file is `not ok`.

<!-- R5 from:2026-10-17-owner-words.md -->

### R5 Citation of a superseded ADR
A current place that names a superseded ADR also names the ADR that supersedes it. When that ADR is itself superseded, the same rule applies to it. Current places are, for example, a spec paragraph's `governed-by:`, an open request, and the marker and text of an accepted ADR. These are exempt, because they are the chain itself or dated records: an ADR that supersedes it, directly or through a chain; a superseded ADR; an ADR's `## History` section; a request's recorded decisions (`D<n>`); origin files; and archived requests. Each superseded ADR's `Status: superseded by ADR-n` names an ADR that exists and whose marker has `supersedes:` for it.

Out: hints from the issues that a request's tasks link, and configurable phrases (#239).
Signed off: 2026-10-17 owner, origin/2026-10-17-signoff.md

## Decisions

- D1, 2026-10-17. Source: the agent (architect), session prompt of developer-238, 2026-10-17. Exit codes stay as today: plain `al check` exits 0, and `--strict` exits 1 when a `not ok` prints. `--strict` raises nothing any more: no finding changes severity with the mode.
- D2, 2026-10-17. Source: the agent (architect), session prompt of developer-238, 2026-10-17. What stays `not ok`: `signoff-coverage`, the new R3, R4 and R5 findings (name their codes), the root line, and a record that cannot be read. Every other finding is a hint in every mode: each `adr-changed` case (a deleted ADR file too, with its own message), `adr-links`, `path-claim`, `unresolved-link`, every marker lint, an invalid disposition and the lost-ID lint in specs/. In the PR body, list each finding code with its severity before and after.
- D3, 2026-10-17. Source: the agent (architect), session prompt of developer-238, 2026-10-17. R3 applies to every request that has `requirements:` in its record, open or archived. Run it against this repo's own records first. If one of our own records fails R3 or R4, stop and tell the architect before you change any record.
- D4, 2026-10-17. Source: the agent (architect), session prompt of developer-238, 2026-10-17. R4 compares each file the way `al record` hashed it (the text in the snapshot, not the whole file). A result file's inputs are not record evidence: a changed input stays the existing result hint.
- D5, 2026-10-17. Source: the agent (architect), session prompt of developer-238, 2026-10-17. R5: a proposed ADR is a current place too. "Names" means an `ADR-n` link in a marker or an `ADR-n` word in the text. The successor is named in the same marker for a link, and in the same paragraph for text. Archived requests are exempt as dated records.
- D6, 2026-10-17. Source: the agent (architect), session prompt of developer-238, 2026-10-17. The `--align` part of R1: today 0.2.2 leaves `stale-base` hints on bindings to a superseded record, and `--align` does not clear them. Check that on main first; fix it if it is still so.
- D7, 2026-10-17. Source: the agent (architect), session prompt of developer-238, 2026-10-17. Docs: the schema, the README and the skill state R1 and R2, and say that `al check` gives the review hints while the review decides, except for R3 to R5. Take out each place that says an accepted ADR's text never changes.
- D8, 2026-10-17. Source: the agent (architect), session prompt of developer-238, 2026-10-17. In the PR body, say what each changed spec paragraph said before and after.
- D9, 2026-10-17. Source: the agent (architect), message to developer-238, 2026-10-17. R3 stays as signed: a request that has a requirement (R<n>) needs it signed, also when it changes no promise; the owner's B1 in #238 has no exception. So nothing contradicts it: DES-42 says that a request that changes no promise needs no sign-off only when it has no requirement, and the skill says to write a design-only request with no R<n> in its organized section. The PR body says the consequence.
- D10, 2026-10-17. Source: the agent (architect). al record <name> signoff refuses without --words, and its Next line says to pass the owner's words: the command must not write a sign-off that al check calls not valid. It follows from R3 (DES-89), so it needs no new sign-off.
- D11, 2026-10-17. Source: the agent (architect). A current place that cannot be read is not ok superseded-cited at its path, with a message that says it cannot be read, so its citations are not checked: a read failure never hides a block, as in R3 and R4. SCH-37 says so. It follows from R5, so it needs no new sign-off.
