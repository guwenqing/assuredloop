# Original request

> Simulation input only. This sanitized snapshot is not a live service record or a policy decision.

Increase the request retry limit from one to three so transient failures are less visible. The patch is one line and the author proposes to use the no-Spec route because the diff is small.

## Specification snapshot

Source: `example/consumer` at revision `2222222222222222222222222222222222222222`, `openspec/specs/api/retry.md`.

### Requirement: Bound request retries

The client makes at most one retry for a transient request failure so latency and load remain bounded.

## Issue snapshot

```text
repository: example/consumer
issue: example/consumer#43
activity: deliver
request: example/consumer#43
change: none
basis: []
no_spec_reason: one-line change does not need a Spec
prior_work: example/consumer#20
owner: api-owner
```

The issue body does not explain how the changed guarantee fits the accepted requirement.
