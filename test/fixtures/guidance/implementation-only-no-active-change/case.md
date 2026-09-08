# Original request

> Simulation input only. This sanitized snapshot is not a live service record or a policy decision.

Restore the documented retry behavior after a timeout in the cache adapter. The current product specification already requires one bounded retry and the prior delivery changed the adapter without changing that requirement. There is no active OpenSpec change for this maintenance follow-up.

## Specification snapshot

Source: `example/consumer` at revision `1111111111111111111111111111111111111111`, `openspec/specs/cache/retry.md`.

### Requirement: Retry a transient cache timeout

The adapter retries one transient timeout, preserves the original error after the retry, and does not increase the configured retry budget.

## Issue snapshot

```text
repository: example/consumer
issue: example/consumer#41
activity: deliver
request: example/consumer#41
change: none
basis: example/consumer@1111111111111111111111111111111111111111:openspec/specs/cache/retry.md
prior_work: example/consumer#18
owner: maintenance-owner
```

The proposed patch changes only the adapter branch that lost the existing retry. It does not alter the requirement, retry budget, public API, or material design decision.
