# Traceability and Context Goals Specification

## Purpose

L1: provide a file-based traceability and retrieval layer for specification-driven
work. The toolkit makes relevant requirements, changes and evidence discoverable
and mechanically checkable without owning the user's way of working.

## Requirements

### Requirement: Work is traceable and proportionate
The toolkit SHALL represent work-to-requirement, change-to-current-Spec and
delivery-to-evidence relationships using explicit references. It SHALL NOT require
a new Proposal for an implementation-only follow-up, or assign agents and task
counts. [Work context](../work-intake-and-planning/spec.md) and
[GitHub traceability](../github-work-traceability/spec.md) define the L2 capabilities.

#### Scenario: A different executor takes over
- **WHEN** an executor selects a work record
- **THEN** its relevant original requirements, decisions, fixed tasks and actual
  contributions are discoverable without reconstructing the whole project history.

### Requirement: Shared facts support human and machine judgment
Mechanical checks SHALL report shape, reference, state, freshness and comparison
facts. Bounded context SHALL preserve sources and gaps for semantic judgment.
[Validation and context](../review-and-validation/spec.md) defines these behaviors.

#### Scenario: Complete records contain a wrong conclusion
- **WHEN** a structurally complete record misstates the meaning of its source
- **THEN** structural success does not claim semantic acceptance or merge permission.

### Requirement: Current requirements remain a usable baseline
Native current Specs SHALL remain distinct from active and archived change
artifacts. The toolkit SHALL verify the selected synchronization inputs and expose
incomplete or inconsistent updates. See [baseline verification](../specification-baseline/spec.md).

#### Scenario: A later feature builds on earlier changes
- **WHEN** work uses the current project definition
- **THEN** it references the integrated current Specs rather than treating all old
  proposals as equally current or reconstructing their accumulated meaning.

### Requirement: Reuse supports a narrow toolkit boundary
The toolkit SHALL reuse pinned OpenSpec artifact/parsing/synchronization behavior
and provide operation-oriented guidance. Development, testing, review methods,
roles, dispatch, communication and approval execution SHALL remain outside its
product capability. [Adoption](../project-workflow-adoption/spec.md) and
[policy boundaries](../workflow-self-evolution/spec.md) describe integration.

#### Scenario: A consumer already has a BOT workflow
- **WHEN** it installs the toolkit
- **THEN** its existing workflow remains in control and the toolkit supplies record,
  retrieval and validation operations without a competing work procedure.
