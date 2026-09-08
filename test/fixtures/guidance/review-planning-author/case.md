# Original request

> Simulation input only. This sanitized snapshot is not a live service record or a policy decision.

Complete an independent review of the planning handoff, publish the findings or clean result, and return the revision, verdict, summary, and comment URL to the planning author session named in this work.

## Specification snapshot

Source: `example/consumer` at revision `eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`, `openspec/specs/review/spec.md`.

Review guidance reads the recipient from explicit current-work handoff context. It does not use a global route keyed by a display name.

## Issue snapshot

```text
repository: example/consumer
issue: example/consumer#50
activity: review
request: example/consumer#50
basis: example/consumer@eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:openspec/specs/review/spec.md
author_kind: planning
author_session: session-planning-author
producer_session: session-planning-producer
reviewer_session: session-reviewer
reviewer_model: model-reviewer
review_depth: full-scope
head: ffffffffffffffffffffffffffffffffffffffff
```

## Policy snapshot

```text
project.review.depth: full-scope
project.review.internal.allowed_models: model-reviewer
project.review.excluded_models: model-blocked
project.review.context.max_inline_bytes: 65536
policy_ref: example/consumer@eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:openspec/config/review-policy.json
```

## Evidence snapshot

```text
request_record: example/consumer#50
changed_scope: openspec/changes/workflow-refresh/Design.md, openspec/changes/workflow-refresh/tasks.md
basis_records: example/consumer@eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:openspec/changes/workflow-refresh/proposal.md; example/consumer@eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:openspec/changes/workflow-refresh/specs/adoption.md
review_head: ffffffffffffffffffffffffffffffffffffffff
producer_session: session-planning-producer
reviewer_session: session-reviewer
reviewer_model: model-reviewer
review_depth: full-scope
review_findings: []
published_comment_url: https://github.com/example/consumer/pull/50#issuecomment-701
notification_recipient: session-planning-author
notification_state: confirmed
```
