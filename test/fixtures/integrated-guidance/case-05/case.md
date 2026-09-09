# Trial input — case-05

> Simulation input only. This declared snapshot is not a live service record, implementation result, or authorization.

## Consumer and follow-up context

```text
repository: northstar-labs/harbor-notes
openspec_root: openspec
consumer_revision: 5555555555555555555555555555555555555555
issue: northstar-labs/harbor-notes#21
activity: deliver
request: northstar-labs/harbor-notes#21
basis: northstar-labs/harbor-notes@5555555555555555555555555555555555555555:openspec/specs/sync-poll.md
change: omitted because no active change is selected
prior_work: northstar-labs/harbor-notes#12
owner: session-build-saffron
```

The selected installed package is `assuredloop-base@0.1.0` at `<installed-package-root>`. Read `skills/assuredloop-deliver/SKILL.md`, `contracts/github-work-traceability/spec.md`, `contracts/review-and-validation/spec.md`, `contracts/work-intake-and-planning/spec.md`, `templates/records/issue.json`, `templates/records/pr.json`, `templates/work-issue.md`, `templates/work-pr.md`, and `templates/README.md`.

## Accepted context

The consumer requirement at `openspec/specs/sync-poll.md` says that a transient upstream timeout is retried once, the last cursor is preserved, and the public poll API and retry budget remain unchanged. Prior delivery `northstar-labs/harbor-notes#12` implemented that behavior, but the current adapter branch returns early on one timeout path. The proposed work touches `src/sync/poll.js` and its focused test. It does not change the requirement, public API, retry budget, or material design decision.

The work owner declares test author `session-test-saffron`, implementation producer `session-build-saffron`, and requested reviewer `session-review-saffron`; these are current handoff facts, not evidence that any session has run. The target has no active OpenSpec change for this maintenance follow-up.

## Executor task

Prepare the assigned follow-up work record and implementation handoff. Explain the accepted-agreement boundary, relevant prior work, independent test-first order, controlled-fault/review obligations, and delivery return path. Keep the optional `change` field absent in the actual draft record when the schema calls for no active change. Do not edit files, run tests, open a PR, or claim completion.
