// [VW-9] every output names what it read: under --at the Read line names the
// commit read, error exits included; a rev that cannot be resolved is named as
// given; never "working tree".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { makeRepo, runAl, sha256 } from './helpers/fixture.js';
import { lines } from './helpers/output.js';

const WORDS = 'Customers keep asking to download their invoices.\n';

function addRequest(repo, name) {
  repo.write(`requests/${name}/request.md`,
    "# Customers can download invoices\nType: story · Tier: 2 · Status: open\n\n## Owner's words and dialog\n\n" +
    '- 2026-09-20 owner chat, snapshot origin/2026-09-20-owner-words.md\n');
  repo.write(`requests/${name}/origin/2026-09-20-owner-words.md`,
    `Source: standard input\nFetched: 2026-09-20T09:00Z\nSHA-256: ${sha256(WORDS)}\n---\n${WORDS}`);
}

// The line starting "Read"; the output ends with Next then Not known.
function readLine(r) {
  const ls = lines(r.stdout);
  assert.match(ls.at(-2) ?? '', /^Next/, r.stdout);
  assert.match(ls.at(-1) ?? '', /^Not known/, r.stdout);
  const read = ls.find((l) => l.startsWith('Read'));
  assert.ok(read, `a Read line:\n${r.stdout}`);
  return read;
}

test('[VW-9] spec --at c, where c\'s .assuredloop has root: ../outside, exits 2 and the Read line names c, not the working tree', (t) => {
  const repo = makeRepo(t);
  const outside = join(dirname(repo.dir), 'outside');
  mkdirSync(outside);
  writeFileSync(join(outside, 'x.md'), '## Outside\n');
  repo.write('.assuredloop', 'root: ../outside\n');
  const c = repo.commit('root outside the repo', { date: '2026-09-20T10:00:00Z' });
  repo.git(['rm', '-q', '.assuredloop']);
  repo.commit('default root', { date: '2026-09-21T10:00:00Z' });
  for (const args of [['spec', '--at', c], ['spec', '--list', '--at', c]]) {
    const r = runAl(repo.dir, args);
    assert.equal(r.code, 2, r.stdout + r.stderr);
    const read = readLine(r);
    assert.ok(read.includes(c.slice(0, 7)), `${args.join(' ')}: the Read line should name ${c.slice(0, 7)}:\n${r.stdout}`);
    assert.ok(!read.includes('working tree'), `${args.join(' ')}:\n${r.stdout}`);
  }
});

test('[VW-9] context no-such-request --at c exits 2 and the Read line names c, not the working tree', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'invoice-download');
  const c = repo.commit('request', { date: '2026-09-20T10:00:00Z' });
  const r = runAl(repo.dir, ['context', 'no-such-request', '--at', c]);
  assert.equal(r.code, 2, r.stdout + r.stderr);
  const read = readLine(r);
  assert.ok(read.includes(c.slice(0, 7)), `the Read line should name ${c.slice(0, 7)}:\n${r.stdout}`);
  assert.ok(!read.includes('working tree'), r.stdout);
});

for (const rev of ['deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', 'no-such-branch']) {
  test(`[VW-9] context <name> --at ${rev} (resolves nowhere) exits 2 and the Read line names the rev as given, not the working tree`, (t) => {
    const repo = makeRepo(t);
    addRequest(repo, 'invoice-download');
    repo.commit('request', { date: '2026-09-20T10:00:00Z' });
    const r = runAl(repo.dir, ['context', 'invoice-download', '--at', rev]);
    assert.equal(r.code, 2, r.stdout + r.stderr);
    const read = readLine(r);
    assert.ok(read.includes(rev), `the Read line should name ${rev}:\n${r.stdout}`);
    assert.ok(!read.includes('working tree'), r.stdout);
  });
}

test('[VW-9] contrast: context no-such-request without --at exits 2 and the Read line names the working tree', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'invoice-download');
  repo.commit('request');
  const r = runAl(repo.dir, ['context', 'no-such-request']);
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.ok(readLine(r).includes('working tree'), r.stdout);
});
