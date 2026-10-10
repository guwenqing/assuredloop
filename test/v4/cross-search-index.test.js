// The incremental search index across the output repos (#186; interface-186.md
// 4, "Incremental"): a walk per repo, up to date only when no repo moved, and
// an output repo that becomes unknown. Level 1 (the index); the --json field
// `index` is the text of the Index line. The world: helpers/cross-search.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asRow, exportRows, key, search } from './helpers/search.js';
import { commit, hide, pin, rev, searchWorld } from './helpers/cross-search.js';
import { write } from './helpers/project.js';

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
