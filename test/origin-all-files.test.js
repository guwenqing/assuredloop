// Issue #138, item 6 [REC-3] [HNT-2] [VW-2] [VW-7]: every file in a
// request's origin/ is a snapshot to every reader, whatever its extension. An
// edited origin/signoff.txt, whose text no longer matches its SHA-256, is a
// `not ok` in check as it is in --audit, and context <name> lists it among
// the snapshots as it lists the .md ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl, sha256 } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { addRequest, both, lineWith } from './helpers/request.js';
import { check, checkHints } from './helpers/hints.js';

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
