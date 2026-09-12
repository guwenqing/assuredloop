## ADDED Requirements

### Requirement: Accepted native no-Spec changes have an explicit synchronization result

For an accepted fixed change declaring a valid native `skip_specs: true`, with no delta or retirement artifacts, synchronization SHALL compare the complete candidate current Spec inventory and bytes with the actual destination baseline. Identical current Specs SHALL yield an explicit no-Spec synchronization result, not an unavailable-delta error or a claim that product behavior was independently proven unchanged. Independent review SHALL assess whether the real assigned/code scope legitimately needs no specification change.

An absent, false, malformed, unsupported-schema or unaccepted declaration SHALL not excuse missing required deltas. Changed, added or removed current Specs and contradictory delta/retirement input SHALL be reported; the flag SHALL not hide lost or changed requirements. Freshness, source fixity and closeout acceptance checks SHALL still apply. Nonempty native changes SHALL retain their existing full-delta synchronization behavior.

#### Scenario: Accepted tooling change has no product delta
- **WHEN** the accepted fixed change has a valid skip declaration and zero deltas, and the full current Spec baseline is unchanged
- **THEN** the result explicitly reports verified no-Spec synchronization with its compared snapshots and remaining semantic review obligation

#### Scenario: Empty change has no valid exemption
- **WHEN** required delta input is empty without a valid accepted native skip declaration
- **THEN** missing-delta verification still fails or remains unavailable rather than treating all empty changes as successful

#### Scenario: Skip declaration conceals a baseline change
- **WHEN** the candidate changes, adds or removes a current Spec or supplies contradictory native delta/retirement input
- **THEN** no-Spec synchronization is invalid, including a baseline wording change that ordinary requirement parsing would otherwise ignore

### Requirement: Manifests preserve initial verification and contribution identities

Manifest capture and revalidation SHALL support a verified initial-bootstrap entry while preserving explicit historical policy absence, original sources and their raw-representation digests. The later verification policy SHALL remain separate from the absent original policy and from the aggregate closeout policy. Missing unverified historical audit data SHALL retain its existing gap status; an unstructured summary or arbitrary null field SHALL not receive this exception.

Manifest prerequisite inventory SHALL match an Issue dependency to its `issues` identities and a PR-contribution dependency to its `prs` identities. A syntactic match SHALL not establish delivered scope or replace verification of the referenced source. Every change in shared aggregate closeout SHALL retain its own complete accepted delta and acceptance inventory; consolidating closeout work SHALL not discard an individual change's evidence.

A closeout PR MAY select one native change through its existing `change` and fixed task references when the assigned aggregate Issue covers multiple changes. Selection SHALL resolve to that Issue's canonical assigned contribution and accepted whole-change revision; ambiguity, unassigned scope or conflicting selectors SHALL fail. Each PR SHALL retain its own synchronization and manifest assessment. Partial contributions SHALL not complete the aggregate Issue or mutate the meaning of earlier selections.

#### Scenario: Initial bootstrap is retained for aggregate acceptance
- **WHEN** the explicitly verified original bootstrap sources and later assessment remain available and unchanged
- **THEN** capture and revalidation retain their distinct provenance without manufacturing a past policy or rejecting confirmed absence merely as unknown audit data

#### Scenario: Bootstrap source changes or disappears
- **WHEN** an original approval/review/delivery source or the later verification changes or is unavailable
- **THEN** fixity or coverage failure remains visible and the old summary does not qualify as complete revalidation

#### Scenario: Dependency is a specific planning PR
- **WHEN** a closeout prerequisite names a PR rather than its still-open planning Issue
- **THEN** the manifest checks the corresponding PR entry and its actual assessed contribution instead of requiring the PR number in the Issue identity array

#### Scenario: Batch closeout contains two native changes
- **WHEN** one aggregate Issue assigns closeout tasks from two changes and a PR selects one of them
- **THEN** verification checks the selected complete delta and assigned contribution, preserves the other change's obligations and leaves aggregate completion pending until all assigned work is delivered
