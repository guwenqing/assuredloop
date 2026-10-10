// The incremental search index across the output repos (#186; interface-186.md
// 4, "Incremental"): a walk per repo, up to date only when no repo moved, and
// an output repo that becomes unknown. Level 1 (the index); the --json field
// `index` is the text of the Index line. The world: helpers/cross-search.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { asRow, exportRows, key, run, search, show } from './helpers/search.js';
import { commit, hide, pin, rev, searchWorld } from './helpers/cross-search.js';
import { read, write } from './helpers/project.js';

const L1 = { level: 1 };
const UP_TO_DATE = /^up to date\b/;
const outside = (out) => out.hits.filter((h) => h.repo !== 'invoicer').map((h) => `${h.repo}:${h.id} v${h.version} ${h.role}`).sort();
const keys = (out) => out.hits.map((h) => `${key(h)} ${h.role}`).sort();
const ALL = ['central', '--change', 'invoice-exports', '--history', '--limit', '500'];

// The refreshed index answers as a rebuilt one.
function sameAsRebuild(dir) {
  const refreshed = search(dir, ALL, L1);
  const rebuilt = search(dir, [...ALL, '--rebuild'], L1);
  assert.deepEqual(keys(rebuilt), keys(refreshed), 'the refreshed index answers as --rebuild');
}

test('level 1: a new commit on the selected branch of an output repo: the refresh adds only that repo\'s rows; up to date only when no repo moved', (t) => {
  const w = searchWorld(t);
  search(w.central, ALL, L1);
  const still = search(w.central, ALL, L1);
  assert.match(still.index, UP_TO_DATE, 'nothing moved');
  write(w.web, 'src/csv-link.js', '// The CSV link of central:invoice-exports/R1, a zebra.\nexport const csv = true;\n');
  const W4 = commit(w.web, 'Add the CSV link'); // web is selected as `commit: main`: no central commit is needed
  const out = search(w.central, ['zebra', '--change', 'invoice-exports'], L1);
  assert.doesNotMatch(out.index, UP_TO_DATE, 'invoicer-web moved');
  assert.ok(out.index.includes('invoicer-web'), `the Index line names the repo that moved: ${out.index}`);
  assert.ok(!out.index.includes('invoicer-worker'), `the Index line does not name a repo that did not move: ${out.index}`);
  assert.deepEqual(out.hits.map((h) => [h.repo, h.id, h.role, h.commit]), [['invoicer-web', 'src/csv-link.js', 'evidence', W4]]);
  assert.equal(out.repos.find((r) => r.name === 'invoicer-web').commit, W4);
  const row = exportRows(w.central).rows.find((r) => r.repo === 'invoicer-web' && r.id === 'src/csv-link.js');
  assert.deepEqual(asRow(out.hits[0]), row, 'the hit is the export row');
  assert.match(search(w.central, ALL, L1).index, UP_TO_DATE, 'up to date again');
  sameAsRebuild(w.central);
});

test('level 1: a pinned output repo: its new commit is not used until a config commit selects it; then only it is walked', (t) => {
  const w = searchWorld(t);
  search(w.central, ALL, L1);
  write(w.worker, 'src/zip-names.js', '// Names (central:invoice-exports/SP-10), a quokka.\nexport const names = [];\n');
  const K8 = commit(w.worker, 'Add the ZIP names');
  const before = search(w.central, ['quokka', '--change', 'invoice-exports'], L1);
  assert.match(before.index, UP_TO_DATE, 'the worker is pinned to K5: no repo moved');
  assert.deepEqual(before.hits, []);
  pin(w, 'invoicer-worker', K8.slice(0, 7), { message: 'Select the worker at K8' });
  const out = search(w.central, ['quokka', '--change', 'invoice-exports'], L1);
  assert.doesNotMatch(out.index, UP_TO_DATE);
  assert.ok(out.index.includes('invoicer-worker'), `the Index line names the repo that moved: ${out.index}`);
  assert.ok(!out.index.includes('invoicer-web'), `the Index line does not name a repo that did not move: ${out.index}`);
  assert.deepEqual(out.hits.map((h) => [h.repo, h.id, h.role, h.commit]), [['invoicer-worker', 'src/zip-names.js', 'evidence', K8]]);
  assert.equal(out.repos.find((r) => r.name === 'invoicer-worker').commit, K8);
  sameAsRebuild(w.central);
});

test('level 1: when an output repo\'s indexed commit is not on its new first-parent history, its rows are walked again from the start', (t) => {
  const w = searchWorld(t);
  const { K4, K5, typo } = w.shas.worker;
  const atK5 = search(w.central, ['--id', 'src/zip-export.js', '--history'], L1);
  assert.deepEqual(atK5.hits.map((h) => `${h.version} ${h.role}`).sort(), ['1 history', '2 evidence']);
  pin(w, 'invoicer-worker', typo.slice(0, 7), { message: 'Select the worker at the typo commit' }); // first parents: typo, K4, K1; K5 is not one
  const out = search(w.central, ['--id', 'src/zip-export.js', '--history'], L1);
  const rows = exportRows(w.central).rows.filter((r) => r.repo === 'invoicer-worker' && r.id === 'src/zip-export.js');
  assert.deepEqual(rows.map((r) => [r.version, r.role, r.valid_from, r.commit]), [[1, 'evidence', K4, typo]], 'the export at typo: v1, read at typo');
  assert.deepEqual(out.hits.map(asRow), rows, `the index agrees with the export; no version of K5:\n${out.hits.map((h) => key(h)).join('\n')}`);
  assert.ok(!out.hits.some((h) => h.valid_from === K5));
  sameAsRebuild(w.central);
});

test('level 1: an output repo that becomes absent leaves the current index; its rows stay findable with --history', (t) => {
  const w = searchWorld(t);
  const first = search(w.central, ['--id', 'src/export-link.js'], L1);
  assert.deepEqual(first.hits.map((h) => h.repo), ['invoicer-web']);
  hide(w, 'invoicer-web');
  const now = search(w.central, ['--id', 'src/export-link.js'], L1);
  assert.doesNotMatch(now.index, UP_TO_DATE, 'invoicer-web moved to unknown');
  assert.deepEqual(now.hits, [], 'not in the current index');
  assert.deepEqual(outside(search(w.central, ['central', '--change', 'invoice-exports', '--limit', '500'], L1)),
    ['invoicer-worker:src/zip-export.js v2 evidence', 'invoicer-worker:test/zip-export.test.js v1 evidence'], 'no web row as evidence');
  const web = now.repos.find((r) => r.name === 'invoicer-web');
  assert.equal(web.commit, null);
  assert.equal(typeof web.unknown, 'string');
  const hist = search(w.central, ['--id', 'src/export-link.js', '--history'], L1);
  assert.deepEqual(hist.hits.map((h) => [h.repo, h.id, h.role]), [['invoicer-web', 'src/export-link.js', 'history']],
    'the history index keeps it, shown as history');
  assert.equal(rev(w.central), w.shas.ext.X1, 'fixture check: the central repo did not move');
});

// --- review of PR #192, finding 1: the refresh walks only the new commits.

// `al search --json` at level 1 with GIT_TRACE: the answer, and each `git log`
// it ran, as { revs, paths } (paths without their `:(literal)` magic).
function traced(w, args) {
  const file = join(w.root, `trace-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
  const r = run(w.central, ['search', ...args, '--level', '1', '--json'], { env: { GIT_TRACE: file } });
  assert.equal(r.code, 0, show(r));
  const logs = readFileSync(file, 'utf8').split('\n').filter((l) => /trace: built-in: git log\b/.test(l)).map((l) => {
    const argv = [...l.replace(/^.*trace: built-in: git log/, '').matchAll(/'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2]);
    const dd = argv.indexOf('--');
    const before = dd < 0 ? argv : argv.slice(0, dd);
    return {
      line: l.replace(/^.*trace: built-in: /, ''),
      revs: before.filter((a) => !a.startsWith('-') || a === '--not'),
      paths: dd < 0 ? [] : argv.slice(dd + 1).map((p) => p.replace(/^:\([^)]*\)/, '')),
    };
  });
  return { out: JSON.parse(r.stdout), logs };
}

// No `git log` that reaches <head> walks from the repo's first commit (no
// range), except one restricted to the paths in `fresh` (files new to the index).
function walksOnlyNew(logs, head, fresh) {
  const mine = logs.filter((g) => g.revs.some((x) => x.includes(head)));
  assert.ok(mine.length > 0, `some git log reaches ${head.slice(0, 12)}:\n${logs.map((g) => g.line).join('\n')}`);
  for (const g of mine) {
    const ranged = g.revs.some((x) => x.includes('..') || x.startsWith('^') || x === '--not');
    if (ranged) continue;
    assert.ok(g.paths.length > 0 && g.paths.every((p) => fresh.includes(p)),
      `a git log with no range walks the whole history; only one restricted to ${fresh.join(', ')} may:\n${g.line}`);
  }
}

// The hits of --id <file> --history are the export rows of that file in <repo>.
function historyAsExport(w, repo, file) {
  const rows = exportRows(w.central).rows.filter((r) => r.repo === repo && r.id === file);
  const hits = search(w.central, ['--id', file, '--history'], L1).hits.filter((h) => h.repo === repo);
  const order = (a, b) => a.version - b.version;
  assert.deepEqual(hits.map(asRow).sort(order), rows.sort(order), `${repo}:${file}: --history gives the export's versions`);
  return rows;
}

test('review 192 #1, level 1: new commits in an output repo with new citing files: the refresh walks only the new commits, and the new files\' history', (t) => {
  const w = searchWorld(t);
  search(w.central, ALL, L1); // the index at web C2
  write(w.web, 'docs/tidy.md', 'Tidy, as central:EXP-4 says.\n'); // in the tree since B, now it cites
  write(w.web, 'src/csv-link.js', '// The CSV link of central:invoice-exports/R1, a zebra.\nexport const csv = true;\n');
  write(w.web, 'docs/link.md', `${read(w.web, 'docs/link.md')}A new line on central:EXP-7.\n`); // a file already indexed
  commit(w.web, 'W4: two files cite, one more line');
  write(w.web, 'src/csv-link.js', '// The CSV link of central:invoice-exports/R1, a zebra, version 2.\nexport const csv = true;\n');
  const W5 = commit(w.web, 'W5: the CSV link again');
  const { out, logs } = traced(w, ['zebra', '--change', 'invoice-exports']);
  assert.doesNotMatch(out.index, UP_TO_DATE);
  walksOnlyNew(logs, W5, ['docs/tidy.md', 'src/csv-link.js']);
  sameAsRebuild(w.central);
  assert.equal(historyAsExport(w, 'invoicer-web', 'src/csv-link.js').length, 2, 'src/csv-link.js v1 (W4) and v2 (W5)');
  assert.ok(historyAsExport(w, 'invoicer-web', 'docs/tidy.md').length >= 2, 'docs/tidy.md: its version of B and its version of W4');
  assert.equal(historyAsExport(w, 'invoicer-web', 'docs/link.md').length, 2, 'docs/link.md v1 (A) and v2 (W4)');
});

test('review 192 #1, level 1: a new spec paragraph in the central repo does not walk the history of the central output files again', (t) => {
  const w = searchWorld(t);
  search(w.central, ALL, L1); // the index at X1
  write(w.central, 'specs/exports.md', `${read(w.central, 'specs/exports.md')}\n<!-- EXP-50 rule -->\n\nA quokka export MUST be rare.\n`);
  write(w.central, 'src/quokka.js', '// The quokka rule, EXP-50.\nexport const q = 1;\n'); // new: names the new ID
  const X2 = commit(w.central, 'X2: EXP-50, and a file that names it');
  const { out, logs } = traced(w, ['quokka']);
  assert.ok(out.hits.some((h) => h.id === 'EXP-50'), 'the new paragraph is found');
  walksOnlyNew(logs, X2, ['src/quokka.js']);
  sameAsRebuild(w.central);
  assert.equal(historyAsExport(w, 'invoicer', 'src/quokka.js').length, 1);
  assert.equal(historyAsExport(w, 'invoicer', 'docs/guide.md').length, 1);
});

// --- review of PR #192 at 2343e45: a result file at the top of an output repo
// (`results: .`) whose note stops citing a central ID.
test('review 192 (2343e45), level 1: a root result file that stops citing: the refresh gives v1 history (superseded by the new commit) and v2 evidence, as --rebuild and the export', (t) => {
  const w = searchWorld(t);
  const result = (note) => [
    'check: test/export-link.test.js', 'outcome: pass', 'commit: unknown',
    'inputs:', `  - {file: src/export-link.js, sha256: ${'b'.repeat(64)}}`, `note: ${note}`, '',
  ].join('\n');
  write(w.web, '.assuredloop/config.yaml', 'repo: invoicer-web\ncentral: {path: ../invoicer}\nresults: .\n');
  write(w.web, 'review.yaml', result('reviewed against central:invoice-exports/R2'));
  const V1 = commit(w.web, 'Results at the top; a review result');
  const first = search(w.central, ['--id', 'review.yaml', '--history'], L1);
  assert.ok(first.hits.some((h) => h.repo === 'invoicer-web' && h.source_type === 'result'), `the result is indexed:\n${first.hits.map(key).join('\n')}`);
  write(w.web, 'review.yaml', result('reviewed'));
  const V2 = commit(w.web, 'The note no longer cites');
  const q = ['--id', 'review.yaml', '--history'];
  const refreshed = search(w.central, q, L1);
  const rebuilt = search(w.central, [...q, '--rebuild'], L1);
  const results = (out) => out.hits.filter((h) => h.repo === 'invoicer-web' && h.source_type === 'result').map(asRow)
    .sort((a, b) => a.version - b.version);
  const rows = exportRows(w.central).rows.filter((r) => r.repo === 'invoicer-web' && r.id === 'review.yaml' && r.source_type === 'result')
    .sort((a, b) => a.version - b.version);
  assert.deepEqual(rows.map((r) => [r.version, r.role, r.valid_from, r.superseded_by]), [[1, 'history', V1, V2], [2, 'evidence', V2, null]],
    'the export: v1 history superseded at V2, v2 evidence');
  assert.deepEqual(results(rebuilt), rows, '--rebuild gives the export rows');
  assert.deepEqual(results(refreshed).map((r) => [r.version, r.role, r.valid_from, r.superseded_by]),
    rows.map((r) => [r.version, r.role, r.valid_from, r.superseded_by]), 'the refresh: v1 history superseded at V2, v2 evidence');
  assert.deepEqual(results(refreshed), rows, 'the refreshed index gives the export rows');
});
