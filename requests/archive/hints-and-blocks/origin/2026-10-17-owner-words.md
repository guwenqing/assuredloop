Source: standard input
Fetched: 2026-10-17T14:14Z
SHA-256: cd75875c6dfa178d4f3a0ed3a3cd93dae5a30ee5e61f2641eeb3b3c7588d0816
---
The owner's issue #238 on GitHub (https://github.com/guwenqing/assuredloop/issues/238), its title and body as the owner filed them, kept exactly:

# Findings are hints for the AI review, except three exact rules that block: an unsigned requirement, changed record evidence, a citation of a superseded ADR; a rewrite that keeps an ADR's decision is allowed (corrects #234)

## Summary

This corrects the requirement of #234, which #236 implemented in 0.2.4. #234 asked for the wrong thing. It accepted the rule that an accepted ADR's text never changes, asked only for a narrow exception for added links, and asked that a missing `source:` or `decides:` become `not ok` under `--strict`.

The intended rules are:

1. **Any text may be rewritten in other words when its meaning stays the same.** This holds for an ADR as for a spec or any other document. A new ADR is needed only when the decision itself changes, in whole or in part. Whether a rewrite keeps the decision is a judgement for the review, not for a tool.
2. **AssuredLoop's findings are hints for the AI review, except for absolute rules.** A script or check does not block a change by itself; the review reads the findings and decides. A rule blocks only when both hold: breaking it lets an unapproved or wrong decision be built, and an exact check decides it from the records, hashes and links, with no judgement. Three rules meet this test today (B1 to B3 below).

## What 0.2.4 does today, against these rules

- `adr-changed` is `not ok` for any change to the text of an accepted or superseded ADR, except links added to its marker. A rewrite that keeps the decision, for example removing quotations or fixing wording, fails the check.
- `adr-links` (from #236) is a hint by default but `not ok` under `--strict`. A project that runs `--strict` in CI is blocked by a missing link.
- The README and the skill say that an accepted ADR's text does not change and that a new ADR must supersede it.

## What we expect

### Hints

- `adr-changed` becomes a hint in every mode, for accepted and superseded ADRs alike: "ADR-3's text changed: check that its decision is unchanged; if the decision changed, write a new ADR that supersedes it." A changed or removed trace link is reported the same way, so that wrong links can be corrected.
- `adr-links` is a hint in every mode, `--strict` included.
- The schema, README and skill state rules 1 and 2, and say that `al check` gives the review hints, while the review decides, except for B1 to B3.
- Other findings that need judgement follow the same principle.
- After a superseded ADR is rewritten without changing its decision, `al index --align <ID>` refreshes the bindings to it, as it does for an accepted ADR. Today 0.2.2 leaves the `stale-base` hints on bindings to a superseded record, and `--align` does not clear them.

### Blocking rules: `not ok` in every mode

**B1. Unsigned requirement version.** The latest version of each requirement is covered by a valid sign-off. A sign-off is valid only when:

- its `covers` entry matches the requirement's id, version and `sha256` exactly, with no case folding;
- its file exists in the request's `origin/` folder, and the hash of that file's signed text equals the sign-off's recorded `sha256`;
- it records when it was signed and the signer's words.

A requirement entry, or a sign-off entry, that the check cannot read is `not ok`, not skipped. The result depends on the record's content, not on its YAML layout: regression tests cover block and flow mappings and different valid indentation.

Today 0.2.2 reports nothing here. Changing the text of a signed requirement and committing it gives no finding. After `al index`, the record holds the new version with no sign-off covering it, still with no finding. Only `al conclude` refuses, at the very end of the request.

**B2. Changed record evidence.** Every file that a record lists with a hash, an origin file under `sources:` or a sign-off file, still has that hash. A changed, missing or unreadable file is `not ok`.

Today 0.2.2 records each origin file's `sha256` with `al record ... origin`, but `al check` does not compare the file with it again. A binding to an origin file takes its hash from the record, not from the file, so a later edit of the file goes unnoticed.

**B3. Citation of a superseded ADR.** Two checks:

- A current place that names a superseded ADR, such as a spec paragraph's `governed-by:`, a request, or the marker or text of an accepted ADR, also names the ADR that supersedes it. When that ADR is itself superseded, the same rule applies to it. Exempt are an ADR that supersedes it, directly or through a chain, which may name it anywhere; and dated records, whose text states what held at their date: a superseded ADR itself, an ADR's `## History` section, a request's recorded decisions (`D<n>`), and origin files.
- Each superseded ADR's `Status: superseded by ADR-n` names an ADR that exists and whose marker holds `supersedes:` for it. A chain is allowed: that ADR may itself be superseded later.

Without these checks, a builder can follow a decision that a newer ADR replaced, with no finding.

## Context

In Sapper/cicd-specs, the repository's own wrapper of `al check` reports every finding as a hint. It fails only when the tool cannot run or on an unsigned requirement version. The wrapper has a local check for B1 that reads the record layout that `al` writes. It adds no local checks for B2 and B3. When AssuredLoop ships these rules, the wrapper removes its B1 check and upgrades its pinned version. It stays on the pinned 0.2.2 for now.

