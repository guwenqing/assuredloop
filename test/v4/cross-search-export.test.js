// al export across the output repos (#186, T13 with T12; design.md 11 and 12;
// interface-186.md 1-3, with D17 for the central repo's own output rows).
// Written from the requirement and the interface only, on one central repo
// with three output repos: invoicer-web (a branch), invoicer-worker (a pinned
// short hash) and invoicer-mobile (no clone). See helpers/cross-search.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { K7, ZIP_V1, ZIP_V2 } from './helpers/cross-repo.js';
import {
  CLAIM, ENCODING, GUIDE, LINK_CHECK, NAMED, TOKEN, addedAt, blob, crossRepo, hide, listOf, namedLines, pin, rowOf,
  searchWorld, setOutputs, sha256,
} from './helpers/cross-search.js';
import { commitAll, git, readYaml, write, writeYaml } from './helpers/project.js';
import { FULL, ROW_FIELDS, exportRows, key, runOk } from './helpers/search.js';

const OUTPUT_REPOS = ['invoicer-web', 'invoicer-worker'];

// One world for the tests that only read it, built on first use.
let shared = null;
function get() {
  if (!shared) {
    const w = searchWorld(null);
    shared = { w, ...exportRows(w.central) };
  }
  return shared;
}

// The resolved commit of each output repo in the shared world.
const resolved = (w) => ({ 'invoicer-web': w.shas.web.main, 'invoicer-worker': w.shas.worker.K5 });

// The run of `al export --out <file>`; the file is removed after.
function exportOut(dir) {
  const r = runOk(dir, ['export', '--out', 'cross-export.jsonl']);
  const written = readFileSync(join(dir, 'cross-export.jsonl'), 'utf8');
  rmSync(join(dir, 'cross-export.jsonl'));
  return { stdout: r.stdout, written };
}

// The Not known part of a summary names <name> with <reason> on one line.
function notKnownNames(stdout, name, reason) {
  const lines = stdout.split('\n');
  const from = lines.findIndex((l) => /^Not known\b/.test(l));
  assert.ok(from >= 0, `a Not known line:\n${stdout}`);
  assert.ok(lines.slice(from).some((l) => l.includes(name) && l.includes(reason)),
    `Not known names ${name} with its reason "${reason}":\n${stdout}`);
}

test('export: the central rows come first, then each known output repo in config order; no row of the absent clone', () => {
  const { rows } = get();
  const blocks = rows.map((r) => r.repo).filter((repo, i, all) => i === 0 || all[i - 1] !== repo);
  assert.deepEqual(blocks, ['invoicer', 'invoicer-web', 'invoicer-worker'], 'one block per repo, in this order');
});

test('export: within each output repo, the order of #183 (doc_or_request, id, version)', () => {
  const { rows } = get();
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  for (const repo of OUTPUT_REPOS) {
    const mine = rows.filter((r) => r.repo === repo);
    assert.ok(mine.length > 1, `${repo} has rows`);
    for (let i = 1; i < mine.length; i++) {
      const a = mine[i - 1];
      const b = mine[i];
      assert.ok((cmp(a.doc_or_request, b.doc_or_request) || cmp(a.id, b.id) || a.version - b.version) < 0, `${key(a)} before ${key(b)}`);
    }
  }
});

test('export: invoicer-web gives exactly its result, its declared files and its files that cite a central ID', () => {
  const { rows } = get();
  assert.deepEqual(listOf(rows, 'invoicer-web'), [
    '.assuredloop/results/export-link-test.yaml v1 evidence',
    'config/link.json v1 evidence',
    'docs/link.md v1 evidence',
    'src/export-link.js v1 evidence',
    'src/reminders.js v1 evidence',
    'test/export-link.test.js v1 evidence',
  ]);
});

test('export: invoicer-worker gives exactly its results, its declared file (with its earlier version) and its citing files', () => {
  const { rows } = get();
  assert.deepEqual(listOf(rows, 'invoicer-worker'), [
    ...['a-no-inputs', 'b-unknown-no-inputs', 'c-unknown', 'd-k7', 'e-gone', 'f-changed', 'g-unchanged', 'h-short']
      .map((f) => `.assuredloop/results/${f}.yaml v1 evidence`),
    'src/reminders.js v1 evidence',
    'src/zip-export.js v1 history',
    'src/zip-export.js v2 evidence',
    'test/zip-export.test.js v1 evidence',
  ]);
});

test('export: nothing from under .assuredloop/ of an output repo but its results', () => {
  const { rows } = get();
  const under = rows.filter((r) => r.repo !== 'invoicer' && r.file.startsWith('.assuredloop/'));
  assert.equal(under.length, 9, `the 9 result files of web and worker: ${under.map((r) => `${r.repo}:${r.file}`).join(', ')}`);
  for (const r of under) {
    assert.equal(r.source_type, 'result', `${r.repo}:${r.file}`);
    assert.match(r.file, /^\.assuredloop\/results\/[^/]+\.yaml$/, `${r.repo}:${r.file}`);
  }
  assert.ok(!rows.some((r) => r.repo === 'invoicer-web' && r.file === '.assuredloop/notes.md'), 'notes.md cites central:EXP-5 but is under .assuredloop/');
  assert.ok(!rows.some((r) => r.repo !== 'invoicer' && r.file === '.assuredloop/config.yaml'));
});

test('export: in an output repo only the qualified form central:<ID> counts; a bare ID makes no row', () => {
  const { rows } = get();
  assert.ok(rows.some((r) => r.repo === 'invoicer-web' && r.source_type === 'output'), 'invoicer-web has output rows');
  assert.ok(!rows.some((r) => r.file === 'src/plain.js'), 'src/plain.js names EXP-4 and invoice-exports/R2 without central:');
  assert.ok(!rows.some((r) => r.repo !== 'invoicer' && r.file === 'docs/tidy.md'), 'a file that names no ID and is not declared');
});

test('export: a file that no longer cites, or is gone, at the resolved commit has no row, not even a history row', () => {
  const { rows } = get();
  assert.ok(rows.some((r) => r.repo === 'invoicer-web' && r.source_type === 'output'), 'invoicer-web has output rows');
  assert.ok(!rows.some((r) => r.file === 'src/old-note.js'), 'cited central:EXP-4 at C1, deleted at C2');
  assert.ok(!rows.some((r) => r.file === 'src/draft.js'), 'cited central:EXP-6 at C1, no cite at C2');
});

test('export: a declared file that is not in the output repo has no row', () => {
  const { rows } = get();
  assert.ok(rows.some((r) => r.repo === 'invoicer-web' && r.file === 'src/export-link.js'), 'a declared file that is there has a row');
  assert.ok(!rows.some((r) => r.file === 'docs/missing.md'));
});

test('export: every output-repo row has every field, its repo and its commit', () => {
  const { w, rows } = get();
  const sha = resolved(w);
  assert.ok(rows.some((x) => x.repo !== 'invoicer' && x.role === 'history'), 'some output-repo rows, one of them history');
  for (const r of rows.filter((x) => x.repo !== 'invoicer')) {
    const name = `${r.repo}:${r.id} v${r.version}`;
    for (const f of ROW_FIELDS) assert.ok(Object.hasOwn(r, f), `${name} has ${f}`);
    assert.ok(['result', 'output'].includes(r.source_type), `${name}: source_type ${r.source_type}`);
    assert.equal(r.kind, r.source_type, `${name}: kind is the source_type`);
    assert.equal(r.id, r.file, `${name}: id is the path`);
    assert.equal(r.doc_or_request, r.file, `${name}: doc_or_request is the path`);
    assert.match(r.commit, FULL, `${name}: commit is a full hash`);
    assert.match(r.valid_from, FULL, `${name}: valid_from is a full hash`);
    if (r.role === 'evidence') {
      assert.equal(r.commit, sha[r.repo], `${name}: an evidence row is read at the repo's resolved commit`);
      assert.equal(r.superseded_by, null, `${name}: current`);
    } else {
      assert.equal(r.role, 'history', name);
      assert.equal(r.commit, r.valid_from, `${name}: a past version is read at its valid_from`);
      assert.match(r.superseded_by, FULL, `${name}: superseded_by`);
    }
    if (r.source_type === 'output') {
      for (const f of ['cites', 'declared', 'how', 'proves']) assert.ok(Array.isArray(r[f]), `${name}: ${f} is a list`);
    }
  }
});

test('export: the bound: an output row of an output repo holds only the lines that name a central ID, and the sha256 of the bytes', () => {
  const { w, rows } = get();
  const dirOf = { 'invoicer-web': w.web, 'invoicer-worker': w.worker };
  const outs = rows.filter((r) => r.repo !== 'invoicer' && r.source_type === 'output');
  assert.ok(outs.length >= 7, `the output rows: ${outs.map((r) => `${r.repo}:${r.id}`).join(', ')}`);
  for (const r of outs) {
    const bytes = blob(dirOf[r.repo], r.commit, r.file);
    const name = `${r.repo}:${r.id} v${r.version}`;
    assert.equal(r.text, namedLines(bytes.toString('utf8')), `${name}: the lines that name a central ID, as "<n>: <line>"`);
    assert.equal(r.sha256, sha256(bytes), `${name}: sha256 of the file's bytes at ${r.commit}`);
    for (const l of r.text.split('\n').filter(Boolean)) assert.match(l, /^\d+: .*central:/, `${name}: no line of code that names no central ID`);
  }
  const all = rows.filter((r) => r.repo !== 'invoicer').map((r) => r.text).join('\n');
  for (const code of ['export function zipName(year) {', 'randomBytes(16)', 'export function banner(days) {', "import assert from 'node:assert/strict';"]) {
    assert.ok(!all.includes(code), `no output-repo row holds "${code}"`);
  }
});

test('export: a declared file that also cites is one row: how declared and exact, with both proofs', () => {
  const { w, rows } = get();
  const r = rowOf(rows, 'invoicer-web', 'src/export-link.js');
  assert.deepEqual(r.how, ['declared', 'exact']);
  assert.deepEqual(r.proves, [CLAIM, NAMED]);
  assert.deepEqual(r.declared, [{ request: 'invoice-exports', link: 'implements', target: 'central:EXP-4' }]);
  assert.deepEqual(r.cites, ['central:EXP-4', 'central:EXP-6']);
  assert.equal(r.text, '1: // Export links (central:EXP-4, central:EXP-6).');
  assert.equal(r.valid_from, w.shas.web.W3);
  assert.equal(r.commit, w.shas.web.main);
  assert.equal(r.role, 'evidence');
  const t = rowOf(rows, 'invoicer-web', 'test/export-link.test.js');
  assert.deepEqual(t.declared, [{ request: 'invoice-exports', link: 'verifies', target: 'central:EXP-4' }]);
  assert.deepEqual(t.how, ['declared', 'exact']);
  assert.equal(t.text, '1: // Checks central:EXP-4: the link stops working 30 minutes after sending.');
});

test('export: a file that only cites: how exact; its IDs as written, sorted, each once', () => {
  const { w, rows } = get();
  const r = rowOf(rows, 'invoicer-web', 'docs/link.md');
  assert.deepEqual(r.how, ['exact']);
  assert.deepEqual(r.proves, [NAMED]);
  assert.deepEqual(r.declared, []);
  assert.deepEqual(r.cites, ['central:ADR-4', 'central:EXP-4', 'central:EXP-6', 'central:EXP-99', 'central:invoice-exports/R2']);
  assert.equal(r.text, [
    '3: The link follows central:invoice-exports/R2.',
    '4: It expires as central:EXP-4 says.',
    '5: See central:EXP-4 again, and the token (central:EXP-6, central:ADR-4).',
    '6: Not in the spec: central:EXP-99.',
  ].join('\n'));
  assert.equal(r.valid_from, w.shas.web.A);
});

test('export: a declared file that names no ID: how declared, and the empty text', () => {
  const { w, rows } = get();
  const r = rowOf(rows, 'invoicer-web', 'config/link.json');
  assert.equal(r.source_type, 'output');
  assert.equal(r.role, 'evidence');
  assert.deepEqual(r.how, ['declared']);
  assert.deepEqual(r.proves, [CLAIM]);
  assert.deepEqual(r.cites, []);
  assert.deepEqual(r.declared, [{ request: 'invoice-exports', link: 'implements', target: 'central:EXP-4' }]);
  assert.equal(r.text, '');
  assert.equal(r.sha256, sha256(blob(w.web, w.shas.web.main, 'config/link.json')));
});

test('export: an earlier version of an output file is a history row on the output repo\'s first-parent history', () => {
  const { w, rows } = get();
  const { K4, K5 } = w.shas.worker;
  const v1 = rowOf(rows, 'invoicer-worker', 'src/zip-export.js', 1);
  const v2 = rowOf(rows, 'invoicer-worker', 'src/zip-export.js', 2);
  assert.equal(v1.role, 'history');
  assert.equal(v1.source_type, 'output', 'a history row keeps its source type');
  assert.equal(v1.valid_from, K4);
  assert.equal(v1.superseded_by, K5, 'the merge brought v2 onto the first-parent history');
  assert.equal(v1.commit, K4);
  assert.equal(v1.text, '1: // Yearly ZIP export (central:invoice-exports/SP-10).');
  assert.deepEqual(v1.cites, ['central:invoice-exports/SP-10']);
  assert.equal(v1.sha256, sha256(ZIP_V1));
  assert.equal(v2.role, 'evidence');
  assert.equal(v2.valid_from, K5);
  assert.equal(v2.superseded_by, null);
  assert.equal(v2.commit, K5);
  assert.equal(v2.text, '1: // Yearly ZIP export (central:invoice-exports/SP-7, central:invoice-exports/SP-10).');
  assert.deepEqual(v2.cites, ['central:invoice-exports/SP-10', 'central:invoice-exports/SP-7']);
  assert.deepEqual(v2.declared, [{ request: 'invoice-exports', link: 'implements', target: 'central:invoice-exports/R3' }]);
  assert.deepEqual(v2.how, ['declared', 'exact']);
  assert.equal(v2.sha256, sha256(ZIP_V2));
});

test('export: a result row holds the result file\'s text, at the resolved commit, even when it names an unavailable commit', () => {
  const { w, rows } = get();
  const web = rowOf(rows, 'invoicer-web', '.assuredloop/results/export-link-test.yaml');
  const text = blob(w.web, w.shas.web.main, '.assuredloop/results/export-link-test.yaml').toString('utf8');
  assert.equal(web.source_type, 'result');
  assert.equal(web.role, 'evidence');
  assert.equal(web.text, text);
  assert.equal(web.valid_from, w.shas.web.result);
  assert.equal(web.commit, w.shas.web.main);
  const k7 = rowOf(rows, 'invoicer-worker', '.assuredloop/results/d-k7.yaml');
  assert.equal(k7.role, 'evidence');
  assert.equal(k7.text, blob(w.worker, w.shas.worker.K5, '.assuredloop/results/d-k7.yaml').toString('utf8'));
  assert.ok(k7.text.includes(K7), 'the result names the commit K7, which is not in the clone');
  assert.equal(k7.valid_from, w.shas.worker.R);
});

test('export: the same path in two repos is two rows; the version key (with repo) is unique', () => {
  const { rows } = get();
  assert.deepEqual(rows.filter((r) => r.id === 'src/reminders.js').map((r) => r.repo), ['invoicer-web', 'invoicer-worker']);
  assert.equal(rowOf(rows, 'invoicer-web', 'src/reminders.js').text, '3: // Shown as central:reminder-emails/SP-2 says.');
  assert.equal(rowOf(rows, 'invoicer-worker', 'src/reminders.js').text, '1: // Reminder job (central:INV-11).');
  const keys = rows.map(key);
  assert.equal(new Set(keys).size, keys.length, 'no two rows share repo, doc_or_request, id and version');
});

// D17: the central repo's own output rows have the same bound.
test('export: central output rows (D17): the declared files and every other file that names a known ID, bounded', () => {
  const { w, rows } = get();
  const outs = rows.filter((r) => r.repo === 'invoicer' && r.source_type === 'output');
  assert.deepEqual(outs.map((r) => `${r.id} v${r.version} ${r.role}`).sort(), [
    'docs/exports.md v1 evidence', 'docs/guide.md v1 evidence', 'src/link-check.js v1 evidence', 'src/token.js v1 evidence',
  ]);
  const X1 = w.shas.ext.X1;
  const declared = rowOf(rows, 'invoicer', 'docs/exports.md');
  assert.deepEqual(declared.how, ['declared', 'exact']);
  assert.deepEqual(declared.proves, [CLAIM, NAMED]);
  assert.deepEqual(declared.declared, [{ request: 'invoice-exports', link: 'documents', target: 'EXP-4' }]);
  assert.deepEqual(declared.cites, ['EXP-4']);
  assert.equal(declared.text, '3: Download a month as CSV (EXP-4 says how long the link works).');
  assert.equal(declared.commit, X1);
  for (const r of outs) assert.equal(r.sha256, sha256(blob(w.central, X1, r.file)), `${r.file}: sha256 of the bytes`);
});

test('export: an undeclared central code file that names EXP-4 gives a row with how exact', () => {
  const { w, rows } = get();
  const r = rowOf(rows, 'invoicer', 'src/link-check.js');
  assert.equal(r.source_type, 'output');
  assert.equal(r.role, 'evidence');
  assert.deepEqual(r.how, ['exact']);
  assert.deepEqual(r.proves, [NAMED]);
  assert.deepEqual(r.declared, []);
  assert.deepEqual(r.cites, ['EXP-4']);
  assert.equal(r.text, `1: ${LINK_CHECK.split('\n')[0]}`);
  assert.equal(r.valid_from, w.shas.ext.X1);
  const q = rowOf(rows, 'invoicer', 'src/token.js');
  assert.deepEqual(q.cites, ['central:EXP-6'], 'central:X in the central repo is its own X');
  assert.equal(q.text, `1: ${TOKEN.split('\n')[0]}`);
});

test('export: a central file under docs/ that names an ID gives a row; one with only UTF-8 or SHA-256 gives none', () => {
  const { rows } = get();
  const r = rowOf(rows, 'invoicer', 'docs/guide.md');
  assert.deepEqual(r.how, ['exact']);
  assert.deepEqual(r.cites, ['EXP-4', 'EXP-6']);
  assert.equal(r.text, `3: ${GUIDE.split('\n')[2]}`, 'only the line that names an ID');
  assert.ok(ENCODING.includes('UTF-8') && ENCODING.includes('SHA-256'));
  assert.ok(!rows.some((r2) => r2.file === 'docs/encoding.md'), 'UTF-8 and SHA-256 are not IDs');
});

test('export: the spec, the requests and .assuredloop/ of the central repo give no output row', () => {
  const { rows } = get();
  assert.ok(rows.some((r) => r.repo === 'invoicer' && r.source_type === 'output' && r.file === 'src/link-check.js'),
    'a central file outside the spec that names an ID has an output row');
  const bad = rows.filter((r) => r.repo === 'invoicer' && r.source_type === 'output'
    && /^(specs\/|requests\/|\.assuredloop\/)/.test(r.file));
  assert.deepEqual(bad.map((r) => r.file), []);
});

test('export: the absent clone gives no rows; the summary names it and its reason under Not known, and gives the rows of each repo', async () => {
  const { w, rows } = get();
  assert.ok(!rows.some((r) => r.repo === 'invoicer-mobile'));
  assert.ok(!rows.some((r) => r.file === 'src/link.swift'));
  const reason = (await crossRepo(w.central)).repos.find((r) => r.name === 'invoicer-mobile').unknown;
  assert.equal(typeof reason, 'string');
  const { stdout, written } = exportOut(w.central);
  assert.equal(written, get().stdout, '--out writes the same bytes as standard output');
  notKnownNames(stdout, 'invoicer-mobile', reason);
  for (const repo of OUTPUT_REPOS) {
    const n = rows.filter((r) => r.repo === repo).length;
    const count = new RegExp(`(^|[^0-9a-f@])${n}([^0-9a-f]|$)`);
    assert.ok(stdout.split('\n').some((l) => l.includes(repo) && count.test(l)), `the summary gives ${n} rows of ${repo}:\n${stdout}`);
  }
});

test('export: an output commit that does not resolve gives no rows, and Not known names the repo and its reason', async (t) => {
  const w = searchWorld(t);
  pin(w, 'invoicer-worker', K7, { message: 'Pin the worker to a commit it does not have' });
  const { rows } = exportRows(w.central);
  assert.deepEqual(listOf(rows, 'invoicer-worker'), [], 'no row of the worker');
  assert.ok(listOf(rows, 'invoicer-web').length > 0, 'the web rows are still there');
  const reason = (await crossRepo(w.central)).repos.find((r) => r.name === 'invoicer-worker').unknown;
  assert.equal(typeof reason, 'string', 'crossRepo calls the worker unknown');
  notKnownNames(exportOut(w.central).stdout, 'invoicer-worker', reason);
});

test('export: the output repos come from the config as committed; an uncommitted change is not used', (t) => {
  const w = searchWorld(t);
  const before = runOk(w.central, ['export']).stdout;
  assert.ok(listOf(exportRows(w.central).rows, 'invoicer-web').length > 0, 'the web rows are there before the edit');
  setOutputs(w, (outs) => outs.filter((o) => o.name === 'invoicer-mobile'), { commitIt: false });
  assert.equal(runOk(w.central, ['export']).stdout, before, 'the same bytes with the config edited, not committed');
  git(w.central, 'add', '-A');
  git(w.central, 'commit', '-q', '-m', 'Drop web and worker from the outputs');
  const { rows } = exportRows(w.central);
  assert.deepEqual(rows.filter((r) => r.repo !== 'invoicer').map((r) => r.repo), [], 'once committed, the change is used');
});

test('export: each output repo is read at its commit, never its working tree', (t) => {
  const w = searchWorld(t);
  const before = runOk(w.central, ['export']).stdout;
  write(w.web, 'src/export-link.js', `${readFileSync(join(w.web, 'src/export-link.js'), 'utf8')}// Also central:EXP-7, not committed.\n`);
  write(w.web, 'src/untracked.js', '// Untracked, cites central:EXP-4.\n');
  git(w.worker, 'checkout', '-q', 'zip-names'); // the worker's HEAD moves; its pinned commit does not
  assert.equal(runOk(w.central, ['export']).stdout, before, 'the same bytes');
  git(w.worker, 'checkout', '-q', 'main');
  git(w.web, 'checkout', '-q', '--', 'src/export-link.js');
  commitAll(w.web, 'Add a citing file on main');
  const { rows } = exportRows(w.central);
  const r = rowOf(rows, 'invoicer-web', 'src/untracked.js');
  assert.equal(r.commit, git(w.web, 'rev-parse', 'main'), 'once committed on the selected branch, it is read');
});

test('export: with no outputs in the committed config, only the central rows, the same with or without the clones beside it', (t) => {
  const w = searchWorld(t);
  const main = w.shas.central.main; // the central config at main has no outputs:
  const withClones = runOk(w.central, ['export', '--at', main]).stdout;
  const rows = exportRows(w.central, ['--at', main]).rows;
  assert.ok(rows.length > 0);
  assert.deepEqual([...new Set(rows.map((r) => r.repo))], ['invoicer']);
  for (const name of ['invoicer-web', 'invoicer-worker']) hide(w, name);
  assert.equal(runOk(w.central, ['export', '--at', main]).stdout, withClones, 'the clones beside it change nothing');
  const out = runOk(w.central, ['export', '--at', main, '--out', 'cross-export.jsonl']).stdout;
  rmSync(join(w.central, 'cross-export.jsonl'));
  assert.ok(!/invoicer-(web|worker|mobile)/.test(out), `no output repo is named:\n${out}`);
});

test('export: the central rows do not depend on the output repos being there', (t) => {
  const w = searchWorld(t);
  const central = (rows) => rows.filter((r) => r.repo === 'invoicer');
  const all = exportRows(w.central).rows;
  for (const name of ['invoicer-web', 'invoicer-worker']) hide(w, name);
  const alone = exportRows(w.central).rows;
  assert.deepEqual(alone.filter((r) => r.repo !== 'invoicer'), [], 'no rows of a repo whose clone is gone');
  assert.deepEqual(central(alone), central(all));
});

test('export: the same commits give the same bytes', () => {
  const { w, stdout } = get();
  assert.equal(runOk(w.central, ['export']).stdout, stdout);
  assert.equal(addedAt(w.web, 'docs/link.md'), w.shas.web.A, 'fixture check: docs/link.md came in at A');
});

// --- review of PR #192, findings 2 and 3.

const RECORD = '.assuredloop/records/requests/invoice-exports.yaml';
const declare = (w, entries) => {
  const rec = readYaml(w.central, RECORD);
  rec.outputs = [...rec.outputs, ...entries];
  writeYaml(w.central, RECORD, rec);
};

test('review 192 #2: a declared file among the spec\'s own files gets no output row; its paragraph rows stay as they are', (t) => {
  const w = searchWorld(t);
  const spec = (rows) => rows.filter((r) => r.file === 'specs/exports.md')
    .map((r) => [r.id, r.version, r.role, r.source_type, r.text, r.sha256, r.valid_from, r.superseded_by]);
  const before = exportRows(w.central).rows;
  declare(w, [
    { file: 'specs/exports.md', documents: ['EXP-4'] },
    { repo: 'invoicer', file: 'requests/invoice-exports/tasks.md', documents: ['EXP-4'] },
  ]);
  commitAll(w.central, 'Declare a spec doc and a request file as outputs');
  const after = exportRows(w.central).rows;
  const outs = after.filter((r) => r.repo === 'invoicer' && r.source_type === 'output').map((r) => r.file);
  assert.ok(!outs.includes('specs/exports.md'), `no output row for specs/exports.md: ${outs.join(', ')}`);
  assert.ok(!outs.includes('requests/invoice-exports/tasks.md'), `no output row for requests/invoice-exports/tasks.md: ${outs.join(', ')}`);
  assert.ok(outs.includes('docs/exports.md'), 'the other declared output is still a row');
  assert.ok(spec(before).length > 0);
  assert.deepEqual(spec(after), spec(before), 'the paragraph rows of specs/exports.md do not change');
});

test('review 192 #3: the sha256 of an output row is the sha256 of the file\'s bytes, for a binary file too', (t) => {
  const w = searchWorld(t);
  const BYTES = Buffer.from([0xff, 0x00, 0xfe, 0x0a]);
  const want = sha256(BYTES);
  assert.ok(want.startsWith('4dcbcbb8'), `fixture check: ${want}`);
  mkdirSync(join(w.web, 'assets'));
  writeFileSync(join(w.web, 'assets/logo.bin'), BYTES);
  commitAll(w.web, 'Add a binary logo');
  mkdirSync(join(w.central, 'assets'));
  writeFileSync(join(w.central, 'assets/logo.bin'), BYTES);
  declare(w, [
    { file: 'assets/logo.bin', documents: ['EXP-4'] },
    { repo: 'invoicer-web', file: 'assets/logo.bin', documents: ['central:EXP-4'] },
  ]);
  commitAll(w.central, 'Add and declare a binary logo');
  assert.deepEqual(blob(w.central, 'HEAD', 'assets/logo.bin'), BYTES, 'fixture check: the bytes are committed as they are');
  const { rows } = exportRows(w.central);
  for (const repo of ['invoicer', 'invoicer-web']) {
    const r = rowOf(rows, repo, 'assets/logo.bin');
    assert.equal(r.source_type, 'output', `${repo}`);
    assert.equal(r.sha256, want, `${repo}:assets/logo.bin: the sha256 of the 4 bytes ff 00 fe 0a`);
  }
});
