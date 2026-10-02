# Decision records

One file per decision, in the orca-bot-kit `obk-arch` format. A change to an
accepted record is a new record that replaces the old one whole; the old one
changes only its status.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-rebuild-in-the-existing-repo.md) | Rebuild in this repo; the old version on `legacy` | accepted |
| [0002](0002-openspec-way-with-a-light-was-now-change-spec.md) | The OpenSpec way, with a light was/now change spec | accepted |
| [0003](0003-section-states-by-content.md) | Judge sections by content: link first, then text | accepted |
| [0004](0004-requirement-sign-off-blocks.md) | Requirement sign-off blocks | superseded by 0010 |
| [0005](0005-hints-not-gates.md) | Hints in the output, not a harness | accepted |
| [0006](0006-the-request-record-and-its-audit-scope.md) | The request record, snapshots and audit scope | accepted |
| [0007](0007-rough-links-from-git.md) | Rough links from git, with reasons | accepted |
| [0008](0008-tiers-as-the-way-of-working-with-adrs.md) | Tiers decide which records to write; ADRs are records | accepted |
| [0009](0009-a-deterministic-script-node-zero-dependencies.md) | A deterministic script, Node, no dependencies | superseded by 0012 |
| [0010](0010-requirement-first-signed-and-blocking.md) | Requirement first, signed, and blocking | superseded by 0011 |
| [0011](0011-requirement-signed-work-delivered-with-or-after.md) | Requirement signed; work drafted before, delivered with or after | accepted |
| [0012](0012-a-deterministic-script-under-3500-lines.md) | A deterministic script, Node, no dependencies, under 3,500 lines | superseded by 0013 |
| [0013](0013-a-deterministic-script-no-line-ceiling.md) | A deterministic script, Node, no dependencies; no line ceiling, lightness is process overhead | accepted |

**Where the cited material lives.**
- The design as agreed: `requests/archive/assuredloop-v1/design.md`.
- Earlier drafts, the adversary's challenges, the case tests, and the
  research notes cited as [A]-[L] and [G]: the bots repository, under
  `bots/assuredloop/design/` and `bots/assuredloop/research/`.
- "input N": the owner's inputs, snapshotted in
  `requests/archive/assuredloop-v1/origin/2026-09-27-owner-inputs.md`.
- The request concluded on 2026-09-28 and moved to
  `requests/archive/assuredloop-v1/`. The ADRs keep the paths they were
  written with, under `requests/assuredloop-v1/`.
