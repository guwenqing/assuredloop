---
name: assuredloop-adopt
description: Configure an explicitly selected repository for AssuredLoop, preview installation and provision mapped labels when requested. Does not plan the project or assign work.
---

# Install AssuredLoop support

Target: {{repository}}; native OpenSpec root: {{openspec_root}}.
Selected package: {{package_name}}@{{package_version}}.

Read the selected package README and `templates/records/config.json`. Field rules are
in `schemas/workflow.schema.json`. Supply real repository, package, native tool and
reference-permission bindings. Examples do not establish accepted policy.

```text
assuredloop init --target /absolute/consumer --config /absolute/config.json
```

The default is a read-only preview. Inspect the exact file list before repeating
with `--apply`. Existing differing files are conflicts, not overwrite permission.
Native OpenSpec initialization and account login are separate prerequisites.
The toolkit does not install CI, invoke reviewers or activate a consumer policy.

For an authorized label setup, preview with `--provision-labels`, then apply.
Only missing configured labels are created; existing metadata is preserved.
A partial result may include successful writes. Read its per-operation outcomes
and make a fresh preview; do not delete labels as rollback.
`--local-only` explicitly skips GitHub checks and cannot provision labels.

The new configuration example contains only a review-context budget. The consumer
chooses its own development, test, review, role and communication methods.
Existing explicit review constraints remain enforced; installation does not relax
them or infer new ones. Accepted source references and actual destination policy
are still required for remote evidence checks.

An actual npm package-root link selects linked development and skips verification
of the toolkit itself. It does not skip consumer record, reference, policy or
freshness checks. Use an explicitly selected linked executable; do not audit or
re-pin the linked toolkit to make consumer checks pass.

Verify the repeat preview is unchanged and native/user Skills are preserved.
Upgrading an existing installation does not remove old discovery copies.
If old AssuredLoop work-role Skills are present, show their exact paths and obtain
permission to remove those copies; never delete unrelated or locally edited Skills.

Installing this toolkit does not reconstruct an existing project's requirements.
Use the consumer's native OpenSpec work to establish any missing baseline.
The toolkit can reference that evidence and check later synchronization; it cannot
turn observed code into accepted intent.
