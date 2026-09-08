# Original request

> Simulation input only. This sanitized snapshot is not a live service record or a policy decision.

Continue the workflow-refresh planning Task after its Proposal pull request merged. The Design, scoped implementation Tasks, and implementation handoff are still due in the same planning effort.

## Specification snapshot

Source: `example/consumer` at revision `2727272727272727272727272727272727272727`, `openspec/changes/workflow-refresh/proposal.md` and `openspec/changes/workflow-refresh/design.md`.

The planning route keeps exploration, Proposal, Specs, Design, decomposition, and handoff together. A Proposal merge is one planning delivery point and does not represent completed planning or authorize implementation by itself.

## Issue snapshot

```text
repository: example/consumer
issue: example/consumer#58
activity: plan
request: example/consumer#58
change: workflow-refresh
basis: example/consumer@2727272727272727272727272727272727272727:openspec/changes/workflow-refresh/proposal.md
plan_items: example/consumer@2727272727272727272727272727272727272727:openspec/changes/workflow-refresh/tasks.md items=2.1,2.2,2.3
proposal_pull_request: example/consumer#59 merged at head 2828282828282828282828282828282828282828
design_state: owed
decomposition_state: owed
handoff_state: owed
planning_owner: planning-owner
issue_state: open
```

The planning record contains the merged Proposal and the remaining work states.
