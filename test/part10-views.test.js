// Part 10, the architect's rulings of 2026-09-28 (the first is D6 of
// assuredloop-v1), on the C10 fixture (an epic at its midpoint: the owner
// drops the email link, R3, while its code is live on main, and revises
// INV-2) and on smaller ones:
// 1. [HNT-2] a cited requirement that does not exist is not ok, except for a
//    block marked Dropped: a dropped block citing R3 after R3 left the
//    organized requirement gives no such not ok. A Kept block, or an unmarked
//    one, citing a missing R-line still does. In check and in context <name>.
// 2. [HNT-1] the note "code still live for dropped work" ranks first among
//    the notes (every not ok still above every note), in check; and the
//    default context <name> of the C10 fixture shows it.
// 3. [VW-2]@2 the Spec line shows a block marked Dropped as dropped and one
//    marked Kept as kept, not by its content state: "1 dropped (INV-5)" in
//    the count form, named like every state but consolidated, carried and
//    pending; "INV-5 dropped (R3)" in the list form.
// 4. The hint that suggests `al record <name> signoff` passes --words <quote>,
//    as the Next line does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { addRequest, both } from './helpers/request.js';
import { file, says } from './helpers/links.js';
import { check, checkHints, hint, kindOf, message, noHint, viewHints } from './helpers/hints.js';
import { count } from './helpers/evidence.js';
import { stateOf } from './helpers/grouped.js';

const NAME = 'invoice-download';
const DIR = `requests/${NAME}`;
const TIER = '3 — part of invoice-download';

const INV1 = '## [INV-1] The invoice page\nA customer can open each of their invoices on its own page.\n';
const INV2 = "## [INV-2] Dates\nDates on an invoice show in the customer's local format.\n";
const INV2_ISO = '## [INV-2] Dates\nDates on an invoice and in its export MUST show in ISO 8601.\n';
const INV2_SPLIT = "## [INV-2] Dates\nDates on the invoice page show in the customer's local format. Dates in\nan invoice's CSV export MUST show in ISO 8601.\n";
const INV3 = '## [INV-3] Totals\nTotals show two decimals.\n';
const INV4 = '## [INV-4] CSV export\nA customer MUST be able to export one invoice as CSV from the invoice page.\n';
const INV5 = "## [INV-5] Email link\nThe invoice email MUST carry a link to the invoice's CSV download.\n";
const INV7 = '## [INV-7] Export name\nThe file MUST be named after the invoice number.\n';

const R1 = '### R1 CSV export\nA customer MUST be able to export one invoice as CSV from the invoice page.\n';
const R2 = '### R2 ISO dates\nDates on an invoice and in its export MUST show in ISO 8601.\n';
const R2_EXPORT = "### R2 ISO dates in the export\nDates in an invoice's CSV export MUST show in ISO 8601. The invoice page\nkeeps the customer's local format.\n";
const R3 = '### R3 Email link\nThe invoice email MUST carry a link to the same CSV download.\n';
const ORG = `## Organized requirement\n\n${R1}\n${R2}\n${R3}\nOut: PDF export; period exports.\n`;
// R3 moved to Out: the organized requirement after the owner dropped the email link.
const ORG_NO_R3 = `## Organized requirement\n\n${R1}\n${R2}\nOut: PDF export; period exports; a link in the invoice email (D1).\n`;
const ORG_REVERSED = `## Organized requirement\n\n${R1}\n${R2_EXPORT}\nOut: PDF export; period exports; a link in the invoice email (D1).\n`;

const D1 = '- D1, 2026-09-28. Source: the owner, chat 2026-09-28. Drop the email link (R3): the newsletter tool will send download links instead. [INV-5] is dropped; R3 moves to Out.\n';
const D2 = '- D2, 2026-09-28. Source: the owner, chat 2026-09-28. The invoice page keeps the customer local format; only the CSV export uses ISO 8601. [INV-2] is revised.\n';
const PARTS = '\n## Parts\n\n1. CSV export ([INV-4])\n2. ISO dates ([INV-2])\n3. Email link ([INV-5])\n';
const LINE = 'Type: epic · Tier: 3 · Status: open';

const EXPORT = '// [INV-4] CSV export of one invoice.\nexport function toCsv(inv) {\n  return inv.lines.map((l) => `${l.item},${l.amount.toFixed(2)}`).join(\'\\n\');\n}\n';
const EXPORT_TEST = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { toCsv } from '../src/export.js';\n" +
  "test('[INV-4] one invoice exports as CSV', () => {\n  assert.equal(toCsv({ lines: [{ item: 'a', amount: 1 }] }), 'a,1.00');\n});\n";
const EMAIL_LINK = '// [INV-5] The invoice email carries a link to the CSV download.\nexport function emailLink(inv, base) {\n  return `${base}/invoices/${inv.id}/export.csv`;\n}\n';

const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);

// The C10 fixture. Main: the baseline; the signed tier-3 request with
// INV-2@1 (modify, for R2), INV-4@1 (add, consolidated with its code) and
// INV-5@1 (add, for R3); then the email link's code, src/email-link.js, under
// an [INV-5] marker, with a Request: line. The branch `reversal`: D1 drops
// the email link (INV-5@1 marked Dropped, R3 moved to Out), D2 revises INV-2
// (INV-2@1 marked Revised, INV-2@2 builds on it); R2 is edited too, so the
// request is blocked until the owner signs again.
function c10(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file('# Invoices\n', INV1, INV2, INV3));
  repo.write('src/page.js', 'export const page = (inv) => `<h1>${inv.id}</h1>`;\n');
  repo.commit('Baseline for invoices', { date: '2026-09-20T12:00:00Z' });

  addRequest(repo, NAME, [
    block('[INV-2]@1 modify   for R2', { was: INV2, now: INV2_ISO }),
    block('[INV-4]@1 add after [INV-3]   for R1', { now: INV4 }),
    block('[INV-5]@1 add after [INV-4]   for R3', { now: INV5 }),
  ], { title: 'Customers can download their invoices', line: LINE, org: ORG, signedText: ORG, decisions: '', rest: PARTS });
  repo.commit(message('invoice-download: request, sign-off and change spec', { request: NAME, tier: TIER }), { date: '2026-09-21T12:00:00Z' });

  repo.write('specs/invoices.md', file('# Invoices\n', INV1, INV2, INV3, INV4));
  repo.write('src/export.js', EXPORT);
  repo.write('test/export.test.js', EXPORT_TEST);
  repo.commit(message('CSV export of one invoice', { request: NAME, tier: TIER }), { date: '2026-09-22T12:00:00Z' });

  repo.write('src/email-link.js', EMAIL_LINK);
  repo.write('src/email.js', "import { emailLink } from './email-link.js';\nexport const emailBody = (inv, base) => `Your invoice ${inv.id}: ${emailLink(inv, base)}`;\n");
  repo.commit(message('Email link to the CSV download (part 3, started)', { request: NAME, tier: TIER }), { date: '2026-09-23T12:00:00Z' });

  repo.git(['checkout', '-q', '-b', 'reversal']);
  const md = repo.read(`${DIR}/request.md`).toString();
  assert.ok(md.includes(ORG), 'the fixture: request.md holds the signed organized requirement');
  repo.write(`${DIR}/request.md`, md.replace(ORG, ORG_REVERSED).replace(PARTS, `\n## Decisions\n\n${D1}${D2}${PARTS}`));
  const change = repo.read(`${DIR}/change.md`).toString();
  repo.write(`${DIR}/change.md`, change
    .replace('### [INV-5]@1 add after [INV-4]   for R3', '### [INV-5]@1 add after [INV-4]   Dropped 2026-09-28 (D1)   for R3')
    .replace('### [INV-2]@1 modify   for R2', '### [INV-2]@1 modify   Revised 2026-09-28 (D2)   for R2') +
    block('[INV-2]@2 modify   for R2', { was: INV2_ISO, now: INV2_SPLIT }));
  repo.commit(message('invoice-download: the owner drops the email link (D1) and reverses the page dates (D2)', { request: NAME, tier: TIER }),
    { date: '2026-09-28T12:00:00Z' });
  return repo;
}

function context(repo, name = NAME, ...args) {
  const r = runAl(repo.dir, ['context', name, ...args]);
  ok(r, `context ${name} ${args.join(' ')}`);
  assertFrame(r.stdout);
  return r.stdout;
}
function specLine(out) {
  const line = lines(out).find((l) => /^Spec\b/.test(l));
  assert.ok(line, `expected a line starting with Spec:\n${out}`);
  return line;
}
// A not ok hint line naming R3 and the block's ID: the cited requirement that does not exist.
const CITES = (id) => ['not ok', /\bR3\b/, id];

// --- 1. [HNT-2] a dropped block citing a missing R-line ---

// Main: the baseline INV-1, INV-3, INV-4 and INV-7, and the request `name`,
// signed with R3 already moved to Out (so it is not blocked), holding
// `blocks` on the branch `work`, committed with a Request: line.
function cites(t, blocks, name = 'email-link') {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file('# Invoices\n', INV1, INV3, INV4, INV7));
  addRequest(repo, name, null, { org: ORG_NO_R3, signedText: ORG_NO_R3, decisions: `\n## Decisions\n\n${D1}` });
  repo.commit('Baseline and request', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write(`requests/${name}/change.md`, `# Change\n\nWhy: the email link.\n\n## Spec changes\n\n${blocks.join('')}`);
  repo.commit(message('Spec changes', { request: name, tier: '2 — the email link' }), { date: '2026-09-28T12:00:00Z' });
  const c = runAl(repo.dir, ['context', name]);
  assert.doesNotMatch(lines(c.stdout)[0], /blocked/i, `the fixture: ${name} is signed and not blocked:\n${c.stdout}`);
  return repo;
}
const DROPPED = block('[INV-5]@1 add after [INV-4]   Dropped 2026-09-28 (D1)   for R3', { now: INV5 });
const KEPT = block('[INV-7]@1 add after [INV-4]   Kept 2026-09-28 (D1)   for R3', { now: INV7 });
const PLAIN = block('[INV-5]@1 add after [INV-4]   for R3', { now: INV5 });

test('[HNT-2] D6: a block marked Dropped citing R3, which the organized requirement no longer holds, gives no not ok for the missing R3: in check', (t) => {
  const repo = cites(t, [DROPPED]);
  noHint(check(repo, '--all'), ...CITES('INV-5'));
});

test('[HNT-2] D6: a block marked Dropped citing R3, which the organized requirement no longer holds, gives no not ok for the missing R3: in context <name>', (t) => {
  const repo = cites(t, [DROPPED]);
  noHint(context(repo, 'email-link', '--all'), ...CITES('INV-5'));
});

test('[HNT-2] D6 contrast: a block marked Kept citing the missing R3 still gives the not ok, in check and in context <name>', (t) => {
  const repo = cites(t, [KEPT]);
  hint(check(repo, '--all'), ...CITES('INV-7'));
  hint(context(repo, 'email-link', '--all'), ...CITES('INV-7'));
});

test('[HNT-2] D6 contrast: an unmarked block citing the missing R3 still gives the not ok, in check and in context <name>', (t) => {
  const repo = cites(t, [PLAIN]);
  hint(check(repo, '--all'), ...CITES('INV-5'));
  hint(context(repo, 'email-link', '--all'), ...CITES('INV-5'));
});

test('[HNT-2] D6 on the C10 fixture: INV-5@1, dropped by D1 while citing R3, gives no not ok for the missing R3, in check or in context invoice-download', (t) => {
  const repo = c10(t);
  noHint(check(repo, '--all'), ...CITES('INV-5'));
  noHint(context(repo, NAME, '--all'), ...CITES('INV-5'));
});

// --- 2. [HNT-1] the live-code note ranks first among the notes ---

const LIVE = ['note', /\blive\b/, 'src/email-link.js'];

test('[HNT-1] C10: check ranks the note "code still live for dropped work" first among the notes, above a baseline edit with no request and code changed without its linked tests; every not ok above every note', (t) => {
  const repo = c10(t);
  // Two more notes on the branch: a baseline edit with no request linked,
  // and src/export.js changed while its linked test did not.
  repo.write('specs/invoices.md', repo.read('specs/invoices.md').toString().replace('Totals show two decimals.', 'Totals show two decimals, always.'));
  repo.write('src/export.js', `${EXPORT}// [INV-4] rows in invoice order\n`);
  repo.commit('Tweaks', { date: '2026-09-28T13:00:00Z' });
  const out = check(repo, '--all');
  const hints = checkHints(out);
  const live = hint(out, ...LIVE);
  const notes = hints.filter((l) => kindOf(l) === 'note');
  assert.ok(notes.length >= 3, `the fixture: at least three notes:\n${out}`);
  assert.equal(notes[0], live, `the live-code note should be the first note:\n${out}`);
  const firstNote = hints.findIndex((l) => kindOf(l) === 'note');
  assert.ok(hints.slice(firstNote).every((l) => kindOf(l) === 'note'), `every not ok above every note:\n${out}`);
});

test('[HNT-1] C10: the default context invoice-download (no --all) shows the note "code still live for dropped work" with src/email-link.js', (t) => {
  const repo = c10(t);
  const out = context(repo);
  hint(out, ...LIVE);
  const hints = viewHints(out);
  const firstNote = hints.findIndex((l) => kindOf(l) === 'note');
  assert.ok(hints.slice(firstNote).every((l) => kindOf(l) === 'note'), `every not ok above every note:\n${out}`);
});

// --- 3. [VW-2]@2 the Spec line: dropped and kept ---

test('[VW-2]@2 C10: the Spec line, grouped, shows INV-5 as 1 dropped: INV-5, not as pending: 1 pending, 1 consolidated, 1 waiting', (t) => {
  const repo = c10(t);
  const spec = specLine(context(repo));
  assert.equal(stateOf(spec, 'Spec', 'INV-5'), 'dropped', `INV-5 should read dropped:\n${spec}`);
  assert.match(spec, count(1, 'pending'), `only INV-2@1 is pending:\n${spec}`);
  assert.doesNotMatch(spec, /\b2 pending\b/, `a dropped add is not folded into pending:\n${spec}`);
  assert.match(spec, count(1, 'consolidated'), spec);
  assert.match(spec, count(1, 'waiting'), spec);
});

test('[VW-2]@2 the Spec line, in the list form: a dropped add reads "INV-5 dropped (R3)", a consolidated one "INV-4 consolidated"', (t) => {
  const repo = cites(t, [block('[INV-4]@1 add after [INV-3]   for R1', { now: INV4 }), DROPPED]);
  const spec = specLine(context(repo, 'email-link'));
  assert.match(spec, /\bINV-5(@1)? dropped \(R3\)/, `INV-5 should read dropped (R3):\n${spec}`);
  assert.ok(says(spec, 'INV-4', 'consolidated'), `INV-4 consolidated:\n${spec}`);
  assert.ok(!says(spec, 'INV-5', 'pending'), `INV-5 is not pending:\n${spec}`);
});

test('[VW-2]@2 the Spec line, in the list form: a kept block reads kept, not consolidated', (t) => {
  const repo = cites(t, [block('[INV-4]@1 add after [INV-3]   for R1', { now: INV4 }),
    block('[INV-7]@1 add after [INV-4]   Kept 2026-09-28 (D1)   for R1', { now: INV7 })]);
  const spec = specLine(context(repo, 'email-link'));
  assert.ok(says(spec, 'INV-7', 'kept'), `INV-7 should read kept:\n${spec}`);
  assert.ok(!says(spec, 'INV-7', 'consolidated'), `INV-7 is shown by its mark, not its content state:\n${spec}`);
  assert.ok(says(spec, 'INV-4', 'consolidated'), `INV-4 consolidated:\n${spec}`);
});

test('[VW-2]@2 the Spec line, grouped: 1 dropped: INV-5 and 1 kept: INV-7; the consolidated and pending ones are named too, none left out (context-all R1)', (t) => {
  const W = (n) => `## [INV-${n}] Rule ${n}\nRule ${n} holds.\n`;
  const N = (n) => `## [INV-${n}] Rule ${n}\nRule ${n} MUST hold.\n`;
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file('# Invoices\n', INV1, INV3, INV4, INV7, ...[11, 12, 13, 14, 15, 16].map(N), ...[21, 22, 23, 24, 25, 26].map(W)));
  addRequest(repo, 'many', [
    ...[11, 12, 13, 14, 15, 16].map((n) => block(`[INV-${n}]@1 modify   for R1`, { was: W(n), now: N(n) })),
    ...[21, 22, 23, 24, 25, 26].map((n) => block(`[INV-${n}]@1 modify   for R1`, { was: W(n), now: N(n) })),
    DROPPED.replace('for R3', 'for R2'),
    block('[INV-7]@1 add after [INV-4]   Kept 2026-09-28 (D1)   for R1', { now: INV7 }),
  ], { org: ORG_NO_R3, signedText: ORG_NO_R3, decisions: `\n## Decisions\n\n${D1}` });
  repo.commit('Fourteen sections', { date: '2026-09-21T12:00:00Z' });
  const spec = specLine(context(repo, 'many'));
  assert.equal(stateOf(spec, 'Spec', 'INV-5'), 'dropped', `INV-5 should read dropped:\n${spec}`);
  assert.equal(stateOf(spec, 'Spec', 'INV-7'), 'kept', `INV-7 should read kept:\n${spec}`);
  assert.match(spec, count(6, 'consolidated'), spec);
  assert.match(spec, count(6, 'pending'), spec);
  for (const n of [11, 12, 13, 14, 15, 16]) assert.equal(stateOf(spec, 'Spec', `INV-${n}`), 'consolidated', `INV-${n}:\n${spec}`);
  for (const n of [21, 22, 23, 24, 25, 26]) assert.equal(stateOf(spec, 'Spec', `INV-${n}`), 'pending', `INV-${n}:\n${spec}`);
});

// --- 4. the sign-off hint passes --words ---

test('[HNT-1] C10: every hint that suggests al record invoice-download signoff passes --words <quote>, as the Next line does; in check and in context', (t) => {
  const repo = c10(t);
  const signoff = (l) => l.includes(`al record ${NAME} signoff`);
  const out = check(repo, '--all');
  const view = context(repo, NAME, '--all');
  const suggested = [...checkHints(out), ...viewHints(view)].filter(signoff);
  assert.ok(suggested.length > 0, `the fixture: a hint suggests al record ${NAME} signoff:\n${out}\n${view}`);
  for (const l of suggested) assert.ok(/--words <[^>]+>/.test(l), `the hint should pass --words <quote>:\n${l}`);
  const next = lines(view).find((l) => /^Next\b/.test(l));
  assert.ok(next.includes(`al record ${NAME} signoff --source <where> --words <quote> --yes`), `the Next line:\n${next}`);
});
