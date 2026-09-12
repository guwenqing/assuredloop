## 1. Reviewed planning and implementation handoff

Work Issue: [Planning #22](https://github.com/guwenqing/assuredloop-base/issues/22)

Basis: [Proposal](proposal.md), [behavior delta](specs/artifact-provenance/spec.md), [Design](design.md). This is a candidate plan, not an implementation approval.

- [ ] 1.1 Preserve #21, establish the Epic and separately owned planning/development/closeout mapping, and complete the Proposal/Spec/Design; verify native strict validation and the actual Issue category/activity/parent relationships.
- [ ] 1.2 Obtain full-scope independent design review, dispose every finding and secure required human Proposal acceptance; verify the exact reviewed revision and applicable destination policy without claiming planning scenarios ran.
- [ ] 1.3 Deliver the authorized planning PR and bind #23/#24 to its real fixed requirement/decision/task refs; verify prerequisite relationships, ordered handoff and acknowledged developer receipt before implementation readiness. This completes the artifact-plan contribution, not other plans owned by #22; use this PR's accepted delivery as the implementation prerequisite rather than requiring umbrella #22 closure.

## 2. Explicit artifact helper and guided use

Work Issue: [Implementation #23](https://github.com/guwenqing/assuredloop-base/issues/23)

Execution prerequisite: reviewed and owner-accepted planning delivery from #22. AL Developer owns this delivery; a different agent authors the tests. All seven steps belong to one scoped implementation Issue, not seven separate tickets.

- [ ] 2.1 Have an independent test author add CLI-facing capture/verify and focused unit contracts covering every scenario in the delta; record genuine baseline RED assertions for the missing behavior, distinct from setup/import failures, using isolated fixture repositories and preserved output.
- [ ] 2.2 Add the local report schema and capture path for the actual selected package, archive preservation, contract/source separation and safe member inventory; verify clean/dirty/added/deleted/excluded-file, Git-less and archive-safety cases from 2.1. Select the direct pinned archive-reader release with recorded license/release-age evidence.
- [ ] 2.3 Add expected-SRI and complete installed-member comparison without changing init; verify exact mismatch reasons for wrong SRI, altered archives, non-contract changes and missing/extra members, with unchanged consumer and capture inputs.
- [ ] 2.4 Add supported explicit owner-root lock/installed-metadata comparison, including direct actual manifest reads; verify source and hoisted installs, top-level npm links, nested/scoped identities, stale hidden-lock metadata, changed lock, missing required/optional nodes (including optional peers), and explicit unsupported/no-lock coverage. Include competing package-lock/shrinkwrap and shrinkwrap-only failures, an introduced-shrinkwrap fault, and the same stable package-lock-only control; native listing agreement must not defeat the retained-effective-lock check. Record native versions/arguments and test inherited filtering without claiming dependency source-byte attestation.
- [ ] 2.5 Add final-boundary reacquisition and drift outcomes; verify deterministic in-flight source/link/lock/metadata mutations and a stable control without timing sleeps, output self-inclusion or edits to existing evidence.
- [ ] 2.6 Update CLI help, existing adopt/review Skills and concise README guidance; verify a fresh executor can capture/verify from the linked command and an installed tarball without private session history, distinguish incomplete results, and leave existing init/conflict behavior unchanged. Do not change generated consumer discovery copies or activation implicitly.
- [ ] 2.7 Complete relevant controlled product faults, GREEN reruns, unchanged compatibility checks, and independent review of the whole implementation under current consumer policy; additional provider review is not routine. The developer decides authorized integration after required checks/review and human decisions, without a default architect final-approval gate. Record exact source/test identities, all findings/dispositions and actual squash delivery before claiming #23 complete.

## 3. Aggregate acceptance and current-Spec synchronization

Work Issue: [Closeout #24](https://github.com/guwenqing/assuredloop-base/issues/24)

Execution prerequisite for this contribution: actual implementation delivery from #23. AL Architect owns aggregate acceptance and handoff; #24 may cover other feedback changes but each has its own complete acceptance and synchronization scope. The original #1/#10 work is delivered and closed.

- [ ] 3.1 Reconcile all accepted requirements/scenarios with planning and implementation delivery evidence; verify actual current code, archived/generated artifact comparisons and declared dependency limits, returning any uncovered obligation to its responsible work.
- [ ] 3.2 Synchronize the complete new capability through native OpenSpec into the current specification and capture the required source-backed acceptance manifest; verify complete delta/result equality and current inbound references, convert the delta's pinned goal reference to its canonical relative form, keep archived history untouched, and explicitly resolve package version/build identity and contract-package selection rather than silently repinning this consumer.
- [ ] 3.3 Obtain applicable independent closeout review and approval, deliver and verify the resulting PR, then perform only authorized archive/closure actions; record actual results in GitHub and leave unresolved owner decisions open rather than checking future delivery as complete. Do not close shared #24 or Epic #21 on this contribution alone while other assigned feedback remains undelivered.
