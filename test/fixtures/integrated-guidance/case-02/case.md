# Trial input — case-02

> Simulation input only. This declared snapshot is not a live service record, owner decision, or authorization.

## Consumer and request snapshot

```text
repository: northstar-labs/harbor-notes
openspec_root: openspec
consumer_revision: 2222222222222222222222222222222222222222
issue: northstar-labs/harbor-notes#17
activity: triage
request: northstar-labs/harbor-notes#17
change: omitted; no active change has been selected
basis: northstar-labs/harbor-notes@2222222222222222222222222222222222222222:openspec/specs/summary-delivery.md
owner: unassigned
```

The selected installed package is `assuredloop-base@0.1.0` at `<installed-package-root>`. Read its `skills/assuredloop-triage/SKILL.md`, `contracts/work-intake-and-planning/spec.md`, `contracts/github-work-traceability/spec.md`, `templates/records/issue.json`, `templates/work-issue.md`, and `templates/README.md`.

## Original request

“Make scheduled digest delivery easier for regional teams before the next reporting cycle. People say that holiday weeks and daylight-saving changes make the schedule confusing. We might need a new calendar setting, clearer guidance, or both.”

## Declared current context

The current consumer requirement at `openspec/specs/summary-delivery.md` says that a digest uses the account's configured locale and time zone. It does not state holiday behavior. The request does not identify affected teams, a current failure example, the desired behavior, acceptance evidence, rollout boundary, responsible owner, or whether an existing change covers the work. A separate prior delivery is mentioned by the requester but no qualified reference is supplied.

The issue is still an incoming request. No implementation permission, planning acceptance, owner assignment, or policy acceptance is declared. The category label mapping is available in the target configuration, but labels do not choose a route by themselves.

## Executor task

Preserve the request, separate its supplied facts from assumptions and questions, and prepare the appropriate triage record/handoff. State what must be clarified or investigated, who should receive the next decision, and which references remain unavailable. Do not invent a change identifier, product requirement, owner, prior-work reference, acceptance result, or successor Issue. Do not post or update any external record.
