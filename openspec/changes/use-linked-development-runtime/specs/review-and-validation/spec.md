## ADDED Requirements

### Requirement: Linked runtime does not waive consumer work verification

Toolkit self-trace exclusion SHALL leave target repository binding, requirement/task associations, source permissions and fixity, destination pre-change policy, required human decisions, independent review and consumer test obligations intact. Toolkit asset loading SHALL not falsely attest that mutable local contracts are the exact fixed policy cited by the consumer. Accepted policy content SHALL still be obtained from its actual fixed source under current read permissions; unresolved authority SHALL remain unavailable rather than be replaced by candidate or mutable toolkit content.

The linked-runtime notice SHALL be concise and separate from consumer diagnostics. It SHALL not force repeated self-audits, additional-provider review or a new approval gate. Developing a change to the toolkit SHALL still require the relevant tests and independent review of that change; excluding runtime self-trace is not permission to omit product development verification.

#### Scenario: Linked tool checks a broken consumer record
- **WHEN** linked development is selected and the consumer has a broken requirement reference, missing review or invalid destination policy
- **THEN** the relevant consumer diagnostic still fails or remains incomplete; skipping toolkit trace does not hide it

#### Scenario: Local contract bytes differ from fixed accepted policy
- **WHEN** the linked toolkit contains mutable local guidance but the consumer references an immutable accepted policy source
- **THEN** checking uses the fixed permitted source for that authority or reports it unavailable, without running a toolkit integrity check or relabeling local bytes as the fixed source
