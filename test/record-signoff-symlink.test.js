// [REC-1][REC-5] record signoff writes only through real folders and files:
// never through a symlink, dangling or not (the same rule as record origin).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync, mkdirSync, writeFileSync, readdirSync, readFileSync, readlinkSync, lstatSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, tempDir, runAl, sha256 } from './helpers/fixture.js';
import { lines } from './helpers/output.js';

const ENV = { SOURCE_DATE_EPOCH: '1790206200' }; // 2026-09-23T23:30Z
const WORDS = 'Customers keep asking to download their invoices.\n';
const OWNER_WORDS = `Source: standard input\nFetched: 2026-09-20T09:00Z\nSHA-256: ${sha256(WORDS)}\n---\n${WORDS}`;
const ORG = '## Organized requirement\n\n### R1 Invoice export\n' +
  'A customer MUST be able to export one invoice as CSV from the invoice page.\n\nOut: PDF export.\n';
const REQUEST_MD = '# Customers can download invoices\nType: story · Tier: 2 · Status: open\n\n' +
  '## Owner\'s words and dialog\n\n- 2026-09-20 owner chat, snapshot origin/2026-09-20-owner-words.md\n\n' +
  `${ORG}Signed off: pending\n`;
const SIGN = ['signoff', '--source', 's', '--yes'];

// Every file under `dir` with its content, to compare before and after.
function tree(dir) {
  const out = {};
  for (const e of readdirSync(dir, { recursive: true })) {
    const p = join(dir, e);
    if (statSync(p).isFile()) out[e] = readFileSync(p, 'utf8');
  }
  return out;
}

function assertLinkCommitted(repo, path) {
  const entry = repo.git(['ls-files', '-s', path]);
  assert.match(entry, /^120000 /, `${path} should be committed as a symlink: ${entry}`);
}

function assertRefused(r, repo) {
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written in the repo');
  const ls = lines(r.stdout);
  assert.match(ls.at(-2) ?? '', /^Next/, r.stdout);
  assert.match(ls.at(-1) ?? '', /^Not known/, r.stdout);
}

// A folder outside any repo holding a whole request.
function outsideRequest(t) {
  const dir = join(tempDir(t), 'outside-request');
  mkdirSync(join(dir, 'origin'), { recursive: true });
  writeFileSync(join(dir, 'request.md'), REQUEST_MD);
  writeFileSync(join(dir, 'origin', '2026-09-20-owner-words.md'), OWNER_WORDS);
  return dir;
}

function addRealRequest(repo, name) {
  repo.write(`requests/${name}/request.md`, REQUEST_MD);
  repo.write(`requests/${name}/origin/2026-09-20-owner-words.md`, OWNER_WORDS);
}

test('[REC-1][REC-5] record signoff --yes refuses a request folder that is a symlink to a folder outside the repo; a real one signs', (t) => {
  const outside = outsideRequest(t);
  const repo = makeRepo(t);
  mkdirSync(join(repo.dir, 'requests'));
  symlinkSync(outside, join(repo.dir, 'requests', 'x'));
  addRealRequest(repo, 'real');
  repo.commit('requests/x links outside');
  assertLinkCommitted(repo, 'requests/x');
  const before = tree(outside);

  assertRefused(runAl(repo.dir, ['record', 'x', ...SIGN], { env: ENV }), repo);
  assert.deepEqual(tree(outside), before, 'the outside folder must be unchanged');

  // Contrast: the real request in the same repo is signed.
  const ok = runAl(repo.dir, ['record', 'real', ...SIGN], { env: ENV });
  assert.equal(ok.code, 0, ok.stdout + ok.stderr);
  assert.ok(existsSync(join(repo.dir, 'requests/real/origin/2026-09-23-signoff.md')));
});

test('[REC-1][REC-5] record signoff --yes refuses a request.md that is a symlink to a file outside the repo', (t) => {
  const outside = outsideRequest(t);
  const outsideMd = join(outside, 'request.md');
  const repo = makeRepo(t);
  repo.write('requests/x/origin/2026-09-20-owner-words.md', OWNER_WORDS);
  symlinkSync(outsideMd, join(repo.dir, 'requests/x/request.md'));
  repo.commit('requests/x/request.md links outside');
  assertLinkCommitted(repo, 'requests/x/request.md');

  assertRefused(runAl(repo.dir, ['record', 'x', ...SIGN], { env: ENV }), repo);
  assert.equal(readFileSync(outsideMd, 'utf8'), REQUEST_MD, 'the outside request.md must be byte-identical');
  assert.deepEqual(readdirSync(join(repo.dir, 'requests/x/origin')), ['2026-09-20-owner-words.md']);
  assert.equal(readlinkSync(join(repo.dir, 'requests/x/request.md')), outsideMd, 'the link itself is unchanged');
});

test('[REC-1][REC-5] record signoff --yes never writes through a dangling symlink at the chosen name: a regular -2 file, the link left alone', (t) => {
  const target = join(tempDir(t), 'nowhere', 'target.md'); // its folder exists, the file does not
  mkdirSync(join(target, '..'));
  const repo = makeRepo(t);
  addRealRequest(repo, 'x');
  // 2026-09-23-signoff.md is the name the clock gives (SOURCE_DATE_EPOCH is 2026-09-23T23:30Z).
  symlinkSync(target, join(repo.dir, 'requests/x/origin/2026-09-23-signoff.md'));
  repo.commit('a dangling link at the sign-off name');
  assertLinkCommitted(repo, 'requests/x/origin/2026-09-23-signoff.md');

  const r = runAl(repo.dir, ['record', 'x', ...SIGN], { env: ENV });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.deepEqual(readdirSync(join(repo.dir, 'requests/x/origin')).sort(),
    ['2026-09-20-owner-words.md', '2026-09-23-signoff-2.md', '2026-09-23-signoff.md']);
  assert.ok(!existsSync(target), 'nothing is created at the link\'s target');
  const written = join(repo.dir, 'requests/x/origin/2026-09-23-signoff-2.md');
  assert.ok(lstatSync(written).isFile(), '-2 should be a regular file');
  assert.equal(readFileSync(written, 'utf8'),
    `Source: s\nFetched: 2026-09-23T23:30Z\nSHA-256: ${sha256(ORG)}   (of the signed text below)\n--- signed text ---\n${ORG}`);
  const link = join(repo.dir, 'requests/x/origin/2026-09-23-signoff.md');
  assert.ok(lstatSync(link).isSymbolicLink(), 'the link stays a link');
  assert.equal(readlinkSync(link), target, 'the link itself is unchanged');
  assert.ok(!existsSync(target), 'nothing is created at the link\'s target');
  assert.deepEqual(readdirSync(join(target, '..')), []);
  assert.ok(readFileSync(join(repo.dir, 'requests/x/request.md'), 'utf8')
    .includes('Signed off: 2026-09-23 owner, origin/2026-09-23-signoff-2.md\n'));
});

test('[REC-1][REC-5] record signoff --yes refuses a real request folder whose origin/ is a symlink to a folder outside the repo', (t) => {
  const outside = join(tempDir(t), 'outside-origin');
  mkdirSync(outside);
  writeFileSync(join(outside, '2026-09-20-owner-words.md'), OWNER_WORDS);
  const repo = makeRepo(t);
  repo.write('requests/x/request.md', REQUEST_MD);
  symlinkSync(outside, join(repo.dir, 'requests/x/origin'));
  addRealRequest(repo, 'real');
  repo.commit('requests/x/origin links outside');
  assertLinkCommitted(repo, 'requests/x/origin');
  const before = tree(outside);

  assertRefused(runAl(repo.dir, ['record', 'x', ...SIGN], { env: ENV }), repo);
  assert.deepEqual(tree(outside), before, 'the outside folder must get no new file');
  assert.equal(readFileSync(join(repo.dir, 'requests/x/request.md'), 'utf8'), REQUEST_MD, 'request.md must be unchanged');

  // Contrast: the real request in the same repo is signed.
  const ok = runAl(repo.dir, ['record', 'real', ...SIGN], { env: ENV });
  assert.equal(ok.code, 0, ok.stdout + ok.stderr);
  assert.ok(existsSync(join(repo.dir, 'requests/real/origin/2026-09-23-signoff.md')));
});
