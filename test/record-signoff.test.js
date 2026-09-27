// al record <name> signoff: shows only what changed since the last sign-off
// [REC-6], and with --yes writes the sign-off file [REC-5] and the Signed off
// line; nothing else [TL-1].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runAl, sha256 } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';

const ENV = { SOURCE_DATE_EPOCH: '1790206200', TZ: 'Asia/Tokyo' }; // 2026-09-23T23:30Z
const WORDS = 'Customers keep asking to download their invoices.\n';
const R1_BODY = 'A customer MUST be able to export one invoice as CSV from the invoice page.';
const R2_BODY = 'The invoice email MUST carry a link to the same CSV download.';
const R2_NEW = 'The invoice email MUST carry a link to the same CSV or PDF download.';
const OUT = 'Out: PDF export; period exports.';
const ASSUMED = 'Assumed: Excel users in comma-decimal locales need \';\' as the separator.';
const ORG = `## Organized requirement\n\n### R1 Invoice export\n${R1_BODY}\n\n### R2 Email link\n${R2_BODY}\n\n${OUT}\n\n${ASSUMED}\n`;
const ORG_2 = ORG.replace(R2_BODY, R2_NEW);
const HEAD = '# Customers can download invoices\nType: story · Tier: 2 · Status: open\n\n' +
  '## Owner\'s words and dialog\n\n- 2026-09-20 owner chat, snapshot origin/2026-09-20-owner-words.md\n\n';
const DECISIONS = '## Decisions\n\n- D1, 2026-09-21. Source: the owner. CSV only for now.\n';
const DIR = 'requests/invoice-download';

// A committed request whose request.md is HEAD + `rest`.
function request(t, rest) {
  const repo = makeRepo(t);
  repo.write(`${DIR}/request.md`, HEAD + rest);
  repo.write(`${DIR}/origin/2026-09-20-owner-words.md`,
    `Source: standard input\nFetched: 2026-09-20T09:00Z\nSHA-256: ${sha256(WORDS)}\n---\n${WORDS}`);
  repo.commit('request invoice-download');
  return repo;
}

// Signed by hand on 2026-09-23 at 10:00Z with ORG; request.md now holds `org`.
function signedThen(t, org) {
  const repo = makeRepo(t);
  repo.write(`${DIR}/request.md`, `${HEAD}${org}Signed off: 2026-09-23 owner, origin/2026-09-23-signoff.md\n`);
  repo.write(`${DIR}/origin/2026-09-20-owner-words.md`,
    `Source: standard input\nFetched: 2026-09-20T09:00Z\nSHA-256: ${sha256(WORDS)}\n---\n${WORDS}`);
  repo.write(`${DIR}/origin/2026-09-23-signoff.md`,
    `Source: chat with the owner\nFetched: 2026-09-23T10:00Z\nSHA-256: ${sha256(ORG)}   (of the signed text below)\n--- signed text ---\n${ORG}`);
  repo.commit('request invoice-download, signed');
  return repo;
}

const origin = (repo) => readdirSync(join(repo.dir, DIR, 'origin')).sort();
const signoff = (repo, ...args) => runAl(repo.dir, ['record', 'invoice-download', 'signoff', ...args], { env: ENV });

test('[REC-6][TL-1] record signoff without --yes, first sign-off: shows the whole organized section and writes nothing', (t) => {
  const repo = request(t, `${ORG}Signed off: pending\n`);
  const r = signoff(repo, '--source', 'chat with the owner');
  assert.equal(r.code, 0, r.stderr);
  for (const text of [R1_BODY, R2_BODY, OUT, ASSUMED]) assert.ok(r.stdout.includes(text), `should show ${JSON.stringify(text)}:\n${r.stdout}`);
  assert.deepEqual(origin(repo), ['2026-09-20-owner-words.md']);
  assert.equal(repo.git(['status', '--porcelain']), '');
  assertFrame(r.stdout);
});

test('[REC-5] record signoff --yes writes the exact sign-off file and replaces the Signed off line; context is then not blocked', (t) => {
  const repo = request(t, `${ORG}Signed off: pending\n`);
  const r = signoff(repo, '--source', 'chat with the owner, architect session', '--words', '"Signed"', '--yes');
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(origin(repo), ['2026-09-20-owner-words.md', '2026-09-23-signoff.md']);
  assert.equal(repo.read(`${DIR}/origin/2026-09-23-signoff.md`).toString(),
    'Source: chat with the owner, architect session\n' +
    'Owner\'s words: "Signed"\n' +
    'Fetched: 2026-09-23T23:30Z\n' +
    `SHA-256: ${sha256(ORG)}   (of the signed text below)\n` +
    '--- signed text ---\n' +
    ORG);
  assert.equal(repo.read(`${DIR}/request.md`).toString(),
    `${HEAD}${ORG}Signed off: 2026-09-23 owner, origin/2026-09-23-signoff.md\n`);
  assert.ok(r.stdout.includes('2026-09-23-signoff.md'), r.stdout);
  assertFrame(r.stdout);

  const c = runAl(repo.dir, ['context', 'invoice-download']);
  assert.equal(c.code, 0, c.stderr);
  assert.ok(!c.stdout.includes('BLOCKED'), `should not be blocked after the sign-off:\n${c.stdout}`);
  assert.ok(lines(c.stdout).some((l) => l.includes('2026-09-23-signoff.md') && !l.includes('owner-words')), c.stdout);
});

test('[REC-5] record signoff --yes with no Signed off line and a section after: signs up to that section, adds the line inside, no Owner\'s words line without --words', (t) => {
  const repo = request(t, `${ORG}\n${DECISIONS}`);
  const r = signoff(repo, '--source', 'owner chat', '--yes');
  assert.equal(r.code, 0, r.stderr);
  // The organized section runs up to "## Decisions", its blank line included.
  const signedText = `${ORG}\n`;
  assert.equal(repo.read(`${DIR}/origin/2026-09-23-signoff.md`).toString(),
    `Source: owner chat\nFetched: 2026-09-23T23:30Z\nSHA-256: ${sha256(signedText)}   (of the signed text below)\n` +
    `--- signed text ---\n${signedText}`);

  const md = repo.read(`${DIR}/request.md`).toString();
  assert.ok(md.startsWith(HEAD), md);
  assert.ok(md.endsWith(DECISIONS), md);
  const section = md.slice(HEAD.length, md.length - DECISIONS.length);
  const line = 'Signed off: 2026-09-23 owner, origin/2026-09-23-signoff.md';
  assert.equal(lines(section).filter((l) => l === line).length, 1, `the organized section should hold "${line}" once:\n${md}`);
  assert.equal(lines(section).filter((l) => l !== line).join('\n').trimEnd(), ORG.trimEnd(), `nothing else should change:\n${md}`);

  const c = runAl(repo.dir, ['context', 'invoice-download']);
  assert.equal(c.code, 0, c.stderr);
  assert.ok(!c.stdout.includes('BLOCKED'), `should not be blocked after the sign-off:\n${c.stdout}`);
});

test('[REC-6][TL-1] record signoff without --yes after R2 changed: shows R2\'s new text, not R1\'s or Out, and writes nothing', (t) => {
  const repo = signedThen(t, ORG_2);
  const r = signoff(repo, '--source', 'chat with the owner');
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes(R2_NEW), `should show R2's new text:\n${r.stdout}`);
  assert.ok(!r.stdout.includes(R1_BODY), `should not show the unchanged R1:\n${r.stdout}`);
  assert.ok(!r.stdout.includes(OUT), `should not show the unchanged Out line:\n${r.stdout}`);
  assert.deepEqual(origin(repo), ['2026-09-20-owner-words.md', '2026-09-23-signoff.md']);
  assert.equal(repo.git(['status', '--porcelain']), '');
  assertFrame(r.stdout);
});

test('[REC-5] record signoff --yes after R2 changed writes 2026-09-23-signoff-2.md, keeps the old one byte-identical, and points Signed off at the new one', (t) => {
  const repo = signedThen(t, ORG_2);
  const old = repo.read(`${DIR}/origin/2026-09-23-signoff.md`);
  const r = signoff(repo, '--source', 'chat with the owner', '--words', '"Yes, PDF too"', '--yes');
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(origin(repo), ['2026-09-20-owner-words.md', '2026-09-23-signoff-2.md', '2026-09-23-signoff.md']);
  assert.deepEqual(repo.read(`${DIR}/origin/2026-09-23-signoff.md`), old);
  assert.equal(repo.read(`${DIR}/origin/2026-09-23-signoff-2.md`).toString(),
    `Source: chat with the owner\nOwner's words: "Yes, PDF too"\nFetched: 2026-09-23T23:30Z\n` +
    `SHA-256: ${sha256(ORG_2)}   (of the signed text below)\n--- signed text ---\n${ORG_2}`);
  assert.equal(repo.read(`${DIR}/request.md`).toString(),
    `${HEAD}${ORG_2}Signed off: 2026-09-23 owner, origin/2026-09-23-signoff-2.md\n`);

  const c = runAl(repo.dir, ['context', 'invoice-download']);
  assert.equal(c.code, 0, c.stderr);
  assert.ok(!c.stdout.includes('BLOCKED'), `should not be blocked after the new sign-off:\n${c.stdout}`);
});

test('[REC-6] record signoff when nothing changed says "unchanged since" the latest sign-off and writes nothing, with or without --yes', (t) => {
  const repo = signedThen(t, ORG);
  for (const args of [[], ['--yes']]) {
    const r = signoff(repo, '--source', 'chat with the owner', ...args);
    assert.equal(r.code, 0, r.stderr);
    assert.ok(r.stdout.includes('unchanged since 2026-09-23-signoff.md'), r.stdout);
    assert.deepEqual(origin(repo), ['2026-09-20-owner-words.md', '2026-09-23-signoff.md']);
    assert.equal(repo.git(['status', '--porcelain']), '');
  }
});

test('[REC-5] record signoff misuse exits 2 and writes nothing, even with --yes: no --source, an unknown request, no organized section', (t) => {
  const repo = request(t, `${ORG}Signed off: pending\n`);
  const noSource = runAl(repo.dir, ['record', 'invoice-download', 'signoff', '--yes'], { env: ENV });
  assert.equal(noSource.code, 2, noSource.stdout + noSource.stderr);
  const unknown = runAl(repo.dir, ['record', 'no-such-request', 'signoff', '--source', 'owner chat', '--yes'], { env: ENV });
  assert.equal(unknown.code, 2, unknown.stdout + unknown.stderr);
  assert.equal(repo.git(['status', '--porcelain']), '');

  const bare = request(t, DECISIONS);
  const none = runAl(bare.dir, ['record', 'invoice-download', 'signoff', '--source', 'owner chat', '--yes'], { env: ENV });
  assert.equal(none.code, 2, none.stdout + none.stderr);
  assert.deepEqual(origin(bare), ['2026-09-20-owner-words.md']);
  assert.equal(bare.git(['status', '--porcelain']), '');

  // The same command on a request that has the section does write: the refusals above are about the input.
  const ok = runAl(repo.dir, ['record', 'invoice-download', 'signoff', '--source', 'owner chat', '--yes'], { env: ENV });
  assert.equal(ok.code, 0, ok.stdout + ok.stderr);
  assert.deepEqual(origin(repo), ['2026-09-20-owner-words.md', '2026-09-23-signoff.md']);
});
