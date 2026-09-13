# GitHub Work Traceability Specification

## Purpose

L2: connect original work, fixed native requirements/tasks, actual PR contributions
and evidence using explicit typed references. Supports
[traceable work](../workflow-goals/spec.md#requirement-work-is-traceable-and-proportionate).

## Requirements

### Requirement: Work categories and activities are formally consistent
The current GitHub adapter SHALL validate one configured category against the
record activity. Category keys are request, epic, architecture-task, task, bug and
spike; mappings SHALL be distinct under case-insensitive comparison. Compatible
activities are respectively triage; none; plan/closeout; adopt/deliver/review;
deliver; and research. These classify records, not agent roles or Skill routing.

#### Scenario: Rough intake and assigned work differ
- **WHEN** a rough Request or non-executable Epic lacks structured context
- **THEN** the documented intake/container exception applies, but an explicit
  contribution assignment still requires its real owning work context.

### Requirement: Trace native definitions without duplicate task bodies
Issue/PR records SHALL use fixed basis and plan_items references. Native task or
package text SHALL associate its Work Issue through the canonical Markdown link.
Resolved PR contributions SHALL match their actual owner/task assignments.

#### Scenario: A PR claims another Issue's tasks
- **WHEN** its task mapping does not belong to its declared owner
- **THEN** the check reports the conflicting canonical association rather than
  granting scope credit from a checked checkbox.

### Requirement: Separate grouping from delivery dependencies
Parent/sub-Issue membership SHALL NOT imply depends_on. An Issue prerequisite
SHALL require completion of its whole current assigned scope. A PR prerequisite
SHALL require its actual merged contribution and valid fixed owner/task/evidence
context without demanding closure of the larger owning Issue.

#### Scenario: Planning Issue reopens after one contribution was delivered
- **WHEN** a dependent record names that Issue
- **THEN** its reopened scope remains a dependency; a diagnostic explains the
  distinction from a fixed PR contribution without silently rewriting the link.

### Requirement: Completion is supported by actual contributions
Completed assigned delivery SHALL have actual merged PR/commit and scoped
evidence coverage. Partial contributions SHALL NOT establish whole-Issue
completion. Cancellation/supersession SHALL contribute no delivery credit.

#### Scenario: A closed Issue has an uncovered task
- **WHEN** its assigned native task has no mapped delivered contribution
- **THEN** the check reports incomplete coverage despite closed state.

### Requirement: Follow-ups preserve historical delivery records
A follow-up SHALL reference relevant current requirements and prior delivery
without rewriting archived plans or old evidence. Original and receiving work
references SHALL remain distinguishable when context is consolidated.

#### Scenario: New bug appears after archive
- **WHEN** implementation restores an existing guarantee
- **THEN** a new work record can reference that guarantee and earlier delivery;
  historical records do not become mutable current task state.
