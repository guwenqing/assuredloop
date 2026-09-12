## Why

[Request #21](https://github.com/guwenqing/assuredloop-base/issues/21) showed that an npm-linked installation can contain uncommitted packaged changes while its recorded Git HEAD stays unchanged. Current initialization checks package/contract declarations, not whether the declared tarball integrity matches the running installation; users need an explicit, reproducible verification step instead of overstating those checks.

## What Changes

- Add an opt-in local `artifact capture` / `artifact verify` workflow for the explicitly selected AssuredLoop installation. Capture retains the actual archive and a structured provenance report; verification compares an externally supplied expected SRI, retained artifact and currently selected package files.
- Report code/assets source revision and dirty packaged paths separately from generated contract provenance. Preserve a dirty overlay as archive bytes rather than describing it as the clean HEAD. A Git-less installed package remains usable without borrowing its consumer's Git identity.
- Record a separately identified dependency lock and compare supported installed dependency identities. Clearly distinguish lock/metadata consistency from verification of dependency file contents or publisher identity.
- Detect differences in the observed package, lock and dependency metadata between capture/check boundaries. Report unavailable or unsupported coverage and the limits of non-atomic observation.
- Document the supported step in adoption/review guidance and test the public CLI with separate implementation/test authors, positive cases, genuine RED/GREEN and controlled faults.

This is a new capability. Existing `init`, `inspect`, `check`, configuration, Evidence vocabulary and activation behavior remain unchanged. Successful artifact verification is not policy acceptance, activation, semantic review or permission to merge.

## Capabilities

### New Capabilities

- `artifact-provenance`: Explicit archive capture, selected-installation comparison, bounded source/dependency provenance and drift reporting.

### Modified Capabilities

None. The new helper supplements existing adoption and review guidance without adding an automatic gate or changing their current guarantees.

## Impact

Implementation will extend the Node.js CLI with a small artifact module, a versioned local report format and scoped independent tests; README and existing adoption/review Skills will explain its inputs and limits. Use native npm packaging and a supported, popular archive reader instead of a new package manager or handwritten tar parser. Any additional directly used dependency must be declared directly, exactly pinned, license-compatible and released more than 24 hours before selection; retain and review its resolved transitive closure in the lock.

The package remains private. Evidence bundles and execution logs stay outside tracked source; no change to consumer bindings is automatic. The current canonical Specs are synchronized only after accepted implementation delivery. Planning [#22](https://github.com/guwenqing/assuredloop-base/issues/22), implementation [#23](https://github.com/guwenqing/assuredloop-base/issues/23), and closeout [#24](https://github.com/guwenqing/assuredloop-base/issues/24) remain separately assigned under #21.

## Non-goals and acceptance boundary

No universal initialization gate, CI/provider installation, global npm-link change, remote fetching, npm publication, publisher authentication, dependency-content attestation, automatic overlay application, multi-package-manager engine or automatic consumer upgrade. Do not modify the archived `establish-project-workflow` change; #1/#10 are already delivered and closed. Shared planning #22 and closeout #24 may cover other explicitly bounded changes without expanding this Proposal's scope.

Owner authorization to pursue #21 permits this planning. The new Proposal still needs explicit human acceptance and independent review before its planning PR merges or its implementation starts. Detailed design choices below are proposed, not already accepted.
