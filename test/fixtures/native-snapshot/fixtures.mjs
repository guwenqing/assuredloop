const textBytes = (text) => Buffer.from(text, 'utf8');

export const repository = 'example/consumer';
export const revision = '0123456789abcdef0123456789abcdef01234567';
export const openspecRoot = 'workflow-spec';
export const change = 'ship-audit';
export const capability = 'accounting';
export const nestedCapability = 'platform/session-layout';

export const canonicalSpecPath = `${openspecRoot}/specs/${capability}/spec.md`;
export const nestedCanonicalSpecPath = `${openspecRoot}/specs/${nestedCapability}/spec.md`;
export const proposalPath = `${openspecRoot}/changes/${change}/proposal.md`;
export const deltaSpecPath = `${openspecRoot}/changes/${change}/specs/${capability}/spec.md`;
export const nestedDeltaSpecPath = `${openspecRoot}/changes/${change}/specs/${nestedCapability}/spec.md`;
export const tasksPath = `${openspecRoot}/changes/${change}/tasks.md`;
export const metadataPath = `${openspecRoot}/changes/${change}/.openspec.yaml`;

export const canonicalSpec = textBytes(`## Purpose\r
This capability keeps an immutable audit trail for account changes and makes review evidence easy to inspect.\r
\r
## Requirements\r
### Requirement: Record audit changes\r
The system SHALL retain every account audit change with its original bytes.\r
\r
#### Scenario: Record an update\r
- **WHEN** an account is updated\r
- **THEN** the original change is stored.\r
\r
#### Scenario: Preserve a Unicode note\r
- **WHEN** a note contains Unicode\r
- **THEN** the original code points remain available.\r
`);

export const nestedCanonicalSpec = textBytes(`## Purpose\r
This nested capability describes platform session layout requirements for stable reviewable workflow state.\r
\r
## Requirements\r
### Requirement: Keep session layout stable\r
The system SHALL keep platform session layout metadata stable across native inspections.\r
\r
#### Scenario: Inspect a nested capability\r
- **WHEN** the platform session layout is inspected\r
- **THEN** the nested capability remains addressable by its complete native id.\r
`);

export const proposal = textBytes(`## Why\r
This change makes account audit exports available to reviewers without changing existing account update records and preserves source bytes for later verification.\r
\r
## What Changes\r
- **accounting:** Add a reviewable audit export requirement.\r
`);

export const malformedProposal = textBytes(`## Why\r
Too short.\r
\r
## What Changes\r
- **accounting:** Add a reviewable audit export requirement.\r
`);

export const deltaSpec = textBytes(`## ADDED Requirements\r
### Requirement: Export audit report\r
The system SHALL provide a reviewable audit report that keeps source bytes unchanged.\r
\r
#### Scenario: Export a report\r
- **WHEN** a reviewer requests an export\r
- **THEN** the report is generated.\r
`);

export const nestedDeltaSpec = textBytes(`## ADDED Requirements\r
### Requirement: Record nested session layout\r
The system SHALL record the platform session layout under its nested capability id.\r
\r
#### Scenario: Record a nested layout\r
- **WHEN** a platform session is created\r
- **THEN** its nested layout is recorded.\r
`);

export const scenarioLossDeltaSpec = textBytes(`## MODIFIED Requirements\r
### Requirement: Record audit changes\r
The system SHALL retain every account audit change with its original bytes.\r
\r
#### Scenario: Record an update\r
- **WHEN** an account is updated\r
- **THEN** the original change is stored.\r
`);

export const malformedSpec = textBytes(`## Purpose\r
This malformed fixture intentionally omits the required Requirements section.\r
`);

export const malformedDeltaSpec = textBytes(`## ADDED Requirements\r
### Requirement: Broken audit report\r
The system SHALL provide a report, but this delta intentionally omits its scenario.\r
`);

export const tasks = textBytes(`# Delivery\r
- [ ] 3.1 Native snapshot adapter — preserve π bytes\r
- [x] 3.6 Synchronization coverage — compare сценарий\r
`);

export const unsupportedSchemaMetadata = textBytes(`schema: custom-native\r
`);

export function canonicalSnapshotFiles({ delta = deltaSpec, proposal: proposalBytes = proposal, ...extras } = {}) {
  return [
    { path: canonicalSpecPath, content: canonicalSpec },
    { path: proposalPath, content: proposalBytes },
    { path: deltaSpecPath, content: delta },
    { path: tasksPath, content: tasks },
    ...Object.entries(extras).map(([path, content]) => ({ path, content })),
  ];
}

export function nestedSnapshotFiles() {
  return [
    { path: nestedCanonicalSpecPath, content: nestedCanonicalSpec },
    { path: proposalPath, content: proposal },
    { path: nestedDeltaSpecPath, content: nestedDeltaSpec },
    { path: tasksPath, content: tasks },
  ];
}

export function snapshotWithUnrelatedFiles() {
  return canonicalSnapshotFiles({
    [`${openspecRoot}/node_modules/@fission-ai/openspec/package.json`]: textBytes('{"version":"0.0.0-malicious"}\n'),
    [`${openspecRoot}/openspec/schemas/spec-driven/schema.yaml`]: textBytes('!!js/function >\n  process.exit(99)\n'),
    [`${openspecRoot}/.assuredloop/config.json`]: textBytes('{"repository":"attacker/redirect"}\n'),
    'README.md': textBytes('dirty consumer checkout\r\nπ\n'),
  });
}

export function snapshotWithUnsupportedSchema() {
  return canonicalSnapshotFiles({ [metadataPath]: unsupportedSchemaMetadata });
}
