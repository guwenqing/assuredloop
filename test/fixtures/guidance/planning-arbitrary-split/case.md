# Original request

> Simulation input only. This sanitized snapshot is not a live service record or a policy decision.

Create separate Issues for the schema file, the Markdown template, the first review round, and the checkbox that records their delivery. All four edits are part of the same accepted workflow-refresh plan and have the same owner and handoff.

## Specification snapshot

Source: `example/consumer` at revision `3131313131313131313131313131313131313131`, `openspec/changes/workflow-refresh/tasks.md`.

Planning splits work for a meaningful independently assignable outcome or responsibility. Individual artifact edits, links, status updates, review rounds, or checklist items remain steps within the relevant work rather than mandatory standalone Issues.

## Issue snapshot

```text
repository: example/consumer
issue: example/consumer#62
activity: plan
request: example/consumer#62
change: workflow-refresh
basis: example/consumer@3131313131313131313131313131313131313131:openspec/changes/workflow-refresh/tasks.md
parent_planning_issue: example/consumer#58
proposed_children: schema-file; Markdown-template; review-round-one; checkbox-update
shared_owner: planning-owner
shared_handoff: same planning pull request
split_rationale: one child per artifact or review round
```

The proposed child records have no separate outcome, scope boundary, evidence, owner responsibility, or human handoff.
