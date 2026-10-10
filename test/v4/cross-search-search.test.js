// al search across the output repos (#186, T13 with T12; design.md 11 and 12;
// interface-186.md 4). Each test runs at level 0, level 1 and level 2 (the
// fixed test embedder of helpers/search.js). The world: helpers/cross-search.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { K7 } from './helpers/cross-repo.js';
import { crossRepo, pin, searchWorld } from './helpers/cross-search.js';
import { asRow, embedded, exportRows, installEmbedder, key, runOk, search, show } from './helpers/search.js';

// One world for the tests that only read it, with the fixed embedder, and its export.
let shared = null;
async function get() {
  if (!shared) {
    const w = searchWorld(null);
    const log = join(w.central, '.git', 'embed-test.log');
    installEmbedder(w.central, { log });
    const { rows } = exportRows(w.central);
    const reason = (await crossRepo(w.central)).repos.find((r) => r.name === 'invoicer-mobile').unknown;
    shared = { w, log, rows: new Map(rows.map((r) => [key(r), r])), list: rows, reason };
  }
  return shared;
}

const lv = (level) => (level === 2 ? [] : ['--level', String(level)]);
const c12 = (sha) => sha.slice(0, 12);
// The output-repo hits, as "<repo>:<id> v<version> <role>", sorted.
const outside = (out) => out.hits.filter((h) => h.repo !== 'invoicer').map((h) => `${h.repo}:${h.id} v${h.version} ${h.role}`).sort();
const RESULTS = (repo, names) => names.map((n) => `${repo}:.assuredloop/results/${n}.yaml v1 evidence`);

// Each hit is the export row of the same key, as it is.
function assertHitsAreRows(out, rows) {
  for (const h of out.hits) {
    const row = rows.get(key(h));
    assert.ok(row, `hit ${key(h)} is an export row`);
    assert.deepEqual(asRow(h), row, `hit ${h.repo}:${h.id} v${h.version} shows its export row`);
  }
}

for (const level of [0, 1, 2]) {
  const L = `level ${level}:`;

  test(`${L} --json repos gives each repo's selected commit, the central first, or unknown; not_known names the absent clone`, async () => {
    const { w, reason } = await get();
    const out = search(w.central, ['--id', 'EXP-4'], { level });
    assert.equal(out.level, level);
    assert.deepEqual(out.repos, [
      { name: 'invoicer', commit: w.shas.ext.X1, unknown: null },
      { name: 'invoicer-web', commit: w.shas.web.main, unknown: null },
      { name: 'invoicer-worker', commit: w.shas.worker.K5, unknown: null },
      { name: 'invoicer-mobile', commit: null, unknown: reason },
    ]);
    assert.ok(Array.isArray(out.not_known), 'not_known is a list of texts');
    assert.ok(out.not_known.some((x) => x.includes('invoicer-mobile') && x.includes(reason)), JSON.stringify(out.not_known));
  });

  test(`${L} the Repos line names the selected commit of each repo, or unknown`, async () => {
    const { w } = await get();
    const r = runOk(w.central, ['search', '--id', 'EXP-4', ...lv(level)]);
    const want = `Repos     invoicer@${c12(w.shas.ext.X1)} invoicer-web@${c12(w.shas.web.main)} invoicer-worker@${c12(w.shas.worker.K5)} invoicer-mobile unknown`;
    assert.ok(r.stdout.split('\n').includes(want), `the line\n${want}\n${show(r)}`);
  });

  test(`${L} an output-repo hit shows <repo>:<file> and its commit; a central hit keeps its form`, async () => {
    const { w, rows } = await get();
    const out = search(w.central, ['--id', 'src/export-link.js'], { level });
    assert.deepEqual(out.hits.map((h) => [h.repo, h.id, h.role, h.commit]), [['invoicer-web', 'src/export-link.js', 'evidence', w.shas.web.main]]);
    assertHitsAreRows(out, rows);
    const r = runOk(w.central, ['search', '--id', 'src/export-link.js', ...lv(level)]);
    const line = new RegExp(`^\\s*1\\. src/export-link\\.js evidence( exact)? output invoicer-web:src/export-link\\.js v1 @${c12(w.shas.web.main)}\\b`);
    assert.ok(r.stdout.split('\n').some((l) => line.test(l)), show(r));
    const c = runOk(w.central, ['search', '--id', 'EXP-4', ...lv(level)]);
    const central = new RegExp(`^\\s*1\\. EXP-4 baseline( exact)? rule specs/exports\\.md v1 @${c12(w.shas.ext.X1)}\\b`);
    assert.ok(c.stdout.split('\n').some((l) => central.test(l)), `a central hit has no repo: before its file:\n${show(c)}`);
  });

  test(`${L} --id <path> matches that path in every repo: the same path in two repos is two hits`, async () => {
    const { w, rows } = await get();
    const out = search(w.central, ['--id', 'src/reminders.js'], { level });
    assert.deepEqual(out.hits.map((h) => `${h.repo} ${h.commit}`).sort(), [
      `invoicer-web ${w.shas.web.main}`, `invoicer-worker ${w.shas.worker.K5}`,
    ]);
    for (const h of out.hits) assert.equal(h.exact, true);
    assertHitsAreRows(out, rows);
    const r = runOk(w.central, ['search', '--id', 'src/reminders.js', ...lv(level)]);
    for (const repo of ['invoicer-web', 'invoicer-worker']) {
      assert.ok(r.stdout.split('\n').some((l) => new RegExp(`^\\s*\\d+\\. src/reminders\\.js evidence( exact)? output ${repo}:src/reminders\\.js v1 @`).test(l)), show(r));
    }
  });

  test(`${L} --change invoice-exports takes the output-repo rows it declares, that cite its IDs, and the results over those`, async () => {
    const { w, rows } = await get();
    const words = search(w.central, ['central', '--change', 'invoice-exports', '--limit', '500'], { level });
    assert.deepEqual(outside(words), [
      'invoicer-web:docs/link.md v1 evidence', // cites central:invoice-exports/R2
      'invoicer-web:src/export-link.js v1 evidence', // declared (cites only spec IDs)
      'invoicer-web:test/export-link.test.js v1 evidence', // declared (cites only a spec ID)
      'invoicer-worker:src/zip-export.js v2 evidence', // declared, and cites
      'invoicer-worker:test/zip-export.test.js v1 evidence', // cites central:invoice-exports/SP-10
    ], 'not web src/reminders.js (reminder-emails), not worker src/reminders.js (cites only INV-11)');
    assertHitsAreRows(words, rows);
    const results = search(w.central, ['outcome', '--change', 'invoice-exports', '--limit', '500'], { level });
    assert.deepEqual(outside(results), [
      ...RESULTS('invoicer-web', ['export-link-test']),
      ...RESULTS('invoicer-worker', ['d-k7', 'e-gone', 'f-changed', 'g-unchanged', 'h-short']),
    ], 'a result with no inputs, or whose inputs are no such file, is not in the context');
    assertHitsAreRows(results, rows);
  });

  test(`${L} --change reminder-emails takes its own output-repo rows, not those of invoice-exports`, async () => {
    const { w, rows } = await get();
    const words = search(w.central, ['central', '--change', 'reminder-emails', '--limit', '500'], { level });
    assert.deepEqual(outside(words), ['invoicer-web:src/reminders.js v1 evidence']);
    assertHitsAreRows(words, rows);
    assert.deepEqual(outside(search(w.central, ['outcome', '--change', 'reminder-emails', '--limit', '500'], { level })), []);
  });

  test(`${L} the default query (the current system) shows no evidence row`, async () => {
    const { w } = await get();
    for (const q of [['central'], ['outcome'], ['link']]) {
      const out = search(w.central, [...q, '--limit', '500'], { level });
      assert.ok(!out.hits.some((h) => h.role === 'evidence'), `${q}: ${out.hits.map((h) => `${h.repo}:${h.id} ${h.role}`).join('\n')}`);
      assert.deepEqual(outside(out), [], `${q}: no output-repo row`);
    }
    const ch = search(w.central, ['central', '--change', 'invoice-exports', '--limit', '500'], { level });
    assert.ok(outside(ch).length > 0, 'the same words find them in the change context');
  });
}

test('level 2 embeds no row of an output repo', async () => {
  const { w, log, list } = await get();
  search(w.central, ['central', '--change', 'invoice-exports', '--limit', '500']);
  const sent = embedded(log);
  assert.ok(sent.length > 0, 'the embedder was used');
  const outs = list.filter((x) => x.repo !== 'invoicer' && x.text !== '');
  assert.ok(outs.length >= 15, `the output-repo rows with text: ${outs.length}`);
  for (const r of outs) {
    assert.ok(!sent.some((x) => x.includes(r.text)), `${r.repo}:${r.id} v${r.version} (${r.role}) is not embedded`);
  }
});

for (const level of [0, 1]) {
  test(`level ${level}: an output commit that does not resolve: the repo is unknown, and none of its rows is found`, async (t) => {
    const w = searchWorld(t);
    pin(w, 'invoicer-worker', K7, { message: 'Pin the worker to a commit it does not have' });
    const reason = (await crossRepo(w.central)).repos.find((r) => r.name === 'invoicer-worker').unknown;
    assert.equal(typeof reason, 'string');
    const out = search(w.central, ['--id', 'src/reminders.js'], { level });
    assert.deepEqual(out.hits.map((h) => h.repo), ['invoicer-web']);
    assert.deepEqual(out.repos.find((r) => r.name === 'invoicer-worker'), { name: 'invoicer-worker', commit: null, unknown: reason });
    assert.ok(out.not_known.some((x) => x.includes('invoicer-worker') && x.includes(reason)), JSON.stringify(out.not_known));
    const r = runOk(w.central, ['search', '--id', 'src/reminders.js', '--level', String(level)]);
    assert.ok(r.stdout.split('\n').some((l) => /^Repos\s/.test(l) && l.includes(' invoicer-worker unknown')), show(r));
  });
}
