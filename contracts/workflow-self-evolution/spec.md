# Policy and Evidence Boundaries Specification

## Purpose

L2: bind mechanical assessment to its actual consumer/destination policy while
keeping policy checks separate from workflow execution. Supports
[shared facts](../workflow-goals/spec.md#requirement-shared-facts-support-human-and-machine-judgment).
The historical path name does not require self-dogfooding or a self-change exercise.

## Requirements

### Requirement: Bootstrap has an explicit activation boundary
Package/Skill presence SHALL NOT assert accepted policy or activation. Before an
activation pointer exists, available bootstrap assessment SHALL require fixed
policy_ref, policy_acceptance, proposal_acceptance and authorized_by sources.
Declarations/source presence SHALL NOT authenticate acceptance.

#### Scenario: Only planning artifacts exist
- **WHEN** config or required acceptance sources are unavailable
- **THEN** policy comparison remains unavailable; it cannot be fabricated from
  the candidate's own declaration.

### Requirement: Policy assessment uses destination pre-change state
PR assessment SHALL use the actual current destination base, not candidate config,
an arbitrary record ref or stale merge-base. Retargeting/base/policy changes SHALL
require applicable fresh comparison. Feature-branch delivery SHALL remain allowed;
its assessment SHALL NOT authorize another destination.

#### Scenario: Work stages through a feature branch
- **WHEN** a PR targets that branch
- **THEN** its accepted destination policy is assessed; a later main PR uses main's
  actual policy without a separate mandated staging-outcome workflow.

#### Scenario: Candidate edits its own activation pointer
- **WHEN** a PR changes policy
- **THEN** the candidate pointer cannot select the authority for its own assessment.

### Requirement: Consumer constraints are optional explicit inputs
New review configuration SHALL accept an empty constraint object or context budget
alone. Existing explicit model/depth/routing constraints SHALL remain enforceable.
The toolkit SHALL NOT infer a provider from a model or impose such choices as a
default. It SHALL NOT perform approvals or reviewer dispatch.

#### Scenario: New consumer already has a review process
- **WHEN** its configuration contains only context budgeting
- **THEN** valid revision-specific evidence need not invent model/depth fields or
  an additional review layer.

### Requirement: Historical assessment is not current authority
Historical reconstruction SHALL retain original fixed base/policy/source values.
Current access permissions SHALL still constrain retrieval. Unsupported historical
formats or inaccessible sources SHALL remain explicit verification limits, not
proof of corrupt evidence or automatically revoked past acceptance.

#### Scenario: Destination advances after delivery
- **WHEN** a delivered PR is checked later
- **THEN** its evidence is compared to its recorded historical assessment while
  current destination authority remains separate.

### Requirement: Historical decisions remain distinct from execution
Existing typed selfChangeDecision records SHALL remain readable as decisions.
They SHALL NOT establish executed work or become mandatory adoption/self-change
exercises. The consuming user controls its workflow and approval requirements.

#### Scenario: A retained decision chose an earlier demonstration
- **WHEN** a fresh context packet includes that source
- **THEN** it remains historical context, not a command to repeat the exercise.
