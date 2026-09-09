## Purpose

Keep requests, formal planning and actual delivery connected while using GitHub for work collaboration. This L2 capability supports the shared [L1 goal](../workflow-goals/spec.md#requirement-work-is-traceable-and-proportionate). Its requirements and scenarios below define L3 behavior.

## ADDED Requirements

### Requirement: Resolve the work basis from an Issue or PR

The workflow SHALL let a worker or reviewer starting from an Issue or PR resolve the originating request, responsible work item, relevant current specification or active change, and applicable requirement and decision references. Legitimate absence of a relevant Spec SHALL be represented explicitly with a reason. Parent membership alone SHALL NOT count as requirement-level traceability. Review records SHALL identify the revision and work context they assessed.

Machine-authoritative basis and plan references SHALL carry repository, immutable revision and normalized path as structured fields, with the applicable heading or task identifiers, rather than require parsing arbitrary display URLs. JSON `activity` SHALL be the single work-guidance selector, checked against the formal category under the requirement below rather than overridden by another selector.

#### Scenario: Reviewer starts at a delivery PR
- **WHEN** a reviewer follows a PR's work reference
- **THEN** the reviewer can reach the scoped Issue, original request, applicable requirements and decisions, and evidence for that delivery without needing the author's conversation history

#### Scenario: Epic link hides missing requirement context
- **WHEN** an implementation Issue links its parent Epic but omits the required scoped basis
- **THEN** the missing basis is reported rather than treating the parent link as sufficient

### Requirement: Work categories and activities are formally consistent

Configured category labels SHALL distinguish Request, Epic, Architecture Task, Task, Bug and Spike. Their default names SHALL be `type:request`, `type:epic`, `type:architecture-task`, `type:task`, `type:bug` and `type:spike`; consumers SHALL be able to map different label names without changing tool source. All mappings SHALL be present, nonempty and case-insensitively distinct. The former `discipline` field and display-label mechanism SHALL be removed, not retained as optional behavior.

Routed executable Issues SHALL carry exactly one configured category and its compatible activity: Request/triage, Architecture Task/plan or closeout, Task/adopt or deliver or review, Bug/deliver, Spike/research. Unrelated labels SHALL NOT count as categories. A rough incoming request before triage MAY omit its category and context; an Epic serving only as a container MAY omit executable context. Neither exception SHALL waive context for another routed category or permit an incompatible executable record. Missing, multiple or incompatible category/activity declarations SHALL be errors, not display warnings. Context tooling SHALL expose the labels, resolved category, activity, applicable rule and discrepancies to review; it SHALL NOT certify that a valid declaration truthfully describes the work.

#### Scenario: Planning and closeout are distinct from ordinary delivery
- **WHEN** independently assigned work develops a formal design or performs aggregate change closeout
- **THEN** its category is Architecture Task and its activity is respectively plan or closeout, regardless of who performs it

#### Scenario: Declared category contradicts the selected work
- **WHEN** an Issue declares Task/plan, Architecture Task/deliver, multiple configured categories, or a routed activity without its required category
- **THEN** validation reports a classification error and review receives the conflicting declarations rather than an unqualified valid result

#### Scenario: A Bug and a documentation delivery use existing guidance
- **WHEN** one Issue restores accepted behavior and another implements accepted documentation requirements
- **THEN** Bug/deliver and Task/deliver remain valid, without creating architecture work solely from the executor's title or file type

#### Scenario: Intake or a container has no executable record
- **WHEN** an unrouted incoming request or non-executable Epic has no Workflow context
- **THEN** its stage-appropriate absence is allowed, but an Architecture Task missing context or an Epic carrying a deliver activity is not exempt

#### Scenario: Consumer labels differ from the defaults
- **WHEN** a consumer maps Architecture Task and the other categories to distinct custom names
- **THEN** acquisition and validation apply the same category/activity rules through those mappings, while conflicting mapped names are rejected

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

Delivery evidence SHALL match the assigned outcome and agreed destination in the existing Issue/plan context. A Task assigned a staging outcome can complete that outcome, but intermediate merges SHALL NOT establish required final integration or parent delivery. Squash delivery SHALL be traceable through the final PR and resulting merge commit without requiring intermediate commit ancestry. Unresolved final-destination context SHALL be clarified before overall completion.

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
