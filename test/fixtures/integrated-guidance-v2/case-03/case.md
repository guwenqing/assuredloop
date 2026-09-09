# Trial input — case-03

> Simulation input only. This declared snapshot is not a live service record, planning approval, or authorization.

## Consumer and planning context

```text
repository: northstar-labs/harbor-notes
openspec_root: openspec
consumer_revision: 3333333333333333333333333333333333333333
planning_issue: northstar-labs/harbor-notes#18
activity: plan
request: northstar-labs/harbor-notes#15
change: calendar-locale
basis: northstar-labs/harbor-notes@3333333333333333333333333333333333333333:openspec/changes/calendar-locale/proposal.md
plan_items: northstar-labs/harbor-notes@3333333333333333333333333333333333333333:openspec/changes/calendar-locale/tasks.md items=2.1,2.2,2.3
planning_owner_session: session-plan-saffron
implementation_owner_session: session-build-saffron
```

The selected installed package is `assuredloop-base@0.1.0` at the verified runtime root supplied in the dispatch. Read `skills/assuredloop-plan/SKILL.md`, `contracts/work-intake-and-planning/spec.md`, `contracts/specification-baseline/spec.md`, `contracts/review-and-validation/spec.md`, `contracts/github-work-traceability/spec.md`, `templates/records/issue.json`, `templates/records/planRef.json`, `templates/work-issue.md`, `templates/work-pr.md`, and `templates/README.md`.

## Declared planning state

The active `calendar-locale` change has a Proposal, consumer Specs, and Design at the declared revision. The current planning handoff records the Proposal as accepted for this simulated planning context. It still owes a final task-to-Issue map and an implementation handoff. The planning Issue remains open. No merge, review, owner approval, or implementation has occurred.

A separately assignable research outcome is declared for `timezone-alias-compatibility`: inspect the consumer's accepted locale requirement, compare the two named input formats, document supported aliases and limitations, and return one recommendation to the planning owner. Its scope, evidence boundary, owner `session-research-saffron`, and handoff back to `session-plan-saffron` are declared. It is related to the active plan but must not be made to wait for the parent planning Issue to close.

The implementation outcome is to add the locale parser and its tests within the accepted `calendar-locale` scope. Unrelated billing, analytics, and account-migration work is not part of the declared plan.

## Executor task

Continue the coherent planning task and prepare the scoped implementation handoff while preserving the separately assignable research outcome. Use native task references and explicit requirement/decision bases. Show owners, dependencies, checks, independent review, and the remaining human decision boundary. Do not create external Issues, alter the plan, claim Proposal acceptance beyond the supplied declaration, or claim implementation or merge.

## Declared category context

At the declared consumer revision, the supplied simulated label snapshot for `northstar-labs/harbor-notes#18` is `["type:architecture-task"]`. The six configured mappings are in `consumer-labels.json`. This is declared fixture context, not a live GitHub observation or accepted route. The originating collection `northstar-labs/harbor-notes#15` has the supplied label `["type:epic"]` and no executable activity/context; it is a container. No child Issue identifiers or observed child labels are supplied for the proposed research and implementation assignments. Their final map and requirement/decision references remain to be reconciled.
