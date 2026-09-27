// `al spec [--list] [--at <commit>]`: the design as it stands [VW-5], read from
// the baseline root [SPC-1], with duplicate IDs flagged [SPC-3].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';

const USERS =
  '# [ACC-1] Accounts\n' +
  '## [ACC-2] Sign in\n' +
  'Users sign in with email.\n';

const INVOICES =
  '# [INV-1] Invoices\n' +
  'Invoices are what we bill.\n' +
  '\n' +
  '## [INV-2] Dates\n' +
  'Every invoice date is ISO 8601.\n' +
  '\n' +
  '## [INV-3] Format\n' +
  'Invoices download as PDF.\n' +
  '\n' +
  '## Notes\n' +
  'A section with no ID yet.\n';

const BODY = ['Users sign in with email.', 'Invoices are what we bill.', 'Every invoice date is ISO 8601.',
  'Invoices download as PDF.', 'A section with no ID yet.'];

// specs/accounts/users.md (2 sections) sorts before specs/invoices.md (4 sections).
function baseline(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INVOICES);
  repo.write('specs/accounts/users.md', USERS);
  repo.write('specs/diagram.txt', 'Not markdown, not read.\n');
  repo.commit('baseline', { date: '2026-09-20T10:00:00Z' });
  return repo;
}

// The count written after a path in the Covers line, before the next path.
function coveredCount(coversLine, path) {
  const at = coversLine.indexOf(path);
  assert.ok(at >= 0, `Covers line should name ${path}:\n${coversLine}`);
  const rest = coversLine.slice(at + path.length);
  const next = rest.search(/specs\//);
  return (next < 0 ? rest : rest.slice(0, next)).match(/\d+/)?.[0];
}

test('[VW-5] spec shows the section map first (files in path order, sections in file order), then the text of the files', (t) => {
  const repo = baseline(t);
  const r = runAl(repo.dir, ['spec']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const out = r.stdout;
  for (const sentence of BODY) assert.ok(out.includes(sentence), `text should include ${sentence}:\n${out}`);
  const firstBody = Math.min(...BODY.map((s) => out.indexOf(s)));
  const map = lines(out.slice(0, firstBody));
  const at = (pred, what) => {
    const i = map.findIndex(pred);
    assert.ok(i >= 0, `the map, before any text, should have ${what}:\n${out}`);
    return i;
  };
  const users = at((l) => l.includes('specs/accounts/users.md') && !/Covers/.test(l), 'specs/accounts/users.md');
  const invoices = at((l) => l.includes('specs/invoices.md') && !/Covers/.test(l), 'specs/invoices.md');
  const acc2 = at((l) => l.includes('ACC-2') && l.includes('Sign in'), 'ACC-2 Sign in');
  const inv1 = at((l) => l.includes('INV-1') && l.includes('Invoices'), 'INV-1 Invoices');
  const inv2 = at((l) => l.includes('INV-2') && l.includes('Dates'), 'INV-2 Dates');
  const inv3 = at((l) => l.includes('INV-3') && l.includes('Format'), 'INV-3 Format');
  const notes = at((l) => l.includes('Notes'), 'the Notes section with no ID');
  assert.ok(users < acc2 && acc2 < invoices, `users.md and its sections come before invoices.md:\n${out}`);
  assert.ok(invoices < inv1 && inv1 < inv2 && inv2 < inv3 && inv3 < notes, `invoices.md sections in file order:\n${out}`);
  assert.ok(out.indexOf('Users sign in with email.') < out.indexOf('Invoices download as PDF.'), `text in path order:\n${out}`);
  assert.ok(!out.includes('Not markdown, not read.'), out);
  assertFrame(out, { read: 'working tree', main: 'local main' });
});

test('[VW-5] spec says which files it covers, with their section counts', (t) => {
  const repo = baseline(t);
  const r = runAl(repo.dir, ['spec']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const covers = lines(r.stdout).find((l) => /Covers/.test(l));
  assert.ok(covers, `a Covers line:\n${r.stdout}`);
  assert.equal(coveredCount(covers, 'specs/accounts/users.md'), '2', covers);
  assert.equal(coveredCount(covers, 'specs/invoices.md'), '4', covers);
  assert.ok(!covers.includes('diagram.txt'), covers);
});

test('[VW-5] spec --list prints the map only: IDs and titles, no body text', (t) => {
  const repo = baseline(t);
  const r = runAl(repo.dir, ['spec', '--list']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  for (const s of ['ACC-1', 'ACC-2', 'Sign in', 'INV-1', 'INV-2', 'Dates', 'INV-3', 'Format', 'Notes',
    'specs/accounts/users.md', 'specs/invoices.md']) {
    assert.ok(r.stdout.includes(s), `--list should show ${s}:\n${r.stdout}`);
  }
  for (const sentence of BODY) assert.ok(!r.stdout.includes(sentence), `--list should not show ${sentence}:\n${r.stdout}`);
  assertFrame(r.stdout);
});

test('[SPC-1] the root set by "root: <path>" in .assuredloop is read instead of specs/', (t) => {
  const repo = makeRepo(t);
  repo.write('.assuredloop', 'root: docs/spec\n');
  repo.write('docs/spec/billing.md', '## [BIL-1] Billing\nWe bill monthly.\n');
  repo.write('specs/old.md', '## [OLD-1] Old place\nNot the baseline.\n');
  repo.commit('root elsewhere');
  const r = runAl(repo.dir, ['spec']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.includes('docs/spec/billing.md'), r.stdout);
  assert.ok(r.stdout.includes('BIL-1'), r.stdout);
  assert.ok(r.stdout.includes('We bill monthly.'), r.stdout);
  assert.ok(!r.stdout.includes('OLD-1'), r.stdout);
  assert.ok(!r.stdout.includes('Not the baseline.'), r.stdout);
  assertFrame(r.stdout);
});

test('[SPC-1] with no baseline root, spec says "no baseline yet" and exits 0', (t) => {
  const repo = makeRepo(t);
  const r = runAl(repo.dir, ['spec']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.includes('no baseline yet'), r.stdout);
  assertFrame(r.stdout);
});

test('[SPC-1] a root with no .md files in it says "no baseline yet" and exits 0', (t) => {
  const repo = makeRepo(t);
  mkdirSync(join(repo.dir, 'specs', 'empty'), { recursive: true });
  writeFileSync(join(repo.dir, 'specs', 'readme.txt'), 'not markdown\n');
  const r = runAl(repo.dir, ['spec']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.includes('no baseline yet'), r.stdout);
  assertFrame(r.stdout);
});

test('[SPC-3] a duplicate ID across two files is "not ok", naming the ID and both files; exit 0', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/a.md', '## [INV-2] Dates\nOne.\n');
  repo.write('specs/b.md', '## [INV-1] Other\nx\n## [INV-2] Days\nTwo.\n');
  repo.commit('dup');
  const r = runAl(repo.dir, ['spec']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.ok(lines(r.stdout).some((l) => l.includes('not ok') && l.includes('INV-2') && l.includes('specs/a.md') && l.includes('specs/b.md')),
    `a not ok line naming INV-2, specs/a.md and specs/b.md:\n${r.stdout}`);
  assert.ok(!lines(r.stdout).some((l) => l.includes('not ok') && l.includes('INV-1')), r.stdout);
  assertFrame(r.stdout);
});

test('[SPC-3] a duplicate ID within one file is "not ok", naming the ID and the file; exit 0', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/a.md', '## [INV-5] First\nOne.\n## [INV-5] Second\nTwo.\n');
  repo.commit('dup in one file');
  const r = runAl(repo.dir, ['spec']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.ok(lines(r.stdout).some((l) => l.includes('not ok') && l.includes('INV-5') && l.includes('specs/a.md')),
    `a not ok line naming INV-5 and specs/a.md:\n${r.stdout}`);
  assertFrame(r.stdout);
});

test('[SPC-3] unique IDs, INV-3 beside INV-3.1, and repeated headings with no ID are not flagged', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/a.md', '## [INV-3] Parent\na\n### [INV-3.1] Child\nb\n## Notes\nc\n');
  repo.write('specs/b.md', '## [INV-4] Other\nd\n## Notes\ne\n');
  repo.commit('unique');
  const r = runAl(repo.dir, ['spec']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.includes('INV-3.1'), r.stdout);
  assert.ok(!r.stdout.includes('not ok'), r.stdout);
  assertFrame(r.stdout);
});

test('[VW-8] spec --at shows the baseline as it was at that commit, root and files both read from its tree', (t) => {
  const repo = makeRepo(t);
  repo.write('.assuredloop', 'root: docs\n');
  repo.write('docs/a.md', '## [DOC-1] Early\nEarly text.\n');
  const c1 = repo.commit('C1', { date: '2026-09-20T10:00:00Z' });
  repo.write('docs/a.md', '## [DOC-1] Early\nEarly text.\n## [DOC-2] Added later\nLater text.\n');
  repo.git(['rm', '-q', '.assuredloop']);
  repo.write('specs/new.md', '## [NEW-1] New root\nNew text.\n');
  repo.commit('C2', { date: '2026-09-21T10:00:00Z' });
  repo.write('specs/wip.md', '## [WIP-1] Uncommitted\nWip text.\n');

  const at = runAl(repo.dir, ['spec', '--at', c1]);
  assert.equal(at.code, 0, at.stdout + at.stderr);
  assert.ok(at.stdout.includes('DOC-1') && at.stdout.includes('Early text.'), at.stdout);
  for (const absent of ['DOC-2', 'Added later', 'NEW-1', 'WIP-1']) assert.ok(!at.stdout.includes(absent), `${absent}:\n${at.stdout}`);
  assertFrame(at.stdout, { read: c1.slice(0, 7) });

  // Contrast: the working tree has the new root and the uncommitted file.
  const now = runAl(repo.dir, ['spec']);
  assert.equal(now.code, 0, now.stdout + now.stderr);
  assert.ok(now.stdout.includes('NEW-1') && now.stdout.includes('WIP-1'), now.stdout);
  assert.ok(!now.stdout.includes('DOC-1'), now.stdout);
});

test('[VW-9] spec does not read the clock: the same repo gives the same output whatever SOURCE_DATE_EPOCH is', (t) => {
  const repo = baseline(t);
  const a = runAl(repo.dir, ['spec'], { env: { SOURCE_DATE_EPOCH: '1780000000' } });
  const b = runAl(repo.dir, ['spec'], { env: { SOURCE_DATE_EPOCH: '1790000000' } });
  assert.equal(a.code, 0, a.stdout + a.stderr);
  assert.ok(a.stdout.includes('INV-2'), a.stdout);
  assert.equal(a.stdout, b.stdout);
});
