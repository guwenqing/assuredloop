// al context --diff <range> --for review [VW-4]: an intent part (per served
// request: the signed organized text verbatim from its latest sign-off file
// [REC-5], its blocks with their states, its decisions with the agent's
// rulings apart [REC-7]), then an evidence part (per R of a served request,
// the changed files linked, with the reason [LNK-1], to a section whose block
// cites that R, or "none found"; then the changed files linked to no served
// request).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, sha256 } from './helpers/fixture.js';
import { lines } from './helpers/output.js';
import { block } from './helpers/change.js';
import { ORG, addRequest, both, lineWith } from './helpers/request.js';
import { assertDiffFrame, contextDiff, file, indexOf, says } from './helpers/links.js';

const INV1 = '## [INV-1] Totals\nTotals MUST show two decimals.\n';
const S0 = "## [INV-3] Dates\nDates show in the customer's local format.\n";
const S1 = '## [INV-3] Dates\nDates MUST show in ISO 8601.\n';
const INV7 = '## [INV-7] CSV rows\nOne row per line item.\n';
const ORG_OLD = ORG.replace('ISO 8601', 'RFC 3339');
// D2 is the agent's ruling; D1 and D3 are the owner's.
const DECIDED = '\n## Decisions\n\n' +
  '- D1, 2026-09-21. Source: the owner. CSV only for now.\n' +
  '- D2, 2026-09-24. Source: ruling by the agent (developer). Semicolon as separator.\n' +
  '- D3, 2026-09-25. Source: the owner, in review. Keep the ISO dates.\n';

// csv-export holds INV-7 (for R1) and INV-3 (for R2); nothing is for R3. It
// was signed on 09-19 (an older text) and again on 09-21 (ORG, the latest).
// The branch consolidates INV-7, then changes src/export.js under its
// [INV-7] marker and src/logger.js, which nothing links to csv-export.
function reviewed(t) {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  repo.commit('Initial spec', { date: '2026-09-01T12:00:00Z' });
  repo.write('src/export.js', "// [INV-7] CSV rows\nexport function csvRow(invoice) {\n  return [invoice.number, invoice.total].join(',');\n}\n");
  repo.write('src/logger.js', "export function log(line) {\n  process.stderr.write(line + '\\n');\n}\n");
  repo.commit('Initial code', { date: '2026-09-10T12:00:00Z' });
  addRequest(repo, 'csv-export', [
    block('[INV-7]@1 add in specs/invoices.md   for R1', { now: INV7 }),
    block('[INV-3]@1 modify   for R2', { was: S0, now: S1 }),
  ], { decisions: DECIDED });
  repo.write('requests/csv-export/origin/2026-09-19-signoff.md', 'Source: chat with the owner\nOwner\'s words: "Signed"\n' +
    `Fetched: 2026-09-19T10:00Z\nSHA-256: ${sha256(ORG_OLD)}   (of the signed text below)\n--- signed text ---\n${ORG_OLD}`);
  repo.commit('Records', { date: '2026-09-22T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'csv-export-part-1']);
  repo.write('specs/invoices.md', file(INV1, S0, INV7));
  repo.commit('Consolidate INV-7\n\nRequest: csv-export', { date: '2026-09-23T12:00:00Z' });
  repo.write('src/export.js', "// [INV-7] CSV rows\nexport function csvRow(invoice) {\n  return [invoice.number, invoice.total].join(';');\n}\n");
  repo.write('src/logger.js', "export function log(line) {\n  process.stderr.write(`${line}\\n`);\n}\n");
  repo.commit('CSV rows\n\nRequest: csv-export', { date: '2026-09-23T13:00:00Z' });
  assert.match(repo.read('requests/csv-export/request.md').toString(), /Signed off: 2026-09-21 owner, origin\/2026-09-21-signoff\.md/,
    'the fixture: request.md points to the 09-21 sign-off');
  return repo;
}

// The review view split at its Intent and Evidence lines.
function review(repo) {
  const r = contextDiff(repo, 'main...HEAD', '--for', 'review');
  assert.equal(r.code, 0, both(r));
  assertDiffFrame(r.stdout);
  const ls = lines(r.stdout);
  const i = indexOf(ls, /^[#\s]*Intent\b/i);
  assert.ok(i >= 0, `expected an Intent line or header:\n${r.stdout}`);
  const e = indexOf(ls, /^[#\s]*Evidence\b/i, i + 1);
  assert.ok(e > i, `expected an Evidence line or header after the Intent one:\n${r.stdout}`);
  return { out: r.stdout, intent: ls.slice(i, e), evidence: ls.slice(e) };
}

test('[VW-4][REC-5] --for review: an Intent part then an Evidence part, with the signed text verbatim between them, from the latest sign-off', (t) => {
  const { out, intent } = review(reviewed(t));
  // Verbatim line by line; an indent or a '>' before each line to set it apart is layout, left open.
  const text = intent.map((l) => l.replace(/^\s*(?:>\s?)?/, '')).join('\n');
  assert.ok(text.includes(ORG.trimEnd()), `the signed text, verbatim, in the intent part:\n${out}`);
  assert.ok(!out.includes('RFC 3339'), `the older sign-off's text is not shown:\n${out}`);
});

test('[VW-4][REC-7] --for review, intent: the served request\'s blocks with their states, and its decisions with the agent\'s ruling apart', (t) => {
  const { out, intent } = review(reviewed(t));
  const text = intent.join('\n');
  assert.ok(says(text, 'INV-7', 'consolidated'), `INV-7 consolidated in the intent part:\n${out}`);
  assert.ok(says(text, 'INV-3', 'pending'), `INV-3 pending in the intent part:\n${out}`);

  const d = (n) => new RegExp(`\\bD${n}\\b`);
  const owner = [1, 3].map((n) => {
    const i = intent.findIndex((l) => d(n).test(l));
    assert.ok(i >= 0, `D${n} in the intent part:\n${out}`);
    assert.doesNotMatch(intent[i], /agent/i, `D${n} is the owner's:\n${out}`);
    return i;
  });
  const at = intent.findIndex((l) => d(2).test(l));
  assert.ok(at >= 0, `D2 in the intent part:\n${out}`);
  // Apart: not on a line with D1 or D3, and not listed between them.
  assert.ok(at < Math.min(...owner) || at > Math.max(...owner), `D2 is listed apart from D1 and D3:\n${out}`);
  const heading = intent.slice(0, at).reverse().find((l) => !/\bD\d+\b/.test(l)) ?? '';
  assert.ok(/agent/i.test(intent[at]) || /agent/i.test(heading), `D2 is marked as the agent's ruling:\n${out}`);
});

test('[VW-4][LNK-1] --for review, evidence: R1 has src/export.js with its reason, R2 and R3 "none found", then src/logger.js, linked to no served request', (t) => {
  const { out, evidence } = review(reviewed(t));
  const r1 = indexOf(evidence, /\bR1\b/);
  const r2 = indexOf(evidence, /\bR2\b/, r1 + 1);
  const r3 = indexOf(evidence, /\bR3\b/, r2 + 1);
  assert.ok(r1 >= 0 && r2 > r1 && r3 > r2, `the evidence part lists R1, R2 and R3 in order:\n${out}`);
  const logger = indexOf(evidence, /src\/logger\.js/);
  assert.ok(logger > r3, `src/logger.js comes after the Rs, as linked to no served request:\n${out}`);

  const forR1 = evidence.slice(r1, r2).join('\n');
  assert.ok(lineWith(forR1, 'src/export.js', 'names [INV-7]'), `R1's evidence: src/export.js, which names [INV-7]:\n${out}`);
  for (const [label, part] of [['R2', evidence.slice(r2, r3)], ['R3', evidence.slice(r3, logger)]]) {
    assert.ok(part.join('\n').includes('none found'), `${label}: "none found":\n${out}`);
    assert.ok(!part.join('\n').includes('src/'), `${label} has no evidence:\n${out}`);
  }
  assert.ok(!evidence.slice(logger).join('\n').includes('src/export.js'), `src/export.js is linked to csv-export:\n${out}`);
});

test('[VW-4] --for review with two served requests: each one\'s signed text verbatim and its blocks in the intent part; each one\'s Rs with their evidence in the evidence part', (t) => {
  const ISO_ORG = '## Organized requirement\n\n### R1 Time stamps\nInvoice times MUST show in ISO 8601.\n';
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  repo.commit('Initial spec', { date: '2026-09-01T12:00:00Z' });
  repo.write('src/export.js', "// [INV-7] CSV rows\nexport function csvRow(invoice) {\n  return [invoice.number, invoice.total].join(',');\n}\n");
  repo.write('src/dates.js', '// [INV-3] Dates\nexport function formatDate(d) {\n  return d.toLocaleDateString();\n}\n');
  repo.write('src/logger.js', "export function log(line) {\n  process.stderr.write(line + '\\n');\n}\n");
  repo.commit('Initial code', { date: '2026-09-10T12:00:00Z' });
  addRequest(repo, 'csv-export', [block('[INV-7]@1 add in specs/invoices.md   for R1', { now: INV7 })], { decisions: DECIDED });
  addRequest(repo, 'iso-dates', [block('[INV-3]@1 modify   for R1', { was: S0, now: S1 })], {
    org: ISO_ORG, signedText: ISO_ORG, decisions: '\n## Decisions\n\n- D1, 2026-09-21. Source: the owner. ISO everywhere.\n',
  });
  repo.commit('Records', { date: '2026-09-22T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'invoices']);
  repo.write('specs/invoices.md', file(INV1, S0, INV7));
  repo.write('src/export.js', "// [INV-7] CSV rows\nexport function csvRow(invoice) {\n  return [invoice.number, invoice.total].join(';');\n}\n");
  repo.commit('CSV rows\n\nRequest: csv-export', { date: '2026-09-23T12:00:00Z' });
  repo.write('specs/invoices.md', file(INV1, S1, INV7));
  repo.write('src/dates.js', '// [INV-3] Dates\nexport function formatDate(d) {\n  return d.toISOString().slice(0, 10);\n}\n');
  repo.commit('ISO dates\n\nRequest: iso-dates', { date: '2026-09-23T13:00:00Z' });
  repo.write('src/logger.js', "export function log(line) {\n  process.stderr.write(`${line}\\n`);\n}\n");
  repo.commit('Logger', { date: '2026-09-23T14:00:00Z' });

  const { out, intent, evidence } = review(repo);
  const text = intent.map((l) => l.replace(/^\s*(?:>\s?)?/, '')).join('\n');
  assert.ok(text.includes(ORG.trimEnd()), `csv-export's signed text, verbatim, in the intent part:\n${out}`);
  assert.ok(text.includes(ISO_ORG.trimEnd()), `iso-dates' signed text, verbatim, in the intent part:\n${out}`);
  assert.ok(says(text, 'INV-7', 'consolidated') && says(text, 'INV-3', 'consolidated'), `both requests' blocks with their states:\n${out}`);

  const ev = evidence.join('\n');
  for (const name of ['csv-export', 'iso-dates']) assert.ok(ev.includes(name), `the evidence part names ${name}:\n${out}`);
  assert.ok(ev.includes('Time stamps'), `iso-dates' R1, Time stamps, in the evidence part:\n${out}`);
  assert.ok(lineWith(ev, 'src/export.js', 'names [INV-7]'), `csv-export's R1 evidence:\n${out}`);
  assert.ok(lineWith(ev, 'src/dates.js', 'names [INV-3]'), `iso-dates' R1 evidence:\n${out}`);
  assert.ok(ev.includes('none found'), `csv-export's R2 and R3 have none:\n${out}`);
  const logger = indexOf(evidence, /src\/logger\.js/);
  assert.ok(logger > indexOf(evidence, /src\/export\.js/) && logger > indexOf(evidence, /src\/dates\.js/),
    `src/logger.js comes after the Rs, as linked to no served request:\n${out}`);
});

test('[VW-4] --for review, intent: a served request the branch archives still shows its blocks with their states', (t) => {
  const repo = makeRepo(t);
  repo.write('specs/invoices.md', file(INV1, S0));
  addRequest(repo, 'iso', [block('[INV-3]@1 modify   for R2', { was: S0, now: S1 })], { decisions: DECIDED });
  repo.commit('Records', { date: '2026-09-22T12:00:00Z' });
  repo.git(['checkout', '-q', '-b', 'iso-part-1']);
  repo.write('specs/invoices.md', file(INV1, S1));
  repo.commit('Consolidate INV-3\n\nRequest: iso', { date: '2026-09-23T12:00:00Z' });
  // Archived as conclude leaves it: the folder moved, the Status set, an Outcome.
  mkdirSync(join(repo.dir, 'requests/archive'), { recursive: true });
  repo.git(['mv', 'requests/iso', 'requests/archive/iso']);
  const md = repo.read('requests/archive/iso/request.md').toString();
  assert.ok(md.includes('Status: open'), 'the fixture: iso was open');
  repo.write('requests/archive/iso/request.md', md.replace('Status: open', 'Status: concluded') + '\n## Outcome\n\n' +
    '- R1 Invoice export: in no section\n- R2 Dates: in [INV-3]\n- R3 Email link: in no section\n' +
    '- Added: none\n- Modified: [INV-3]\n- Removed: none\n- Dropped: none\n- Kept: none\n- Decisions: D1, D3\n- Agent rulings: D2\n');
  repo.commit('Conclude iso\n\nRequest: iso', { date: '2026-09-23T13:00:00Z' });

  const { out, intent } = review(repo);
  const text = intent.join('\n');
  assert.ok(text.includes('iso'), `the intent part names iso:\n${out}`);
  assert.ok(says(text, 'INV-3', 'consolidated'), `iso's INV-3 block, consolidated, in the intent part:\n${out}`);
});
