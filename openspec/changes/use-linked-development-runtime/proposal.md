## Why

The owner explicitly rejected toolkit self-tracing for npm-linked development on 2026-09-12. The original artifact capture/verification proposal would impose exactly the product provenance work the owner does not want; it is withdrawn rather than implemented under a different name.

## What Changes

- Recognize the actual selected npm-linked package automatically and default to no toolkit self-trace: no archive/SRI, Git-cleanliness, source-provenance, installed-dependency or packaged-contract integrity gate for that linked runtime.
- Keep consumer work, requirement references, accepted destination policy, evidence fixity, independent review and tests in force. Linked development does not turn consumer errors into success or let candidate policy authorize itself.
- Report linked/unverified toolkit operation once, without repeated warnings, mandatory capture bundles or another approval round. Preserve existing installed-package behavior outside linked development.

## Capabilities

### New Capabilities

None. No artifact capture module, tar reader, artifact-report schema or new dependency is introduced.

### Modified Capabilities

- `project-workflow-adoption`: Automatic linked-runtime selection and default self-trace exclusion.
- `review-and-validation`: Consumer policy/context validation remains distinct from excluded toolkit self-attestation.

## Impact

Separate runtime selection and required source loading from toolkit integrity checks in the existing CLI/adoption/policy/contract-loading paths. Update existing usage and Skills where needed, plus focused independent tests. Keep [planning #22](https://github.com/guwenqing/assuredloop-base/issues/22), [implementation #23](https://github.com/guwenqing/assuredloop-base/issues/23), and shared [closeout #24](https://github.com/guwenqing/assuredloop-base/issues/24) under Epic21; do not create replacement Architecture Tasks.

## Boundaries and acceptance

The instruction applies immediately to this project's operating practice and is also a reusable product requirement. No caller opt-out flag is required when an actual npm link is selected. A normal executable bin symlink in a regular installation is not sufficient to classify it as npm link. Runtime parsing/loading errors remain errors; skipping self-trace does not make a broken runtime executable. No default provider change, target-policy waiver, consumer re-pin, global-link mutation or nonlinked capture feature is authorized. The old artifact plan and its reviews remain Git/PR history, not accepted requirements or current delivery work. Independent review and required owner acceptance of the concrete replacement still precede its implementation.
