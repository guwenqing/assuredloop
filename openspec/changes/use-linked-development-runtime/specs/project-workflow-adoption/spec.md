## ADDED Requirements

### Requirement: Npm-linked development omits toolkit self-trace by default

When the actually invoked toolkit package is selected through npm link, runtime operations SHALL default to linked-development use without checking that toolkit's archive integrity, source provenance, clean Git state, dependency consistency or packaged-contract integrity against its release binding. No artifact capture, source-retention proof, re-pin or opt-out flag SHALL be required merely to use the linked toolkit. The result SHALL identify linked development and toolkit self-verification not performed, rather than claim an attested release.

Selection SHALL distinguish an npm-linked package-root relationship from an ordinary bin shim or symlink in an installed package. It SHALL use the actual invocation/module context, not an untrusted consumer record or arbitrary runtime path from evidence. Existing nonlinked installation checks SHALL remain unchanged. Files needed to execute and interpret the selected contracts must still be readable and structurally usable; absent inputs or incompatible native APIs SHALL remain explicit operation failures, not integrity claims.

#### Scenario: Linked source changes between development runs
- **WHEN** a correctly selected npm-linked toolkit has uncommitted source, changed packaged assets or dependency observations
- **THEN** consumer work can be checked without toolkit self-trace/capture or a package-integrity gate and the report states linked unverified runtime use

#### Scenario: Ordinary installed binary uses a symlink
- **WHEN** an installed package exposes its CLI through the normal node_modules/.bin or global bin symlink without a linked package root
- **THEN** it retains ordinary installed-runtime behavior rather than gaining the linked-development exclusion

#### Scenario: Record requests its own exemption
- **WHEN** a candidate work record names a linked mode or source path but the actual runtime selection does not establish it
- **THEN** record content does not select runtime mode or grant any exemption
