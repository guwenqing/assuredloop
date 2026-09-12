## Why

The first consumer required private-session knowledge for setup choices, manual label repair and current-project context. The owner also wants review policy to belong to each consuming project and tentative future work to live in the repo without becoming another formal specification or execution log.

## What Changes

- Make the selected primary review tool and optional additional-review requirement explicit project choices. New setup defaults to one independent reviewer in the selected tool ecosystem; no Astra, Claude or provider is imposed on consumers.
- Add opt-in missing-label provisioning to initialization with preview/apply, explicit authorization, exact repository binding, additive writes and honest partial-failure reporting. Default initialization and read-only check/inspect remain non-mutating remotely.
- Add a bounded Brownfield adoption path to existing adoption/planning guidance: inspect selected existing sources, distinguish observed code from intended requirements, reconcile an owner-reviewed current product definition through native OpenSpec, and identify uncovered scope before claiming adoption.
- Establish an optional repo-versioned `.assuredloop/notes/future-work.md` convention for informal gaps and tentative ideas. It is best effort and outside formal consistency/completion checks, not a backlog database, accepted requirement set or run log.

## Capabilities

### New Capabilities

None. Reuse the existing capability boundaries and work categories.

### Modified Capabilities

- `project-workflow-adoption`: Consumer setup choices, authorized label provisioning, and bounded Brownfield guidance.
- `review-and-validation`: Explicit optional tool routing and review obligations with same-tool independence as the setup default.
- `specification-baseline`: Informal future notes remain separate from current accepted requirements and historical execution evidence.

## Impact

Extend `project.review`, Evidence routing declarations and initialization's explicit write path where needed; update the existing adoption/planning/review Skills, shared templates, README and focused tests. Reuse native tool identifiers and existing `gh` access checks. Brownfield understanding remains human/AI work, not an automatic code-to-requirement generator or a repository-wide semantic validator. Source code remains evidence, not automatic intent.

Use [continuous planning #22](https://github.com/guwenqing/assuredloop-base/issues/22) and [aggregate closeout #24](https://github.com/guwenqing/assuredloop-base/issues/24) under [Epic #21](https://github.com/guwenqing/assuredloop-base/issues/21); implementation is separately assigned by coherent outcome. This Proposal does not expand the linked-runtime exclusion in PR #26 or the archived initial minimum.

## Boundaries and acceptance

No bot hosting, session dispatcher, external-provider subscription, automatic CI/review installation, multi-repo authority graph, universal model choice, imposed two-ticket quota, credential handling, historical reconstruction promise or required database. Existing consumers retain their accepted policy until an explicit reviewed upgrade. New fields cannot govern their own configuration change. The first Brownfield version covers an explicitly selected single repository/area and a reviewed baseline, not automatic completeness for arbitrary large projects. Owner acceptance of these limits and independent design review are required before implementation.
