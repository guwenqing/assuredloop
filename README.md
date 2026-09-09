# AssuredLoop Base

Local workflow extensions built on OpenSpec. The package provides record contracts, explicit project initialization, work-category guidance and a private, packable Node.js CLI. It does not activate a consumer workflow or install CI/review providers. The accepted change remains under `openspec/changes/establish-project-workflow/`; overall acceptance and closeout are separate work.

## Local use

Use Node.js >=20.19.0 and Git. Install the pinned dependencies with `npm ci`. OpenSpec 1.12.0 supplies native planning and tool discovery; GitHub operations additionally need gh >=2.88.0 with access to the selected repository. Initialization never installs prerequisites or signs in for you.

```text
node src/cli.js --help
node src/cli.js --version
node src/cli.js init --target /absolute/consumer --config /absolute/config.json --local-only
```

Create the input from the illustrative `templates/records/config.json` and the descriptions in `schemas/workflow.schema.json`. Select your own repository, OpenSpec root, tools, label mappings and accepted review choices. Do not use example identities or evidence as real authorization. The default command previews eligible changes; repeat with `--apply` only after reviewing that preview. Existing conflicting files cause an error rather than being overwritten. `--local-only` explicitly skips remote checks and is not delivery acceptance.

The adoption procedure is in `skills/assuredloop-adopt/SKILL.md`. Native tool roots are discovered from the pinned OpenSpec registry, including Gemini; upstream ownership markers are preserved. Framework contracts remain in the selected installation, separate from the consumer's product Specs. The returned file list identifies target discovery copies.

## Inspect and check work

Run `assuredloop inspect --target ABS_ROOT --work OWNER/REPO#NUMBER` to read a reviewer packet, or `assuredloop check` with the same target/work options to check structured records and their sources. Both commands use read-only Git and GitHub operations. A formal `pass` does not authorize a merge, authenticate reviewer independence or establish the whole assigned outcome.

`check` returns a complete, non-paginated machine-readable diagnostic report, including synchronization and manifest outcomes. It has no reviewer-packet cursor, and its full report is not bounded by `max_inline_bytes`. Use `inspect` with the same work/delta/manifest selectors for bounded review context. That inspection captures a fresh view; it does not continue an earlier check snapshot if the source state changed.

`inspect` uses the resolved policy's `project.review.context.max_inline_bytes` for the complete serialized response page, including metadata and its trailing newline. The default is 65536 bytes when the optional context setting is absent. `--max-inline-bytes` may narrow that limit. Follow `packet.next_cursor` with `--cursor` to read remaining inventory pages; do not combine pages after a stale-cursor result. `--expand` accepts an exact discovered structured reference as JSON, including its anchor, or a qualified work reference. Content outside inline depth 1, over budget or unavailable remains distinguishable in the inventory. Policy source bodies are packet content rather than an unbounded duplicate beside the packet. Irreducible metadata that cannot fit returns `packet-limit`. Candidate changed-file inventories come from paginated GitHub reads, with fixed base/head references and available patch text in the PR source context; absent patch text and removed head paths remain explicit gaps.

PR assessments use their actual destination and pre-change Git objects. Delivered PR evidence is compared with its recorded historical base and policy, even after the destination advances. For genuinely non-PR intake, research and cancellation, the adapter inspects the repository's GitHub-reported current default branch and rechecks its revision. This is a current-context convention, not a historical-policy reconstruction or a restriction on PR destinations. Non-PR evidence is retained without synthetic PR audit fields. `--local-only` skips remote checks and returns an incomplete diagnostic.

Acquisition has one current permission ceiling per request. A directly selected PR uses its actual current destination configuration; an Issue-root request uses the repository's live default-branch configuration, even when several PRs are linked. Secondary assessments can narrow that ceiling and cannot widen it through historical coordinates, prerequisites or linked-PR ordering. Scope checks precede cached returns and physical reads, and the primary context/configuration is rechecked for freshness. Derived context retains the primary source and assessment restrictions. A forbidden historical reference remains a coverage gap until a current binding change is explicitly authorized. Verified installed contract assets remain readable through their exact package binding; that does not authorize remote access to their source repository. Incidental denied timeline relations stay in the inventory without replacing the permitted local assessment; required denied sources remain unresolved obligations.

Open Request or unclassified intake without an authoritative `Workflow context` block remains incomplete. Configured Architecture Task/Task/Bug/Spike labels require that routed record. Epic is a non-executable container and may omit context; executable work belongs to a child. Routed Issues require exactly one configured category compatible with their activity, under the [category contract](templates/README.md#classify-the-assigned-work). Inspection preserves actual labels, resolved category, activity, rule basis and discrepancies for review. A valid declaration does not prove truthful classification. Plain JSON in an Issue body is not a substitute for the block. Null or absent bodies remain source data; missing or unsupported operational states are reported rather than treated as open work. Binary references remain in packet inventories with a non-text reason. A generic basis can be acquired as raw bytes, while heading anchors and native task references require text.

Formal source parsing distinguishes absent context, invalid syntax/shape and a valid supported record. Explicit Workflow context errors remain errors with their source identity and available body; illustrative fenced headings are not declarations. For comments containing a whole JSON object, Evidence candidates use existing own-property signals: `head`, `no_head_reason`, review declarations, command/exit or assessment/audit fields, or `scope` together with `result` or `evidence`. The complete schema is then checked, including missing required fields. This discovery convention creates no review credit and does not infer intent. Tagged self-change decisions are validated separately; malformed or mixed declarations cannot disappear behind another valid review. Unrelated JSON/prose remains context. Generic supporting references may be code, logs or test-result JSON and are not recursively classified as Evidence from familiar keys. Where an operation actually expects a canonical record, such as manifest source derivation, an empty or malformed object cannot qualify. Unstructured historical material retains its separate semantic/manual-assessment boundary.

Evidence does not contain a review-role discriminator. The CLI therefore reports `review-kind-unresolved` and checks shared declarations, aliases, exclusions, depth and revision consistency. It does not infer internal/external assignment from a model name or prose. Reviewers must establish that assignment and obligation coverage from the original sources. The low-level `checkReviewEvidence` API can compare an explicitly supplied `internal` or `external` kind; its informational finding identifies that caller-declared assumption. An external comparison does not discharge an internal review obligation.

Canonical task ownership uses `Work Issue: [label](https://github.com/OWNER/REPO/issues/NUMBER)` in the relevant package section, task subsection or checkbox description. Section declarations apply to their children, while sibling packages remain separate. Conflicting package/task declarations, repeated task IDs and missing or unrecognized associations cannot verify linkage at handoff; early planning may retain an explicitly unresolved association. Code examples and ordinary Basis/dependency links are not ownership declarations. The checker compares the canonical Issue with the contributing Issue/PR mappings, not with human or bot assignees; changing a GitHub assignee does not require rewriting the plan.

For closeout, `check` and `inspect` accept `--delta-ref JSON_REPO_REF` for the complete fixed change directory and `--manifest-ref JSON_REPO_REF` for the actual candidate's `acceptance-manifest.json`. The delta must match the selected change and an accepted plan revision. An unambiguous active change/manifest location can be inferred; use an explicit candidate manifest reference when it has moved. These selectors choose diagnostic inputs, not acceptance or archive authority. The checks compare the full native delta result, including declared capability retirement, against candidate Specs and current inbound references; verify prerequisite delivery and manifest fixity; and retain the semantic acceptance boundary.

Manifest generation is also available through the packaged Node.js module `src/manifest.js`: `captureManifest({adapter, closeoutPolicyRef, capturedAt, deliveries, decisions})` returns a candidate manifest and findings. Supply source descriptors under the shared schema and a bound read adapter from `src/read-adapter.js`. `checkManifest({adapter, manifest})` checks raw Git bytes or the declared decoded GitHub comment body. Neither API posts evidence or writes a manifest file. Missing audit provenance remains a gap; the current closeout policy never fills historical entry fields. Closeout checks separately require inventory entries for its declared prerequisites; generic manifest validity does not prove that inventory is complete. Native parent/sub-Issue membership alone does not create a prerequisite.

For genuinely unstructured historical reports, a `deliveries` input can supply the existing manifest row fields explicitly, including `reviewed_head`, `scope`, `result` and known historical audit values. Capture always reads the original source and computes `content_sha256`; a supplied digest cannot replace acquisition. Unknown audit values remain null with findings. Required values are not invented, and a known PR cannot use a null head to disguise a missing revision. Structured Evidence remains authoritative over conflicting caller fields; malformed or ambiguous structured records cannot use the historical-report path. Typed decisions remain separate. A manual row with valid shape and fixity still carries `source-summary-review-required` on capture and verification: mechanical validity does not establish accurate transcription, approval or delivered coverage.

## Resolve guidance and context

Use the explicitly selected package installation, not whichever source checkout happens to be the working directory. For an installed CLI, follow the executable's symlink and locate its owning `package.json`; a project dependency can also be located through the package manager. Verify package name/version and `contracts/metadata.json` against the target's workflow pin and the actual installation evidence. If the location or binding is unavailable, request the selected installation context instead of silently choosing another package. Framework-maintenance work may explicitly select its source checkout through the current handoff; that is not consumer policy adoption.

Paths such as `schemas/`, `templates/` and `contracts/` in the guidance are relative to that verified package root. Consumer requirements are relative to the explicitly selected target and its configured OpenSpec root. Record the resolved locations in the current work context. Do not inject framework contracts into consumer product Specs or use the framework's historical Issues as consumer work.

The schema's activity selector identifies the relevant work guidance; this table is a navigation index, not a role assignment or additional policy source:

| Activity | Source guidance |
| --- | --- |
| adopt | [Adopt the workflow](skills/assuredloop-adopt/SKILL.md) |
| triage | [Triage a request](skills/assuredloop-triage/SKILL.md) |
| plan | [Plan and decompose](skills/assuredloop-plan/SKILL.md) |
| research | [Research a Spike](skills/assuredloop-research/SKILL.md) |
| deliver | [Deliver assigned work](skills/assuredloop-deliver/SKILL.md) |
| review | [Review and return the outcome](skills/assuredloop-review/SKILL.md) |
| closeout | [Close out a change](skills/assuredloop-closeout/SKILL.md) |

Use [shared record/template instructions](templates/README.md) for authoritative field examples and draft scaffolds. Optional consumer agent-instruction pointers are in [the opt-in snippet](templates/agent-instructions.md); add them only within the authorized adoption scope, preserving existing instructions. Initialization never overwrites a consumer README/AGENTS file or installs a permanent author-session route. Root `AGENTS.md` points framework contributors to these same sources.

Guidance explains manual/native execution and current owner boundaries. Tool results have the inspection limits described above. Guidance does not claim that automation is available, that schema validity proves semantic correctness, or that a review PASS satisfies a separately withheld owner decision. Fresh-agent trials and independent review assess whether the guidance is usable.

### Authoring reusable Skill examples

Initialization resolves `{{repository}}`, `{{openspec_root}}`, `{{package_name}}` and `{{package_version}}` everywhere in packaged Skill text. To show a later-work template, place the own-line comment `<!-- assuredloop:template:start -->` before the example and `<!-- assuredloop:template:end -->` after it, with a visible caption identifying the content as a reusable template/example rather than completed target data. Only literal markers in the original authored source control regions; substituted values remain data and cannot create or close a region. Other tokens, such as `{{change}}`, are preserved only inside that declared region. Unknown tokens outside it, unbalanced regions and nesting are errors. Do not use these markers to exempt executable instructions or actual work records; semantic review must assess the declaration. Target configuration always remains strict. This convention does not validate completed handoff records.

## Package and contract assets

The package stays private; no npm publication is authorized. `npm pack` builds a tarball with an explicit file allowlist. Its output reports the tarball's integrity; retain that value with the package name/version and generated contract source reference in the consumer binding. Contract file hashes verify the generated assets, not publisher identity or policy acceptance.

Generate framework assets only from an explicitly selected Git revision and specification root:

```text
node src/cli.js generate-contracts --source-root /absolute/framework --repository owner/framework --revision FULL_COMMIT_SHA --specs-path openspec/specs --out /absolute/output/contracts --basis canonical
```

For reviewed active-change contracts before closeout, select that explicit specification directory and `--basis bootstrap`. The generator reads Git blobs, records provenance and preserves file bytes; it does not promote deltas into a consumer baseline. `contracts/metadata.json` identifies the source, package version, basis and asset checksums. Regenerate through reviewed delivery when that source changes.

When the source checkout has an origin, its supported GitHub HTTPS/SSH identity must match the declared source repository. A present unsupported origin is an error. Without an origin, the explicit root and RepoRef form a caller-declared local binding. Neither this declaration nor a matching remote string authenticates repository ownership. Generation rejects conflicting or unlisted output files before adding assets; choose a clean explicit output directory for a new contract version.

The JavaScript record API is `validateRecord(kind, value)` from `src/records.js`, returning `{valid, errors}`. Kinds refer to the schema's definitions. This API checks record shape. It does not prove reference availability, review independence, authorization or semantic correctness. Use the read-only inspect/check commands described above to acquire and compare the bound sources.

## Verification

Run the independently authored, scoped Node tests with `npm test`. The PR records test-first failures, passing reruns, controlled product faults and independent reviews. Runtime and package fixtures use distinct temporary consumer repositories; no fixture config is a real activation record. Keep execution logs in ignored `local-data/` and Issue/PR comments.
