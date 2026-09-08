---
name: assuredloop-adopt
description: Adopt the pinned AssuredLoop package in an explicitly selected repository with previewed configuration and native tool discovery.
---

# Adopt AssuredLoop

Start from the intended consumer repository and an explicitly selected installed package. This guidance does not select a repository from the framework's own source history. `{{repository}}` is the target repository; `{{openspec_root}}` is its native specification context. The installed framework package is `{{package_name}}` at `{{package_version}}`.

## Prepare the binding

Read the selected installation's `schemas/workflow.schema.json` (`config` and `contractPackage`) and `templates/records/config.json`. Examples are illustrative, not accepted policy. Set the consumer's GitHub identity, repository-relative OpenSpec root, selected native tool IDs and labels. Set explicit review eligibility/exclusions and the workflow package version, installation integrity and immutable source reference. Resolve framework rules from the installation's `contracts/metadata.json` and generated files; resolve product requirements from the consumer's own OpenSpec context. Never copy the framework's Specs into the consumer baseline.

Use the existing OpenSpec initialization when native context or integrations are missing. AssuredLoop supplements it and does not run prerequisite installers, log in to accounts or modify upstream Skills. Prerequisites are Node.js >=20.19.0, Git, pinned OpenSpec 1.12.0 and, for GitHub checks, authenticated gh >=2.88.0 with access to the bound repository. Different native tools select different roots; incompatible registry versions/shapes and unresolved shared-root ownership are reported rather than guessed.

Before routed work, the adopting owner or explicitly authorized agent must provision missing configured category labels or confirm mappings to existing labels. Initialization only reports this prerequisite. It does not create labels or claim that a syntactically valid owner/review declaration proves acceptance.

## Preview, apply and verify

Save the agreed configuration to an explicitly named JSON input file. From the pinned installation, run:

```text
assuredloop init --target /absolute/consumer/root --config /absolute/config.json
```

Inspect the proposed file list and diagnostics. The default is read-only preview. Use `--local-only` when remote access is intentionally unavailable; it reports skipped GitHub checks and cannot establish complete pre-merge validation. Resolve invalid bindings, package-version mismatches, unknown tools and file/co-tenancy conflicts before applying. Preserve user files and upstream `.openspec-target` ownership markers; do not remove conflicting files to force success.

After the preview matches the authorized adoption scope, repeat with `--apply`. Only the target `.assuredloop/config.json` and namespaced AssuredLoop discovery assets are eligible. Verify a repeat preview is unchanged, native/user Skills and product Specs are preserved, generated guidance has no unresolved binding placeholders, and the target configuration points to the intended package. Installed copies are generated from this packaged source; change the source through governed work rather than editing discovery copies independently.

Record the actual command, result, selected package/version and limitations in the adoption work record. Obtain the applicable independent review and policy acceptance before treating adoption as accepted. A successful init does not activate the workflow. Establish accepted bootstrap/configuration in the destination before any later activation assessment; missing policy remains unavailable and a candidate cannot authorize itself. Escalate policy/scope questions to the responsible work owner.

This package increment provides initialization and record contracts. Full work-category guidance and inspect/check behavior have their own delivery tasks; do not claim those unfinished operations ran. Automatic CI, provider orchestration and registry publication are separate authorized work.
