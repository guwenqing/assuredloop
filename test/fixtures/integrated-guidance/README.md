# Integrated guidance trials

These are local, declared-context-only inputs for the Issue #9 item 4.2 fresh-agent trials. They are simulation material, not consumer work records, activation evidence, owner decisions, or delivery evidence.

Give a fresh executor exactly one `case-XX/case.md`, the selected installed package described in `package-binding.md`, and the package files named by that case in `manifest.json`. The installed package must be unpacked from the delivered `assuredloop-base@0.1.0` tarball; do not give the executor this framework checkout, its Issue history, sibling cases, private conversation, or evaluator material.

The package root is represented as `<installed-package-root>` in the inputs. Resolve Skill, contract, schema, and template paths relative to that root. The source repository named in `contracts/metadata.json` identifies the framework package provenance; it is not a consumer work context.

All work is draft-only. Do not post to GitHub, create Issues or pull requests, modify a repository, activate a policy, claim owner approval, or treat a shape-valid record as semantic acceptance. No fake GitHub service is used by these fixtures. If a tool would require a GitHub call, record the missing/unsafe environment and continue with a truthful draft or limitation.

The executor response format is in `executor-brief.md`. The evaluator-only capability map and launch notes are kept under ignored `local-data/issue-9/guidance/`; they are not part of executor input.
