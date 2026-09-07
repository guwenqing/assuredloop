## Purpose

Use formal checks to expose missing or inconsistent evidence and give independent reviewers a focused basis for judgment. This L2 capability supports the shared [L1 goal](../workflow-goals/spec.md#requirement-shared-facts-support-human-and-machine-judgment). Its requirements and scenarios below define L3 behavior.

## ADDED Requirements

### Requirement: Separate mechanical findings from semantic judgment

Mechanical validation SHALL check applicable record presence, structured fields, reference resolution, revision identity, ticket status consistency and required evidence. It SHALL identify what was checked, what failed and what could not be inspected. It SHALL NOT claim that formal completeness proves semantic correctness, adequate requirements, safe implementation-only handling or actual delivery. Unknown or unavailable evidence SHALL NOT be silently reported as a pass.

#### Scenario: Structurally complete but misleading change
- **WHEN** all required fields exist but the implementation contradicts an accepted requirement
- **THEN** mechanical success does not approve the work, and independent review assesses the actual change against that requirement

#### Scenario: Referenced record is unavailable
- **WHEN** a required Issue, artifact revision or evidence record cannot be accessed
- **THEN** the check reports the unavailable input and prevents an unqualified completion claim based on that missing evidence

### Requirement: Build focused review context with visible limits

Review preparation SHALL gather the original request, scoped Issue, applicable requirements and decisions, actual changes, relevant test/evidence records, known impacts and unresolved questions. It SHALL identify the revision under review and missing or excluded context, and allow the reviewer to request a broader scope. Context selection SHALL NOT substitute the producer's conclusion for source evidence or conceal an omitted dependency. No-Spec and implementation-only claims SHALL include their basis for review.

#### Scenario: Focused packet omits a needed dependency
- **WHEN** the reviewer finds that an affected contract lies outside the supplied context
- **THEN** the reviewer can expand the context and withhold a conclusion until the missing basis is available

#### Scenario: No-Spec rationale is unsupported
- **WHEN** a task claims no applicable Spec but changes behavior covered by one
- **THEN** review challenges the exemption and returns work to the appropriate requirement/plan path

### Requirement: Keep review independent and revision-specific

Workers SHALL obtain internal review by a different agent/session at the configured Sol/Astra level before submission. A producer SHALL NOT independently accept its own output. Review SHALL identify the examined revision, scope and unresolved findings; material changes after review SHALL receive appropriate renewed review. Fable SHALL NOT be invoked without explicit owner request. In this initial release, checks and review handoffs SHALL be explicitly executed and recorded; automatic external-review setup, CI jobs and enforced automatic gates SHALL remain a later Proposal.

#### Scenario: Previous version passed
- **WHEN** a producer changes reviewed content after a PASS
- **THEN** the previous result remains tied to its old revision and is not presented as acceptance of the changed content

#### Scenario: Review agent stops early
- **WHEN** a reviewer is interrupted or returns no completed result
- **THEN** review remains incomplete and cannot be replaced with the producer's self-check

#### Scenario: No automation is installed
- **WHEN** native checks and an independent review are run manually for a PR
- **THEN** the results are recorded as explicit manual execution, not as configured automatic external review or CI enforcement

### Requirement: Verify code with independent test-first evidence

Executable work, including workflow scripts and validators, SHALL use applicable unit and functional tests with test authorship independent of the implementation producer. The work SHALL record a genuine failing test before the corresponding implementation and a successful rerun afterwards, with relevant controlled-fault checks to assess whether verification detects intended failures. Work that is not executable SHALL use appropriate artifact validation and independent review rather than fabricated RED/GREEN evidence. The evidence SHALL state applicability and limits.

#### Scenario: New validator rule is implemented
- **WHEN** executable validation behavior is added
- **THEN** evidence includes an independently authored case exposing the missing behavior before implementation, a passing rerun after implementation, and a relevant deliberately invalid input or controlled fault that the checks reject

#### Scenario: Planning text changes
- **WHEN** work changes only a Proposal or Spec without executable behavior
- **THEN** native structural checks and independent semantic review are used without claiming that unimplemented runtime scenarios have passed

### Requirement: Submission follows evidence and human-decision boundaries

The responsible owner SHALL resolve applicable review findings, verify required checks and obtain required human approval before merge or claiming delivery. By default, new or materially changed Proposals SHALL require human acceptance before their changes merge; implementation within accepted scope SHALL NOT require a new personal approval merely because it is a separate PR. A semantic deviation SHALL return to the affected agreement. AI SHALL perform authorized merge and follow-through operations once these obligations are satisfied, without treating open findings, pending checks or ticket closure as success.

#### Scenario: Agreed implementation is ready
- **WHEN** scoped implementation satisfies its applicable checks and independent review without changing accepted agreement
- **THEN** the AI owner can complete authorized submission and merge without an invented extra personal-approval category

#### Scenario: Proposal boundary is crossed
- **WHEN** review finds that delivery changes the accepted agreement
- **THEN** the affected Proposal decision returns to the human rather than being waived by passing structural checks

### Requirement: Evidence-backed Issue completion includes semantic review

Review SHALL assess actual code, artifacts and observed behavior against the Issue's assigned outcome. It SHALL distinguish research findings and cancellation from implemented delivery. Missing formal evidence SHALL be reported mechanically; semantically insufficient evidence SHALL be reported by review. Neither unsupported case SHALL qualify completion or parent acceptance under [GitHub work traceability](../github-work-traceability/spec.md).

#### Scenario: Evidence file exists but proves the wrong behavior
- **WHEN** a completed Issue points to a test report unrelated to its acceptance condition
- **THEN** review rejects the completion claim despite the evidence link resolving correctly
