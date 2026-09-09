const bytes = (value) => Buffer.from(value, 'utf8');

export const repository = 'example/consumer';
export const baseRevision = '1111111111111111111111111111111111111111';
export const headRevision = '2222222222222222222222222222222222222222';
export const deltaRevision = '3333333333333333333333333333333333333333';
export const staleRevision = '4444444444444444444444444444444444444444';
export const openspecRoot = 'openspec';
export const change = 'workflow-refresh';
export const capability = 'audit';
export const retirementCapability = 'retireable-audit';
export const unrelatedCapability = 'unrelated-audit';
export const customRetirementSchema = 'retirement-schema';

export const canonicalPath = `${openspecRoot}/specs/${capability}/spec.md`;
export const deltaPath = `${openspecRoot}/changes/${change}/specs/${capability}/spec.md`;
export const retirementCanonicalPath = `${openspecRoot}/specs/${retirementCapability}/spec.md`;
export const unrelatedCanonicalPath = `${openspecRoot}/specs/${unrelatedCapability}/spec.md`;
export const retirementDeltaPath = `${openspecRoot}/changes/${change}/specs/${retirementCapability}/spec.md`;
export const metadataPath = `${openspecRoot}/changes/${change}/.openspec.yaml`;
export const customSchemaPath = `${openspecRoot}/schemas/${customRetirementSchema}/schema.yaml`;
export const currentInboundPath = 'docs/current-links.md';
export const historicalInboundPath = 'history/immutable-review.md';
export const historyRelativeInboundPath = 'history/current-review.md';
export const currentReferenceInboundPath = 'docs/current-reference-links.md';
export const linkExamplesPath = 'docs/link-examples.md';

export const baseSpec = bytes(`## Purpose
This capability keeps account audit behavior readable, reviewable, and stable while accepted changes move through delivery.

## Requirements
### Requirement: Record audit changes
The system SHALL retain every account audit change with its original bytes.

#### Scenario: Record an update
- **WHEN** an account is updated
- **THEN** the original change is stored.

#### Scenario: Preserve a Unicode note
- **WHEN** a note contains Unicode
- **THEN** the original code points remain available.

### Requirement: Audit links
The system SHALL keep current links to audit requirements resolvable.

#### Scenario: Resolve an audit link
- **WHEN** a reviewer follows the current audit link
- **THEN** the linked requirement is available.

### Requirement: Retire legacy audit
The system SHALL retain the legacy audit export only during migration.

#### Scenario: Finish migration
- **WHEN** migration completes
- **THEN** the legacy export can be retired.

### Requirement: Preserve unrelated contract
The system SHALL preserve unrelated audit behavior during this change.

#### Scenario: Keep unrelated behavior
- **WHEN** the synchronization is applied
- **THEN** unrelated behavior remains available.
`);

export const deltaSpec = bytes(`## ADDED Requirements
### Requirement: Export audit report
The system SHALL provide a reviewable audit report that keeps source bytes unchanged.

#### Scenario: Export a report
- **WHEN** a reviewer requests an export
- **THEN** the report is generated.

## MODIFIED Requirements
### Requirement: Record audit changes
The system SHALL retain every account audit change with its original bytes and review metadata.

#### Scenario: Record an update
- **WHEN** an account is updated
- **THEN** the original change is stored.

#### Scenario: Preserve a Unicode note
- **WHEN** a note contains Unicode
- **THEN** the original code points remain available.

## REMOVED Requirements
### Requirement: Retire legacy audit

## RENAMED Requirements
- FROM: \`### Requirement: Audit links\`
- TO: \`### Requirement: Stable audit links\`
`);

export const candidateSpec = bytes(`## Purpose
This capability keeps account audit behavior readable, reviewable, and stable while accepted changes move through delivery.

## Requirements

### Requirement: Record audit changes
The system SHALL retain every account audit change with its original bytes and review metadata.

#### Scenario: Record an update
- **WHEN** an account is updated
- **THEN** the original change is stored.

#### Scenario: Preserve a Unicode note
- **WHEN** a note contains Unicode
- **THEN** the original code points remain available.

### Requirement: Stable audit links
The system SHALL keep current links to audit requirements resolvable.

#### Scenario: Resolve an audit link
- **WHEN** a reviewer follows the current audit link
- **THEN** the linked requirement is available.

### Requirement: Preserve unrelated contract
The system SHALL preserve unrelated audit behavior during this change.

#### Scenario: Keep unrelated behavior
- **WHEN** the synchronization is applied
- **THEN** unrelated behavior remains available.

### Requirement: Export audit report
The system SHALL provide a reviewable audit report that keeps source bytes unchanged.

#### Scenario: Export a report
- **WHEN** a reviewer requests an export
- **THEN** the report is generated.
`);

export const retirementBaseSpec = bytes(`## Purpose
This capability is retained only until its final audit requirement is deliberately retired.

## Requirements
### Requirement: Retireable audit
The system SHALL retain the temporary audit capability until its owner retires it.

#### Scenario: Retire the temporary capability
- **WHEN** the owner retires the temporary capability
- **THEN** the capability is removed from the current specification set.
`);

export const retirementBaseSpecWithUnaccountedContent = bytes(`## Purpose
This capability is retained only until its final audit requirement is deliberately retired.

## Requirements
### Requirement: Retireable audit
The system SHALL retain the temporary audit capability until its owner retires it.

#### Scenario: Retire the temporary capability
- **WHEN** the owner retires the temporary capability
- **THEN** the capability is removed from the current specification set.

## Notes
This authored note is outside the native merge vocabulary.
`);

export const retirementMalformedBaseSpec = bytes(`## Requirements
### Requirement: Retireable audit
The system SHALL retain the temporary audit capability until its owner retires it.

#### Scenario: Retire the temporary capability
- **WHEN** the owner retires the temporary capability
- **THEN** the capability is removed from the current specification set.
`);

export const retirementEmptyBaseSpec = bytes(`## Purpose
This capability has already lost its requirements in an earlier revision.

## Requirements
`);

export const retirementDeltaSpec = bytes(`## REMOVED Requirements
### Requirement: Retireable audit
`);

export const retirementMetadata = bytes(`schema: spec-driven
retire_capabilities: true
`);

export const retirementMetadataMissingMarker = bytes(`schema: spec-driven
`);

export const retirementMetadataInvalidSchema = bytes(`schema: not-a-real-schema
retire_capabilities: true
`);

export const retirementMetadataInvalidMarker = bytes(`schema: spec-driven
retire_capabilities: yes
`);

export const retirementMetadataCustomSchema = bytes(`schema: ${customRetirementSchema}
retire_capabilities: true
`);

export const customRetirementSchemaYaml = bytes(`name: ${customRetirementSchema}
version: 1
description: A bounded test schema for capability retirement.
artifacts:
  - id: specs
    generates: specs/**/*.md
    description: Native specification artifacts.
    template: spec.md
`);

export const retirementEmptyDeltaSpec = bytes(`## ADDED Requirements
`);

export const unrelatedSpec = bytes(`## Purpose
This unrelated capability remains part of the current contract during retirement.

## Requirements
### Requirement: Preserve unrelated audit
The system SHALL preserve this unrelated capability.

#### Scenario: Preserve the unrelated capability
- **WHEN** another capability is retired
- **THEN** this capability remains available.
`);

export const currentInboundOld = bytes(`The current contract is documented at [audit links](../openspec/specs/audit/spec.md#requirement-audit-links).
`);

export const currentInboundRepaired = bytes(`The current contract is documented at [audit links](../openspec/specs/audit/spec.md#requirement-stable-audit-links).
`);

export const currentReferenceInboundOld = bytes(`The current contract is documented at [audit links][audit-contract].

[audit-contract]: ../openspec/specs/audit/spec.md#requirement-audit-links
`);

export const currentReferenceInboundRepaired = bytes(`The current contract is documented at [audit links][audit-contract].

[audit-contract]: ../openspec/specs/audit/spec.md#requirement-stable-audit-links
`);

export const historicalInbound = bytes(`The archived review used [audit links](https://github.com/example/consumer/blob/${baseRevision}/openspec/specs/audit/spec.md#requirement-audit-links).
`);

export const historyRelativeInboundOld = bytes(`A current review under a history-named directory uses [audit links](../openspec/specs/audit/spec.md#requirement-audit-links).
`);

export const historyRelativeInboundRepaired = bytes(`A current review under a history-named directory uses [audit links](../openspec/specs/audit/spec.md#requirement-stable-audit-links).
`);

export const linkExamples = bytes(`These examples are documentation, not current inbound references.

\`\`\`markdown
[stale fenced example](../openspec/specs/audit/spec.md#requirement-audit-links)
\`\`\`

Use \`[stale inline example](../openspec/specs/audit/spec.md#requirement-audit-links)\` as literal text.
`);

export function baseFiles() {
  return [
    { path: canonicalPath, content: baseSpec },
    { path: currentInboundPath, content: currentInboundOld },
    { path: currentReferenceInboundPath, content: currentReferenceInboundOld },
    { path: linkExamplesPath, content: linkExamples },
    { path: historicalInboundPath, content: historicalInbound },
    { path: historyRelativeInboundPath, content: historyRelativeInboundOld },
  ];
}

export function deltaFiles() {
  return [{ path: deltaPath, content: deltaSpec }];
}

export function retirementBaseFiles({ content = retirementBaseSpec } = {}) {
  return [
    { path: retirementCanonicalPath, content },
    { path: unrelatedCanonicalPath, content: unrelatedSpec },
  ];
}

export function retirementCandidateFiles({ includeRetired = false, retiredContent = retirementBaseSpec } = {}) {
  return [
    ...(includeRetired ? [{ path: retirementCanonicalPath, content: retiredContent }] : []),
    { path: unrelatedCanonicalPath, content: unrelatedSpec },
  ];
}

export function retirementDeltaFiles({ delta = retirementDeltaSpec, metadata = retirementMetadata, schema = null } = {}) {
  return [
    { path: retirementDeltaPath, content: delta },
    ...(metadata === null ? [] : [{ path: metadataPath, content: metadata }]),
    ...(schema === null ? [] : [{ path: customSchemaPath, content: schema }]),
  ];
}

export function retirementSnapshot(overrides = {}) {
  return {
    repository,
    baseRevision,
    headRevision,
    deltaRevision,
    openspecRoot,
    change,
    baseFiles: retirementBaseFiles(),
    candidateFiles: retirementCandidateFiles(),
    deltaFiles: retirementDeltaFiles(),
    observedBaseRevision: baseRevision,
    ...overrides,
  };
}

export function candidateFiles() {
  return [
    { path: canonicalPath, content: candidateSpec },
    { path: currentInboundPath, content: currentInboundRepaired },
    { path: currentReferenceInboundPath, content: currentReferenceInboundRepaired },
    { path: linkExamplesPath, content: linkExamples },
    { path: historicalInboundPath, content: historicalInbound },
    { path: historyRelativeInboundPath, content: historyRelativeInboundRepaired },
  ];
}

export function snapshot(overrides = {}) {
  return {
    repository,
    baseRevision,
    headRevision,
    deltaRevision,
    openspecRoot,
    change,
    baseFiles: baseFiles(),
    candidateFiles: candidateFiles(),
    deltaFiles: deltaFiles(),
    observedBaseRevision: baseRevision,
    ...overrides,
  };
}

export function cloneFiles(files) {
  return files.map(({ path, content }) => ({ path, content: Buffer.from(content) }));
}
