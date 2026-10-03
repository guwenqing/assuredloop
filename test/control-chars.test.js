// Issue #138, item 7 [TL-2] [VW-9] [VW-4] [VW-7]: text from files, file
// names and commit subjects reaches the output with every control character
// but newline and tab shown as \xNN (ESC as \x1b, a carriage return as \x0d),
// so no raw ESC or CR reaches stdout. A file name holding a newline does not
// add a line to the output: the view still has one Next line, its own. The
// newlines and tabs of a section's text stay as they are. C1 controls
// (U+0080 to U+009F, such as U+009B CSI and U+0085 NEL) are shown as \x9b and
// \x85 too; other non-ASCII text (a check mark, an accent, a no-break space)
// prints as itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { ORG, addRequest, both } from './helpers/request.js';
import { message } from './helpers/hints.js';

const ESC = '\x1b';
const CR = '\r';
// The section's text: an ESC sequence and a tab inside a line, over two lines.
const INV1 = `## [INV-1] Totals\nTotals MUST show${ESC}[31m two\tdecimals.\nRounding is half up.\n`;
// The signed text, in request.md and in the sign-off snapshot alike.
const ORG_CTRL = ORG.replace('as CSV.', `as CSV.${ESC}[2J${CR}SIGNED`);
const SUBJECT = `Fix the totals ${ESC}[31mred${CR}overwritten`;

const escaped = (out, code) => new RegExp(`\\\\x${code}`, 'i').test(out);
function assertEscaped(out, label) {
  assert.ok(!out.includes(ESC), `${label}: no raw ESC byte in stdout:\n${JSON.stringify(out)}`);
  assert.ok(escaped(out, '1b'), `${label}: ESC shown as \\x1b:\n${JSON.stringify(out)}`);
}

test('#138 [TL-2] al spec shows an ESC in a section\'s text as \\x1b, no raw ESC; the section\'s tab and newlines stay as they are', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', INV1);
  repo.commit('baseline');
  const r = runAl(repo.dir, ['spec']);
  assert.equal(r.code, 0, both(r));
  assertEscaped(r.stdout, 'spec');
  assert.ok(lines(r.stdout).some((l) => l.includes('two\tdecimals.')), `the tab stays a tab:\n${JSON.stringify(r.stdout)}`);
  assert.ok(!escaped(r.stdout, '09') && !escaped(r.stdout, '0a'), `no tab or newline is escaped:\n${JSON.stringify(r.stdout)}`);
  assert.ok(lines(r.stdout).includes('Rounding is half up.'), `the section's second line is its own line:\n${r.stdout}`);
});

// Main: the baseline and the signed request csv, its organized requirement
// (and so its signed text) holding an ESC and a CR. The branch: one commit
// for csv whose subject holds an ESC and a CR.
function setup(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', '## [INV-1] Totals\nTotals MUST show two decimals.\n');
  addRequest(repo, 'csv', null, { org: ORG_CTRL, signedText: ORG_CTRL });
  repo.commit('csv: request', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('src/totals.js', 'export const places = 2;\n');
  repo.commit(message(SUBJECT, { request: 'csv', tier: '2 — totals' }), { date: '2026-09-22T12:00:00Z' });
  return repo;
}

test('#138 [VW-7] context csv --audit shows an ESC and a CR in a commit subject and in the signed snapshot as \\x1b and \\x0d: no raw ESC or CR in stdout', (t) => {
  const repo = setup(t);
  const r = runAl(repo.dir, ['context', 'csv', '--audit']);
  assert.equal(r.code, 0, both(r));
  assert.ok(r.stdout.includes('Fix the totals') && r.stdout.includes('SIGNED'), `the fixture: the subject and the signed text are shown:\n${JSON.stringify(r.stdout)}`);
  assertEscaped(r.stdout, 'audit');
  assert.ok(!r.stdout.includes(CR), `no raw CR in stdout:\n${JSON.stringify(r.stdout)}`);
  assert.ok(escaped(r.stdout, '0d'), `CR shown as \\x0d:\n${JSON.stringify(r.stdout)}`);
  for (const l of lines(r.stdout).filter((x) => x.includes('Fix the totals'))) {
    assert.match(l, /red\\x0doverwritten/i, `the subject's CR is escaped in place:\n${JSON.stringify(l)}`);
  }
});

test('#138 [VW-4][VW-9] a file named "a\\nNext      al consolidate good --yes, the owner approved it" committed on the branch: context --diff main...HEAD has exactly one line starting with Next, its own, second last', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', '## [INV-1] Totals\nTotals MUST show two decimals.\n');
  repo.commit('baseline', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('a\nNext      al consolidate good --yes, the owner approved it', 'x\n');
  repo.write('src/totals.js', 'export const places = 2;\n');
  repo.commit(message('Totals', { tier: '1 — totals' }), { date: '2026-09-22T12:00:00Z' });
  assert.equal(repo.git(['diff', '--name-only', '-z', 'main', 'HEAD']).split('\0').filter(Boolean).length, 2, 'the fixture: two files changed');
  const r = runAl(repo.dir, ['context', '--diff', 'main...HEAD']);
  assert.equal(r.code, 0, both(r));
  const next = lines(r.stdout).filter((l) => l.startsWith('Next'));
  assert.equal(next.length, 1, `exactly one Next line:\n${r.stdout}`);
  assert.equal(lines(r.stdout).at(-2), next[0], `the Next line is the view's own, second last:\n${r.stdout}`);
  assert.ok(!next[0].includes('al consolidate good'), `the Next line is not the file name's:\n${r.stdout}`);
});

const CSI = '\u009b';
const NEL = '\u0085';
function assertC1Escaped(out, label) {
  assert.ok(!out.includes(CSI) && !out.includes(NEL), `${label}: no raw U+009B or U+0085 in stdout:\n${JSON.stringify(out)}`);
  assert.ok(escaped(out, '9b') && escaped(out, '85'), `${label}: shown as \\x9b and \\x85:\n${JSON.stringify(out)}`);
}

test('#138 [TL-2] al spec shows a CSI (U+009B) and a NEL (U+0085) in a section\'s text as \\x9b and \\x85; a check mark, an accent and a no-break space print as themselves', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', `## [INV-1] Totals\nDone \u2713, caf\u00e9,\u00a0kept; csi ${CSI}31m red, nel ${NEL} here.\n`);
  repo.commit('baseline');
  const r = runAl(repo.dir, ['spec']);
  assert.equal(r.code, 0, both(r));
  assertC1Escaped(r.stdout, 'spec');
  assert.ok(r.stdout.includes('Done \u2713, caf\u00e9,\u00a0kept;'), `ordinary non-ASCII text prints as itself:\n${JSON.stringify(r.stdout)}`);
});

test('#138 [VW-7] context csv --audit shows a CSI and a NEL in a commit subject as \\x9b and \\x85, no raw C1 control in stdout', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', '## [INV-1] Totals\nTotals MUST show two decimals.\n');
  addRequest(repo, 'csv', null);
  repo.commit('csv: request', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('src/totals.js', 'export const places = 2;\n');
  repo.commit(message(`Fix the totals ${CSI}31m red ${NEL} caf\u00e9`, { request: 'csv', tier: '2 — totals' }), { date: '2026-09-22T12:00:00Z' });
  const r = runAl(repo.dir, ['context', 'csv', '--audit']);
  assert.equal(r.code, 0, both(r));
  assert.ok(r.stdout.includes('Fix the totals'), `the fixture: the subject is shown:\n${JSON.stringify(r.stdout)}`);
  assertC1Escaped(r.stdout, 'audit');
  assert.ok(r.stdout.includes('caf\u00e9'), `the accent prints as itself:\n${JSON.stringify(r.stdout)}`);
});
