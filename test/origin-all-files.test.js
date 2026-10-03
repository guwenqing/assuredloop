// Issue #138, item 6 [REC-3] [HNT-2] [VW-2] [VW-7]: every file in a
// request's origin/ is a snapshot to every reader, whatever its extension. An
// edited origin/signoff.txt, whose text no longer matches its SHA-256, is a
// `not ok` in check as it is in --audit, and context <name> lists it among
// the snapshots as it lists the .md ones. A hidden file (its name starting
// with ".", such as a stray .DS_Store) is no snapshot: every reader ignores it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl, sha256 } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { addRequest, both, lineWith } from './helpers/request.js';
import { check, checkHints, message, strict } from './helpers/hints.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const TEXT = 'Please add a CSV download to the invoice page.\n';
const snap = (text) => `Source: https://example.com/issues/31\nFetched: 2026-09-22T10:00Z\nSHA-256: ${sha256(TEXT)}\n---\n${text}`;

// Main: the baseline and the signed request csv, whose origin/ also holds
// `file`, a valid snapshot of TEXT. In the working tree its text is edited.
function setup(t, file) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  addRequest(repo, 'csv', null);
  repo.write(`requests/csv/origin/${file}`, snap(TEXT));
  repo.commit('csv: request', { date: '2026-09-22T12:00:00Z' });
  repo.write(`requests/csv/origin/${file}`, snap('Please add a PDF download to the invoice page.\n'));
  return repo;
}

for (const file of ['signoff.txt', 'issue.md']) {
  test(`#138 [REC-3][HNT-2] ${file === 'issue.md' ? 'contrast: ' : ''}an edited origin/${file}: al check says not ok naming origin/${file}, "no longer matches its SHA-256"`, (t) => {
    const repo = setup(t, file);
    const out = check(repo, '--all');
    assert.ok(checkHints(out).some((l) => l.startsWith('not ok') && l.includes(`origin/${file}`) && l.includes('no longer matches its SHA-256')),
      `expected a not ok naming origin/${file}:\n${out}`);
  });

  test(`#138 [REC-3][VW-2] ${file === 'issue.md' ? 'contrast: ' : ''}an edited origin/${file}: context csv lists it among the snapshots, beside the owner's words`, (t) => {
    const repo = setup(t, file);
    const r = runAl(repo.dir, ['context', 'csv']);
    assert.equal(r.code, 0, both(r));
    const words = lineWith(r.stdout, '2026-09-20-owner-words.md');
    assert.ok(words, `the snapshots line names the owner's words:\n${r.stdout}`);
    assert.ok(words.includes(file), `the snapshots line should list ${file} as it lists the .md ones:\n${r.stdout}`);
  });
}

test('#138 [VW-7] contrast: --audit on csv already flags the edited origin/signoff.txt', (t) => {
  const repo = setup(t, 'signoff.txt');
  const r = runAl(repo.dir, ['context', 'csv', '--audit']);
  assert.equal(r.code, 0, both(r));
  assert.ok(lines(r.stdout).some((l) => l.includes('origin/signoff.txt') && l.includes('no longer matches its SHA-256')), r.stdout);
});

// Bytes as a Finder .DS_Store holds them: no snapshot header, not text.
const DS_STORE = Buffer.from([0, 0, 0, 1, 0x42, 0x75, 0x64, 0x31, 0, 0, 0x10, 0, 0, 0, 0x08, 0, 0xff, 0xfe, 0x0a, 0x1b]);

// Main: the baseline. The branch work: one commit adding the signed request
// csv, tier 2, so check counts csv's not oks. requests/csv/origin/<file>
// holds `bytes`, in that commit when `committed`, else untracked.
function stray(t, file, bytes, { committed }) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  repo.commit('Baseline', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  addRequest(repo, 'csv', null);
  if (committed) repo.write(`requests/csv/origin/${file}`, bytes);
  repo.commit(message('csv: request', { request: 'csv', tier: '2 — csv' }), { date: '2026-09-22T12:00:00Z' });
  if (!committed) repo.write(`requests/csv/origin/${file}`, bytes);
  assert.equal(repo.git(['ls-files', `requests/csv/origin/${file}`]), committed ? `requests/csv/origin/${file}` : '',
    `the fixture: origin/${file} is ${committed ? 'committed' : 'untracked'}`);
  return repo;
}

for (const committed of [false, true]) {
  const how = committed ? 'committed' : 'untracked';
  test(`#138 [REC-3][HNT-2][HNT-3] a hidden origin/.DS_Store, ${how}, is no snapshot: al check names no .DS_Store, check --strict exits 0`, (t) => {
    const repo = stray(t, '.DS_Store', DS_STORE, { committed });
    const out = check(repo, '--all');
    assert.ok(!lines(out).some((l) => l.includes('.DS_Store')), `no line should name .DS_Store:\n${out}`);
    strict(repo, 0);
  });

  test(`#138 [REC-3][VW-2] a hidden origin/.DS_Store, ${how}, is no snapshot: context csv does not list it among the snapshots, nor name it anywhere`, (t) => {
    const repo = stray(t, '.DS_Store', DS_STORE, { committed });
    const r = runAl(repo.dir, ['context', 'csv']);
    assert.equal(r.code, 0, both(r));
    assert.ok(lineWith(r.stdout, '2026-09-20-owner-words.md'), `the snapshots line names the owner's words:\n${r.stdout}`);
    assert.ok(!r.stdout.includes('.DS_Store'), `.DS_Store is not a snapshot:\n${r.stdout}`);
  });
}

test('#138 [REC-3][HNT-2][HNT-3] contrast: a visible origin/notes.txt that is no snapshot is a not ok naming it (check --strict exits 1), and context csv lists it', (t) => {
  const repo = stray(t, 'notes.txt', 'Just my notes.\n', { committed: false });
  const out = check(repo, '--all');
  assert.ok(checkHints(out).some((l) => l.startsWith('not ok') && l.includes('origin/notes.txt')), `expected a not ok naming origin/notes.txt:\n${out}`);
  strict(repo, 1);
  const r = runAl(repo.dir, ['context', 'csv']);
  assert.ok(lineWith(r.stdout, '2026-09-20-owner-words.md', 'notes.txt'), `the snapshots line lists notes.txt:\n${r.stdout}`);
});
