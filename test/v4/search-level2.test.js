// Search level 2 and the fallback (#181, T14; design.md 11 "The search
// levels"; interface.md "Levels and fallback"). Since #212 the level 2 code
// is in al, and its library is @huggingface/transformers, an optional peer
// dependency. Level 2 runs here with a fixed test embedder: a stand-in
// @huggingface/transformers that the test writes into the test repo's
// node_modules (helpers/search.js, standIn). These tests need no model and
// run in CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { commitAll, doc, project, write, writeConfig } from './helpers/project.js';
import {
  A_TEXT, LEVEL2_LINE, MODEL, QUERY_PREFIX, REVISION, SMALL_SP2, SMALL_SPEC, besideAl, buildWorld, callsOf, clearLog,
  embedded, exportRows, indexFile, installEmbedder, runOk, search, show, smallRepo,
} from './helpers/search.js';

const NO_SQLITE = ['--no-experimental-sqlite'];
const idRoles = (out) => out.hits.map((h) => `${h.id} v${h.version} ${h.role}`);
const has = (out, want) => assert.ok(idRoles(out).includes(want), `${want} in:\n${idRoles(out).join('\n')}`);
// True when some text given to the embedder holds `text`.
const sent = (log, text) => embedded(log).some((x) => x.includes(text));

test('level 2 answers when @huggingface/transformers is in the project; the Level line names al\'s model and its revision', (t) => {
  const { dir } = smallRepo(t, { embedder: {} });
  const out = search(dir, ['export', 'link']);
  assert.equal(out.level, 2);
  assert.equal(out.fallback, null);
  has(out, 'EXP-4 v1 baseline');
  const r = runOk(dir, ['search', 'export', 'link']);
  assert.equal(r.stdout.split('\n')[0], LEVEL2_LINE, show(r));
  assert.ok(!/^Fallback\b/m.test(r.stdout), show(r));
});

// #212: what al asks of the library. The stand-in logs each call.
test('level 2 calls the library as pinned: pipeline once per process, with the model, its revision and q8; the extractor with cls pooling and normalize, at most 32 texts at a time', (t) => {
  const dir = project(t);
  write(dir, '.gitignore', 'node_modules/\n');
  writeConfig(dir, [{ file: 'specs/many.md', prefix: 'MNY' }], { repo: 'acme' });
  // 70 paragraphs, so the rows need more than two batches of 32.
  const paras = [['MNY-1 note', '# Many rules']];
  for (let i = 2; i <= 71; i += 1) paras.push([`MNY-${i} rule`, `Rule number ${i}: the invoice link of batch ${i} MUST expire.`]);
  write(dir, 'specs/many.md', doc(paras));
  commitAll(dir, 'A: many rules');
  const calls = join(dir, '.git', 'embed-calls.log');
  const log = join(dir, '.git', 'embed-test.log');
  installEmbedder(dir, { calls, log });

  const out = search(dir, ['URL']);
  assert.equal(out.level, 2, `level 2 answered (fallback: ${out.fallback})`);
  const first = callsOf(calls);
  const pipes = first.filter((c) => c.call === 'pipeline');
  assert.equal(pipes.length, 1, `pipeline is called once in one process:\n${JSON.stringify(first)}`);
  assert.deepEqual([pipes[0].task, pipes[0].model, pipes[0].options], ['feature-extraction', MODEL, { revision: REVISION, dtype: 'q8' }]);
  const extracts = first.filter((c) => c.call === 'extract');
  assert.ok(extracts.length >= 4, `70 rows and a query need at least 4 calls of the extractor: ${extracts.length}`);
  for (const c of extracts) {
    assert.ok(c.count >= 1 && c.count <= 32, `a batch of 1 to 32 texts: ${c.count}`);
    assert.deepEqual(c.options, { pooling: 'cls', normalize: true });
  }
  for (let i = 2; i <= 71; i += 1) {
    assert.ok(embedded(log).some((x) => x.includes(`Rule number ${i}:`)), `MNY-${i} was embedded`);
  }

  // A second process loads the pipeline again, once.
  search(dir, ['link', 'expiry']);
  assert.equal(callsOf(calls).filter((c) => c.call === 'pipeline').length, 2, 'one more pipeline call for the second process');
});

test('level 2 puts the bge query prefix before the query\'s words only; a stored row is embedded with no prefix', (t) => {
  const { dir, log } = smallRepo(t, { embedder: {} });
  search(dir, ['URL']);
  const sent = embedded(log);
  assert.ok(sent.includes(`${QUERY_PREFIX}URL`), `the query is embedded as "${QUERY_PREFIX}URL":\n${sent.join('\n')}`);
  const rows = sent.filter((x) => x.includes(A_TEXT.exp4));
  assert.ok(rows.length > 0, 'EXP-4 was embedded');
  for (const x of sent.filter((y) => y !== `${QUERY_PREFIX}URL`)) {
    assert.ok(!x.includes(QUERY_PREFIX), `a stored row has no query prefix: ${x.slice(0, 120)}`);
  }
});

test('level 2 keeps its vectors in vectors.sqlite beside the index', (t) => {
  const { dir } = smallRepo(t, { embedder: {} });
  assert.equal(search(dir, ['export', 'link']).level, 2);
  const vectors = join(dirname(indexFile(dir)), 'vectors.sqlite');
  assert.ok(existsSync(indexFile(dir)), 'the fixture: the index is there');
  assert.ok(existsSync(vectors), `${vectors} should exist`);
});

test('level 2 fuses word hits and vector hits: a row found only by its meaning is found', (t) => {
  const { dir } = smallRepo(t, { embedder: {} });
  // "URL" is a word of no row; the fixed embedder puts it and EXP-4 on the link concept.
  assert.deepEqual(search(dir, ['URL'], { level: 1 }).hits, [], 'level 1: no row has the word');
  const l2 = search(dir, ['URL']);
  assert.equal(l2.level, 2);
  has(l2, 'EXP-4 v1 baseline');
  for (const h of l2.hits) assert.equal(h.role, 'baseline', `${h.id}: the default query is still the current system`);
  // "header" is a word of EXP-2 only: the word hit is kept in the fused list.
  assert.deepEqual(idRoles(search(dir, ['header'], { level: 1 })), ['EXP-2 v1 baseline']);
  has(search(dir, ['header']), 'EXP-2 v1 baseline');
  assert.ok(!l2.hits.some((h) => h.id === 'links/SP-2'), 'a proposal is embedded, but not in the default query');
  const ch = search(dir, ['URL', '--change', 'links', '--limit', '50']);
  has(ch, 'links/SP-2 v1 proposal');
});

test('level 2 embeds only baseline and proposal rows; the other roles are found by their words', (t) => {
  const W = buildWorld(t, { embedder: {} });
  search(W.dir, ['URL']);
  assert.ok(embedded(W.log).length > 0, 'the embedder was used');
  const { rows } = exportRows(W.dir);
  const isHeading = (r) => r.text.startsWith('#');
  for (const r of rows.filter((x) => ['baseline', 'proposal'].includes(x.role))) {
    assert.ok(sent(W.log, r.text), `${r.id} (${r.role}) was embedded`);
  }
  // Rows that were never baseline or proposal at any commit.
  const never = rows.filter((r) => ['spike', 'source', 'evidence'].includes(r.role)
    || (r.role === 'history' && !['EXP-2', 'EXP-5'].includes(r.id)));
  for (const r of never.filter((x) => !isHeading(x))) {
    assert.ok(!sent(W.log, r.text), `${r.id} v${r.version} (${r.role}, ${r.source_type}) is not embedded`);
  }
  // Still found by their words at level 2.
  const spike = search(W.dir, ['minutes', '--change', 'link-spike', '--limit', '50']);
  assert.equal(spike.level, 2);
  has(spike, 'link-spike/SP-2 v1 spike');
  const hist = search(W.dir, ['fax', '--history', '--limit', '50']);
  has(hist, 'dropped-idea/SP-2 v1 history');
  const ev = search(W.dir, ['passed', '--change', 'reminder-emails', '--limit', '50']);
  has(ev, '.assuredloop/results/reminders-test.yaml v1 evidence');
});

test('level 2 embeds only new or changed rows on a refresh', (t) => {
  const { dir, log } = smallRepo(t, { embedder: {} });
  search(dir, ['export', 'link']);
  assert.ok(sent(log, A_TEXT.exp4), 'EXP-4 was embedded by the first search');
  clearLog(log);
  search(dir, ['forwarded', 'link']);
  for (const text of [A_TEXT.exp2v2, A_TEXT.exp4, A_TEXT.exp5, SMALL_SP2]) {
    assert.ok(!sent(log, text), `nothing changed, so "${text.slice(0, 30)}..." is not embedded again`);
  }
  const changed = 'The export link MUST expire 20 minutes after the email is sent.';
  write(dir, 'specs/exports.md', SMALL_SPEC.replace(A_TEXT.exp4, changed));
  commitAll(dir, 'B: EXP-4 changed');
  clearLog(log);
  const out = search(dir, ['export', 'link']);
  assert.ok(sent(log, changed), 'the changed row is embedded');
  for (const text of [A_TEXT.exp2v2, A_TEXT.exp5, SMALL_SP2]) {
    assert.ok(!sent(log, text), `an unchanged row ("${text.slice(0, 30)}...") is not embedded again`);
  }
  has(out, 'EXP-4 v2 baseline');
});

// Before #212 this test also changed the model of the level 2 package. The
// model is al's own now, and a stand-in cannot change it, so only --rebuild
// is left.
test('level 2: --rebuild embeds every row again', (t) => {
  const { dir, log } = smallRepo(t, { embedder: {} });
  search(dir, ['export', 'link']);
  const all = [A_TEXT.exp2v2, A_TEXT.exp4, A_TEXT.exp5, SMALL_SP2];
  clearLog(log);
  search(dir, ['export', 'link', '--rebuild']);
  for (const text of all) assert.ok(sent(log, text), `--rebuild embeds "${text.slice(0, 30)}..." again`);
});

test('fallback 2 -> 1: @huggingface/transformers in the project does not load', (t) => {
  const { dir } = smallRepo(t, { embedder: { mode: 'load-throws' } });
  const out = search(dir, ['export', 'link']);
  assert.equal(out.level, 1);
  assert.equal(typeof out.fallback, 'string');
  assert.match(out.fallback, /^level 2 failed: .*test embedder: it does not load/, 'it says why, with the first line of the error');
  has(out, 'EXP-4 v1 baseline');
  const r = runOk(dir, ['search', 'export', 'link']);
  assert.match(r.stdout.split('\n')[0], /^Level\s+1\b/, show(r));
  assert.ok(r.stdout.split('\n').some((l) => /^Fallback\s+\S/.test(l)), `a Fallback line says why:\n${show(r)}`);
});

test('fallback 2 -> 1: the extractor of @huggingface/transformers throws', (t) => {
  const { dir } = smallRepo(t, { embedder: { mode: 'embed-throws' } });
  const out = search(dir, ['export', 'link']);
  assert.equal(out.level, 1);
  assert.ok(typeof out.fallback === 'string', 'it says why');
  assert.match(out.fallback, /^level 2 failed: .*test embedder: embed failed/, 'it says why, with the first line of the error');
  has(out, 'EXP-4 v1 baseline');
  assert.equal(search(dir, ['--id', 'EXP-4']).hits[0].id, 'EXP-4', 'exact lookup still works');
});

test('fallback 2 -> 1: no @huggingface/transformers in the project (and none beside al)', (t) => {
  if (besideAl()) {
    t.skip('@huggingface/transformers resolves beside bin/al.js, so "not installed" cannot be shown here');
    return;
  }
  const { dir } = smallRepo(t);
  const out = search(dir, ['export', 'link']);
  assert.equal(out.level, 1);
  assert.ok(typeof out.fallback === 'string' && out.fallback.length > 0, 'it says why');
});

test('fallback 1 -> 0: node:sqlite is absent (node --no-experimental-sqlite)', (t) => {
  const { dir } = smallRepo(t);
  const out = search(dir, ['export', 'link', '--level', '1'], { nodeArgs: NO_SQLITE });
  assert.equal(out.level, 0);
  assert.ok(typeof out.fallback === 'string' && out.fallback.length > 0, 'it says why');
  has(out, 'EXP-4 v1 baseline');
  const r = runOk(dir, ['search', 'export', 'link', '--level', '1'], { nodeArgs: NO_SQLITE });
  assert.match(r.stdout.split('\n')[0], /^Level\s+0\b/, show(r));
  assert.ok(r.stdout.split('\n').some((l) => /^Fallback\s+\S/.test(l)), show(r));
});

test('fallback 2 -> 0: the package is there, node:sqlite is not', (t) => {
  const { dir } = smallRepo(t, { embedder: {} });
  const out = search(dir, ['export', 'link'], { nodeArgs: NO_SQLITE });
  assert.equal(out.level, 0);
  assert.ok(typeof out.fallback === 'string' && out.fallback.length > 0);
  has(out, 'EXP-4 v1 baseline');
  assert.deepEqual(search(dir, ['--id', 'links/SP-2'], { nodeArgs: NO_SQLITE }).hits.map((h) => `${h.id} ${h.role}`), ['links/SP-2 proposal']);
});

test('--level caps the level: the user\'s choice is no fallback', (t) => {
  const { dir } = smallRepo(t, { embedder: {} });
  const one = search(dir, ['export', 'link'], { level: 1 });
  assert.equal(one.level, 1);
  assert.equal(one.fallback, null);
  const zero = search(dir, ['export', 'link'], { level: 0 });
  assert.equal(zero.level, 0);
  assert.equal(zero.fallback, null);
  const two = search(dir, ['export', 'link', '--level', '2']);
  assert.equal(two.level, 2);
  assert.equal(two.fallback, null);
});
