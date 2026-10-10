// End to end through the public commands (#175, the check of task T9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY, STAMP, WORDS_FILE, appendSection, assertSnapshot, baseProject, binding, doc, docRecord, hashOf, index,
  ok, organized, read, record, req, sha, signedText, write,
} from './helpers/project.js';

const SPEC = 'specs/invoices.md';

test('a request from the owner\'s words to bound change spec links: the whole chain in the records', (t) => {
  const dir = baseProject(t);

  // 1. The request, from a file of the owner's words.
  const words = 'I want my invoices as one CSV file per month.\n';
  write(dir, 'notes/owner.txt', words);
  ok(dir, ['new', 'invoice-exports', '--from', 'notes/owner.txt', '--title', 'Invoice exports', '--tier', '2']);

  // 2. More source text.
  const more = 'Send me the link by email; it should not work forever.\n';
  ok(dir, ['record', 'invoice-exports', 'origin', '--url', 'https://example.com/chat/7', '--from', '-',
    '--fetched', '2026-05-06T10:00Z', '--yes'], { input: more });
  const moreFile = '2026-05-06-example-com-chat-7.md';
  assertSnapshot(read(dir, `requests/invoice-exports/origin/${moreFile}`),
    { source: 'https://example.com/chat/7', text: more, fetched: '2026-05-06T10:00Z' });

  // 3. The organized requirement, with from: markers.
  const R1 = req('R1', 'Monthly CSV download', 'A user MUST be able to download one month as one CSV file.', [WORDS_FILE]);
  const R2 = req('R2', 'An email link that expires', 'The link MUST stop working after a short time.', [WORDS_FILE, moreFile]);
  const section = organized([R1, R2], { tail: '\nOut: tax reports.\n' });
  appendSection(dir, 'invoice-exports', section);

  // 4. The owner signs that exact version.
  ok(dir, ['record', 'invoice-exports', 'signoff', '--source', 'owner by email', '--words', 'Yes, go ahead', '--yes']);

  // 5. A decision.
  const decision = '30 minutes is long enough for the email link.';
  ok(dir, ['record', 'invoice-exports', 'decision', '--source', 'owner', '--text', decision, '--clarifies', 'R2', '--yes']);

  // 6. The change spec, linked to the requirement and to a spec paragraph.
  write(dir, 'requests/invoice-exports/spec.md', doc([
    ['SP-1 note', '# Invoice exports'],
    ['SP-12 rule serves:R2 builds-on:INV-12', 'The export link MUST expire 30 minutes after the email is sent.'],
  ]));

  // 7. Index.
  index(dir);

  const rec = record(dir, 'invoice-exports');
  assert.equal(rec.tier, '2');
  assert.deepEqual(rec.sources, [
    { file: WORDS_FILE, kind: 'owner-words', sha256: sha(words), taken: STAMP },
    { file: moreFile, kind: 'owner-words', sha256: sha(more), taken: '2026-05-06T10:00Z', url: 'https://example.com/chat/7' },
  ]);
  assert.deepEqual(rec.requirements, [
    { id: 'R1', version: 1, sha256: R1.sha256, title: R1.title },
    { id: 'R2', version: 1, sha256: R2.sha256, title: R2.title },
  ]);
  const signed = signedText(section);
  assert.deepEqual(rec.signoff, [{
    id: 'S1', file: `${DAY}-signoff.md`, sha256: sha(signed), signed: STAMP, source: 'owner by email',
    words: 'Yes, go ahead',
    covers: [{ id: 'R1', version: 1, sha256: R1.sha256 }, { id: 'R2', version: 1, sha256: R2.sha256 }],
  }]);
  assertSnapshot(read(dir, `requests/invoice-exports/origin/${DAY}-signoff.md`),
    { source: 'owner by email', text: signed, fetched: STAMP, signoff: true, words: 'Yes, go ahead' });
  assert.ok(read(dir, 'requests/invoice-exports/request.md').includes(`Signed off: ${DAY} owner, origin/${DAY}-signoff.md\n`));
  assert.deepEqual(rec.decisions, [
    { id: 'D1', date: DAY, source: 'owner', text: decision, sha256: sha(decision), clarifies: ['R2'] },
  ]);

  const cs = 'requests/invoice-exports/spec.md';
  const sp12 = hashOf(dir, cs, 'SP-12');
  assert.deepEqual(binding(rec, 'invoice-exports/SP-12', 'serves', 'invoice-exports/R2'), {
    from: 'invoice-exports/SP-12', link: 'serves', to: 'invoice-exports/R2',
    from_sha256: sp12, to_sha256: R2.sha256, to_version: 1,
  });
  assert.equal(rec.signoff[0].covers[1].sha256, binding(rec, 'invoice-exports/SP-12', 'serves', 'invoice-exports/R2').to_sha256,
    'the sign-off covers the version that SP-12 serves');
  assert.deepEqual(binding(rec, 'invoice-exports/SP-12', 'builds-on', 'INV-12'), {
    from: 'invoice-exports/SP-12', link: 'builds-on', to: 'INV-12',
    from_sha256: sp12, to_sha256: hashOf(dir, SPEC, 'INV-12'),
  });
  for (const [r, file, h] of [[R1, WORDS_FILE, sha(words)], [R2, WORDS_FILE, sha(words)], [R2, moreFile, sha(more)]]) {
    assert.deepEqual(binding(rec, `invoice-exports/${r.id}`, 'from', `invoice-exports/${file}`), {
      from: `invoice-exports/${r.id}`, link: 'from', to: `invoice-exports/${file}`, from_sha256: r.sha256, to_sha256: h,
    });
  }
  assert.deepEqual(docRecord(dir, cs).paragraphs.map((p) => [p.id, p.kind, p.change]),
    [['SP-1', 'note', ['New']], ['SP-12', 'rule', ['New']]]);
});

test('an ADR with decides, source and supersedes, indexed: its bindings and its per-doc record', (t) => {
  const dir = baseProject(t);
  ok(dir, ['new', 'token-links', '--from', '-'], { input: 'A link must be cancellable.\n' });
  const decision = 'Use one-time tokens in place of signed links.';
  ok(dir, ['record', 'token-links', 'decision', '--source', 'architect', '--text', decision, '--yes']);
  const adr = 'specs/adr/0004-one-time-tokens.md';
  write(dir, adr, `Status: accepted\n\n${doc([
    ['ADR-4 choice decides:INV-41 source:token-links/D1 supersedes:ADR-3', '# ADR-4: One-time tokens'],
    ['ADR-4-1 rationale', 'Context: a link must be cancellable.'],
    ['ADR-4-2 rationale', 'Considered: signed links (ADR-3), which cannot be cancelled.'],
  ])}`);
  index(dir);

  const docRec = docRecord(dir, adr);
  assert.equal(docRec.schema, 'assuredloop/1');
  assert.equal(docRec.file, adr);
  assert.equal(docRec.status, 'accepted');
  assert.deepEqual(docRec.paragraphs.map((p) => [p.id, p.kind, p.change]),
    [['ADR-4', 'choice', ['New']], ['ADR-4-1', 'rationale', ['New']], ['ADR-4-2', 'rationale', ['New']]]);
  assert.equal(docRecord(dir, 'specs/adr/0003-signed-links.md').status, 'accepted');

  const rec = record(dir, 'token-links');
  const a4 = hashOf(dir, adr, 'ADR-4');
  assert.deepEqual(binding(rec, 'ADR-4', 'decides', 'INV-41'),
    { from: 'ADR-4', link: 'decides', to: 'INV-41', from_sha256: a4, to_sha256: hashOf(dir, SPEC, 'INV-41') });
  assert.deepEqual(binding(rec, 'ADR-4', 'source', 'token-links/D1'),
    { from: 'ADR-4', link: 'source', to: 'token-links/D1', from_sha256: a4, to_sha256: sha(decision) });
  assert.deepEqual(binding(rec, 'ADR-4', 'supersedes', 'ADR-3'), {
    from: 'ADR-4', link: 'supersedes', to: 'ADR-3', from_sha256: a4,
    to_sha256: hashOf(dir, 'specs/adr/0003-signed-links.md', 'ADR-3'),
  });
  assert.equal(rec.bindings.length, 3);
});
