// Bindings: each link kind, the IDs, which record holds a link, and the links
// that are not bound (#175).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORDS_FILE, appendSection, baseProject, binding, bindingsOf, doc, editRecord, hashOf, index, newRequest, ok,
  organized, read, record, req, sha, write,
} from './helpers/project.js';

const SPEC = 'specs/invoices.md';
const CS = 'requests/inv/spec.md';
const ADR3 = 'specs/adr/0003-signed-links.md';
const WORDS = 'I want my invoices as CSV, and a link by email.\n';
const MORE = 'The link should not work forever.\n';
const MORE_FILE = '2026-05-06-example-com-call-notes.md';
const R1 = req('R1', 'Monthly CSV download', 'A user MUST be able to download one month as one CSV file.', [WORDS_FILE]);
const R2 = req('R2', 'An email link that expires', 'The link MUST stop working after a short time.', [WORDS_FILE, MORE_FILE]);
const DTEXT = '30 minutes is long enough for the email link.';

// main: config, specs/invoices.md, ADR-3. Branch feature: the request inv with
// two snapshots, R1 and R2, sign-off S1 and decision D1.
function chain(t) {
  const dir = baseProject(t);
  newRequest(dir, 'inv', WORDS);
  ok(dir, ['record', 'inv', 'origin', '--url', 'https://example.com/call-notes', '--from', '-',
    '--fetched', '2026-05-06T10:00Z', '--yes'], { input: MORE });
  appendSection(dir, 'inv', organized([R1, R2]));
  ok(dir, ['record', 'inv', 'signoff', '--source', 'owner by email', '--yes']);
  ok(dir, ['record', 'inv', 'decision', '--source', 'owner', '--text', DTEXT, '--clarifies', 'R2', '--yes']);
  return dir;
}

const pair = (holder, target) => ({ holder_sha256: holder, target_sha256: target });

test('each link kind of a change spec is bound in its request record, with both hashes', (t) => {
  const dir = chain(t);
  write(dir, CS, doc([
    ['SP-1 rule serves:R2 builds-on:INV-12', 'The export link MUST expire 30 minutes after the email is sent.'],
    ['SP-2 rule changes:INV-41', 'The export link MUST expire 30 minutes after it is first opened.'],
    ['SP-3 limit removes:INV-13', 'An invoice MAY have no line.'],
    ['SP-4 rationale explains:SP-1', 'A short life limits a leaked link.'],
    ['SP-5 example illustrates:SP-1', 'Sent at 10:00, the link stops at 10:30.'],
    ['SP-6 open resolved-by:D1', 'How long is short?'],
    ['SP-7 approach governed-by:ADR-3 for:T2', 'Sign the link with the server key.'],
    ['SP-8 rationale explains:S1', 'The owner signed the expiry.'],
  ]));
  index(dir);
  const rec = record(dir, 'inv');
  const sp = (id) => hashOf(dir, CS, id);
  const inv = (id) => hashOf(dir, SPEC, id);
  const d1 = rec.decisions.find((d) => d.id === 'D1');
  const s1 = rec.signoff.find((s) => s.id === 'S1');
  assert.equal(d1.sha256, sha(DTEXT));

  const expect = (from, link, to, hashes, extra = {}) =>
    assert.deepEqual(binding(rec, from, link, to), { holder: from, link, target: to, ...hashes, ...extra });
  expect('inv/SP-1', 'serves', 'inv/R2', pair(sp('SP-1'), R2.sha256), { target_version: 1 });
  expect('inv/SP-1', 'builds-on', 'INV-12', pair(sp('SP-1'), inv('INV-12')));
  expect('inv/SP-2', 'changes', 'INV-41', pair(sp('SP-2'), inv('INV-41')));
  expect('inv/SP-3', 'removes', 'INV-13', pair(sp('SP-3'), inv('INV-13')));
  expect('inv/SP-4', 'explains', 'inv/SP-1', pair(sp('SP-4'), sp('SP-1')));
  expect('inv/SP-5', 'illustrates', 'inv/SP-1', pair(sp('SP-5'), sp('SP-1')));
  expect('inv/SP-6', 'resolved-by', 'inv/D1', pair(sp('SP-6'), d1.sha256));
  expect('inv/SP-7', 'governed-by', 'ADR-3', pair(sp('SP-7'), hashOf(dir, ADR3, 'ADR-3')));
  expect('inv/SP-8', 'explains', 'inv/S1', pair(sp('SP-8'), s1.sha256));
  assert.equal(rec.bindings.filter((b) => b.link === 'for').length, 0, 'a for: link is not bound');
  assert.equal(rec.bindings.filter((b) => b.holder.startsWith('inv/SP-')).length, 9);
});

test("a requirement's from: is bound to each snapshot it names", (t) => {
  const dir = chain(t);
  index(dir);
  const rec = record(dir, 'inv');
  const [words, more] = rec.sources;
  assert.equal(words.sha256, sha(WORDS));
  assert.equal(more.sha256, sha(MORE));
  assert.deepEqual(binding(rec, 'inv/R1', 'from', `inv/${WORDS_FILE}`),
    { holder: 'inv/R1', link: 'from', target: `inv/${WORDS_FILE}`, ...pair(R1.sha256, words.sha256) });
  assert.deepEqual(binding(rec, 'inv/R2', 'from', `inv/${WORDS_FILE}`),
    { holder: 'inv/R2', link: 'from', target: `inv/${WORDS_FILE}`, ...pair(R2.sha256, words.sha256) });
  assert.deepEqual(binding(rec, 'inv/R2', 'from', `inv/${MORE_FILE}`),
    { holder: 'inv/R2', link: 'from', target: `inv/${MORE_FILE}`, ...pair(R2.sha256, more.sha256) });
  assert.equal(rec.bindings.filter((b) => b.link === 'from').length, 3);
});

test('declared outputs are bound with the hash of the file bytes; an output of another repo is not', (t) => {
  const dir = chain(t);
  const code = 'export const expiresAfter = 30 * 60;\n';
  const testFile = "import './export-link.js';\n";
  const userDoc = '# Exports\n\nThe link expires after 30 minutes.\n';
  write(dir, 'src/export-link.js', code);
  write(dir, 'test/export-link.test.js', testFile);
  write(dir, 'docs/exports.md', userDoc);
  editRecord(dir, 'inv', (rec) => {
    rec.outputs = [
      { file: 'src/export-link.js', implements: ['INV-41'] },
      { file: 'test/export-link.test.js', verifies: ['INV-41', 'inv/R2'] },
      { file: 'docs/exports.md', documents: ['INV-41'] },
      { repo: 'invoicer-web', file: 'src/web-link.js', implements: ['INV-41'] },
    ];
  });
  index(dir);
  const rec = record(dir, 'inv');
  const inv41 = hashOf(dir, SPEC, 'INV-41');
  assert.deepEqual(binding(rec, 'src/export-link.js', 'implements', 'INV-41'),
    { holder: 'src/export-link.js', link: 'implements', target: 'INV-41', ...pair(sha(code), inv41) });
  assert.deepEqual(binding(rec, 'test/export-link.test.js', 'verifies', 'INV-41'),
    { holder: 'test/export-link.test.js', link: 'verifies', target: 'INV-41', ...pair(sha(testFile), inv41) });
  assert.deepEqual(binding(rec, 'test/export-link.test.js', 'verifies', 'inv/R2'),
    { holder: 'test/export-link.test.js', link: 'verifies', target: 'inv/R2', ...pair(sha(testFile), R2.sha256), target_version: 1 });
  assert.deepEqual(binding(rec, 'docs/exports.md', 'documents', 'INV-41'),
    { holder: 'docs/exports.md', link: 'documents', target: 'INV-41', ...pair(sha(userDoc), inv41) });
  assert.equal(rec.bindings.filter((b) => b.holder.includes('web-link')).length, 0, 'cross-repo is not bound here');
  assert.equal(rec.outputs.length, 4, 'the hand-written outputs stay');
});

test('a specs/ paragraph link is held by every open request its targets name; with none it is not bound', (t) => {
  const dir = chain(t);
  newRequest(dir, 'other');
  const O1 = req('R1', 'Yearly ZIP', 'A user MUST be able to download a year as one ZIP file.');
  appendSection(dir, 'other', organized([O1]));
  write(dir, SPEC, `${read(dir, SPEC)}\n${doc([
    ['INV-42 rule serves:inv/R2 builds-on:INV-12', 'An export link MUST name one invoice month.'],
    ['INV-43 rule serves:inv/R1,other/R1', 'An export MUST use ISO dates.'],
    ['INV-50 rule builds-on:INV-12', 'An invoice number MUST be unique.'],
  ])}`);
  const r = index(dir);
  const inv = (id) => hashOf(dir, SPEC, id);
  const rec = record(dir, 'inv');
  const other = record(dir, 'other');

  assert.deepEqual(binding(rec, 'INV-42', 'serves', 'inv/R2'),
    { holder: 'INV-42', link: 'serves', target: 'inv/R2', ...pair(inv('INV-42'), R2.sha256), target_version: 1 });
  assert.deepEqual(binding(rec, 'INV-42', 'builds-on', 'INV-12'),
    { holder: 'INV-42', link: 'builds-on', target: 'INV-12', ...pair(inv('INV-42'), inv('INV-12')) });
  assert.equal(bindingsOf(other, 'INV-42', 'serves', 'inv/R2').length, 0, 'other is not named by INV-42');

  for (const holder of [rec, other]) {
    assert.deepEqual(binding(holder, 'INV-43', 'serves', 'inv/R1'),
      { holder: 'INV-43', link: 'serves', target: 'inv/R1', ...pair(inv('INV-43'), R1.sha256), target_version: 1 });
    assert.deepEqual(binding(holder, 'INV-43', 'serves', 'other/R1'),
      { holder: 'INV-43', link: 'serves', target: 'other/R1', ...pair(inv('INV-43'), O1.sha256), target_version: 1 });
  }

  for (const holder of [rec, other]) assert.equal(holder.bindings.filter((b) => b.holder === 'INV-50').length, 0);
  assert.match(r.stdout, /^not bound: INV-50 builds-on INV-12: no request record holds it$/m);
});

test("an ADR's decides, source and supersedes are bound in the request its source names", (t) => {
  const dir = chain(t);
  const adr4 = 'specs/adr/0004-one-time-tokens.md';
  write(dir, adr4, `Status: accepted\n\n${doc([
    ['ADR-4 choice decides:INV-41 source:inv/D1 supersedes:ADR-3', '# ADR-4: One-time tokens'],
    ['ADR-4-1 rationale', 'Context: a link must be cancellable.'],
  ])}`);
  const adr5 = 'specs/adr/0005-sign-off-source.md';
  write(dir, adr5, `Status: proposed\n\n${doc([
    ['ADR-5 choice decides:INV-12 source:inv/S1', '# ADR-5: Numbers come from the ledger'],
  ])}`);
  const adr6 = 'specs/adr/0006-no-request.md';
  write(dir, adr6, `Status: proposed\n\n${doc([['ADR-6 choice decides:INV-13', '# ADR-6: Lines are kept']])}`);
  const r = index(dir);
  const rec = record(dir, 'inv');
  const a4 = hashOf(dir, adr4, 'ADR-4');
  assert.deepEqual(binding(rec, 'ADR-4', 'decides', 'INV-41'),
    { holder: 'ADR-4', link: 'decides', target: 'INV-41', ...pair(a4, hashOf(dir, SPEC, 'INV-41')) });
  assert.deepEqual(binding(rec, 'ADR-4', 'source', 'inv/D1'),
    { holder: 'ADR-4', link: 'source', target: 'inv/D1', ...pair(a4, sha(DTEXT)) });
  assert.deepEqual(binding(rec, 'ADR-4', 'supersedes', 'ADR-3'),
    { holder: 'ADR-4', link: 'supersedes', target: 'ADR-3', ...pair(a4, hashOf(dir, ADR3, 'ADR-3')) });
  assert.deepEqual(binding(rec, 'ADR-5', 'source', 'inv/S1'),
    { holder: 'ADR-5', link: 'source', target: 'inv/S1', ...pair(hashOf(dir, adr5, 'ADR-5'), rec.signoff[0].sha256) });
  assert.equal(rec.bindings.filter((b) => b.holder.startsWith('ADR-4-')).length, 0);
  assert.equal(rec.bindings.filter((b) => b.holder === 'ADR-6').length, 0);
  assert.match(r.stdout, /^not bound: ADR-6 decides INV-13: no request record holds it$/m);
});

test('IDs in a change spec: R, D, S and its own IDs are the request\'s; <request>/<ID> is another\'s; Q in a spike', (t) => {
  const dir = chain(t);
  newRequest(dir, 'other');
  const O1 = req('R1', 'Yearly ZIP', 'A user MUST be able to download a year as one ZIP file.');
  appendSection(dir, 'other', organized([O1]));
  write(dir, CS, doc([
    ['SP-1 rule serves:R1', 'A month MUST be one CSV file.'],
    ['SP-10 rule serves:other/R1 builds-on:INV-12', 'A ZIP MUST hold one CSV file per month.'],
  ]));
  newRequest(dir, 'spike-a', 'Can we sign links?\n', ['--tier', 'S']);
  const Q1 = req('Q1', 'Signed links', 'Can a signed link replace the token table?');
  appendSection(dir, 'spike-a', organized([Q1], { heading: '## Organized question' }));
  write(dir, 'requests/spike-a/spec.md', doc([['SP-1 approach serves:Q1', 'Try an HMAC over the invoice ID.']]));
  index(dir);
  const rec = record(dir, 'inv');
  const sp = (id) => hashOf(dir, CS, id);
  assert.deepEqual(binding(rec, 'inv/SP-1', 'serves', 'inv/R1'),
    { holder: 'inv/SP-1', link: 'serves', target: 'inv/R1', ...pair(sp('SP-1'), R1.sha256), target_version: 1 });
  assert.deepEqual(binding(rec, 'inv/SP-10', 'serves', 'other/R1'),
    { holder: 'inv/SP-10', link: 'serves', target: 'other/R1', ...pair(sp('SP-10'), O1.sha256), target_version: 1 });
  assert.deepEqual(binding(rec, 'inv/SP-10', 'builds-on', 'INV-12'),
    { holder: 'inv/SP-10', link: 'builds-on', target: 'INV-12', ...pair(sp('SP-10'), hashOf(dir, SPEC, 'INV-12')) });
  assert.equal(record(dir, 'other').bindings.filter((b) => b.holder.startsWith('inv/')).length, 0,
    'a change spec link is held by its own request');
  const spike = record(dir, 'spike-a');
  assert.deepEqual(binding(spike, 'spike-a/SP-1', 'serves', 'spike-a/Q1'), {
    holder: 'spike-a/SP-1', link: 'serves', target: 'spike-a/Q1',
    ...pair(hashOf(dir, 'requests/spike-a/spec.md', 'SP-1'), Q1.sha256), target_version: 1,
  });
});

test('not bound: a target that is not found, and a cross-repo ID', (t) => {
  const dir = chain(t);
  write(dir, CS, doc([
    ['SP-20 rule builds-on:INV-999', 'A rule on a missing paragraph.'],
    ['SP-21 rule serves:R9', 'A rule for a missing requirement.'],
    ['SP-22 rule builds-on:central:INV-41', 'A rule on a paragraph of another repo.'],
    ['SP-23 rule serves:R1', 'A rule that is bound.'],
  ]));
  const r = index(dir);
  const rec = record(dir, 'inv');
  assert.match(r.stdout, /^not bound: inv\/SP-20 builds-on INV-999: target not found$/m);
  assert.match(r.stdout, /^not bound: inv\/SP-21 serves inv\/R9: target not found$/m);
  for (const id of ['SP-20', 'SP-21', 'SP-22']) {
    assert.equal(rec.bindings.filter((b) => b.holder === `inv/${id}`).length, 0, `${id} is not bound`);
  }
  assert.equal(rec.bindings.filter((b) => String(b.target).includes('central')).length, 0);
  binding(rec, 'inv/SP-23', 'serves', 'inv/R1');
});
