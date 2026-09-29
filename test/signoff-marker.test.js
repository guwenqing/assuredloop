// Issue #96 [REC-5] [REC-6]: a file in origin/ is a sign-off only when its
// header ends with the separator line exactly `--- signed text ---`, as al
// record <name> signoff --yes writes it. A snapshot whose header ends with
// the ordinary `---` is never a sign-off, even when its text holds the line
// `--- signed text ---`. The Signed off: line is not required; it only
// breaks ties. The same classification holds for context, conclude,
// context --audit, and check's note on work that reached main before the
// first sign-off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { ENV, both } from './helpers/request.js';
import { check, hint, message } from './helpers/hints.js';

const DAY_LATER = { ...ENV, SOURCE_DATE_EPOCH: String(Number(ENV.SOURCE_DATE_EPOCH) + 86400) }; // 2026-09-24T23:30Z
// The issue's organized section: it quotes the marker on a line of its own, in a code block.
const QUOTING = '## Organized requirement\n\n### R1 Sign-off documentation\nThe guide MUST describe this literal marker:\n\n' +
  '```text\n--- signed text ---\n```\n\nOut: none\nAssumed: none\n';
const PLAIN = '## Organized requirement\n\n### R1 Totals\nTotals MUST show two decimals.\n\nOut: none\n';
const OWNER_WORDS = 'origin/2026-09-23-owner-words.md';

const al = (repo, args, { input, env = ENV } = {}) => runAl(repo.dir, args, { input, env });
const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);
function context(repo, name, ...args) {
  const r = al(repo, ['context', name, ...args]);
  ok(r, `context ${name} ${args.join(' ')}`);
  assertFrame(r.stdout);
  return r.stdout;
}
const labelled = (out, label) => lines(out).filter((l) => new RegExp(`^${label}\\s`).test(l));

// al new `name` --tier 1 with `words` on standard input, then `org` appended to request.md.
function newRequest(repo, name, words, org) {
  ok(al(repo, ['new', name, '--tier', '1', '--from', '-'], { input: words }), `new ${name}`);
  const path = `requests/${name}/request.md`;
  repo.write(path, `${repo.read(path).toString()}\n${org}`);
}

// --- the issue's case: the owner's words quote the marker, and nobody signed ---

function snapshotCase(t) {
  const repo = makeRepo(t);
  newRequest(repo, 'snapshot-case', QUOTING, QUOTING);
  const words = repo.read(`requests/snapshot-case/${OWNER_WORDS}`).toString();
  assert.ok(words.includes('\n---\n') && words.includes('\n--- signed text ---\n'), `the fixture: an ordinary snapshot whose text holds the marker:\n${words}`);
  assert.doesNotMatch(repo.read('requests/snapshot-case/request.md').toString(), /^Signed off:/m, 'the fixture: no Signed off line');
  repo.commit('snapshot-case: request', { date: '2026-09-24T12:00:00Z' });
  return repo;
}

test('#96 [REC-6] the owner\'s words quote "--- signed text ---", nobody signed: context shows BLOCKED, not "signed off origin/…-owner-words.md"', (t) => {
  const out = context(snapshotCase(t), 'snapshot-case');
  assert.match(lines(out)[0], /^BLOCKED/, `awaiting sign-off:\n${out}`);
  assert.ok(!lines(out).some((l) => /signed off/.test(l) && l.includes('owner-words')), `the owner's words are not a sign-off:\n${out}`);
});

test('#96 [REC-6] the same request: conclude --yes refuses, exit 1, and writes nothing', (t) => {
  const repo = snapshotCase(t);
  const r = al(repo, ['conclude', 'snapshot-case', '--yes']);
  assert.equal(r.code, 1, `conclude should refuse:\n${both(r)}`);
  assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written');
});

test('#96 [REC-5] the same request: context --audit lists the owner\'s words as a Snapshot, and no Sign-off', (t) => {
  const out = context(snapshotCase(t), 'snapshot-case', '--audit');
  assert.ok(labelled(out, 'Snapshot').some((l) => l.includes(OWNER_WORDS)), `a Snapshot line for ${OWNER_WORDS}:\n${out}`);
  assert.deepEqual(labelled(out, 'Sign-off'), [], `no Sign-off line:\n${out}`);
});

// --- a later snapshot that quotes the marker does not block a signed request ---

const QUOTED_PAGE = 'How to sign off:\n\n```text\n--- signed text ---\n```\n';
// Signed with al record signoff --yes on 2026-09-23 (its Signed off line
// taken out unless `keepSignedOffLine`); a day later, unless not `quote`, a
// snapshot of a page quoting the marker.
function signedThenQuoted(t, { keepSignedOffLine = true, quote = true } = {}) {
  const repo = makeRepo(t);
  newRequest(repo, 'totals', 'Totals need two decimals.\n', PLAIN);
  ok(al(repo, ['record', 'totals', 'signoff', '--source', 'chat with the owner', '--words', '"OK"', '--yes']), 'record signoff');
  if (!keepSignedOffLine) {
    const path = 'requests/totals/request.md';
    const md = repo.read(path).toString();
    assert.match(md, /^Signed off: .*\n/m, 'the fixture: record signoff wrote a Signed off line');
    repo.write(path, md.replace(/^Signed off: .*\n/m, ''));
  }
  if (quote) ok(al(repo, ['record', 'totals', 'origin', '--url', 'https://example.com/guide', '--from', '-', '--yes'], { input: QUOTED_PAGE, env: DAY_LATER }), 'record origin');
  repo.commit('totals: request, sign-off and a snapshot', { date: '2026-09-25T12:00:00Z' });
  return repo;
}
const quotedFile = (out) => (out.match(/origin\/2026-09-24-[\w.-]+\.md/) ?? [])[0];

test('#96 [REC-5] a signed request, then a later snapshot whose text quotes the marker: still signed, by the real sign-off, unchanged since', (t) => {
  const out = context(signedThenQuoted(t), 'totals');
  assert.doesNotMatch(lines(out)[0], /^BLOCKED/, `still signed:\n${out}`);
  const require = labelled(out, 'Require')[0];
  assert.ok(require, `a Require line:\n${out}`);
  assert.match(require, /signed off origin\/2026-09-23-signoff\.md/, `the latest sign-off is the real one:\n${require}`);
  assert.match(require, /unchanged since/, require);
});

test('#96 [REC-5] the same request: context --audit lists the quoting snapshot as a Snapshot, and only the real file as a Sign-off', (t) => {
  const out = context(signedThenQuoted(t), 'totals', '--audit');
  const quoted = quotedFile(out);
  assert.ok(quoted, `the fixture: the audit names the 2026-09-24 snapshot:\n${out}`);
  assert.ok(labelled(out, 'Snapshot').some((l) => l.includes(quoted)), `a Snapshot line for ${quoted}:\n${out}`);
  const signoffs = labelled(out, 'Sign-off');
  assert.equal(signoffs.length, 1, `one Sign-off line:\n${out}`);
  assert.match(signoffs[0], /origin\/2026-09-23-signoff\.md/, signoffs[0]);
});

test('#96 [REC-5] contrast, unchanged: a real sign-off file counts with or without a Signed off line in request.md', (t) => {
  for (const keepSignedOffLine of [true, false]) {
    const out = context(signedThenQuoted(t, { keepSignedOffLine, quote: false }), 'totals');
    assert.doesNotMatch(lines(out)[0], /^BLOCKED/, `signed (Signed off line ${keepSignedOffLine ? 'kept' : 'taken out'}):\n${out}`);
    assert.match(labelled(out, 'Require')[0] ?? '', /signed off origin\/2026-09-23-signoff\.md/, out);
  }
});

test('#96 [REC-5] a real sign-off file with no Signed off line in request.md, and the quoting snapshot beside it: still signed by the real file', (t) => {
  const out = context(signedThenQuoted(t, { keepSignedOffLine: false }), 'totals');
  assert.doesNotMatch(lines(out)[0], /^BLOCKED/, `signed by its sign-off file:\n${out}`);
  assert.match(labelled(out, 'Require')[0] ?? '', /signed off origin\/2026-09-23-signoff\.md/, out);
});

// --- check: the quoting snapshot is not the first sign-off ---

test('#96 [REC-10][HNT-2] check: work that reached main after a snapshot quoting the marker, but before the real sign-off, is noted "before its first sign-off"', (t) => {
  const repo = makeRepo(t);
  newRequest(repo, 'guide', QUOTING, QUOTING);
  repo.commit('guide: request, its owner\'s words quoting the marker', { date: '2026-09-20T12:00:00Z' });
  repo.write('docs/guide.md', '# Signing off\n');
  const early = repo.commit(message('The guide, early', { request: 'guide', tier: '1 — guide' }), { date: '2026-09-21T12:00:00Z' });
  ok(al(repo, ['record', 'guide', 'signoff', '--source', 'chat with the owner', '--yes']), 'record signoff');
  repo.commit(message('Sign off guide', { request: 'guide', tier: '1 — guide' }), { date: '2026-09-22T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('docs/guide.md', '# Signing off\n\nWrite the marker on a line of its own.\n');
  repo.commit(message('The guide, more', { request: 'guide', tier: '1 — guide' }), { date: '2026-09-23T12:00:00Z' });
  hint(check(repo, '--all'), 'note', 'before its first sign-off', early.slice(0, 7));
});
