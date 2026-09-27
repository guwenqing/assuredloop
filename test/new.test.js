// al new: the request folder [REC-1], its record [REC-2] and the owner's words
// as a snapshot [REC-3]. Clock pinned by SOURCE_DATE_EPOCH [TL-2].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runAl, sha256 } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';

// 2026-09-23T23:30Z; in Tokyo it is already 09-24, so a local-time date shows.
const EPOCH = '1790206200';
const ENV = { SOURCE_DATE_EPOCH: EPOCH, TZ: 'Asia/Tokyo' };

const WORDS = 'Customers keep asking to download their invoices.\r\nCSV, ünïcode ✓\n\nno newline at end';

test('[REC-1][REC-3] new stores the words as a snapshot, byte for byte, with Source as given and the SOURCE_DATE_EPOCH time', (t) => {
  const repo = makeRepo(t);
  repo.write('notes/words.txt', WORDS);
  const r = runAl(repo.dir, ['new', 'invoice-download', '--from', 'notes/words.txt',
    '--title', 'Customers can download invoices', '--tier', '2'], { env: ENV });
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(readdirSync(join(repo.dir, 'requests/invoice-download/origin')), ['2026-09-23-owner-words.md']);
  assert.equal(repo.read('requests/invoice-download/origin/2026-09-23-owner-words.md').toString(),
    'Source: notes/words.txt\n' +
    'Fetched: 2026-09-23T23:30Z\n' +
    `SHA-256: ${sha256(WORDS)}\n` +
    '---\n' +
    WORDS);
  assertFrame(r.stdout);
});

test('[REC-2] new writes request.md: title, tier and status, then the owner\'s words section with a dated entry citing the snapshot', (t) => {
  const repo = makeRepo(t);
  repo.write('words.txt', WORDS);
  const r = runAl(repo.dir, ['new', 'invoice-download', '--from', 'words.txt',
    '--title', 'Customers can download invoices', '--tier', '2'], { env: ENV });
  assert.equal(r.code, 0, r.stderr);
  const md = lines(repo.read('requests/invoice-download/request.md').toString());
  assert.equal(md[0], '# Customers can download invoices');
  assert.ok(md.some((l) => l.includes('Tier: 2 · Status: open')), md.join('\n'));
  const firstSection = md.findIndex((l) => l.startsWith('## '));
  assert.equal(md[firstSection], "## Owner's words and dialog");
  const entry = md.slice(firstSection + 1).find((l) => l.startsWith('- '));
  assert.ok(entry, md.join('\n'));
  assert.ok(entry.startsWith('- 2026-09-23'), entry);
  assert.ok(entry.includes('origin/2026-09-23-owner-words.md'), entry);
});

test('[REC-2][REC-3] new --from - reads stdin; no title means the name is the title; no tier means no Tier', (t) => {
  const repo = makeRepo(t);
  const r = runAl(repo.dir, ['new', 'csv-export', '--from', '-'], { input: WORDS, env: ENV });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(repo.read('requests/csv-export/origin/2026-09-23-owner-words.md').toString(),
    `Source: standard input\nFetched: 2026-09-23T23:30Z\nSHA-256: ${sha256(WORDS)}\n---\n${WORDS}`);
  const md = lines(repo.read('requests/csv-export/request.md').toString());
  assert.equal(md[0], '# csv-export');
  assert.ok(md.some((l) => l.includes('Status: open')), md.join('\n'));
  assert.ok(!md.some((l) => l.includes('Tier:')), md.join('\n'));
  assertFrame(r.stdout);
});

test('[REC-1] new run from a subfolder writes under the repo top level', (t) => {
  const repo = makeRepo(t);
  repo.write('sub/deeper/w.txt', WORDS);
  const r = runAl(join(repo.dir, 'sub/deeper'), ['new', 'from-sub', '--from', 'w.txt'], { env: ENV });
  assert.equal(r.code, 0, r.stderr);
  assert.ok(existsSync(join(repo.dir, 'requests/from-sub/request.md')));
  assert.ok(!existsSync(join(repo.dir, 'sub/deeper/requests')));
  assert.ok(repo.read('requests/from-sub/origin/2026-09-23-owner-words.md').toString().startsWith('Source: w.txt\n'));
});

test('[REC-1] new accepts tier S and names starting with a digit', (t) => {
  const repo = makeRepo(t);
  const r = runAl(repo.dir, ['new', '9lives-2', '--from', '-', '--tier', 'S'], { input: 'why?', env: ENV });
  assert.equal(r.code, 0, r.stderr);
  const md = lines(repo.read('requests/9lives-2/request.md').toString());
  assert.ok(md.some((l) => l.includes('Tier: S · Status: open')), md.join('\n'));
});

test('[REC-1] new refuses a bad name with exit 2 and writes nothing', (t) => {
  const repo = makeRepo(t);
  for (const name of ['Invoice', '-lead', 'a_b', 'a b', 'a.b', 'ünï', '']) {
    const r = runAl(repo.dir, ['new', name, '--from', '-'], { input: WORDS, env: ENV });
    assert.equal(r.code, 2, `name ${JSON.stringify(name)}: ${r.stdout}${r.stderr}`);
  }
  assert.ok(!existsSync(join(repo.dir, 'requests')), 'no requests/ folder should be written');
});

test('[REC-1] new with a bad tier or no --from is misuse: exit 2, nothing written', (t) => {
  const repo = makeRepo(t);
  assert.equal(runAl(repo.dir, ['new', 'x1', '--from', '-', '--tier', '4'], { input: WORDS, env: ENV }).code, 2);
  assert.equal(runAl(repo.dir, ['new', 'x2'], { env: ENV }).code, 2);
  assert.ok(!existsSync(join(repo.dir, 'requests')));
});

test('[REC-2] new refuses empty words with exit 2 (from a file and from stdin), and writes nothing', (t) => {
  const repo = makeRepo(t);
  repo.write('empty.txt', '');
  assert.equal(runAl(repo.dir, ['new', 'empty-file', '--from', 'empty.txt'], { env: ENV }).code, 2);
  assert.equal(runAl(repo.dir, ['new', 'empty-stdin', '--from', '-'], { input: '', env: ENV }).code, 2);
  assert.ok(!existsSync(join(repo.dir, 'requests/empty-file')));
  assert.ok(!existsSync(join(repo.dir, 'requests/empty-stdin')));
});

test('[REC-1] new refuses a name whose folder exists with exit 2, leaving it untouched and ending with Next / Not known', (t) => {
  const repo = makeRepo(t);
  repo.write('requests/taken/request.md', '# Taken\n');
  const r = runAl(repo.dir, ['new', 'taken', '--from', '-'], { input: WORDS, env: ENV });
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.ok((r.stdout + r.stderr).includes('taken'), 'the refusal names the name');
  assertFrame(r.stdout);
  assert.equal(repo.read('requests/taken/request.md').toString(), '# Taken\n');
  assert.deepEqual(readdirSync(join(repo.dir, 'requests/taken')), ['request.md']);
  // Contrast: a free name in the same repo is accepted.
  assert.equal(runAl(repo.dir, ['new', 'free', '--from', '-'], { input: WORDS, env: ENV }).code, 0);
});

test('[REC-1] new refuses a name that is archived with exit 2', (t) => {
  const repo = makeRepo(t);
  repo.write('requests/archive/done-thing/request.md', '# Done\n');
  const r = runAl(repo.dir, ['new', 'done-thing', '--from', '-'], { input: WORDS, env: ENV });
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.ok((r.stdout + r.stderr).includes('done-thing'), 'the refusal names the name');
  assertFrame(r.stdout);
  assert.ok(!existsSync(join(repo.dir, 'requests/done-thing')));
  // Contrast: a free name in the same repo is accepted.
  assert.equal(runAl(repo.dir, ['new', 'free', '--from', '-'], { input: WORDS, env: ENV }).code, 0);
});

test('[REC-1] new refuses a name that existed only in git history (requests/ or archive/) with exit 2', (t) => {
  const repo = makeRepo(t);
  repo.write('requests/gone/request.md', '# Gone\n');
  repo.write('requests/archive/gone-archived/request.md', '# Gone too\n');
  repo.commit('add two requests');
  repo.git(['rm', '-q', '-r', 'requests']);
  repo.commit('delete them');
  assert.ok(!existsSync(join(repo.dir, 'requests')));
  for (const name of ['gone', 'gone-archived']) {
    const r = runAl(repo.dir, ['new', name, '--from', '-'], { input: WORDS, env: ENV });
    assert.equal(r.code, 2, `${name}: ${r.stdout}${r.stderr}`);
    assertFrame(r.stdout);
    assert.ok(!existsSync(join(repo.dir, 'requests', name)), name);
  }
  // Contrast: a name never used in the same repo is accepted.
  assert.equal(runAl(repo.dir, ['new', 'free', '--from', '-'], { input: WORDS, env: ENV }).code, 0);
});

test('[REC-1] a longer name in history does not block its prefix', (t) => {
  const repo = makeRepo(t);
  repo.write('requests/old-thing/request.md', '# Old thing\n');
  repo.commit('add old-thing');
  repo.git(['rm', '-q', '-r', 'requests']);
  repo.commit('delete it');
  const r = runAl(repo.dir, ['new', 'old', '--from', '-'], { input: WORDS, env: ENV });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.ok(existsSync(join(repo.dir, 'requests/old/request.md')));
});
