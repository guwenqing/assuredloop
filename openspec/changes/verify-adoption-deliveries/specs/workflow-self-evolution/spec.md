## ADDED Requirements

### Requirement: Later verification can identify a genuine first manual bootstrap

Later prerequisite or closeout assessment SHALL support an explicitly tagged verification of an actually delivered initial manual bootstrap. It SHALL retain the original PR, reviewed head, actual delivery, pre-change base and source evidence. Verified absence of both configuration and activation at that base SHALL be distinct from inaccessible, malformed, suspended, unsupported or unaccepted existing policy. It SHALL NOT select candidate policy as the authority that governed its own first merge or grant a current merge exemption.

The verification SHALL retain the original fixed-policy and Proposal acceptance sources, independent review identity/scope and delivery evidence. It SHALL identify the later verifier and the policy under which that later verification is performed, separately from the absent historical policy. Shape, source presence and different session strings SHALL not prove genuine authority or semantic acceptance. Original reports SHALL remain unchanged; retrospective verification SHALL not claim it ran before the original delivery.

#### Scenario: Initial manual delivery has complete sources
- **WHEN** a merged first-bootstrap PR has confirmed absent pre-change configuration/activation, consistent fixed-policy and Proposal acceptance references, independent review sources and assigned delivery coverage
- **THEN** later verification exposes the original sources and observed facts as an eligible initial-bootstrap prerequisite assessment, with explicit semantic review obligations and without invented historical policy digests

#### Scenario: Missing policy is not confirmed absence
- **WHEN** a historical base cannot be read or contains invalid, unsupported or suspended policy instead of a genuinely absent configuration and activation
- **THEN** the special initial-bootstrap path is unavailable or invalid, not a fallback that converts the missing authority into acceptance

#### Scenario: Acceptance or delivery is insufficient
- **WHEN** evidence establishes only Proposal scope, a different fixed policy, same-session review, an unmerged PR or incomplete assigned task coverage
- **THEN** formal discrepancies are reported and semantic review withholds prerequisite acceptance; a tagged record alone cannot repair them

#### Scenario: Current candidate claims the initial exception
- **WHEN** an unmerged candidate supplies the tag or selects its own new policy to seek approval
- **THEN** later-delivery verification supplies no merge authority and existing current pre-change obligations remain in force
