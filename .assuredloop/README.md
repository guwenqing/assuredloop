# Retained consumer binding

The owner has paused AssuredLoop self-dogfooding for the current direct core
overhaul. This checkout does not run its own Issue/Proposal, BOT handoff or
self-trace workflow for that work. Targeted tests and independent local subagent
review still apply. See ../AGENTS.md. This exception does not change another
consumer's accepted policy or make an old checkpoint describe the new source.

config.json and activation.json are retained binding/evidence records, not an
instruction to resume old sessions. The selected historical package is
assuredloop-base@0.1.0 at code/assets commit
29f2a59daf15f4f154297580296bff71e8f9a9f8; its tarball integrity is in config.json.
Its canonical contract source is
9dfe8524072aec0f896dd7bacb345d7ed6471aac:openspec/specs.
The source-retention tag assuredloop-base-0.1.0-canonical-build identifies that
build, not a release/approval of the current candidate.

These historical objects remain available for source/fixity reconstruction.
In a shallow or single-branch clone, fetch the needed history/tag explicitly and
verify the full commit identity before use. Do not force a conflicting tag,
substitute today's files or execute a package based only on an untrusted record.

Current product capabilities and limits are in ../README.md. The old AssuredLoop
work-role discovery copies have been removed from this checkout; native OpenSpec
and user Skills remain. New tool-operation Skills are authored under ../skills/
and packaged for explicit installation, not automatically activated here.

Only Astra is used for this repository's work, at the effort appropriate to the
task. This is a repository-local user choice, not a framework default.
