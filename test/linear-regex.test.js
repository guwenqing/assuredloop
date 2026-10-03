// Issue #138, item 8 [REC-11] [SPC-1] [LNK-4] [HNT-3]: reading a PR's own
// content takes time linear in its size. A commit message with a very long
// `Tier:` line, an .assuredloop `root:` line with a very long run of spaces,
// and an ADR whose Status and Supersedes lines hold a very long run of
// ADR-name-like tokens each leave check, spec and context quick (bounded; a
// quadratic read of these inputs takes minutes). A well-formed Tier line is
// read as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo } from './helpers/fixture.js';
import { both } from './helpers/request.js';
import { check, hint } from './helpers/hints.js';
import { lines } from './helpers/output.js';
import { adr } from './helpers/evidence.js';
import { assertFinished, timed } from './helpers/bounded.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const INV1B = '## [INV-1] Totals\nTotals MUST show three decimals.\n';
const LONG = 100_000;

// Main: the baseline INV-1 (and `main` files). The branch work: one commit
// with `msg` that edits INV-1.
function branch(t, msg, main = {}) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  for (const [path, text] of Object.entries(main)) repo.write(path, text);
  repo.commit('Baseline', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('specs/invoices.md', INV1B);
  repo.commit(msg, { date: '2026-09-22T12:00:00Z' });
  return repo;
}

function assertQuick(repo, args, codes = [0]) {
  const r = timed(repo.dir, args);
  assertFinished(r, args);
  assert.ok(codes.includes(r.code), `al ${args.join(' ')} exit ${r.code}:\n${both(r).slice(0, 2000)}`);
}

test(`#138 [REC-11][HNT-3] a commit message line "Tier: 0" + ${LONG} spaces + "x": al check finishes quickly (bounded), exit 0`, (t) => {
  const repo = branch(t, `Totals to three decimals\n\nTier: 0${' '.repeat(LONG)}x`);
  assertQuick(repo, ['check']);
});

test('#138 [REC-11] contrast: "Tier: 0 — fix" is still read as a tier-0 claim: the Tier line shows it, and the baseline edit is a not ok', (t) => {
  const repo = branch(t, 'Totals to three decimals\n\nTier: 0 — fix');
  const out = check(repo, '--all');
  assert.ok(lines(out).some((l) => /^Tier\s+0 — fix$/.test(l)), `the Tier line reads the claim:\n${out}`);
  hint(out, 'not ok', 'tier 0', 'INV-1');
});

test(`#138 [SPC-1][HNT-3] an .assuredloop line "root: specs" + ${LONG} spaces + "x": al spec and al check finish quickly (bounded), exit 0 or 2`, (t) => {
  const repo = branch(t, 'Totals to three decimals\n\nTier: 1 — totals', { '.assuredloop': `root: specs${' '.repeat(LONG)}x\n` });
  assertQuick(repo, ['spec'], [0, 2]);
  assertQuick(repo, ['check'], [0, 2]);
});

test(`#138 [LNK-4][HNT-3] an ADR governing INV-1 whose Status and Supersedes lines each hold ${LONG / 5} tokens "0002-." with no ".md": al check and al context INV-1 finish quickly (bounded), exit 0`, (t) => {
  const text = adr('0001-totals', 'Two decimals', { governs: ['INV-1'] });
  const run = '0002-.'.repeat(LONG / 5);
  const crafted = text.replace('Status: accepted.', `Status: superseded by ${run}`).replace('Decided by:', `Supersedes: ${run}\nDecided by:`);
  assert.notEqual(crafted, text, 'the fixture: the ADR lines are replaced');
  const repo = branch(t, 'Totals to three decimals\n\nTier: 1 — totals', { 'docs/adr/0001-totals.md': crafted });
  assertQuick(repo, ['check']);
  assertQuick(repo, ['context', 'INV-1']);
});
