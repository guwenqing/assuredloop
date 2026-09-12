## Purpose

Provide reviewable evidence of the locally selected toolkit artifact and observed installation without confusing byte identity, source history, dependency declarations or policy authority. This L2 capability supports [shared facts for judgment](https://github.com/guwenqing/assuredloop-base/blob/7343ffc7518200ce80437a9c914448dd6f176a35/openspec/specs/workflow-goals/spec.md#requirement-shared-facts-support-human-and-machine-judgment); the requirements and scenarios below define L3 behavior.

## ADDED Requirements

### Requirement: Identify the selected installation without inventing provenance

Artifact operations SHALL identify the owning package of the invoked executable through its resolved installation, independently of the caller's working directory. They SHALL report package name/version, code/assets Git provenance when available, changed packaged paths and separately verified contract metadata/source. Git identity SHALL describe the actual package source, not an enclosing consumer repository. Missing Git history SHALL be explicit rather than inferred from the contract source or another checkout.

#### Scenario: Linked package has unchanged HEAD and modified assets
- **WHEN** a packaged template changes without a new source commit
- **THEN** capture identifies the actual selected package and changed asset, retains its bytes, and does not label the artifact as a clean copy of HEAD

#### Scenario: Installed package is inside another Git repository
- **WHEN** the selected packed installation has no own source history but its consumer has a Git HEAD
- **THEN** package Git provenance remains unavailable while local artifact and contract checks can still run; the consumer HEAD is not substituted

### Requirement: Retain and compare actual archive bytes

Explicit capture SHALL retain an actual package archive and a versioned local report in a new caller-selected evidence directory. The archive SHALL either be supplied locally or generated from the selected installation with lifecycle scripts disabled. The report SHALL distinguish those origins, record its actual SHA-512 SRI and exact member inventory/digests, and identify its observation limits. A deliberately selected dirty overlay SHALL be retained as archive bytes, not only a commit name, hash or unavailable patch.

Verification SHALL compare an independently supplied expected SRI with the retained archive bytes and compare the selected installation's package inventory and file contents against that archive. It SHALL expose missing, added and changed packaged files, not check only contract files or HEAD. Repacking SHALL NOT be represented as reconstructing or authenticating a previously supplied archive. A report's own declared SRI SHALL NOT serve as its independently supplied expectation.

#### Scenario: Supplied expected SRI has valid shape but wrong bytes
- **WHEN** verification receives a syntactically valid SHA-512 SRI that does not match the retained archive
- **THEN** it reports an artifact-integrity mismatch with a failing result without changing consumer configuration or relying on a later init conflict

#### Scenario: Archive matches but linked source changed
- **WHEN** the retained archive still matches its expected SRI but a non-contract packaged file differs in the current selected installation
- **THEN** verification reports installation drift and identifies the affected member rather than passing on the archive hash alone

#### Scenario: Only excluded scratch content changes
- **WHEN** a change affects only files excluded by native npm packaging and not a separately observed dependency lock or metadata input
- **THEN** it is not reported as packaged artifact drift; any available Git dirty observation remains distinct from packaged-file comparison

### Requirement: Keep dependency provenance separate from dependency-content verification

Capture SHALL separately identify and retain the selected npm dependency lock when available, its raw digest and the supported installed dependency identity observations. Verification SHALL compare the retained lock with an explicitly selected current lock and the actual installed dependency observations, exposing changed lock bytes, mismatched or missing required identities, and unsupported or unavailable coverage.

The initial guarantee SHALL be lock provenance and installed metadata consistency, not proof that dependency file contents match registry archives. Missing Git, missing lock, unsupported lock/layout, optional platform omissions and actual mismatches SHALL be distinguishable. A valid artifact comparison SHALL NOT silently convert incomplete dependency coverage into a full verification PASS.

#### Scenario: Dependency version or lock changes
- **WHEN** a required installed dependency version differs from the captured supported lock, or the selected current lock differs from the retained copy
- **THEN** verification reports the corresponding dependency or lock mismatch separately from archive and toolkit-file identity

#### Scenario: Native inventory uses stale cached metadata
- **WHEN** native npm listing reports a dependency's old identity while its current package manifest has changed
- **THEN** verification detects the discrepancy from independently read current manifest metadata rather than accepting the cached listing as actual installed identity

#### Scenario: Packed installation has no source lock
- **WHEN** artifact bytes can be compared but no explicit usable dependency lock is available
- **THEN** the artifact result remains visible and dependency verification is reported as incomplete, without fabricating provenance or fetching a lock

#### Scenario: Competing lock changes the native expected tree
- **WHEN** the selected dependency root contains npm-shrinkwrap.json, whether initially or introduced after capture, even if native installed and expected listings agree
- **THEN** dependency verification reports unsupported/incomplete coverage rather than attributing that tree to a retained package-lock.json; a stable control with only the supported package-lock uses that exact retained lock as its expected-tree basis

#### Scenario: Dependency bytes change without metadata changing
- **WHEN** a dependency implementation file changes while its observed package identity metadata remains unchanged
- **THEN** the report does not claim this metadata-only check authenticates dependency contents; its declared coverage explicitly excludes that claim

### Requirement: Expose source changes across observation boundaries

Capture and verification SHALL re-observe the selected package identity, member inventory/bytes and applicable lock/dependency metadata before publishing success. A detected change during acquisition SHALL prevent an unqualified stable result and retain the relevant differences. Comparison SHALL use content and identity observations rather than elapsed time or HEAD alone. Reports SHALL identify observation boundaries and state that these are not atomic snapshots, continuous monitoring or protection from every change-and-revert between observations.

#### Scenario: Source changes during capture
- **WHEN** a controlled change to a packaged member persists between the initial and final observations
- **THEN** capture reports source drift rather than publishing the mixed acquisition as a stable artifact capture

#### Scenario: Stable source is checked twice
- **WHEN** the same inputs remain unchanged across both observation boundaries
- **THEN** the report can identify them as unchanged across those observations without claiming future stability

### Requirement: Preserve local input and authority boundaries

Artifact operations SHALL use explicit local inputs and bounded package/evidence paths. They SHALL NOT fetch arbitrary archives, execute package lifecycle scripts, follow archive member traversal or links outside the selected package, overwrite existing evidence, change global npm links, mutate consumer configuration, re-pin packages or activate policy. Retained archives SHALL be inspected as data with duplicate, unsafe or unsupported entries rejected. Unavailable tools or inputs SHALL be distinguishable from a measured mismatch.

Capture SHALL write only its explicitly selected new evidence directory and owned scratch; verification SHALL leave its input bundle, source installation, dependency tree and consumer unchanged. Neither operation SHALL claim publisher authentication, trustworthy self-attestation of malicious code, semantic acceptance or merge authority.

#### Scenario: Archive contains an escaping or duplicate member
- **WHEN** a local archive includes traversal, an absolute path, duplicate normalized names or an unsupported link member
- **THEN** it is rejected without reading or writing outside the permitted roots or treating the ambiguous inventory as verified

#### Scenario: Capture output already exists
- **WHEN** capture is directed at an existing evidence destination
- **THEN** it fails without overwriting that evidence or silently selecting another destination

### Requirement: Add a guided opt-in check without changing existing gates

The CLI and existing adoption/review guidance SHALL explain capture/verify inputs, side effects, result scopes, retention and failure handling. Existing initialization, work checks, policy selection and activation semantics SHALL remain compatible and SHALL NOT silently acquire a new mandatory artifact gate. Adoption SHALL require a separate explicit acceptance decision for any changed package binding. Artifact outputs SHALL remain local execution evidence or referenced collaboration evidence, not a new authoritative workflow database or a mandatory committed run log.

#### Scenario: Adopter verifies a local overlay
- **WHEN** capture and verification succeed for a deliberately selected dirty package
- **THEN** the adopter receives retained bytes and bounded comparison evidence, while any decision to adopt that artifact still follows the consumer's current approval process

#### Scenario: Existing initialization is used without the helper
- **WHEN** a consumer runs an existing supported init invocation
- **THEN** its existing behavior remains unchanged and no new integrity enforcement is claimed for that invocation
