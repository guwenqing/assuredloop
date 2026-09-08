# Original request

> Simulation input only. This sanitized snapshot is not a live service record or a policy decision.

Complete an independent review of the implementation handoff, publish the findings or clean result, and return the revision, verdict, summary, and comment URL to the implementation author's session.

## Specification snapshot

Source: `example/consumer` at revision `1212121212121212121212121212121212121212`, `openspec/specs/review/spec.md`.

The work-specific author recipient overrides any example planning route. Review depth and independence remain required.

## Issue snapshot

```text
repository: example/consumer
issue: example/consumer#51
activity: review
request: example/consumer#51
basis: example/consumer@1212121212121212121212121212121212121212:openspec/specs/review/spec.md
author_kind: implementation
author_session: session-implementation-author
producer_session: session-implementation-producer
reviewer_session: session-reviewer
reviewer_model: model-reviewer
review_depth: full-scope
head: 1313131313131313131313131313131313131313
```

## Policy snapshot

```text
project.review.depth: full-scope
project.review.internal.allowed_models: model-reviewer
project.review.excluded_models: model-blocked
project.review.context.max_inline_bytes: 65536
policy_ref: example/consumer@1212121212121212121212121212121212121212:openspec/config/review-policy.json
```

## Evidence snapshot

```text
request_record: example/consumer#51
changed_scope: src/cache/retry.js, test/cache/retry.test.js
basis_records: example/consumer@1212121212121212121212121212121212121212:openspec/specs/cache/retry.md; example/consumer#18
review_head: 1313131313131313131313131313131313131313
producer_session: session-implementation-producer
reviewer_session: session-reviewer
reviewer_model: model-reviewer
review_depth: full-scope
review_findings: []
published_comment_url: https://github.com/example/consumer/pull/51#issuecomment-702
notification_recipient: session-implementation-author
notification_state: confirmed
```
