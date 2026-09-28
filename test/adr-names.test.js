// ADR numbers and file names in history [LNK-4] [REC-9] [HNT-2]. A number
// once used stays used: an ADR renamed to another number leaves its old
// number taken, so a later file under that old number is a reused number,
// not ok, and check --strict exits 1; a rename that keeps the number is no
// reuse. (Review of #85, finding 5.) Which request added an ADR does not
// depend on the characters of its file name: docs/adr/0002-税率.md, added
// in a commit carrying "Request: tax", is tax's, so conclude lists it as
// "0002 (proposed)" under ADRs added and prints the proposed note, and check
// gives that note once the request is archived on the branch. (Review of
// #85, finding 6.) Acceptance C5a.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { addRequest, both, lineWith, outcome } from './helpers/request.js';
import { file } from './helpers/links.js';
import { check, checkHints, hint, kindOf, message, strict } from './helpers/hints.js';
import { writeAdr } from './helpers/evidence.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const INV3 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const ENV = { SOURCE_DATE_EPOCH: '1790206200' };

// --- a number once used stays used ---

// Main: the baseline, a signed tier-1 request "decisions", and the proposed
// ADR `first`. The branch work starts there.
function decided(t, first) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, INV3));
  addRequest(repo, 'decisions', null, { line: 'Type: bug · Tier: 1 · Status: open' });
  writeAdr(repo, first, 'Original', { status: 'proposed' });
  repo.commit('Records and ADR', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  return repo;
}
const commit = (repo, subject, date) => repo.commit(message(subject, { request: 'decisions', tier: '1 — decisions' }), { date });
// git mv `from` `to` in a commit of its own, which git sees as a rename.
function rename(repo, from, to) {
  repo.git(['mv', `docs/adr/${from}.md`, `docs/adr/${to}.md`]);
  commit(repo, `Rename ${from}`, '2026-09-21T12:00:00Z');
  assert.equal(repo.git(['show', '-M', '--name-status', '--format=', 'HEAD']), `R100\tdocs/adr/${from}.md\tdocs/adr/${to}.md`,
    `the fixture: the commit renames ${from}.md to ${to}.md`);
}
const reusedNotOk = (out) => checkHints(out).filter((l) => kindOf(l) === 'not ok' && /reused/.test(l));

test('C5a [LNK-4][HNT-3] renumbering keeps the old number used: 0001-original.md renamed to 0002-original.md, then 0001-new.md added: not ok naming the reused 0001, and check --strict exits 1', (t) => {
  const repo = decided(t, '0001-original');
  rename(repo, '0001-original', '0002-original');
  writeAdr(repo, '0001-new', 'New', { status: 'proposed' });
  commit(repo, 'New ADR', '2026-09-22T12:00:00Z');
  assert.notEqual(repo.git(['log', '--diff-filter=A', '--format=%h', 'main', '--', 'docs/adr/0001-original.md']), '',
    'the fixture: main\'s history added 0001-original.md');
  assert.equal(repo.git(['ls-tree', '--name-only', 'HEAD', 'docs/adr/']), 'docs/adr/0001-new.md\ndocs/adr/0002-original.md',
    'the fixture: one 0001 file in docs/adr now');
  hint(check(repo, '--all'), 'not ok', /reused/, /\b0001\b/);
  strict(repo, 1);
});

test('C5a [LNK-4] contrast: a rename that keeps the number (0001-a.md to 0001-b.md) is not a reuse; check --strict exits 0', (t) => {
  const repo = decided(t, '0001-a');
  rename(repo, '0001-a', '0001-b');
  assert.deepEqual(reusedNotOk(check(repo, '--all')), [], 'no reused number');
  strict(repo, 0);
});

// --- the request that added an ADR, whatever its file name ---

// Main: the baseline and the signed request tax. The branch adds the
// proposed ADR `name`, with no Request line of its own, in a commit carrying
// "Request: tax".
function taxAdr(t, name) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, INV3));
  addRequest(repo, 'tax', null);
  repo.commit('Request records', { date: '2026-09-20T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  const path = writeAdr(repo, name, 'Tax policy', { status: 'proposed' });
  assert.ok(!repo.read(path).toString().includes('Request:'), 'the fixture: the ADR has no Request line');
  repo.commit(message('Tax decision', { request: 'tax', tier: '2 — tax' }), { date: '2026-09-21T12:00:00Z' });
  assert.equal(repo.git(['-c', 'core.quotePath=false', 'show', '--name-only', '--format=', 'HEAD']), path, `the fixture: the commit adds ${path}`);
  return repo;
}
// The entry of ADR `n` on a line: from its number to the next other number.
const entry = (l, n) => {
  const at = l.search(new RegExp(`\\b${n}\\b`));
  return at < 0 ? '' : n + l.slice(at + n.length).split(new RegExp(`\\b(?!${n}\\b)\\d{4}\\b`))[0];
};

for (const name of ['0002-税率', '0002-tax']) {
  test(`C5a [REC-9][LNK-4][HNT-2] docs/adr/${name}.md, proposed, added in a commit carrying "Request: tax": conclude lists 0002 (proposed) under ADRs added and prints the proposed note; check, with tax archived on the branch, gives the note`, (t) => {
    const repo = taxAdr(t, name);
    const r = runAl(repo.dir, ['conclude', 'tax', '--yes'], { env: ENV });
    assert.equal(r.code, 0, both(r));
    const g = outcome(repo.read('requests/archive/tax/request.md').toString()).generated;
    const added = g.find((l) => l.startsWith('- ADRs added:'));
    assert.ok(added, `expected a generated line starting with "- ADRs added:":\n${g.join('\n')}`);
    assert.match(entry(added, '0002'), /\bproposed\b/, `0002 is listed, marked proposed:\n${added}`);
    assert.ok(lineWith(both(r), /\bnote\b/, /\b0002\b/, /proposed/), `conclude prints a note naming the proposed 0002:\n${both(r)}`);

    repo.commit(message('Conclude tax', { request: 'tax', tier: '2 — tax' }), { date: '2026-09-22T12:00:00Z' });
    hint(check(repo, '--all'), 'note', /proposed/, /\b0002\b/);
  });
}
