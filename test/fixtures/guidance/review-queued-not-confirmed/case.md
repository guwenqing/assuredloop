# Original request

> Simulation input only. This sanitized snapshot is not a live service record or a policy decision.

Publish the review result and send its revision, verdict, summary, and comment URL to the explicit author session. Report the communication state exactly as returned by the available tool.

## Specification snapshot

Source: `example/consumer` at revision `1818181818181818181818181818181818181818`, `openspec/specs/review/spec.md`.

Accepted or queued message submission does not establish confirmed delivery. The review record must expose that limitation.

## Issue snapshot

```text
repository: example/consumer
issue: example/consumer#54
activity: review
request: example/consumer#54
basis: example/consumer@1818181818181818181818181818181818181818:openspec/specs/review/spec.md
author_kind: planning
author_session: session-planning-author
producer_session: session-planning-producer
reviewer_session: session-reviewer
reviewer_model: model-reviewer
review_depth: full-scope
head: 1919191919191919191919191919191919191919
communication: queued by the tool; receipt not confirmed
```

## Policy snapshot

```text
project.review.depth: full-scope
project.review.internal.allowed_models: model-reviewer
project.review.excluded_models: model-blocked
project.review.context.max_inline_bytes: 65536
policy_ref: example/consumer@1818181818181818181818181818181818181818:openspec/config/review-policy.json
```

## Evidence snapshot

```text
request_record: example/consumer#54
changed_scope: templates/review-result.md, skills/assuredloop-review/SKILL.md
basis_records: example/consumer@1818181818181818181818181818181818181818:openspec/specs/review/spec.md; example/consumer#24
review_head: 1919191919191919191919191919191919191919
producer_session: session-planning-producer
reviewer_session: session-reviewer
reviewer_model: model-reviewer
review_depth: full-scope
review_findings: []
published_comment_url: https://github.com/example/consumer/pull/54#issuecomment-704
notification_recipient: session-planning-author
message_request_id: msg-simulated-704
message_state: queued
delivery_receipt: absent
```
