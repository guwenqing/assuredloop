import assert from 'node:assert/strict';
import test from 'node:test';
import { collectRecordReferences, validateRecord } from '../src/records.js';
import { readSourceRecord } from '../src/source-record.js';
import { commentSource, gitSource, purposes, ref, verificationRecord, wrap } from './fixtures/issue36-bootstrap/records.mjs';

test('initial bootstrap has a distinct shared schema and comment discovery role', async () => {
  const record = verificationRecord();
  const shape = validateRecord('initialBootstrapVerification', record);
  assert.equal(shape.valid, true, JSON.stringify(shape.errors));
  const found = await readSourceRecord(wrap(record), { discoverEvidence: true });
  assert.equal(found.state, 'valid', JSON.stringify(found.findings));
  assert.equal(found.kind, 'initialBootstrapVerification');
  assert.deepEqual(found.record, record);
  assert.equal(validateRecord('evidence', record).valid, false, 'later verification is never historical Evidence');
});

test('bootstrap discovery retains plain tagged records and all nested acquisition references', async () => {
  const record = verificationRecord();
  record.sources[3].source = gitSource(ref('e'.repeat(40), 'reports/original-delivery.md'));
  const found = await readSourceRecord(JSON.stringify(record), { allowPlain: true, discoverEvidence: true });
  assert.equal(found.state, 'valid', JSON.stringify(found.findings));
  assert.equal(found.kind, 'initialBootstrapVerification');
  const refs = collectRecordReferences(record);
  for (const expected of [record.pr, record.bootstrap_ref, record.verification_policy_ref,
    ...record.sources.map(({ source }) => source.kind === 'git-blob'
      ? source.ref : { repository: source.repository, comment_id: source.comment_id })]) {
    assert.ok(refs.some((actual) => JSON.stringify(actual) === JSON.stringify(expected)), `missing acquisition reference ${JSON.stringify(expected)}`);
  }
});

for (const purpose of purposes) {
  test(`bootstrap schema requires the original ${purpose} purpose`, () => {
    const record = verificationRecord();
    record.sources = record.sources.filter((source) => source.purpose !== purpose);
    assert.equal(validateRecord('initialBootstrapVerification', record).valid, false);
  });
}

for (const [name, mutate] of [
  ['unknown tag', (record) => { record.record_type = 'initial-bootstrap-verified'; }],
  ['ordinary Evidence audit fields', (record) => { record.policy_ref = record.verification_policy_ref; record.config_digest = 'f'.repeat(64); }],
  ['decision fields', (record) => { record.selection = 'improvement'; record.authorized_by = 'owner'; }],
  ['command execution fields', (record) => { record.command = 'true'; record.exit_code = 0; }],
  ['bad source representation', (record) => { record.sources[0].source.normalization = 'nfc'; }],
  ['malformed digest', (record) => { record.sources[0].content_sha256 = 'not-a-hash'; }],
  ['missing later policy', (record) => { delete record.verification_policy_ref; }],
  ['missing original head', (record) => { delete record.head; }],
  ['unknown result', (record) => { record.result = 'approved'; }],
]) {
  test(`malformed or mixed bootstrap ${name} cannot become manual prose or normal Evidence`, async () => {
    const record = verificationRecord(); mutate(record);
    assert.equal(validateRecord('initialBootstrapVerification', record).valid, false);
    for (const body of [wrap(record), JSON.stringify(record)]) {
      const found = await readSourceRecord(body, { allowPlain: true, discoverEvidence: true });
      assert.equal(found.state, 'invalid', JSON.stringify(found));
      assert.ok(found.findings.length > 0);
    }
  });
}

test('duplicate tagged Workflow contexts remain invalid', async () => {
  const body = wrap(verificationRecord());
  const found = await readSourceRecord(`${body}\n${body}`, { discoverEvidence: true });
  assert.equal(found.state, 'invalid');
  assert.ok(found.findings.some((finding) => finding.code === 'record-context-invalid'));
});

test('revise and incomplete bootstrap results are valid records, separate from eligibility', () => {
  for (const result of ['revise', 'incomplete']) {
    const record = { ...verificationRecord(), result };
    assert.equal(validateRecord('initialBootstrapVerification', record).valid, true);
  }
});

test('typed bootstrap schema does not authenticate owners or session declarations', () => {
  const record = verificationRecord();
  record.reviewer_session = record.producer_session;
  record.sources[0].source = commentSource(999);
  assert.equal(validateRecord('initialBootstrapVerification', record).valid, true,
    'independence and actual acceptance are assessment obligations, not proof from JSON shape');
});
