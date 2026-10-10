// al export (#181, T13; design.md 11 "The export" and "Roles"; interface.md
// "al export"). Written from the requirement and the interface only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  commitAll, doc, editRecord, git, hashOf, index, newRequest, project, read, record, appendSection, organized, req, write,
  writeConfig,
} from './helpers/project.js';
import {
  A_TEXT, D1_TEXT, FULL, REMINDERS_JS, ROLES, ROW_FIELDS, SOURCE_TYPES, buildWorld, exportRows, key, oneRow, runOk,
  runRefused, rowsOf, sha,
} from './helpers/search.js';

// One world for the tests that only read it, built on first use.
const cleanups = [];
after(() => cleanups.forEach((f) => f()));
let world = null;
function get() {
  if (!world) {
    const w = buildWorld({ after: (f) => cleanups.push(f) });
    world = { W: w, ...exportRows(w.dir) };
  }
  return world;
}
const SPEC = 'specs/exports.md';

test('export: each line is one JSON row with every field, of the right type', () => {
  const { rows: ROWS } = get();
  assert.ok(ROWS.length > 0);
  for (const r of ROWS) {
    const name = `${r.id} v${r.version}`;
    for (const f of ROW_FIELDS) assert.ok(Object.hasOwn(r, f), `${name} has ${f}`);
    assert.equal(r.repo, 'acme', `${name}: repo is config.yaml repo:`);
    assert.ok(Number.isInteger(r.version) && r.version >= 1, `${name}: version is a whole number from 1`);
    assert.ok(ROLES.includes(r.role), `${name}: role ${r.role}`);
    assert.ok(SOURCE_TYPES.includes(r.source_type), `${name}: source_type ${r.source_type}`);
    assert.match(r.valid_from, FULL, `${name}: valid_from is a full commit`);
    assert.match(r.commit, FULL, `${name}: commit is a full commit`);
    assert.ok(r.superseded_by === null || FULL.test(r.superseded_by), `${name}: superseded_by`);
    assert.match(r.sha256, /^[0-9a-f]{64}$/, `${name}: sha256 is the full hash`);
    assert.equal(typeof r.text, 'string');
    assert.ok(r.line === null || (Number.isInteger(r.line) && r.line >= 1), `${name}: line`);
    for (const f of ['heading_path', 'serves', 'builds_on', 'changes']) assert.ok(Array.isArray(r[f]), `${name}: ${f} is a list`);
  }
});

test('export: the version key (repo, doc_or_request, id, version) is unique', () => {
  const { rows: ROWS } = get();
  const keys = ROWS.map(key);
  assert.equal(new Set(keys).size, keys.length, 'no two rows share a version key');
});

test('export: rows are sorted by doc_or_request, then id, then version', () => {
  const { rows: ROWS } = get();
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  for (let i = 1; i < ROWS.length; i++) {
    const a = ROWS[i - 1];
    const b = ROWS[i];
    const c = cmp(a.doc_or_request, b.doc_or_request) || cmp(a.id, b.id) || a.version - b.version;
    assert.ok(c < 0, `row ${i} (${key(a)}) comes before row ${i + 1} (${key(b)})`);
  }
});

test('export: the same commit gives the same bytes; --out writes those bytes', () => {
  const { W, stdout: STDOUT } = get();
  const again = runOk(W.dir, ['export']).stdout;
  assert.equal(again, STDOUT, 'two runs, same bytes');
  const atHead = runOk(W.dir, ['export', '--at', W.D]).stdout;
  assert.equal(atHead, STDOUT, '--at HEAD gives the same bytes as the default');
  runOk(W.dir, ['export', '--out', 'export.jsonl']);
  assert.equal(readFileSync(join(W.dir, 'export.jsonl'), 'utf8'), STDOUT, '--out writes the JSONL');
  git(W.dir, 'clean', '-q', '-f', 'export.jsonl');
});

test('export: a current spec paragraph is one baseline row with its fields', () => {
  const { W, rows: ROWS } = get();
  const r = oneRow(ROWS, 'EXP-4');
  assert.equal(r.doc_or_request, SPEC);
  assert.equal(r.version, 1);
  assert.equal(r.role, 'baseline');
  assert.equal(r.source_type, 'spec');
  assert.equal(r.file, SPEC);
  assert.deepEqual(r.heading_path, ['Exports', 'Export links']);
  assert.equal(r.kind, 'rule');
  assert.equal(r.text, A_TEXT.exp4);
  assert.equal(r.sha256, sha(A_TEXT.exp4), 'the parser hash of the text');
  assert.equal(r.sha256, W.hash(SPEC, 'EXP-4'), 'the per-doc record hash');
  assert.equal(r.valid_from, W.A, 'first seen at A');
  assert.equal(r.superseded_by, null, 'current');
  assert.equal(r.commit, W.D, 'a current row is read at the selected commit');
  // The line: the text's first line is at `line`, or just after its marker line.
  const lines = git(W.dir, 'show', `${r.commit}:${r.file}`).split('\n');
  assert.ok(lines.slice(r.line - 1, r.line + 2).includes(A_TEXT.exp4), `line ${r.line} points at the paragraph`);
});

test('export: a replaced paragraph has a history row for its past version and a baseline row for the current one', () => {
  const { W, rows: ROWS } = get();
  const v1 = oneRow(ROWS, 'EXP-2', 1);
  const v2 = oneRow(ROWS, 'EXP-2', 2);
  assert.equal(rowsOf(ROWS, 'EXP-2').length, 2);
  assert.equal(v1.text, A_TEXT.exp2v1);
  assert.equal(v1.role, 'history');
  assert.equal(v1.source_type, 'spec', 'a history row keeps its source type');
  assert.equal(v1.valid_from, W.A);
  assert.equal(v1.superseded_by, W.C, 'replaced at C');
  assert.equal(v1.commit, W.A, 'a past version is read at its valid_from');
  assert.equal(v2.text, A_TEXT.exp2v2);
  assert.equal(v2.role, 'baseline');
  assert.equal(v2.valid_from, W.C);
  assert.equal(v2.superseded_by, null);
  assert.equal(v2.commit, W.D);
});

test('export: a removed paragraph stays as a history row', () => {
  const { W, rows: ROWS } = get();
  const r = oneRow(ROWS, 'EXP-5');
  assert.equal(r.role, 'history');
  assert.equal(r.source_type, 'spec');
  assert.equal(r.text, A_TEXT.exp5);
  assert.equal(r.valid_from, W.A);
  assert.equal(r.superseded_by, W.C, 'removed at C');
  assert.equal(r.commit, W.A);
});

test('export: hints only when the hint was made from this text (basis_sha256 equals sha256)', () => {
  const { rows: ROWS } = get();
  assert.deepEqual(oneRow(ROWS, 'EXP-4').hints, { summary: 'An export link works for half an hour.', tags: ['links', 'expiry'] });
  for (const r of rowsOf(ROWS, 'EXP-2')) assert.ok(!Object.hasOwn(r, 'hints'), `EXP-2 v${r.version}: a stale hint is absent`);
  const withHints = ROWS.filter((r) => Object.hasOwn(r, 'hints')).map((r) => r.id);
  assert.deepEqual(withHints, ['EXP-4'], 'no other row has hints');
});

test('export: ADRs: accepted is baseline, proposed is proposal, superseded is history; ID as in the marker', () => {
  const { rows: ROWS } = get();
  const roles = (file) => ROWS.filter((r) => r.doc_or_request === file).map((r) => [r.id, r.role, r.source_type]);
  assert.deepEqual(roles('specs/adr/0001-csv-files.md'), [['ADR-1', 'baseline', 'adr'], ['ADR-1-1', 'baseline', 'adr']]);
  assert.deepEqual(roles('specs/adr/0002-signed-urls.md'), [['ADR-2', 'history', 'adr'], ['ADR-2-1', 'history', 'adr']]);
  assert.deepEqual(roles('specs/adr/0003-one-time-tokens.md'), [['ADR-3', 'baseline', 'adr'], ['ADR-3-1', 'baseline', 'adr']]);
  assert.deepEqual(roles('specs/adr/0004-zip-archives.md'), [['ADR-4', 'proposal', 'adr'], ['ADR-4-1', 'proposal', 'adr']]);
  assert.equal(oneRow(ROWS, 'ADR-3-1').file, 'specs/adr/0003-one-time-tokens.md');
});

test('export: an open change spec gives proposal rows, with request-qualified IDs and links', () => {
  const { rows: ROWS } = get();
  const sp2 = oneRow(ROWS, 'reminder-emails/SP-2');
  assert.equal(sp2.doc_or_request, 'reminder-emails');
  assert.equal(sp2.role, 'proposal');
  assert.equal(sp2.source_type, 'change');
  assert.equal(sp2.file, 'requests/reminder-emails/spec.md');
  assert.equal(sp2.kind, 'rule');
  assert.equal(sp2.text, A_TEXT.remSp2);
  assert.deepEqual(sp2.serves, ['reminder-emails/R1'], 'R1 in a change spec is <request>/R1');
  assert.deepEqual(sp2.changes, ['EXP-7'], 'a spec ID stays as is');
  const sp3 = oneRow(ROWS, 'reminder-emails/SP-3');
  assert.deepEqual(sp3.builds_on, ['reminder-emails/SP-2'], 'an ID of its own spec is <request>/SP-n');
  assert.equal(sp3.role, 'proposal');
  assert.equal(sp3.kind, 'flow');
});

test('export: a change paragraph whose current version is abandoned or superseded is history, kept as change', () => {
  const { rows: ROWS } = get();
  for (const id of ['reminder-emails/SP-4', 'reminder-emails/SP-5']) {
    const r = oneRow(ROWS, id);
    assert.equal(r.role, 'history', id);
    assert.equal(r.source_type, 'change', id);
    assert.equal(r.superseded_by, null, `${id}: its text is still in the file`);
  }
});

test('export: a spike: its change spec gives spike rows, its question is a source row', () => {
  const { rows: ROWS } = get();
  const sp2 = oneRow(ROWS, 'link-spike/SP-2');
  assert.equal(sp2.role, 'spike');
  assert.equal(sp2.source_type, 'spike');
  assert.equal(sp2.doc_or_request, 'link-spike');
  assert.deepEqual(sp2.serves, ['link-spike/Q1']);
  assert.deepEqual(sp2.builds_on, ['EXP-4']);
  assert.equal(oneRow(ROWS, 'link-spike/SP-1').role, 'spike');
  const q1 = oneRow(ROWS, 'link-spike/Q1');
  assert.equal(q1.role, 'source');
  assert.equal(q1.source_type, 'question');
  assert.equal(q1.kind, 'question', 'kind is the source_type for a row with no marker');
  assert.ok(q1.text.includes('Can the link time be shorter'), q1.text);
  assert.equal(oneRow(ROWS, 'link-spike/S1').source_type, 'signoff');
  assert.equal(oneRow(ROWS, 'link-spike/S1').role, 'source');
});

test('export: the sources of an open request: requirement versions, decisions, owner words, sign-offs', () => {
  const { W, rows: ROWS } = get();
  const rec = record(W.dir, 'reminder-emails');
  const v = (n) => rec.requirements.find((x) => x.id === 'R1' && x.version === n);
  const r1 = rowsOf(ROWS, 'reminder-emails/R1');
  assert.deepEqual(r1.map((r) => r.version), [1, 2], 'one row per requirement version, numbered as the record');
  assert.equal(r1[0].sha256, v(1).sha256, 'version 1 is the record version 1, by hash');
  assert.equal(r1[1].sha256, v(2).sha256, 'version 2 is the record version 2, by hash');
  assert.equal(r1[0].role, 'history', 'an earlier requirement version is history');
  assert.equal(r1[0].source_type, 'requirement');
  assert.equal(r1[1].role, 'source');
  assert.equal(r1[1].source_type, 'requirement');
  assert.ok(r1[1].text.includes('7, 14 and 21 days'), r1[1].text);
  assert.equal(r1[1].doc_or_request, 'reminder-emails');
  const d1 = oneRow(ROWS, 'reminder-emails/D1');
  assert.equal(d1.role, 'source');
  assert.equal(d1.source_type, 'decision');
  assert.equal(d1.kind, 'decision');
  assert.ok(d1.text.includes(D1_TEXT), d1.text);
  const words = oneRow(ROWS, 'reminder-emails/2026-05-04-owner-words.md');
  assert.equal(words.role, 'source');
  assert.equal(words.source_type, 'owner-words');
  assert.ok(words.text.includes('Send them three reminders'), words.text);
  const s1 = oneRow(ROWS, 'reminder-emails/S1');
  assert.equal(s1.role, 'source');
  assert.equal(s1.source_type, 'signoff');
});

test('export: every row of an archived request, and of a request whose status is not open, is history', () => {
  const { rows: ROWS } = get();
  for (const name of ['old-numbers', 'dropped-idea']) {
    const mine = ROWS.filter((r) => r.doc_or_request === name);
    assert.ok(mine.length >= 3, `${name} has rows: ${mine.map((r) => r.id)}`);
    for (const r of mine) assert.equal(r.role, 'history', `${r.id}`);
  }
  const sp2 = oneRow(ROWS, 'old-numbers/SP-2');
  assert.equal(sp2.source_type, 'change', 'a history row keeps its source type');
  assert.equal(sp2.file, 'requests/archive/old-numbers/spec.md');
  assert.equal(sp2.text, A_TEXT.oldSp2);
  assert.equal(oneRow(ROWS, 'old-numbers/R1').source_type, 'requirement');
  assert.equal(oneRow(ROWS, 'old-numbers/2026-05-04-owner-words.md').source_type, 'owner-words');
  assert.equal(oneRow(ROWS, 'dropped-idea/SP-2').source_type, 'change');
});

test('export: identical local IDs in several requests stay apart', () => {
  const { rows: ROWS } = get();
  const sp2 = ROWS.filter((r) => /\/SP-2$/.test(r.id)).map((r) => [r.id, r.role]).sort();
  assert.deepEqual(sp2, [
    ['dropped-idea/SP-2', 'history'], ['link-spike/SP-2', 'spike'], ['old-numbers/SP-2', 'history'], ['reminder-emails/SP-2', 'proposal'],
  ]);
  assert.ok(!ROWS.some((r) => r.id === 'SP-2'), 'no bare SP-2');
});

test('export: evidence: result files and declared outputs of this repo that exist', () => {
  const { rows: ROWS } = get();
  const res = oneRow(ROWS, '.assuredloop/results/reminders-test.yaml');
  assert.equal(res.role, 'evidence');
  assert.equal(res.source_type, 'result');
  assert.equal(res.doc_or_request, '.assuredloop/results/reminders-test.yaml');
  assert.ok(res.text.includes('the reminder test passed'), res.text);
  assert.equal(oneRow(ROWS, '.assuredloop/results/csv-review.yaml').role, 'evidence');
  const out = oneRow(ROWS, 'src/reminders.js');
  assert.equal(out.role, 'evidence');
  assert.equal(out.source_type, 'output');
  assert.equal(out.file, 'src/reminders.js');
  // D15 (interface-186.md, "The central repo's own output rows"): an output
  // row holds only the lines that name an ID, as "<n>: <line>", not the whole file.
  assert.equal(out.text, `1: ${REMINDERS_JS.split('\n')[0]}`, 'only line 1 names an ID (reminder-emails/SP-2)');
  assert.deepEqual(out.cites, ['reminder-emails/SP-2']);
  assert.deepEqual(out.declared, [{ request: 'reminder-emails', link: 'implements', target: 'SP-2' }]);
  assert.deepEqual(out.how, ['declared', 'exact']);
  assert.deepEqual(out.proves, ['a claim, not proven', 'proves only that the ID is named']);
  assert.ok(!ROWS.some((r) => r.id === 'src/missing.js'), 'a declared output that does not exist has no row');
  assert.ok(!ROWS.some((r) => r.id === 'src/worker.js' || r.file === 'src/worker.js'), 'an output of another repo has no row');
});

test('export: committed text only; the working tree is not read', () => {
  const { W } = get();
  const before = runOk(W.dir, ['export']).stdout;
  const spec = read(W.dir, SPEC);
  write(W.dir, SPEC, `${spec.replace('30 minutes', '45 minutes')}\n<!-- EXP-9 rule -->\n\nAn uncommitted zebra rule MUST NOT be exported.\n`);
  write(W.dir, 'requests/reminder-emails/spec.md', `${read(W.dir, 'requests/reminder-emails/spec.md')}\n<!-- SP-6 rule -->\n\nAn uncommitted zebra proposal.\n`);
  try {
    const now = runOk(W.dir, ['export']).stdout;
    assert.equal(now, before, 'the same bytes as before the edits');
    assert.ok(!now.includes('zebra'));
  } finally {
    git(W.dir, 'checkout', '-q', '--', SPEC, 'requests/reminder-emails/spec.md');
  }
});

test('export --at: the rows as at that commit', () => {
  const { W } = get();
  const { rows } = exportRows(W.dir, ['--at', W.A]);
  const exp2 = oneRow(rows, 'EXP-2');
  assert.equal(exp2.version, 1);
  assert.equal(exp2.role, 'baseline');
  assert.equal(exp2.text, A_TEXT.exp2v1);
  assert.equal(exp2.superseded_by, null, 'at A it is current');
  assert.equal(exp2.commit, W.A);
  assert.equal(oneRow(rows, 'EXP-5').role, 'baseline');
  assert.ok(!rows.some((r) => r.doc_or_request === 'reminder-emails'), 'no request at A');
  const short = exportRows(W.dir, ['--at', W.A.slice(0, 10)]).stdout;
  assert.equal(short, exportRows(W.dir, ['--at', W.A]).stdout, 'a short commit selects the same commit');
});

test('export: with no commit, it refuses', (t) => {
  const dir = project(t);
  writeConfig(dir, [{ file: SPEC, prefix: 'EXP' }]);
  write(dir, SPEC, doc([['EXP-1 rule', 'A rule.']]));
  runRefused(dir, ['export']);
  commitAll(dir, 'one');
  assert.equal(oneRow(exportRows(dir).rows, 'EXP-1').text, 'A rule.', 'with a commit, the same command exports');
});

test('export: repo is the top folder name when config has no repo:', (t) => {
  const dir = project(t);
  writeConfig(dir, [{ file: SPEC, prefix: 'EXP' }]);
  write(dir, SPEC, doc([['EXP-1 rule', 'A user MUST be able to export.']]));
  commitAll(dir, 'one');
  const { rows } = exportRows(dir);
  assert.equal(oneRow(rows, 'EXP-1').repo, dir.split('/').at(-1));
});

test('export: versions follow the first-parent history; a text seen only on a merged branch is no version', (t) => {
  const dir = project(t);
  writeConfig(dir, [{ file: SPEC, prefix: 'EXP' }], { repo: 'acme' });
  write(dir, SPEC, doc([['EXP-1 note', '# Exports'], ['EXP-2 rule', 'Alpha text one.']]));
  const A = commitAll(dir, 'A');
  git(dir, 'checkout', '-q', '-b', 'side');
  write(dir, SPEC, doc([['EXP-1 note', '# Exports'], ['EXP-2 rule', 'Alpha draft.']]));
  commitAll(dir, 'S1');
  write(dir, SPEC, doc([['EXP-1 note', '# Exports'], ['EXP-2 rule', 'Alpha final.']]));
  commitAll(dir, 'S2');
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'merge', '-q', '--no-ff', '-m', 'M: merge side', 'side');
  const M = git(dir, 'rev-parse', 'HEAD');
  const { rows } = exportRows(dir);
  const exp2 = rowsOf(rows, 'EXP-2');
  assert.deepEqual(exp2.map((r) => [r.version, r.text, r.role]), [[1, 'Alpha text one.', 'history'], [2, 'Alpha final.', 'baseline']]);
  assert.equal(exp2[0].valid_from, A);
  assert.equal(exp2[0].superseded_by, M);
  assert.equal(exp2[1].valid_from, M, 'first seen on the first-parent history at the merge');
  assert.ok(!rows.some((r) => r.text === 'Alpha draft.'));
});

test('export: a text that comes back after a change keeps its first version number', (t) => {
  const dir = project(t);
  writeConfig(dir, [{ file: SPEC, prefix: 'EXP' }], { repo: 'acme' });
  const v = (text) => doc([['EXP-1 note', '# Exports'], ['EXP-2 rule', text]]);
  write(dir, SPEC, v('Beta one.'));
  commitAll(dir, '1');
  write(dir, SPEC, v('Beta two.'));
  commitAll(dir, '2');
  write(dir, SPEC, v('Beta one.'));
  commitAll(dir, '3');
  const { rows } = exportRows(dir);
  const exp2 = rowsOf(rows, 'EXP-2');
  const current = exp2.filter((r) => r.role === 'baseline');
  assert.equal(current.length, 1);
  assert.equal(current[0].text, 'Beta one.');
  assert.equal(current[0].version, 1, 'versions are numbered by first appearance of the text');
  assert.ok(exp2.some((r) => r.version === 2 && r.text === 'Beta two.' && r.role === 'history'));
  assert.equal(new Set(exp2.map((r) => r.version)).size, exp2.length);
});

test('export: a disposition closes one source version: an edited paragraph is proposal again, its old version history', (t) => {
  const dir = project(t);
  writeConfig(dir, [{ file: SPEC, prefix: 'EXP' }], { repo: 'acme' });
  write(dir, SPEC, doc([['EXP-1 rule', 'A user MUST be able to export.']]));
  commitAll(dir, 'spec');
  newRequest(dir, 'faxes', 'Fax the invoices.\n', ['--tier', '2']);
  const CS = 'requests/faxes/spec.md';
  write(dir, CS, doc([['SP-1 note', '# Faxes'], ['SP-2 rule', 'Invoices MAY be sent by fax.']]));
  editRecord(dir, 'faxes', (rec) => { rec.dispositions = [{ source: 'faxes/SP-2', disposition: 'abandoned', reason: 'never applied' }]; });
  index(dir);
  assert.equal(record(dir, 'faxes').dispositions[0].source_sha256, hashOf(dir, CS, 'SP-2'), 'index filled the source hash');
  commitAll(dir, 'abandoned');
  write(dir, CS, doc([['SP-1 note', '# Faxes'], ['SP-2 rule', 'Invoices MAY be sent by fax, on request.']]));
  index(dir);
  commitAll(dir, 'edited after the disposition');
  const { rows } = exportRows(dir);
  const sp2 = rowsOf(rows, 'faxes/SP-2');
  assert.deepEqual(sp2.map((r) => [r.version, r.role]), [[1, 'history'], [2, 'proposal']]);
  assert.equal(sp2[1].text, 'Invoices MAY be sent by fax, on request.');
});

test('export: a requirement text the record does not hold takes the next number after the record\'s highest', (t) => {
  const dir = project(t);
  writeConfig(dir, [{ file: SPEC, prefix: 'EXP' }], { repo: 'acme' });
  write(dir, SPEC, doc([['EXP-1 rule', 'A user MUST be able to export.']]));
  commitAll(dir, 'spec');
  newRequest(dir, 'csv', 'CSV please.\n', ['--tier', '2']);
  const t1 = req('R1', 'CSV', 'Exports MUST be CSV files.');
  const t2 = req('R1', 'CSV', 'Exports MUST be CSV files with a header.');
  const t3 = req('R1', 'CSV', 'Exports MUST be UTF-8 CSV files with a header.');
  appendSection(dir, 'csv', organized([t1]));
  index(dir);
  commitAll(dir, 'R1 version 1');
  const md = read(dir, 'requests/csv/request.md');
  write(dir, 'requests/csv/request.md', md.replace(t1.text, t2.text));
  index(dir); // the record holds version 2, whose text is never committed
  write(dir, 'requests/csv/request.md', md.replace(t1.text, t3.text));
  commitAll(dir, 'R1 text 3, not indexed');
  assert.deepEqual(record(dir, 'csv').requirements.map((v) => [v.version, v.sha256]), [[1, t1.sha256], [2, t2.sha256]]);
  const { rows } = exportRows(dir);
  const r1 = rowsOf(rows, 'csv/R1');
  const first = r1.find((r) => r.sha256 === t1.sha256);
  const third = r1.find((r) => r.sha256 === t3.sha256);
  assert.ok(first && third, JSON.stringify(r1.map((r) => [r.version, r.text])));
  assert.equal(first.version, 1);
  assert.equal(first.role, 'history');
  assert.equal(third.version, 3, 'next after the record\'s highest (2)');
  assert.equal(third.role, 'source');
});

test('export: with no --out it writes nothing to the working tree', () => {
  const { W } = get();
  const before = git(W.dir, 'status', '--porcelain', '--ignored');
  runOk(W.dir, ['export']);
  assert.equal(git(W.dir, 'status', '--porcelain', '--ignored'), before);
});

// The fields of a row are what the requirement names (design.md 11): nothing is
// assumed about extra fields, but `hints` holds only summary and tags.
test('export: hints hold summary and tags only', () => {
  const { rows: ROWS } = get();
  for (const r of ROWS.filter((x) => x.hints)) assert.deepEqual(Object.keys(r.hints).sort(), ['summary', 'tags']);
});

