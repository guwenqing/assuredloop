// [REC-3] a snapshot header needs Source:, Fetched: and SHA-256:, then a `---`
// line. A file missing any of them is not a valid snapshot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runAl, sha256 } from './helpers/fixture.js';
import { assertNotOk, lines } from './helpers/output.js';

const TEXT = '# Export invoices\nPlease let me download a CSV.\n';
const H = sha256(TEXT);
const GOOD = '2026-09-20-good.md';
const BAD = '2026-09-21-bad.md';

// The recorded hash, where there is one, matches the text: only the missing part is wrong.
const VARIANTS = {
  'no Source:': `Fetched: 2026-09-21T09:00Z\nSHA-256: ${H}\n---\n${TEXT}`,
  'no Fetched:': `Source: https://example.com/issue\nSHA-256: ${H}\n---\n${TEXT}`,
  'no SHA-256:': `Source: https://example.com/issue\nFetched: 2026-09-21T09:00Z\n---\n${TEXT}`,
  'no --- line': `Source: https://example.com/issue\nFetched: 2026-09-21T09:00Z\nSHA-256: ${H}\n${TEXT}`,
};

function repoWith(t, bad) {
  const repo = makeRepo(t);
  repo.write('requests/invoice-download/request.md',
    "# Customers can download invoices\nTier: 2 · Status: open\n\n## Owner's words and dialog\n\n- 2026-09-20 issue, snapshot origin/2026-09-20-good.md\n");
  repo.write(`requests/invoice-download/origin/${GOOD}`,
    `Source: https://example.com/issue\nFetched: 2026-09-20T09:00Z\nSHA-256: ${H}\n---\n${TEXT}`);
  repo.write(`requests/invoice-download/origin/${BAD}`, bad);
  repo.commit('request with a bad snapshot');
  return repo;
}

for (const [missing, content] of Object.entries(VARIANTS)) {
  test(`[REC-3] context reports a snapshot with ${missing} "not ok", naming it, exit 0`, (t) => {
    const repo = repoWith(t, content);
    const r = runAl(repo.dir, ['context', 'invoice-download']);
    assert.equal(r.code, 0, r.stderr);
    assertNotOk(r.stdout, BAD);
    assert.ok(!lines(r.stdout).some((l) => l.includes('not ok') && l.includes(GOOD)), r.stdout);
  });

  test(`[REC-3] --verify against a snapshot with ${missing} exits 2 naming it, no crash, nothing written, with or without --yes`, (t) => {
    const repo = repoWith(t, content);
    for (const extra of [[], ['--yes']]) {
      const r = runAl(repo.dir, ['record', 'invoice-download', 'origin', '--verify', BAD, '--from', '-',
        '--fetched', '2026-09-26T09:00Z', ...extra], { input: TEXT, env: { SOURCE_DATE_EPOCH: '1790206200' } });
      assert.equal(r.code, 2, `${extra.join(' ')}: ${r.stdout}${r.stderr}`);
      assert.ok((r.stdout + r.stderr).includes(BAD), `should name ${BAD}:\n${r.stdout}${r.stderr}`);
      assert.doesNotMatch(r.stderr, /TypeError|^\s+at .+:\d+:\d+\)?$/m, `crashed:\n${r.stderr}`);
      assert.deepEqual(readdirSync(join(repo.dir, 'requests/invoice-download/origin')).sort(), [GOOD, BAD]);
      assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written');
    }
  });
}
