// Issue #89, five tier-0 fixes to what al context and al check print; no
// promise changes. On the C10 fixture (copied from part10-views.test.js: an
// epic at its midpoint, the email link dropped by D1 while its code is live,
// INV-2 revised by D2, the request blocked until the owner signs again) and
// on smaller ones:
// (i) an archived request concluded on main: the Next line of context <name>
//     suggests only a read command, al context <name> --audit, never al
//     record [REC-1];
// (g) the note "<name> changed since its sign-off" (or "is not signed off
//     yet") is dropped, in check and in context <name>, only where a not ok
//     hint for the same request carries the same reason and the same al
//     record <name> signoff command: the blocked-delivery not ok, or "[ID]
//     changed on this branch equals the Now of <name>, which is blocked".
//     The BLOCKED header is not a hint (the architect's ruling on [HNT-2]):
//     for a served, blocked request with nothing delivering, the note stays,
//     in context <name> --all too;
// (d) the Spec line's count form names what a waiting block waits on,
//     "1 waiting (INV-2@2 on INV-2@1)", with the <request>/ prefix only for
//     another request's block; the list form reads "INV-2@2 waiting on …";
// (a) when the request changed since its sign-off, the Require line names
//     the command that shows what changed, al record <name> signoff --source
//     <where> (no --yes); context stays at twelve lines or fewer;
// (e) the note "code still live for dropped work" names each live file that
//     imports or requires the dropped file, with the reason: "imported by"
//     for an import or import(), "required by" for require(), by a relative
//     specifier that resolves to it with or without its extension; a file
//     that only mentions its name in a comment or a string does not count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, runAl } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ORG as ORG3, addRequest, both } from './helpers/request.js';
import { file } from './helpers/links.js';
import { check, checkHints, hint, kindOf, message, viewHints } from './helpers/hints.js';

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

const R1 = '### R1 CSV export\nA customer MUST be able to export one invoice as CSV from the invoice page.\n';
const R2 = '### R2 ISO dates\nDates on an invoice and in its export MUST show in ISO 8601.\n';
const R2_EXPORT = "### R2 ISO dates in the export\nDates in an invoice's CSV export MUST show in ISO 8601. The invoice page\nkeeps the customer's local format.\n";
const R3 = '### R3 Email link\nThe invoice email MUST carry a link to the same CSV download.\n';
const ORG = `## Organized requirement\n\n${R1}\n${R2}\n${R3}\nOut: PDF export; period exports.\n`;
const ORG_REVERSED = `## Organized requirement\n\n${R1}\n${R2_EXPORT}\nOut: PDF export; period exports; a link in the invoice email (D1).\n`;

const D1 = '- D1, 2026-09-28. Source: the owner, chat 2026-09-28. Drop the email link (R3): the newsletter tool will send download links instead. [INV-5] is dropped; R3 moves to Out.\n';
const D2 = '- D2, 2026-09-28. Source: the owner, chat 2026-09-28. The invoice page keeps the customer local format; only the CSV export uses ISO 8601. [INV-2] is revised.\n';
const PARTS = '\n## Parts\n\n1. CSV export ([INV-4])\n2. ISO dates ([INV-2])\n3. Email link ([INV-5])\n';
const LINE = 'Type: epic · Tier: 3 · Status: open';

const EXPORT = '// [INV-4] CSV export of one invoice.\nexport function toCsv(inv) {\n  return inv.lines.map((l) => `${l.item},${l.amount.toFixed(2)}`).join(\'\\n\');\n}\n';
const EXPORT_TEST = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { toCsv } from '../src/export.js';\n" +
  "test('[INV-4] one invoice exports as CSV', () => {\n  assert.equal(toCsv({ lines: [{ item: 'a', amount: 1 }] }), 'a,1.00');\n});\n";
const EMAIL_LINK = '// [INV-5] The invoice email carries a link to the CSV download.\nexport function emailLink(inv, base) {\n  return `${base}/invoices/${inv.id}/export.csv`;\n}\n';
const EMAIL = "import { emailLink } from './email-link.js';\nexport const emailBody = (inv, base) => `Your invoice ${inv.id}: ${emailLink(inv, base)}`;\n";

const ok = (r, what) => assert.equal(r.code, 0, `${what}:\n${both(r)}`);

// The C10 fixture, as in part10-views.test.js; the email link's code at
// `link`; `extra` ({ path: text }) is written with it, on main.
function c10(t, { extra = {}, link = 'src/email-link.js' } = {}) {
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

  repo.write(link, EMAIL_LINK);
  repo.write('src/email.js', EMAIL);
  for (const [path, text] of Object.entries(extra)) repo.write(path, text);
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
const labelLine = (out, label) => {
  const line = lines(out).find((l) => new RegExp(`^${label}\\b`).test(l));
  assert.ok(line, `expected a line starting with ${label}:\n${out}`);
  return line;
};
// The lines above the frame (Read, Next, Not known).
const body = (out) => lines(out).filter((l) => !/^(Read|Next|Not known)\b/.test(l));

// The sign-off note: "<name> changed since its sign-off" or "<name> is not signed off yet".
const SIGNOFF_NOTE = /changed since its sign-off|not signed off yet/;
const signoffNotes = (hints, name) => hints.filter((l) => kindOf(l) === 'note' && SIGNOFF_NOTE.test(l) && l.includes(name));
const BLOCKED_DELIVERY = (name) => ['not ok', 'delivers work for', name, /\bblocked\b/];

// --- (i) an archived request concluded on main suggests only a read ---

test('#89 (i) [REC-1] an archived request concluded on main: the Next line of context <name> suggests al context <name> --audit, and no al record', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, INV3, INV4));
  addRequest(repo, 'csv-export', [block('[INV-4]@1 add after [INV-3]   for R1', { now: INV4 })], { org: ORG3, signedText: ORG3 });
  repo.commit('csv-export: request and its consolidated section', { date: '2026-09-21T12:00:00Z' });
  ok(runAl(repo.dir, ['conclude', 'csv-export', '--yes']), 'conclude');
  const archived = repo.commit(message('Conclude csv-export', { request: 'csv-export', tier: '2 — csv export' }), { date: '2026-09-22T12:00:00Z' });
  const out = context(repo, 'csv-export');
  assert.ok(lines(out).some((l) => /concluded on main/i.test(l) && l.includes(archived.slice(0, 7))),
    `the fixture: csv-export is concluded on main at ${archived.slice(0, 7)}:\n${out}`);
  const next = labelLine(out, 'Next');
  assert.ok(next.includes('al context csv-export --audit'), `the Next line should suggest al context csv-export --audit:\n${next}`);
  assert.doesNotMatch(next, /\bal record\b/, `the Next line should suggest no al record:\n${next}`);
  assert.doesNotMatch(next, /\bal (consolidate|conclude|new)\b|--yes/, `the Next line should suggest only a read:\n${next}`);
});

// --- (g) no repeated sign-off hint ---

test('#89 (g) C10: context invoice-download shows the blocked-delivery not ok and no sign-off note beside it, with or without --all', (t) => {
  const repo = c10(t);
  for (const args of [[], ['--all']]) {
    const out = context(repo, NAME, ...args);
    assert.match(lines(out)[0], /^BLOCKED/, `the fixture: blocked:\n${out}`);
    hint(out, ...BLOCKED_DELIVERY(NAME));
    assert.deepEqual(signoffNotes(viewHints(out), NAME), [], `context ${args.join(' ')}: no sign-off note:\n${out}`);
  }
});

test('#89 (g) C10: check shows the blocked-delivery not ok for invoice-download and not the sign-off note beside it', (t) => {
  const repo = c10(t);
  const out = check(repo, '--all');
  hint(out, ...BLOCKED_DELIVERY(NAME));
  assert.deepEqual(signoffNotes(checkHints(out), NAME), [], `no sign-off note beside the not ok:\n${out}`);
});

test('#89 (g) the not ok "[INV-3] changed on this branch equals the Now of iso-dates, which is blocked" carries the sign-off too: no sign-off note for iso-dates, in check or in context iso-dates --all', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })], { org: ORG3, signed: false });
  repo.commit('iso-dates: request', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  repo.write('specs/invoices.md', file(INV1, S1));
  repo.commit(message('ISO dates', { request: 'iso-dates', tier: '2 — ISO dates' }), { date: '2026-09-22T12:00:00Z' });
  const out = check(repo, '--all');
  hint(out, 'not ok', 'INV-3', /\bNow\b/, 'iso-dates', /\bblocked\b/);
  assert.deepEqual(signoffNotes(checkHints(out), 'iso-dates'), [], `no sign-off note beside the not ok:\n${out}`);
  const view = context(repo, 'iso-dates', '--all');
  assert.deepEqual(signoffNotes(viewHints(view), 'iso-dates'), [], `no sign-off note in context:\n${view}`);
});

// Main: csv-export signed (or not, when `unsigned`). The branch serves it and
// delivers nothing: it edits the organized requirement (so it changed since
// its sign-off), or, unsigned, records a decision only.
function servedNothingDelivered(t, { unsigned = false } = {}) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, INV3));
  addRequest(repo, 'csv-export', null, { org: ORG3, signedText: ORG3, signed: !unsigned });
  repo.commit('csv-export: request', { date: '2026-09-21T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'work']);
  const md = repo.read('requests/csv-export/request.md').toString();
  repo.write('requests/csv-export/request.md', unsigned
    ? `${md}- D5, 2026-09-22. Source: the owner. Keep the CSV header in English.\n`
    : md.replace('as CSV.', 'as CSV or PDF.'));
  repo.commit(message('csv-export: for the owner to sign', { request: 'csv-export', tier: '2 — csv export' }), { date: '2026-09-22T12:00:00Z' });
  return repo;
}

for (const [what, unsigned] of [['changed since its sign-off', false], ['not signed off yet', true]]) {
  test(`#89 (g) pin: csv-export ${what}, served by a branch that delivers nothing for it: check gives the sign-off note, the only hint there`, (t) => {
    const repo = servedNothingDelivered(t, { unsigned });
    const out = check(repo, '--all');
    assert.ok(!checkHints(out).some((l) => kindOf(l) === 'not ok' && l.includes('csv-export')), `the fixture: no not ok for csv-export:\n${out}`);
    assert.equal(signoffNotes(checkHints(out), 'csv-export').length, 1, `the sign-off note should show:\n${out}`);
  });

  test(`#89 (g) pin: csv-export ${what}, served by a branch that delivers nothing for it: context csv-export --all shows the BLOCKED header and the sign-off note beside it (the header is not a hint)`, (t) => {
    const repo = servedNothingDelivered(t, { unsigned });
    const out = context(repo, 'csv-export', '--all');
    assert.match(lines(out)[0], /^BLOCKED/, `the fixture: csv-export is blocked:\n${out}`);
    assert.ok(!viewHints(out).some((l) => kindOf(l) === 'not ok' && l.includes('csv-export')), `the fixture: no not ok for csv-export:\n${out}`);
    assert.equal(signoffNotes(viewHints(out), 'csv-export').length, 1, `the sign-off note should show:\n${out}`);
  });
}

test('#89 (g) pin: an unsigned request on main, served by no branch: context csv-export --all shows the BLOCKED header and no sign-off note (the note is for a served request)', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, INV3));
  addRequest(repo, 'csv-export', [block('[INV-4]@1 add after [INV-3]   for R1', { now: INV4 })], { org: ORG3, signed: false });
  repo.commit('csv-export: request', { date: '2026-09-21T12:00:00Z' });
  const out = context(repo, 'csv-export', '--all');
  assert.match(lines(out)[0], /^BLOCKED/, `the fixture: blocked:\n${out}`);
  assert.deepEqual(signoffNotes(viewHints(out), 'csv-export'), [], `no sign-off note for an unserved request:\n${out}`);
});

// --- (d) the waiting block's target on the Spec line ---

test('#89 (d) C10: the Spec line\'s count form names what the waiting block waits on: 1 waiting (INV-2@2 on INV-2@1)', (t) => {
  const repo = c10(t);
  const spec = labelLine(context(repo), 'Spec');
  assert.ok(spec.includes('1 waiting (INV-2@2 on INV-2@1)'), `the Spec line:\n${spec}`);
});

// Main: INV-1, INV-3 (S0) and rules 11-16 (six pending blocks, so the count
// form); cancel-invoices holds INV-3@1, pending; `name` holds INV-3@1 built
// on it (waiting) and, when `many`, the six.
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const S2 = '## [INV-3] Dates\nDates MUST show in ISO 8601, with the time zone.\n';
const W = (n) => `## [INV-${n}] Rule ${n}\nRule ${n} holds.\n`;
const N = (n) => `## [INV-${n}] Rule ${n}\nRule ${n} MUST hold.\n`;
const SIX = [11, 12, 13, 14, 15, 16];
function builtOn(t, { many }) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0, ...SIX.map(W)));
  addRequest(repo, 'cancel-invoices', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })]);
  addRequest(repo, 'dates', [
    block('[INV-3]@1 modify   builds on cancel-invoices/INV-3@1   for R2', { was: S1, now: S2 }),
    ...(many ? SIX.map((n) => block(`[INV-${n}]@1 modify   for R1`, { was: W(n), now: N(n) })) : []),
  ]);
  repo.commit('Requests', { date: '2026-09-21T12:00:00Z' });
  return repo;
}

test('#89 (d) the count form keeps the <request>/ prefix for another request\'s block: 1 waiting (INV-3@1 on cancel-invoices/INV-3@1)', (t) => {
  const spec = labelLine(context(builtOn(t, { many: true }), 'dates'), 'Spec');
  assert.ok(spec.includes('1 waiting (INV-3@1 on cancel-invoices/INV-3@1)'), `the Spec line:\n${spec}`);
});

test('#89 (d) pin: the list form reads "INV-3@1 waiting on cancel-invoices/INV-3@1"', (t) => {
  const spec = labelLine(context(builtOn(t, { many: false }), 'dates'), 'Spec');
  assert.match(spec, /\bINV-3(@1)? waiting on cancel-invoices\/INV-3@1\b/, `the Spec line:\n${spec}`);
});

// --- (a) the Require line names the command that shows what changed ---

test('#89 (a) C10: the Require line names what changed since the sign-off (R2, Out, R3) and the command that shows it, al record invoice-download signoff --source <where>, without --yes; twelve lines or fewer', (t) => {
  const repo = c10(t);
  const out = context(repo);
  const require = labelLine(out, 'Require');
  assert.ok(require.includes('R2, Out, R3'), `the Require line should name R2, Out, R3:\n${require}`);
  assert.ok(require.includes(`al record ${NAME} signoff --source <where>`), `the Require line should name the command:\n${require}`);
  assert.doesNotMatch(require, /--yes/, `the command only shows what changed; no --yes:\n${require}`);
  assert.ok(body(out).length <= 12, `more than twelve lines above the frame (${body(out).length}):\n${out}`);
});

// --- (e) the live-code note names the files that import or require it ---

const LIVE = ['note', /\blive\b/, 'src/email-link.js'];

test('#89 (e) C10: the note "code still live for dropped work" names src/email.js, which imports it: src/email-link.js:1-4, imported by src/email.js', (t) => {
  const repo = c10(t);
  const line = hint(check(repo, '--all'), ...LIVE);
  assert.ok(line.includes('src/email-link.js:1-4, imported by src/email.js'), `the note:\n${line}`);
  const view = hint(context(repo, NAME, '--all'), ...LIVE);
  assert.ok(view.includes('src/email-link.js:1-4, imported by src/email.js'), `the note in context:\n${view}`);
});

test('#89 (e) importers by a relative specifier, with or without the extension: import from, import(), require() (required by), from another folder; a file that names email-link.js only in a comment or a string does not count', (t) => {
  const repo = c10(t, {
    extra: {
      'src/mail/send.js': "import { emailLink } from '../email-link';\nexport const send = (inv) => emailLink(inv, '');\n",
      'src/lazy.js': "export const lazy = () => import('./email-link.js');\n",
      'src/legacy.cjs': "const { emailLink } = require('./email-link');\nmodule.exports = { emailLink };\n",
      'src/notes.js': "// The email link lives in ./email-link.js; see import from './email-link.js' there.\nexport const note = 'email-link.js';\n",
    },
  });
  const line = hint(check(repo, '--all'), ...LIVE);
  const after = line.slice(line.indexOf('src/email-link.js'));
  for (const importer of ['src/email.js', 'src/mail/send.js', 'src/lazy.js']) {
    assert.match(after, new RegExp(`imported by [^;]*${importer.replaceAll('.', '\\.')}`), `${importer} imports it:\n${line}`);
  }
  assert.match(after, /required by [^;]*src\/legacy\.cjs/, `src/legacy.cjs requires it:\n${line}`);
  assert.ok(!line.includes('src/notes.js'), `src/notes.js only names it in a comment and a string:\n${line}`);
});

// PR #90 review: only real code is a caller, and a directory specifier resolves to its index file.

// The note's text from the dropped file on.
const liveNote = (repo, path = 'src/email-link.js') => {
  const line = hint(check(repo, '--all'), 'note', /\blive\b/, path);
  return { line, after: line.slice(line.indexOf(path)) };
};

test('#89 (e) PR #90: an import inside a string is not a caller: a file whose only code is export const example = "import \'./email-link.js\'" is not named', (t) => {
  const repo = c10(t, { extra: { 'src/example.js': 'export const example = "import \'./email-link.js\'";\n' } });
  const { line, after } = liveNote(repo);
  assert.match(after, /imported by [^;]*src\/email\.js/, `the fixture: the note names importers:\n${line}`);
  assert.ok(!line.includes('src/example.js'), `src/example.js holds the import only in a string:\n${line}`);
});

test('#89 (e) PR #90: a string does not hide code after it: an import() after a URL string with // on the same line is named, imported by src/loader.js', (t) => {
  const repo = c10(t, { extra: { 'src/loader.js': "export const documentationUrl = 'https://example.invalid'; export const load = () => import('./email-link.js');\n" } });
  const { line, after } = liveNote(repo);
  assert.match(after, /imported by [^;]*src\/loader\.js/, `src/loader.js imports it after the URL:\n${line}`);
});

test('#89 (e) PR #90: a directory specifier resolves to its index file: with the dropped code in src/email-link/index.js, require(\'./email-link\') is named "required by", and an explicit ./email-link/index.js import "imported by"', (t) => {
  const repo = c10(t, {
    link: 'src/email-link/index.js',
    extra: {
      'src/email.js': "import { emailLink } from './email-link/index.js';\nexport const emailBody = (inv, base) => emailLink(inv, base);\n",
      'src/directory.cjs': "const { emailLink } = require('./email-link');\nmodule.exports = { emailLink };\n",
    },
  });
  const { line, after } = liveNote(repo, 'src/email-link/index.js');
  assert.match(after, /imported by [^;]*src\/email\.js/, `src/email.js imports ./email-link/index.js:\n${line}`);
  assert.match(after, /required by [^;]*src\/directory\.cjs/, `src/directory.cjs requires ./email-link, the folder:\n${line}`);
});
