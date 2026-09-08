# Original request

> Simulation input only. This sanitized snapshot is not a live service record or a policy decision.

Review the unchanged assigned revision, publish a clean result with its scope and basis, and return the supported outcome to the explicit author session.

## Specification snapshot

Source: `example/consumer` at revision `1616161616161616161616161616161616161616`, `openspec/specs/review/spec.md`.

A clean result is still a published review outcome. Reusing matching completed coverage is acceptable only when revision, scope, and applicable context are unchanged.

## Issue snapshot

```text
repository: example/consumer
issue: example/consumer#53
activity: review
request: example/consumer#53
basis: example/consumer@1616161616161616161616161616161616161616:openspec/specs/review/spec.md
author_kind: implementation
author_session: session-implementation-author
producer_session: session-implementation-producer
reviewer_session: session-reviewer
reviewer_model: model-reviewer
review_depth: full-scope
head: 1717171717171717171717171717171717171717
prior_result: matching clean review for the same head and scope
```

## Policy snapshot

```text
project.review.depth: full-scope
project.review.internal.allowed_models: model-reviewer
project.review.excluded_models: model-blocked
project.review.context.max_inline_bytes: 65536
policy_ref: example/consumer@1616161616161616161616161616161616161616:openspec/config/review-policy.json
```

## Evidence snapshot

```text
request_record: example/consumer#53
changed_scope: docs/workflow-guide.md
basis_records: example/consumer@1616161616161616161616161616161616161616:openspec/specs/workflow/spec.md; example/consumer#23
review_head: 1717171717171717171717171717171717171717
producer_session: session-implementation-producer
reviewer_session: session-reviewer
reviewer_model: model-reviewer
review_depth: full-scope
prior_review_comment: https://github.com/example/consumer/pull/53#issuecomment-703
prior_review_scope: docs/workflow-guide.md plus workflow contract references
prior_review_context_digest: sha256:3030303030303030303030303030303030303030303030303030303030303030
current_context_digest: sha256:3030303030303030303030303030303030303030303030303030303030303030
```
