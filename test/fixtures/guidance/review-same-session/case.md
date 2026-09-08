# Original request

> Simulation input only. This sanitized snapshot is not a live service record or a policy decision.

Review the assigned documentation change against its original request and the current workflow contract. Record a revision-specific verdict and publish the review result.

## Specification snapshot

Source: `example/consumer` at revision `5555555555555555555555555555555555555555`, `openspec/specs/workflow/spec.md`.

The review contract requires a producer and reviewer from distinct sessions, a full-scope assessment, and evidence tied to the reviewed revision.

## Issue snapshot

```text
repository: example/consumer
issue: example/consumer#46
activity: review
request: example/consumer#46
basis: example/consumer@5555555555555555555555555555555555555555:openspec/specs/workflow/spec.md
handoff_author_session: session-reviewer
producer_session: session-reviewer
reviewer_session: session-reviewer
reviewer_model: model-reviewer
review_depth: full-scope
head: 6666666666666666666666666666666666666666
```

The handoff declares the same session for producer and reviewer.
