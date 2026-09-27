// [REC-10] a tier-0 fix has no record, so a request that says `Tier: 0`
// contradicts it: it gets no sign-off exemption [REC-5][REC-6], context hints
// at the contradiction, and new refuses to write one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runAl, sha256 } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';

const ENV = { SOURCE_DATE_EPOCH: '1790206200' }; // 2026-09-23T23:30Z
const WORDS = 'Customers keep asking to download their invoices.\n';
const ORG = '## Organized requirement\n\n### R1 Invoice export\n' +
  'A customer MUST be able to export one invoice as CSV from the invoice page.\n\nOut: PDF export.\n';
const requestMd = (tier) => `# Customers can download invoices\nType: bug · Tier: ${tier} · Status: open\n\n` +
  '## Owner\'s words and dialog\n\n- 2026-09-20 owner chat, snapshot origin/2026-09-20-owner-words.md\n\n' +
  `${ORG}Signed off: pending\n`;

function request(t, tier) {
  const repo = makeRepo(t);
  repo.write('requests/invoice-fix/request.md', requestMd(tier));
  repo.write('requests/invoice-fix/origin/2026-09-20-owner-words.md',
    `Source: standard input\nFetched: 2026-09-20T09:00Z\nSHA-256: ${sha256(WORDS)}\n---\n${WORDS}`);
  return repo;
}

// A line saying tier 0 has no record (the title line also says "tier 0", but not "no record").
const tier0Hint = (out) => lines(out).some((l) => /tier 0/i.test(l) && /no record/i.test(l));

test('[REC-10][REC-6] context on a Tier: 0 request with no sign-off is BLOCKED awaiting owner sign-off, with a hint that tier 0 has no record', (t) => {
  const r = runAl(request(t, 0).dir, ['context', 'invoice-fix']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(lines(r.stdout)[0], /^BLOCKED/, `first line should start with BLOCKED:\n${r.stdout}`);
  assert.ok(lines(r.stdout)[0].includes('awaiting owner sign-off'), r.stdout);
  assert.ok(tier0Hint(r.stdout), `a line should say tier 0 has no record:\n${r.stdout}`);
  assert.ok(lines(r.stdout).length <= 12, `more than 12 lines:\n${r.stdout}`);
  assertFrame(r.stdout);

  // Contrast: the same request at Tier: 2 is blocked the same way, without the hint.
  const two = runAl(request(t, 2).dir, ['context', 'invoice-fix']);
  assert.equal(two.code, 0, two.stderr);
  assert.match(lines(two.stdout)[0], /^BLOCKED/, two.stdout);
  assert.ok(!tier0Hint(two.stdout), `tier 2 should have no tier-0 hint:\n${two.stdout}`);
});

test('[REC-10] new --tier 0 writes nothing and exits 2, saying tier 0 has no record; --tier 1 writes the request', (t) => {
  const repo = makeRepo(t);
  const r = runAl(repo.dir, ['new', 'invoice-fix', '--from', '-', '--tier', '0'], { input: WORDS, env: ENV });
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.ok(tier0Hint(r.stdout + r.stderr), `the output should say tier 0 has no record:\n${r.stdout}${r.stderr}`);
  assert.ok(!existsSync(join(repo.dir, 'requests/invoice-fix')), 'requests/invoice-fix must not exist');
  assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written');

  const ok = runAl(repo.dir, ['new', 'invoice-fix', '--from', '-', '--tier', '1'], { input: WORDS, env: ENV });
  assert.equal(ok.code, 0, ok.stdout + ok.stderr);
  assert.ok(lines(repo.read('requests/invoice-fix/request.md').toString()).some((l) => l.includes('Tier: 1')));
});
