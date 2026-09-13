# Specification Baseline Specification

## Purpose

L2: verify that accepted changes are reflected in the current project definition,
with source-specific context rather than reconstruction from all old proposals.
Supports [current requirements](../workflow-goals/spec.md#requirement-current-requirements-remain-a-usable-baseline).

## Requirements

### Requirement: Keep current requirements distinct from change history
Native specs/ SHALL hold the current integrated definition. Active/archived change
artifacts SHALL retain their change/history identity. Acceptance of a Proposal
alone SHALL NOT assert implementation or complete baseline synchronization.

#### Scenario: Reader asks what the project currently requires
- **WHEN** the reader selects the baseline
- **THEN** current requirements are available without composing every archived delta.

### Requirement: Reconcile affected requirements without rewriting history
Synchronization verification SHALL compare the selected accepted whole delta,
base and candidate through pinned native OpenSpec behavior. It SHALL preserve
unaffected requirements, handle additions/modifications/renames/removals and expose
broken current inbound references. Historical references SHALL remain fixed.

#### Scenario: Requirement changes but an old guarantee remains
- **WHEN** a modified requirement drops an unaffected scenario or leaves a broken link
- **THEN** the comparison/context exposes the discrepancy for assessment.

### Requirement: Integrated verification uses explicit source selectors
The current closeout adapter SHALL select one assigned native change and fixed
accepted task revision per PR, plus its candidate-head acceptance manifest.
Ambiguous/mismatched selectors SHALL fail. Aggregate work MAY cover several
changes without claiming unfinished contributions complete. This record constraint
SHALL NOT impose an architect role, ticket count or approval sequence.

#### Scenario: Child Tasks are closed but one requirement was not integrated
- **WHEN** state claims completion without mapped synchronized delivery
- **THEN** the check reports the gap rather than trusting state alone.

#### Scenario: Accepted native change declares skip_specs
- **WHEN** the accepted metadata supplies a valid no-spec change
- **THEN** the complete baseline path inventory and raw bytes must remain identical,
  without contradictory delta or retirement; native validation still applies.

### Requirement: Pilot readable goal-to-behavior references
The framework's Specs SHALL express readable L1 goals, L2 capabilities and L3
requirements/scenarios using ordinary native files and links. The toolkit SHALL
NOT claim a generalized enforced layer graph that it does not implement.

#### Scenario: Reviewer traces behavior to purpose
- **WHEN** a concrete behavior is examined
- **THEN** its linked purpose is available without another authoritative database.

### Requirement: Formal files remain the reconstructible authority
Formal files and fixed Git sources SHALL remain authoritative. Optional caches
SHALL NOT contain unique truth needed by a fresh verifier. Ordinary notes under
.assuredloop/notes/ MAY be obsolete informal context, not accepted requirements.

#### Scenario: Fresh reviewer has no local database
- **WHEN** it has access to the declared source repositories and records
- **THEN** relevant context and mechanical checks can be reconstructed from them.

### Requirement: Closeout preserves acceptance evidence fixity
Manifest records SHALL identify source representation and SHA-256: raw Git blob
bytes or UTF-8 decoded GitHub comment body without normalization. Per-delivery
base_ref/base_sha/policy_ref/policy_mode SHALL describe that delivery, separately
from closeout_policy_ref. Missing sources/audit values SHALL remain explicit.

#### Scenario: An accepted evidence comment changes later
- **WHEN** its current source bytes no longer match the recorded digest
- **THEN** verification reports the mismatch without pretending to recover lost
  bytes or authenticate the author from hash equality.

#### Scenario: Initial delivery had no prior policy
- **WHEN** later source-backed initialBootstrapVerification proves the distinct
  original absence/delivery facts under an invoking accepted policy
- **THEN** original null policy history remains distinct from later verification;
  ordinary missing history cannot borrow this exception.
