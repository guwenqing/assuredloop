# AssuredLoop Base

Local workflow extensions built on OpenSpec. This first implementation increment provides record contracts, explicit project initialization and a private, packable Node.js CLI. It does not activate a consumer workflow or install CI/review providers. The accepted change remains under `openspec/changes/establish-project-workflow/`; overall acceptance and closeout are separate work.

## Local use

Use Node.js >=20.19.0 and Git. Install the pinned dependencies with `npm ci`. OpenSpec 1.12.0 supplies native planning and tool discovery; GitHub operations additionally need gh >=2.88.0 with access to the selected repository. Initialization never installs prerequisites or signs in for you.

```text
node src/cli.js --help
node src/cli.js --version
node src/cli.js init --target /absolute/consumer --config /absolute/config.json --local-only
```

Create the input from the illustrative `templates/records/config.json` and the descriptions in `schemas/workflow.schema.json`. Select your own repository, OpenSpec root, tools, label mappings and accepted review choices. Do not use example identities or evidence as real authorization. The default command previews eligible changes; repeat with `--apply` only after reviewing that preview. Existing conflicting files cause an error rather than being overwritten. `--local-only` explicitly skips remote checks and is not delivery acceptance.

The adoption procedure is in `skills/assuredloop-adopt/SKILL.md`. Native tool roots are discovered from the pinned OpenSpec registry, including Gemini; upstream ownership markers are preserved. Framework contracts remain in the selected installation, separate from the consumer's product Specs. The returned file list identifies target discovery copies.

## Package and contract assets

The package stays private; no npm publication is authorized. `npm pack` builds a tarball with an explicit file allowlist. Its output reports the tarball's integrity; retain that value with the package name/version and generated contract source reference in the consumer binding. Contract file hashes verify the generated assets, not publisher identity or policy acceptance.

Generate framework assets only from an explicitly selected Git revision and specification root:

```text
node src/cli.js generate-contracts --source-root /absolute/framework --repository owner/framework --revision FULL_COMMIT_SHA --specs-path openspec/specs --out /absolute/output/contracts --basis canonical
```

For reviewed active-change contracts before closeout, select that explicit specification directory and `--basis bootstrap`. The generator reads Git blobs, records provenance and preserves file bytes; it does not promote deltas into a consumer baseline. `contracts/metadata.json` identifies the source, package version, basis and asset checksums. Regenerate through reviewed delivery when that source changes.

When the source checkout has an origin, its supported GitHub HTTPS/SSH identity must match the declared source repository. A present unsupported origin is an error. Without an origin, the explicit root and RepoRef form a caller-declared local binding. Neither this declaration nor a matching remote string authenticates repository ownership. Generation rejects conflicting or unlisted output files before adding assets; choose a clean explicit output directory for a new contract version.

The JavaScript record API is `validateRecord(kind, value)` from `src/records.js`, returning `{valid, errors}`. Kinds refer to the schema's definitions. This API checks record shape. It does not prove reference availability, review independence, authorization or semantic correctness. Full read-only inspect/check behavior is a later implementation task in the same accepted change.

## Verification

Run the independently authored, scoped Node tests with `npm test`. The PR records test-first failures, passing reruns, controlled product faults and independent reviews. Runtime and package fixtures use distinct temporary consumer repositories; no fixture config is a real activation record. Keep execution logs in ignored `local-data/` and Issue/PR comments.
