## ADDED Requirements

### Requirement: Prerequisites select whole work or delivered contributions

A declared prerequisite SHALL distinguish an actual Issue from a PR using acquired GitHub identity, not identifier syntax or invented Issue state. An Issue prerequisite SHALL retain whole-assigned-outcome completion checks. A PR prerequisite SHALL verify its actual merged delivery, fixed reviewed scope, applicable historical policy or supported initial-bootstrap verification, canonical work/task associations and required source evidence without requiring its owning continuous planning Issue to close. Missing or stale evidence SHALL remain incomplete or invalid.

Context SHALL expose which contribution the dependent work relies on, the owning Issue's remaining scope and the semantic need to judge sufficiency. A merged PR SHALL not prove that all its parent work is complete, nor that an unrelated contribution satisfies the dependency. Current acquisition limits, cycle detection and actual destination/squash semantics SHALL apply equally to both kinds. A compound cycle through an owning Issue and its PR SHALL not be hidden by changing record kind.

#### Scenario: One planning contribution is ready before the rest
- **WHEN** one independently accepted planning PR is delivered while its continuous planning Issue still owns other plans
- **THEN** work depending on that exact PR can be verified without fake Issue closure or an extra wrapper Architecture Task

#### Scenario: The whole planning result is required
- **WHEN** a dependent work item declares the planning Issue itself as prerequisite
- **THEN** a partial merged PR does not satisfy the incomplete Issue's whole assigned outcome

#### Scenario: PR identity or evidence is wrong
- **WHEN** a PR is merely closed without merge, lacks review, maps unrelated task scope, or carries stale head/base or unsupported historical evidence
- **THEN** it does not qualify as a verified contribution and the reviewer receives the specific missing or conflicting sources
