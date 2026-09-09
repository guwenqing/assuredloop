# Trial input — case-08

> Simulation input only. This declared snapshot is not a live service record, scope authorization, or delivery evidence.

## Consumer and active-plan context

```text
repository: northstar-labs/harbor-notes
openspec_root: openspec
consumer_revision: 8888888888888888888888888888888888888888
issue: northstar-labs/harbor-notes#24
activity: deliver
request: northstar-labs/harbor-notes#24
change: palette-refresh
basis: northstar-labs/harbor-notes@8888888888888888888888888888888888888888:openspec/changes/palette-refresh/specs/theme.md
plan_items: northstar-labs/harbor-notes@8888888888888888888888888888888888888888:openspec/changes/palette-refresh/tasks.md items=2.2
active_plan_owner_session: session-plan-saffron
implementation_owner_session: session-theme-saffron
```

The selected installed package is `assuredloop-base@0.1.0` at `<installed-package-root>`. Read `skills/assuredloop-deliver/SKILL.md`, `skills/assuredloop-triage/SKILL.md`, `contracts/work-intake-and-planning/spec.md`, `contracts/github-work-traceability/spec.md`, `contracts/review-and-validation/spec.md`, `templates/records/issue.json`, `templates/work-issue.md`, and `templates/README.md`.

## Declared accepted scope

The active `palette-refresh` change covers parsing the existing theme token aliases and preserving the documented fallback order. Task `2.2` assigns the parser and focused tests to `session-theme-saffron`. The planning owner remains responsible for impact assessment and reconciliation of additions. No implementation, test, review, merge, or owner decision is supplied.

The implementation handoff also proposes, “while this parser is open,” a new audit export, a migration of historical account rows, and a billing dashboard field. These items have no basis or plan references in the supplied context. The requester has not separated their outcomes, owners, evidence, or human decision boundary.

## Executor task

Prepare the scoped work assessment and handoff using the active-plan rules. Preserve the assigned parser outcome, identify the additional requests and their missing basis, and return any material expansion to the explicitly named planning owner. Do not silently add plan items, create a successor Issue, edit the active change, or claim that the extra work is part of delivery.
