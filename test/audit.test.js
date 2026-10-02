// --audit [VW-7] on al context <name>, <ID> and <path>:<line>: the whole
// trace, nothing capped. On a request: every snapshot with its SHA-256
// re-checked [REC-3]; every sign-off with its signed text shown and
// re-checked [REC-5]; every decision [REC-7]; every commit on main's
// first-parent line that changed request.md or change.md (a side branch's by
// its merge commit; an unmerged branch's never); when each held section was
// consolidated [STA-2]; the linked commits [LNK-2] and the test files they
// changed; the Outcome of an archived request [REC-9]. On an ID: its text,
// the commits on main that changed it with their requests, then each one's
// trace. From a code or baseline line: blame, the request, its signed text,
// its decisions and its change. A shallow clone says "history unavailable"
// for the history, never "nothing found" [VW-9]; --at gives the trace as at
// that commit [VW-8]. Acceptance C7 (a fresh single-branch clone audits
// offline) and design §8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, cloneRepo, runAl, sha256 } from './helpers/fixture.js';
import { assertFrame, lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ORG, addRequest, both, lineWith, requestText } from './helpers/request.js';
import { assertBlamed, file } from './helpers/links.js';
import { short } from './helpers/evidence.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const INV4 = '## [INV-4] Separator\nThe CSV separator is a comma.\n';
const INV7 = '## [INV-7] CSV rows\nOne row per line item.\n';
const INV9 = '## [INV-9] Credit notes\nA credit note cancels an invoice.\n';
// The organized requirement as signed the second time: R2 carries the time zone.
const TZ_LINE = 'Dates MUST show in ISO 8601, with the time zone.';
const ORG2 = ORG.replace('Dates MUST show in ISO 8601.', TZ_LINE);
const SIGNED_1 = '2026-09-21 owner, origin/2026-09-21-signoff.md';
const SIGNED_2 = '2026-09-25 owner, origin/2026-09-25-signoff.md';
const signoff = (text) => 'Source: chat with the owner\nOwner\'s words: "Signed again"\n' +
  `Fetched: 2026-09-25T10:00Z\nSHA-256: ${sha256(text)}   (of the signed text below)\n--- signed text ---\n${text}`;
const ISSUE = 'Please add a CSV download to the invoice page.\n';
const snapshot = (text) => `Source: https://example.com/issues/31\nFetched: 2026-09-22T10:00Z\nSHA-256: ${sha256(ISSUE)}\n---\n${text}`;

// Seven decisions, D2 over two lines; D6 and D7 come in a later commit.
const DECISIONS = [
  ['D1', '- D1, 2026-09-02. Source: the owner. CSV only for now.'],
  ['D2', '- D2, 2026-09-03. Source: the review of PR #9 (reviewer);\n  ruling by the agent (architect). Semicolon as separator.'],
  ['D3', '- D3, 2026-09-04. Source: the owner. Keep the ISO dates.'],
  ['D4', '- D4, 2026-09-05. Source: the owner. One row per line item.'],
  ['D5', '- D5, 2026-09-06. Source: the owner. Totals in the invoice currency.'],
  ['D6', '- D6, 2026-09-10. Source: the owner. The email carries the link.'],
  ['D7', '- D7, 2026-09-10. Source: the owner, in review. Header row in English.'],
];
const decisions = (n) => `\n## Decisions\n\n${DECISIONS.slice(0, n).map(([, d]) => d).join('\n')}\n`;
const CSV_MD = (n) => requestText('Request csv-export', { org: ORG2, decisions: decisions(n) }).replace(SIGNED_1, SIGNED_2);

const EXPORT_1 = 'export function exportInvoice(invoice) {\n  const rows = invoice.lines.map((l) => [l.name, l.total]);\n' +
  "  return rows.map((r) => r.join(',')).join('\\n');\n}\n";
const EXPORT_2 = EXPORT_1.replace("r.join(',')", "r.join(';')");
const req = (subject) => `${subject}\n\nRequest: csv-export`;

// main's first-parent line (dates 2026-09-01 to -12):
//   m1  Baseline: INV-1, INV-3 (S0), INV-4; src/legacy.js. No request.
//   m2  csv-export: request.md (D1-D5), words, sign-off 1, the issue snapshot, change.md (INV-3 modify, INV-7 add).
//   m3  src/export.js, test/x.test.js.                  (the side branch forks at m2: b1, a second sign-off, ORG2)
//   mg  merge of side (--no-ff): request.md changes on main here.
//   m4  INV-3 consolidated (the baseline at S1).
//   m5  src/export.js line 3; test/x.test.js.
//   m6  change.md's why edited; test/y.test.js.
//   m7  src/format.js; test/x.test.js.
//   m8  request.md: D6, D7.
//   m9  INV-9 added to the baseline. No request.
//   m10 the issue snapshot's text edited after writing (tampered). No Request line.
// Every commit from m2 to m8 but mg has "Request: csv-export". Branch wip,
// never merged, has u: change.md edited, "Request: csv-export".
function billing(t) {
  const repo = makeRepo(t);
  const c = {};
  repo.write('specs/invoices.md', file(INV1, S0, INV4));
  repo.write('src/legacy.js', 'export const legacy = true;\n');
  c.m1 = repo.commit('Baseline', { date: '2026-09-01T12:00:00Z' });

  addRequest(repo, 'csv-export', [
    block('[INV-3]@1 modify   for R2', { was: S0, now: S1 }),
    block('[INV-7]@1 add after [INV-3]   for R1', { now: INV7 }),
  ], { decisions: decisions(5) });
  repo.write('requests/csv-export/origin/2026-09-22-issue.md', snapshot(ISSUE));
  c.m2 = repo.commit(req('csv-export: request'), { date: '2026-09-02T12:00:00Z' });

  repo.git(['checkout', '-q', '-b', 'side']);
  repo.write('requests/csv-export/request.md', CSV_MD(5));
  repo.write('requests/csv-export/origin/2026-09-25-signoff.md', signoff(ORG2));
  c.b1 = repo.commit(req('csv-export: R2 carries the time zone, signed again'), { date: '2026-09-03T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);

  repo.write('src/export.js', EXPORT_1);
  repo.write('test/x.test.js', "import './src/export.js';\n// exports one row per line\n");
  c.m3 = repo.commit(req('Export code'), { date: '2026-09-04T12:00:00Z' });
  repo.git(['merge', '-q', '--no-ff', '-m', "Merge branch 'side'", 'side'], { date: '2026-09-05T12:00:00Z' });
  c.mg = repo.head();
  repo.git(['branch', '-q', '-D', 'side']);

  repo.write('specs/invoices.md', file(INV1, S1, INV4));
  c.m4 = repo.commit(req('Consolidate INV-3'), { date: '2026-09-06T12:00:00Z' });
  repo.write('src/export.js', EXPORT_2);
  repo.write('test/x.test.js', "import './src/export.js';\n// exports one row per line, semicolons\n");
  c.m5 = repo.commit(req('Semicolon separator'), { date: '2026-09-07T12:00:00Z' });
  const change = repo.read('requests/csv-export/change.md').toString();
  repo.write('requests/csv-export/change.md', change.replace('Why: customers asked.', 'Why: customers asked twice.'));
  repo.write('test/y.test.js', "import './src/export.js';\n// the separator\n");
  c.m6 = repo.commit(req('Why, and a separator test'), { date: '2026-09-08T12:00:00Z' });
  repo.write('src/format.js', 'export const currency = (n) => n.toFixed(2);\n');
  repo.write('test/x.test.js', "import './src/export.js';\n// exports one row per line, semicolons, two decimals\n");
  c.m7 = repo.commit(req('Currency format'), { date: '2026-09-09T12:00:00Z' });
  repo.write('requests/csv-export/request.md', CSV_MD(7));
  c.m8 = repo.commit(req('Decisions D6 and D7'), { date: '2026-09-10T12:00:00Z' });
  repo.write('specs/invoices.md', file(INV1, S1, INV4, INV9));
  c.m9 = repo.commit('Credit notes', { date: '2026-09-11T12:00:00Z' });
  repo.write('requests/csv-export/origin/2026-09-22-issue.md', snapshot(`${ISSUE}And PDF too.\n`));
  c.m10 = repo.commit('Edit a snapshot', { date: '2026-09-12T12:00:00Z' });

  repo.git(['checkout', '-q', '-b', 'wip']);
  repo.write('requests/csv-export/change.md', change.replace('Why: customers asked.', 'Why: a draft.'));
  c.u = repo.commit(req('Draft, never merged'), { date: '2026-09-13T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);

  // The fixture holds the history it claims.
  const firstParent = repo.git(['log', '--first-parent', '--format=%H']).split('\n');
  assert.ok(firstParent.includes(c.mg) && !firstParent.includes(c.b1), 'the fixture: b1 reaches main through mg');
  assert.equal(repo.git(['rev-list', '--count', '--merges', 'HEAD']), '1', 'the fixture: one merge commit on main');
  assert.ok(!repo.git(['rev-list', 'HEAD']).split('\n').includes(c.u), 'the fixture: u is not on main');
  assertBlamed(repo, 'HEAD', 'src/export.js', [3, 3], ['-w', '-M', '-C'], c.m5);
  assertBlamed(repo, 'HEAD', 'src/legacy.js', [1, 1], ['-w', '-M', '-C'], c.m1);
  assertBlamed(repo, 'HEAD', 'specs/invoices.md', [5, 5], ['-w', '-M'], c.m4);
  assert.equal(repo.git(['status', '--porcelain']), '', 'the fixture: a clean tree');
  return { repo, c };
}

const ok = (r) => assert.equal(r.code, 0, both(r));
const audit = (repo, target, ...args) => runAl(repo.dir, ['context', target, '--audit', ...args]);
const nonBlank = (text) => text.split('\n').filter((l) => l.trim());
const has = (out, ...parts) => assert.ok(lineWith(out, ...parts), `expected a line with ${parts.map(String).join(' and ')}:\n${out}`);
const names = (out, sha, what) => assert.ok(out.includes(short(sha)), `should name ${what} ${short(sha)}:\n${out}`);

// The Version line naming `sha` lists each of `paths`, the records that
// commit changed (a Commit line naming the same sha does not count).
function version(out, sha, paths, what) {
  const line = lines(out).find((l) => /^Version\b/.test(l) && l.includes(short(sha)));
  assert.ok(line, `a Version line should name ${what} ${short(sha)}:\n${out}`);
  for (const p of paths) assert.ok(line.includes(p), `the Version line of ${what} should list ${p}:\n${line}`);
}
// A Commit line names `sha`.
function commitLine(out, sha, what) {
  assert.ok(lines(out).some((l) => /^Commit\b/.test(l) && l.includes(short(sha))), `a Commit line should name ${what} ${short(sha)}:\n${out}`);
}
// The indented block under the line "Sign-off  origin/<file> …" is `text`,
// verbatim: its lines in order, relative indentation kept, trailing spaces
// and trailing blank lines aside. The next labelled line ends the block, so
// another sign-off's text cannot fill it.
function signedText(out, file, text, what) {
  const ls = lines(out);
  const at = ls.findIndex((l) => /^Sign-off\b/.test(l) && l.includes(`origin/${file} `));
  assert.ok(at >= 0, `${what}: a Sign-off line for origin/${file}:\n${out}`);
  const block = [];
  for (const l of ls.slice(at + 1)) {
    if (!/^\s/.test(l)) break;
    block.push(l);
  }
  const pad = Math.min(...block.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  const tidy = (xs) => xs.map((l) => l.trimEnd()).join('\n').replace(/\n+$/, '');
  assert.equal(tidy(block.map((l) => l.slice(pad))), tidy(text.split('\n')), `${what}, under origin/${file}:\n${out}`);
}
// The snapshot `name` is named; its hash is not ok, or never said to be.
function snapshotChecked(out, name, tampered) {
  const named = lines(out).filter((l) => l.includes(name));
  assert.ok(named.length > 0, `should name the snapshot ${name}:\n${out}`);
  const bad = named.some((l) => l.includes('not ok'));
  assert.equal(bad, tampered, tampered ? `a line should say "not ok" for the tampered ${name}:\n${out}` : `${name} matches its SHA-256:\n${out}`);
}
// Each decision's text shows in full: its every line, its number on the first.
function showsDecisions(out, n) {
  for (const [d, text] of DECISIONS.slice(0, n)) {
    const [first, ...rest] = text.split('\n').map((l) => l.replace(/^- /, '').trim());
    has(out, new RegExp(`\\b${d}\\b`), first.slice(first.indexOf('Source:')));
    for (const l of rest) has(out, l);
  }
}
const assertUncapped = (out) => assert.doesNotMatch(out, /more hidden|\b\d+ more\b|\band \d+ others?\b|truncated/i, `nothing is capped:\n${out}`);

// --- on a request ---

test('[VW-7][REC-3] audit of a request names every snapshot with its SHA-256 re-checked: the tampered one is "not ok"', (t) => {
  const { repo } = billing(t);
  const r = audit(repo, 'csv-export');
  ok(r);
  snapshotChecked(r.stdout, '2026-09-20-owner-words.md', false);
  snapshotChecked(r.stdout, '2026-09-21-signoff.md', false);
  snapshotChecked(r.stdout, '2026-09-25-signoff.md', false);
  snapshotChecked(r.stdout, '2026-09-22-issue.md', true);
  assertFrame(r.stdout);
});

test('[VW-7][REC-5] audit of a request shows every sign-off with its signed text, verbatim, and its hash checked', (t) => {
  const { repo } = billing(t);
  const r = audit(repo, 'csv-export');
  ok(r);
  signedText(r.stdout, '2026-09-21-signoff.md', ORG, 'the first sign-off\'s text');
  signedText(r.stdout, '2026-09-25-signoff.md', ORG2, 'the second sign-off\'s text');
  assert.ok(r.stdout.includes('Dates MUST show in ISO 8601.') && r.stdout.includes(TZ_LINE), `both texts of R2:\n${r.stdout}`);
});

test('[VW-7][REC-7] audit of a request shows all seven decisions in full, the two-line one included, none capped', (t) => {
  const { repo } = billing(t);
  const r = audit(repo, 'csv-export');
  ok(r);
  showsDecisions(r.stdout, 7);
  assertUncapped(r.stdout);
});

test('[VW-7] audit of a request names each commit on main\'s first-parent line that changed its request.md or change.md; the side branch\'s by its merge commit; never an unmerged branch\'s', (t) => {
  const { repo, c } = billing(t);
  const r = audit(repo, 'csv-export');
  ok(r);
  const CSV = (f) => `requests/csv-export/${f}`;
  version(r.stdout, c.m2, [CSV('request.md'), CSV('change.md')], 'the commit that wrote request.md and change.md');
  version(r.stdout, c.mg, [CSV('request.md')], 'the merge commit that brought the second sign-off\'s request.md to main');
  version(r.stdout, c.m6, [CSV('change.md')], 'the commit that edited change.md');
  version(r.stdout, c.m8, [CSV('request.md')], 'the commit that added D6 and D7');
  assert.ok(!r.stdout.includes(short(c.u)), `u is only on the unmerged branch wip:\n${r.stdout}`);
});

test('[VW-7][STA-2] audit of a request says when each held section was consolidated: INV-3 at the commit where the baseline first equals its "now"; INV-7 not consolidated', (t) => {
  const { repo, c } = billing(t);
  const r = audit(repo, 'csv-export');
  ok(r);
  has(r.stdout, 'INV-3', /consolidated/, short(c.m4));
  has(r.stdout, 'INV-7', /not (yet )?consolidated/);
});

test('[VW-7][LNK-2] audit of a request lists every linked commit, more than five, none hidden, and the test files they changed', (t) => {
  const { repo, c } = billing(t);
  const r = audit(repo, 'csv-export');
  ok(r);
  for (const k of ['m3', 'm4', 'm5', 'm6', 'm7', 'm8']) commitLine(r.stdout, c[k], `the linked commit ${k}`);
  for (const f of ['test/x.test.js', 'test/y.test.js']) assert.ok(r.stdout.includes(f), `should name the test file ${f}:\n${r.stdout}`);
  assertUncapped(r.stdout);
});

test('[VW-7][REC-5] audit of a request whose sign-off text was edited after signing: "not ok" naming the sign-off file', (t) => {
  const repo = makeRepo(t);
  addRequest(repo, 'csv-export', null);
  repo.commit(req('csv-export: request'), { date: '2026-09-02T12:00:00Z' });
  const path = 'requests/csv-export/origin/2026-09-21-signoff.md';
  repo.write(path, repo.read(path).toString().replace('Dates MUST show in ISO 8601.', TZ_LINE));
  repo.commit('Edit the signed text', { date: '2026-09-03T12:00:00Z' });
  const r = audit(repo, 'csv-export');
  ok(r);
  snapshotChecked(r.stdout, '2026-09-21-signoff.md', true);
});

test('[VW-7] audit of an unknown request exits 2', (t) => {
  const { repo } = billing(t);
  const r = audit(repo, 'nosuch-request');
  assert.equal(r.code, 2, both(r));
  assert.ok(both(r).includes('nosuch-request'), `the message should name the request:\n${both(r)}`);
  assert.doesNotMatch(both(r), /unknown option/i, 'the error is the request, not the option');
});

test('[VW-7][VW-8] audit --at <commit> gives the trace as at that commit: D6 and D7 came later, the snapshot was not yet tampered; the Read line names it', (t) => {
  const { repo, c } = billing(t);
  const r = audit(repo, 'csv-export', '--at', c.m7);
  ok(r);
  showsDecisions(r.stdout, 5);
  for (const [d, text] of DECISIONS.slice(5)) {
    assert.ok(!r.stdout.includes(text.slice(text.indexOf('Source:'))), `${d} was added after ${short(c.m7)}:\n${r.stdout}`);
  }
  snapshotChecked(r.stdout, '2026-09-22-issue.md', false);
  assert.ok(!r.stdout.includes(short(c.m8)), `m8 comes after ${short(c.m7)}:\n${r.stdout}`);
  assertFrame(r.stdout, { read: short(c.m7) });
});

// --- on a section ID ---

test('[VW-7] audit of a section ID: its text, the commits on main that changed it with the request each maps to, then each request\'s signed text and decisions', (t) => {
  const { repo, c } = billing(t);
  const r = audit(repo, 'INV-3');
  ok(r);
  assert.ok(r.stdout.includes('Dates MUST show in ISO 8601.'), `the section's text:\n${r.stdout}`);
  names(r.stdout, c.m1, 'the commit that wrote INV-3');
  has(r.stdout, short(c.m4), 'csv-export');
  assert.ok(!r.stdout.includes(short(c.m9)), `m9 changed the file, not INV-3:\n${r.stdout}`);
  signedText(r.stdout, '2026-09-25-signoff.md', ORG2, 'csv-export\'s signed text');
  showsDecisions(r.stdout, 7);
  assertFrame(r.stdout);
});

test('[VW-7] audit of an ID not in the baseline and held by no block says it is not found', (t) => {
  const { repo } = billing(t);
  const r = audit(repo, 'INV-99');
  assert.match(r.stdout + r.stderr, /not in the baseline|not found/, both(r));
});

// --- from a line ---

test('C7 [VW-7] audit from a code line walks blame to the commit, its request, the signed text verbatim, the decisions and the change\'s blocks', (t) => {
  const { repo, c } = billing(t);
  const r = audit(repo, 'src/export.js:3');
  ok(r);
  names(r.stdout, c.m5, 'the commit blame gives line 3');
  assert.ok(r.stdout.includes('csv-export'), `the request m5 maps to:\n${r.stdout}`);
  signedText(r.stdout, '2026-09-25-signoff.md', ORG2, 'csv-export\'s signed text');
  showsDecisions(r.stdout, 7);
  assert.match(r.stdout, /\[?INV-3\]?@1/, `the change's blocks:\n${r.stdout}`);
  assert.match(r.stdout, /\[?INV-7\]?@1/, `the change's blocks:\n${r.stdout}`);
  assertFrame(r.stdout);
});

test('C7 [VW-7] audit from a baseline line reaches the request that wrote it', (t) => {
  const { repo, c } = billing(t);
  const r = audit(repo, 'specs/invoices.md:5');
  ok(r);
  names(r.stdout, c.m4, 'the commit blame gives the line');
  assert.ok(r.stdout.includes('csv-export'), `the request m4 maps to:\n${r.stdout}`);
  signedText(r.stdout, '2026-09-25-signoff.md', ORG2, 'csv-export\'s signed text');
  showsDecisions(r.stdout, 7);
});

test('[VW-7][LNK-2] audit from a line whose commit maps to no request says so, names the commit, and shows no request\'s trace', (t) => {
  const { repo, c } = billing(t);
  const r = audit(repo, 'src/legacy.js:1');
  ok(r);
  names(r.stdout, c.m1, 'the commit blame gives the line');
  assert.match(r.stdout, /no request/, `m1 maps to no request:\n${r.stdout}`);
  assert.ok(!r.stdout.includes('csv-export'), `no request's trace:\n${r.stdout}`);
  assert.ok(!r.stdout.includes(TZ_LINE), `no signed text:\n${r.stdout}`);
});

test('[VW-7] audit of a path that does not exist, or of a line past the end of the file, exits 2', (t) => {
  const { repo } = billing(t);
  for (const target of ['src/nope.js:1', 'src/export.js:99']) {
    const r = audit(repo, target);
    assert.equal(r.code, 2, `${target}:\n${both(r)}`);
    assert.ok(both(r).includes(target.split(':')[0]), `the message should name the path:\n${both(r)}`);
    assert.doesNotMatch(both(r), /unknown option/i, 'the error is the path or line, not the option');
  }
});

test('[VW-7] context <path>:<line> without --audit exits 2, says path:line goes with --audit, and writes nothing', (t) => {
  const { repo } = billing(t);
  const r = runAl(repo.dir, ['context', 'src/export.js:3']);
  assert.equal(r.code, 2, both(r));
  assert.match(both(r), /al: .*--audit/, `an "al:" line naming --audit:\n${both(r)}`);
  assert.equal(repo.git(['status', '--porcelain']), '', 'nothing written');
});

// --- clones ---

test('[VW-7][VW-9] audit in a shallow clone still shows the snapshots and sign-offs with their hash checks and the decisions, and says "history unavailable" for the history, never "nothing found"', (t) => {
  const { repo } = billing(t);
  const clone = cloneRepo(t, repo, { depth: 1 });
  assert.equal(clone.git(['rev-parse', '--is-shallow-repository']), 'true');
  const r = audit(clone, 'csv-export');
  ok(r);
  snapshotChecked(r.stdout, '2026-09-20-owner-words.md', false);
  snapshotChecked(r.stdout, '2026-09-25-signoff.md', false);
  snapshotChecked(r.stdout, '2026-09-22-issue.md', true);
  signedText(r.stdout, '2026-09-25-signoff.md', ORG2, 'the second sign-off\'s text');
  showsDecisions(r.stdout, 7);
  assert.ok(r.stdout.includes('history unavailable'), r.stdout);
  assert.doesNotMatch(r.stdout, /nothing found/i);
  assertFrame(r.stdout, { main: 'origin/main' });
});

const OUTCOME = '\n## Outcome\n\n' +
  '- R1 Invoice export: in no section\n- R2 Dates: in [INV-3]\n- R3 Email link: in no section\n' +
  '- Added: none\n- Modified: [INV-3]\n- Removed: none\n- Dropped: none\n- Kept: none\n' +
  '- Decisions: D1, D3\n- Agent rulings: D2\n';

// iso-dates on main: m2 writes it; part-1 (merged with a merge commit, mg)
// edits change.md and signs again; part-2 (squashed, sq) consolidates INV-3
// and archives it, the concluding commit.
function concluded(t) {
  const repo = makeRepo(t);
  const c = {};
  repo.write('specs/invoices.md', file(INV1, S0));
  c.m1 = repo.commit('Baseline', { date: '2026-09-01T12:00:00Z' });
  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })], { decisions: decisions(3) });
  c.m2 = repo.commit('iso-dates: request\n\nRequest: iso-dates', { date: '2026-09-02T12:00:00Z' });

  repo.git(['checkout', '-q', '-b', 'part-1']);
  const change = repo.read('requests/iso-dates/change.md').toString();
  repo.write('requests/iso-dates/change.md', change.replace('Why: customers asked.', 'Why: customers asked twice.'));
  repo.write('requests/iso-dates/request.md',
    requestText('Request iso-dates', { org: ORG2, decisions: decisions(3) }).replace(SIGNED_1, SIGNED_2));
  repo.write('requests/iso-dates/origin/2026-09-25-signoff.md', signoff(ORG2));
  repo.commit('Why, and signed again\n\nRequest: iso-dates', { date: '2026-09-03T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  repo.git(['merge', '-q', '--no-ff', '-m', "Merge branch 'part-1'", 'part-1'], { date: '2026-09-04T12:00:00Z' });
  c.mg = repo.head();

  repo.git(['checkout', '-q', '-b', 'part-2']);
  repo.write('specs/invoices.md', file(INV1, S1));
  mkdirSync(join(repo.dir, 'requests/archive'), { recursive: true });
  repo.git(['mv', 'requests/iso-dates', 'requests/archive/iso-dates']);
  const md = repo.read('requests/archive/iso-dates/request.md').toString().replace('Status: open', 'Status: concluded');
  repo.write('requests/archive/iso-dates/request.md', md + OUTCOME);
  repo.commit('Consolidate and conclude\n\nRequest: iso-dates', { date: '2026-09-05T12:00:00Z' });
  repo.git(['checkout', '-q', 'main']);
  repo.git(['merge', '-q', '--squash', 'part-2']);
  repo.git(['commit', '-q', '--no-edit'], { date: '2026-09-06T12:00:00Z' });
  c.sq = repo.head();
  for (const b of ['part-1', 'part-2']) repo.git(['branch', '-q', '-D', b]);

  assert.equal(repo.git(['log', '--diff-filter=A', '--format=%H', '--', 'requests/archive/iso-dates/request.md']), c.sq,
    'the fixture: the squash added the archived request.md on main');
  assertBlamed(repo, 'HEAD', 'specs/invoices.md', [5, 5], ['-w', '-M'], c.sq);
  return { repo, c };
}
const showsOutcome = (out) => { for (const l of nonBlank(OUTCOME).slice(1)) has(out, l.replace(/^- /, '')); };

test('[VW-7][REC-9] audit of an archived request shows its Outcome', (t) => {
  const { repo } = concluded(t);
  const r = audit(repo, 'iso-dates');
  ok(r);
  showsOutcome(r.stdout);
  assertFrame(r.stdout);
});

test('C7 [VW-7] a fresh single-branch clone audits an archived request offline: originals, every sign-off with its text, the decisions, every change.md version that reached main, the concluding commit, and the Outcome', (t) => {
  const { repo, c } = concluded(t);
  const clone = cloneRepo(t, repo, { singleBranch: true });
  assert.equal(clone.git(['rev-parse', '--is-shallow-repository']), 'false');
  const r = audit(clone, 'iso-dates');
  ok(r);
  snapshotChecked(r.stdout, '2026-09-20-owner-words.md', false);
  snapshotChecked(r.stdout, '2026-09-21-signoff.md', false);
  snapshotChecked(r.stdout, '2026-09-25-signoff.md', false);
  signedText(r.stdout, '2026-09-21-signoff.md', ORG, 'the first sign-off\'s text');
  signedText(r.stdout, '2026-09-25-signoff.md', ORG2, 'the second sign-off\'s text');
  showsDecisions(r.stdout, 3);
  version(r.stdout, c.m2, ['requests/iso-dates/change.md'], 'the commit that wrote change.md');
  version(r.stdout, c.mg, ['requests/iso-dates/change.md'], 'the merge commit that brought change.md\'s edit to main');
  version(r.stdout, c.sq, ['requests/archive/iso-dates/change.md'], 'the concluding commit');
  showsOutcome(r.stdout);
  assert.ok(!r.stdout.includes('history unavailable'), `the clone holds all of main:\n${r.stdout}`);
  assertFrame(r.stdout, { main: 'origin/main' });
});

test('C7 [VW-7] in a fresh single-branch clone, audit from a baseline line reaches the archived request that wrote it, with its signed text and decisions', (t) => {
  const { repo, c } = concluded(t);
  const clone = cloneRepo(t, repo, { singleBranch: true });
  const r = audit(clone, 'specs/invoices.md:5');
  ok(r);
  names(r.stdout, c.sq, 'the commit blame gives the line');
  assert.ok(r.stdout.includes('iso-dates'), `the request the line maps to:\n${r.stdout}`);
  signedText(r.stdout, '2026-09-25-signoff.md', ORG2, 'iso-dates\' signed text');
  showsDecisions(r.stdout, 3);
});
