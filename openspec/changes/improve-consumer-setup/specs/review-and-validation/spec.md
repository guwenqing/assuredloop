## ADDED Requirements

### Requirement: Consumer review routing is explicit and proportionate

Setup SHALL let a consuming project choose its primary review tool and whether additional independent review is required. For new setup, the default SHALL be one independent review within the selected primary tool ecosystem; a separate provider or model family SHALL not be required merely to obtain independence. If several tools are selected and no primary choice is supplied, setup guidance SHALL obtain the choice rather than silently selecting one. Eligible models remain explicit consumer choices under the existing allowlist/exclusion rules, not hardcoded framework model names.

The recorded policy SHALL distinguish ordinary primary review from explicitly requested or required additional review. Applicable checks SHALL expose route obligations, tool/model/session declarations, conflicts and missing evidence for the exact candidate; declarations SHALL not prove real independence or actual execution. A reviewer in the same ecosystem SHALL qualify when its independent assessment and accepted policy satisfy the requirement. An additional review SHALL not substitute for a required primary review or create a permanent extra gate by being requested once.

Existing accepted consumer configurations and historical reviews SHALL retain their original meaning until an explicit reviewed upgrade; new routing fields SHALL not govern their own adoption. Routing support SHALL provide guidance and validation/context, not automatic provider invocation, credentials, session discovery or hosted CI.

#### Scenario: Project uses one selected tool
- **WHEN** a new consumer selects a primary tool and eligible models without asking for a second review
- **THEN** setup records same-tool independent primary review and additional review only on explicit request, without prescribing Astra or Claude

#### Scenario: Project requests a stricter policy
- **WHEN** the owner accepts a policy requiring additional review
- **THEN** the reviewer packet/check exposes both obligations and missing required review declarations while preserving the original producer/reviewer separation

#### Scenario: Same model is used by a different reviewer
- **WHEN** an eligible reviewer uses the same underlying model/tool as the producer in an independently evidenced session
- **THEN** model equality alone does not invalidate independence or require another provider

#### Scenario: Legacy review lacks routing declarations
- **WHEN** an existing consumer or historical report predates explicit routing
- **THEN** it is assessed under its actual old policy without invented tool/role values or retroactive rejection solely for new fields
