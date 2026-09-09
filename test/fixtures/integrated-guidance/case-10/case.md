# Trial input — case-10

> Simulation input only. This declared snapshot is not a live review record, verdict, or authorization.

## Consumer and review context

```text
repository: northstar-labs/harbor-notes
openspec_root: openspec
consumer_revision: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
issue: northstar-labs/harbor-notes#26
activity: review
request: northstar-labs/harbor-notes#26
basis: northstar-labs/harbor-notes@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:openspec/specs/notes-export.md
pr: northstar-labs/harbor-notes#27
head: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
base_ref: main
base_sha: cccccccccccccccccccccccccccccccccccccccc
```

The selected installed package is `assuredloop-base@0.1.0` at `<installed-package-root>`. Read `skills/assuredloop-review/SKILL.md`, `contracts/review-and-validation/spec.md`, `contracts/github-work-traceability/spec.md`, `contracts/workflow-self-evolution/spec.md`, `templates/review-request.md`, `templates/review-result.md`, `templates/records/evidence.json`, and `templates/README.md`.

## Declared handoff

The pull request changes `src/export/notes.js` and `test/export/notes.test.js` to preserve note ordering in the CSV export. The supplied basis is `openspec/specs/notes-export.md`, and the requested assessment is full-scope against that requirement and the changed files. The destination's declared review policy has depth `full-scope`, allows `model-cedar`, excludes `model-slate`, and names no additional reviewer requirement.

The handoff declares `producer_session: session-review-saffron`, `reviewer_session: session-review-saffron`, `reviewer_model: model-cedar`, and `review_depth: full-scope`. The current author return context is `session-export-saffron`. No prior review, findings, comment, notification, command result, or owner approval is supplied. No external publication channel is available in this local trial.

## Executor task

Prepare the independent review request/outcome draft from the supplied scope and policy. Assess the session declarations, revision-specific evidence, and current return/publishing limits. State what can proceed as a diagnostic draft and what cannot be represented as an independent review. Do not change the candidate, post a comment, send a message, or claim a verdict, delivery, or receipt.
