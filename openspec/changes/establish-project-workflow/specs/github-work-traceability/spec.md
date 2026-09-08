## Purpose

Keep requests, formal planning and actual delivery connected while using GitHub for work collaboration. This L2 capability supports the shared [L1 goal](../workflow-goals/spec.md#requirement-work-is-traceable-and-proportionate). Its requirements and scenarios below define L3 behavior.

## ADDED Requirements

### Requirement: Resolve the work basis from an Issue or PR

The workflow SHALL let a worker or reviewer starting from an Issue or PR resolve the originating request, responsible work item, relevant current specification or active change, and applicable requirement and decision references. Legitimate absence of a relevant Spec SHALL be represented explicitly with a reason. Parent membership alone SHALL NOT count as requirement-level traceability. Review records SHALL identify the revision and work context they assessed.

Machine-authoritative basis and plan references SHALL carry repository, immutable revision and normalized path as structured fields, with the applicable heading or task identifiers, rather than require parsing arbitrary display URLs. The work-guidance selector SHALL have one authoritative representation; optional display/discipline labels SHALL NOT select a different workflow implicitly.

#### Scenario: Reviewer starts at a delivery PR
- **WHEN** a reviewer follows a PR's work reference
- **THEN** the reviewer can reach the scoped Issue, original request, applicable requirements and decisions, and evidence for that delivery without needing the author's conversation history

#### Scenario: Epic link hides missing requirement context
- **WHEN** an implementation Issue links its parent Epic but omits the required scoped basis
- **THEN** the missing basis is reported rather than treating the parent link as sufficient

### Requirement: Separate planning content from operational status

The workflow SHALL use repo files for formal planning and GitHub for work collaboration. It SHALL declare the authoritative ownership of task definitions, ticket associations and execution status, without two independently maintained copies of the same task body or status. Routine assignment, progress and review-comment updates SHALL NOT require a new formal change. Native OpenSpec task handling SHALL remain usable through the declared integration, and derived status SHALL be identifiable as derived rather than a second authority.

#### Scenario: Assignment changes without a scope change
- **WHEN** an existing work item is assigned to another executor
- **THEN** its operational record can change without a new Proposal or a manual rewrite of formal planning

#### Scenario: Native progress disagrees with delivery evidence
- **WHEN** a local planning checkbox or derived progress summary disagrees with the linked work's delivery evidence
- **THEN** the discrepancy is exposed and cannot serve as proof of completion

### Requirement: Keep planning and delivery PRs accountable

Each PR SHALL identify its work Issue, scope, applicable plan or no-Spec rationale, changed artifacts, and required verification and review evidence. Planning/design and implementation SHALL remain separately assignable work even when they contribute to the same change. A PR SHALL NOT claim to deliver sibling or parent scope outside its evidence. Material plan changes discovered during implementation SHALL return to the responsible planning owner under [work intake and planning](../work-intake-and-planning/spec.md).

#### Scenario: Proposal PR merges
- **WHEN** a PR delivers only an approved Proposal
- **THEN** that Proposal contribution is recorded as accepted while the continuous planning Task remains open until its full assigned planning and handoff outcome is delivered, and the parent request remains open for overall delivery

#### Scenario: One task has multiple delivery PRs
- **WHEN** scoped work is delivered through more than one PR
- **THEN** the Issue can identify their respective contributions and remains incomplete until its applicable acceptance evidence covers the full assigned scope

### Requirement: Completion requires the right kind of evidence

The workflow SHALL distinguish implemented delivery, research completion and cancellation. Closing an Issue as completed SHALL require the evidence appropriate to its assigned outcome and resolution of applicable review findings. Missing required evidence or inconsistent status SHALL be reported as an error. Cancellation SHALL carry a reason and SHALL NOT count as delivered requirements. A parent SHALL NOT qualify as complete by counting unsupported child closures.

Delivery evidence SHALL match the assigned outcome and agreed destination in the existing Issue/plan context. A Task assigned a staging outcome can complete that outcome, but intermediate merges SHALL NOT establish required final integration or parent delivery. Squash delivery SHALL be traceable through the final PR and resulting merge commit without requiring intermediate commit ancestry. Unresolved final-destination context SHALL be clarified before overall completion, not replaced by a blanket ban on feature branches.

#### Scenario: Closed development task lacks delivery evidence
- **WHEN** an Issue is marked completed but its required deliverable or verification record is absent
- **THEN** validation reports an unsupported completion and parent completion cannot rely on it

#### Scenario: Research Issue closes on findings
- **WHEN** a Spike provides its scoped findings, limits and required review evidence
- **THEN** it can close as research without pretending that the recommended implementation exists

#### Scenario: Scope is cancelled
- **WHEN** work is cancelled rather than delivered
- **THEN** its reason remains traceable and parent review assesses any remaining requirement gap instead of counting cancellation as delivery

#### Scenario: Staged delivery is mistaken for final integration
- **WHEN** work requires an agreed final destination but evidence shows only intermediate feature-branch merges
- **THEN** final delivery remains incomplete even if stage-specific Tasks legitimately completed their assigned outcomes

### Requirement: Follow-ups preserve historical delivery records

New work after a change is archived SHALL reference relevant current Specs and prior Issues or delivery records without rewriting the archived plan to register new tickets. Formal agreement changes SHALL use a new OpenSpec change; implementation-only follow-ups SHALL provide the reviewed boundary rationale. Active-plan additions SHALL follow the existing change owner's plan update path.

#### Scenario: New bug appears after archive
- **WHEN** a follow-up restores behavior of an archived delivery
- **THEN** its new Issue and PR carry the references to the prior work and current basis, without adding the new ticket to the archived task plan
