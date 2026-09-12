## Context

See [Proposal](proposal.md). This replaces the unaccepted `verify-linked-artifact` plan on PR26 after the owner's explicit instruction. The current implementation calls `verifyContracts` in adoption and policy resolution, compares the runtime name/version/contracts to the consumer's release binding, and can serve policy bytes from that locally verified bundle. Those assumptions are inappropriate for the owner's linked development path. Consumer work checks remain required.

## Goals / Non-Goals

Remove toolkit self-trace from actual npm-link use, not build a more elaborate attestation service. Preserve source reading needed for real policy and review context. No tarball capture, dependency inventory, Git cleanliness scan, synthetic release integrity, automatic source upgrade, general package-manager detection or new CLI waiver flag.

## Decisions

### 1. Resolve actual linked installation, not every symlink

At CLI entry preserve the invoked path before resolving it completely. Follow the bounded filesystem symlink chain to the owning package and distinguish the executable shim from a package-root link. Local npm linking presents a selected `node_modules/<package>` link; global npm linking presents the global module package link reached by the bin target. Identify the actual scoped/unscoped package root from the invocation and selected module, not a hardcoded framework installation path. Ordinary `.bin` and global executable links into a real installed package remain installed mode.

Use filesystem path/identity observations only for runtime selection, not source provenance verification. Do not run npm pack/ls dependency audits, inspect Git history or query a registry. Prevent cycles/escapes in the resolver and report unresolved runtime selection explicitly. Direct `node src/cli.js` without npm-link invocation remains direct-source mode and does not falsely claim npm-link detection; internal APIs receive explicit runtime selection from their caller. Preserve the actual selection through init/inspect/check and historical assessment calls, rather than let a nested call silently revert to installed-package verification.

### 2. Split source loading from toolkit verification

In linked mode do not call product-integrity/source/dependency verification or compare the live toolkit against a declared distributed artifact. Read only metadata/Skill/schema assets needed to execute the requested operation, with normal syntax, required-input and path-safety checks. Those checks mean the operation has usable input, not that the package is an attested release. Initialization keeps its target binding, configuration shape, native Skill root and file-conflict checks while omitting the linked toolkit's release-match gate.

The consumer's declared `contract_package` remains its policy record value; a mutable linked runtime neither proves nor silently rewrites it. In linked mode disable the policy loader shortcut that treats mutable installed assets as authenticated bytes of an immutable `source_ref`. Resolve accepted fixed policy through the existing permission-limited Git source adapter instead. No new network allowance or source fetch fallback is added: an unavailable fixed source remains an explicit consumer-policy gap. Read current target config/activation from the actual PR destination exactly as before. A changed candidate config cannot choose linked mode or weaken its own current check.

This is not a way to skip contract understanding. Workers/reviewers still read applicable fixed consumer/framework requirements; they simply do not audit the product artifact hosting the linked runtime. Nonlinked mode keeps the existing verified packaged-asset path and compatibility behavior.

### 3. One clear observation, no repeated self-audit

Attach one operation-level runtime observation (`linked-development`, `toolkit_verification: not-performed`) to check/inspect/init output and reviewer context. It is not a failing condition, provider request or requirement for a capture log. Do not emit the same notice at every historical policy/source read. Other consumer findings retain their actual severity and source. No new persistent runtime provenance file is needed.

### 4. Verification and handoff

Independent tests precede implementation. Test local/global npm-link path fixtures, scoped packages, normal bin symlinks, direct-source entry and malformed/cyclic links. Use injected filesystem/command boundaries to assert no toolkit pack/Git/dependency/integrity calls in linked mode, then verify unchanged installed-mode checks. Add end-to-end consumer fixtures showing that broken source refs, stale review tuples, missing approvals and candidate-policy edits still fail under linked use; fixed policy must come from the permitted immutable source, not altered local contract bytes. A controlled fault treating every bin symlink as a package link and another bypassing consumer checks must be detected by unchanged tests before restoring GREEN.

Actual npm-link command trials use isolated paths without changing the user's global link. Tests of the toolkit change itself remain normal development verification; the runtime exclusion does not waive them. Reuse existing adopt/deliver/review guidance, explaining default linked behavior without asking users to learn an exemption process.

## Risks / Trade-offs

- Mutable linked code is trusted development tooling rather than an attested product. That is the owner's explicit tradeoff, not a hidden assurance claim.
- Fixed policy source may need an explicit available local reference checkout; unavailable access must be reported rather than silently accepting mutable toolkit bytes.
- Symlink topology varies: support real native local/global npm-link layouts with fixtures and a real isolated trial, distinguishing ordinary shims. Do not infer link mode from a package version or a candidate field.

## Migration Plan

Keep the same #22 planning, #23 delivery and #24 aggregate closeout assignments with corrected fixed references; old artifact scope is withdrawn, not delivered. After independent design review and required owner acceptance, deliver the plan and ordered handoff. Current runtime use already follows the owner's no-self-trace operating direction; product code support is still pending and must not be falsely reported installed. A current pre-change check that still imposes the old linked self-trace behavior is retained as a known limitation, with any bounded transition explicitly accepted by the owner rather than manufactured by the candidate. #24 synchronizes both complete deltas, verifies actual consumer checks remain intact, and records any package selection without global-link or consumer-config mutation.
