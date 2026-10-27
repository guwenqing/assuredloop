// #100 (kb-search/R10: "When the tool offers a model, it MUST support each
// model and runtime measured for that offer"; "The tool MUST show a model's
// download size before it fetches the model"): the llama.cpp rows through
// `al search`, and the table with no setting.
// - The table: 43 rows, 6 excluded, no "not yet" state (points 1, 2).
// - The platform rule: off macOS arm64 a llama row is not fit, with the
//   not-offered reason (point 3).
// - A llama embedding row and a llama reranker row run with a fake
//   llama-server on PATH (helpers/llama.js) and LLAMA_CACHE in a temp
//   folder (points 5, 6).
// - The fetch, a wrong SHA-256, a wrong size, no llama-server, another
//   build, a server that exits, another platform, the lower levels and --id
//   (points 7 to 13).
// - al check gives the same output with each kind of new setting, and never
//   starts llama-server (point 17).
// Built from the issue and the public interface only; nothing here reads
// src/. No model, no download, no network beyond 127.0.0.1.
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { commitAll, doc, project, write, writeConfig } from './helpers/project.js';
import { CONCEPTS, run, runOk, search, show, smallRepo } from './helpers/search.js';
import {
  ALL_ROWS, BIG_MAC, EXCLUDED, INTEL_MAC, LINUX, LLAMA_ROWS, SMALL_MAC, fakeComputer, labelled, namedIn, noChoice, notOffered,
} from './helpers/kb-search.js';
import { BOS, CLS, EOS, EOS_G, SEP, fakeLlama } from './helpers/llama.js';
import {
  SCORE_BY, fileOf, installReranker, invoiceWorld, pathWithout, reranked, sparse, tableOf,
} from './helpers/rerank.js';

const NEW_EXCLUDED = 'qwen3-embedding-4b q4_k_m llama-cpu';
const NEW_REASON = 'speed and memory only, on 300 chunks; recall not measured';
const BUILD = 'version: 11624 (build 11624, commit 1a2b3c4)';
const level2 = (row) => `Level     2 (hybrid: full text and ${row})`;
const reranks = (row) => `Level     2 (full text, reranked by ${row})`;
const HIT = /^\s*\d+\. /;
// A test that hangs fails at this limit, and its after steps still kill the fake.
const LIMIT = 120_000;

// The tokens of each family in the fake server.
const TOK = {
  bge: { prefix: [CLS], suffix: [SEP] },
  gemma: { prefix: [BOS], suffix: [EOS_G] },
  qwen: { prefix: [], suffix: [EOS], special: { '<|endoftext|>': EOS } },
};

let TABLE = null;
before(() => { TABLE = tableOf(fakeComputer, BIG_MAC); });
const rowOf = (name) => {
  assert.ok(TABLE.has(name), `the table has ${name}`);
  return TABLE.get(name);
};

const jsonOf = (r) => {
  try { return JSON.parse(r.stdout); } catch { return assert.fail(`--json gives one JSON object:\n${show(r)}`); }
};
// The text of a labelled line with its continuation lines.
const lineOf = (stdout, label) => {
  const l = labelled(stdout).find((x) => x.label === label);
  return l ? [l.text, ...l.more].join(' ') : null;
};

// A fake computer, the fake llama-server first on PATH, and LLAMA_CACHE.
// `present`: write the row's model file at its place (true: its size; a
// number: that size). Returns { fake, pc, opts, place, file, row }.
function llamaSetup(t, dir, rowName, { conf = {}, computer = BIG_MAC, present = true } = {}) {
  const row = rowOf(rowName);
  const file = fileOf(row);
  const fake = fakeLlama(t, { version: BUILD, ...conf });
  const pc = fakeComputer(join(dir, '.git', 'fake-computer'), computer);
  const place = join(fake.cache, file.path);
  if (present !== false) sparse(place, present === true ? file.bytes : present);
  const opts = { nodeArgs: pc.nodeArgs, env: { PATH: `${fake.bin}${delimiter}${pc.env.PATH}`, LLAMA_CACHE: fake.cache } };
  return { fake, pc, opts, place, file, row };
}

const argOf = (argv, flag) => {
  const i = argv.indexOf(flag);
  return i < 0 ? null : argv[i + 1];
};
const noneLeft = (fake) => assert.deepEqual(fake.left(), [], 'no llama-server process is left');

// --- the table (points 1, 2, 3)

for (const [name, computer] of [['a Mac with 64 GB', BIG_MAC], ['a Linux computer', LINUX]]) {
  test(`#100 no setting, ${name}: 43 rows; 6 excluded with ${NEW_EXCLUDED}; no Not yet line and no not-yet state`, (t) => {
    const { dir } = smallRepo(t, { search: null });
    const pc = fakeComputer(join(dir, '.git', 'fake-computer'), computer);
    const opts = { nodeArgs: pc.nodeArgs, env: pc.env };
    const r = runOk(dir, ['search', 'export', 'link'], opts);
    const o = noChoice(r.stdout);
    assert.ok(!o.labels.includes('Not yet'), `no Not yet line:\n${show(r)}`);
    assert.ok(!/cannot run/.test(r.stdout), `no row is one "this version cannot run":\n${show(r)}`);
    assert.match(o.excluded.line, /^Excluded  6 rows: \S/, show(r));
    assert.ok(namedIn(o.excluded.text, NEW_EXCLUDED), `${NEW_EXCLUDED} is in the Excluded line:\n${o.excluded.line}`);
    assert.ok(o.excluded.text.includes(NEW_REASON), `the Excluded line gives its reason:\n${o.excluded.line}`);
    const out = jsonOf(runOk(dir, ['search', 'export', 'link', '--json'], opts));
    assert.equal(out.rows.length, 43);
    assert.deepEqual(out.rows.map((x) => x.name).sort(), [...ALL_ROWS].sort());
    const byName = new Map(out.rows.map((x) => [x.name, x]));
    assert.equal(byName.get(NEW_EXCLUDED).state, 'excluded');
    assert.equal(byName.get(NEW_EXCLUDED).reason, NEW_REASON);
    const excluded = out.rows.filter((x) => x.state === 'excluded').map((x) => x.name).sort();
    assert.deepEqual(excluded, Object.keys(EXCLUDED).sort());
    for (const x of out.rows) assert.ok(['fits', 'not-fit', 'excluded'].includes(x.state), `${x.name}: state ${x.state}`);
  });
}

for (const computer of [LINUX, INTEL_MAC, { platform: 'linux', arch: 'arm64', memory: 64, disk: 500 }]) {
  test(`#100 no setting, ${computer.platform} ${computer.arch}: each llama row is not fit, with the not-offered reason`, (t) => {
    const { dir } = smallRepo(t, { search: null });
    const pc = fakeComputer(join(dir, '.git', 'fake-computer'), computer);
    const opts = { nodeArgs: pc.nodeArgs, env: pc.env };
    const reason = notOffered(computer.platform, computer.arch);
    const r = runOk(dir, ['search', 'export', 'link'], opts);
    const o = noChoice(r.stdout);
    assert.ok(o.notFit, `a Not fit line:\n${show(r)}`);
    const notFit = [o.notFit.text, ...o.notFit.more].join(' ');
    assert.ok(notFit.includes(reason), `the Not fit line gives "${reason}":\n${o.notFit.line}`);
    const byName = new Map(jsonOf(runOk(dir, ['search', 'export', 'link', '--json'], opts)).rows.map((x) => [x.name, x]));
    for (const row of LLAMA_ROWS) {
      assert.equal(byName.get(row).state, 'not-fit', row);
      assert.equal(byName.get(row).reason, reason, `${row}: the reason in --json`);
      assert.ok(namedIn(notFit, row), `${row} is named in the Not fit line:\n${o.notFit.line}`);
      assert.ok(!o.fit.some((f) => f.row === row), `${row} is not in the fit list`);
    }
  });
}

for (const [name, computer] of [['a Mac with 64 GB', BIG_MAC], ['a Mac with 16 GB', SMALL_MAC]]) {
  test(`#100 no setting, ${name} (macOS arm64): the llama rows follow the fit rule (memory + 1 GB, disk, Apple GPU)`, (t) => {
    const { dir } = smallRepo(t, { search: null });
    const pc = fakeComputer(join(dir, '.git', 'fake-computer'), computer);
    const opts = { nodeArgs: pc.nodeArgs, env: pc.env };
    const out = jsonOf(runOk(dir, ['search', 'export', 'link', '--json'], opts));
    const o = noChoice(runOk(dir, ['search', 'export', 'link'], opts).stdout);
    const { available_memory: memory, free_disk: disk } = out.computer;
    for (const x of out.rows.filter((y) => LLAMA_ROWS.includes(y.name))) {
      const fits = x.peak_memory + 1e9 <= memory && x.download <= disk;
      assert.equal(x.state, fits ? 'fits' : 'not-fit', `${x.name}: peak ${x.peak_memory}, download ${x.download}; memory ${memory}, disk ${disk}`);
      assert.ok(!String(x.reason ?? '').includes('not offered'), `${x.name}: offered on macOS arm64`);
      assert.equal(o.fit.some((f) => f.row === x.name), fits, `${x.name}: in the fit list when it fits`);
    }
    if (computer === SMALL_MAC) assert.equal(out.rows.find((x) => x.name === 'qwen3-embedding-8b f16 llama-metal').state, 'not-fit', 'the fixture: 16.6 GB does not fit 16 GB');
  });
}

// --- an embedding row (point 5)

// Rules with one concept each (helpers/search.js, CONCEPTS); the queries use
// another word of the same concept, which no text has, so only the vectors
// can find the rule.
const LONG = `Rule start ${Array.from({ length: 600 }, (_, i) => `w${i + 1}`).join(' ')} rule end.`;
const RULES = doc([
  ['RUL-1 note', '# Rules'],
  ['RUL-2 rule', 'Each token MUST be secret.'],
  ['RUL-3 rule', 'Each CSV file MUST have a header row.'],
  ['RUL-4 rule', 'The link MUST expire after one hour.'],
  ['RUL-5 rule', LONG],
  ['RUL-6 rule', 'Each invoice MUST have a number.'],
  ['RUL-7 rule', 'A reminder MUST go out each week.'],
]);
const QUERIES = [['url', 'RUL-4'], ['bill', 'RUL-6'], ['spreadsheet', 'RUL-3']];

function rulesRepo(t, setting) {
  const dir = project(t);
  write(dir, '.gitignore', 'node_modules/\n');
  writeConfig(dir, [{ file: 'specs/rules.md', prefix: 'RUL' }], { repo: 'acme', search: setting });
  write(dir, 'specs/rules.md', RULES);
  commitAll(dir, 'A: the rules');
  return dir;
}

const EMBED_ROWS = [
  ['bge-small-en-v1.5 q4_k_m llama-metal', 'bge', 'cls', '99'],
  ['embeddinggemma-300m q8_0 llama-metal', 'gemma', 'mean', '99'],
  ['qwen3-embedding-0.6b q8_0 llama-cpu', 'qwen', 'last', '0'],
];

for (const [rowName, family, pooling, ngl] of EMBED_ROWS) {
  test(`#100 search: {local: ${rowName}}, file present, build 11624: level 2 with the row; one llama-server with the measured arguments, stopped at the end`, { timeout: LIMIT }, (t) => {
    const dir = rulesRepo(t, { local: rowName });
    const s = llamaSetup(t, dir, rowName, { conf: { tok: TOK[family], concepts: CONCEPTS } });
    const r = runOk(dir, ['search', 'url'], s.opts);
    assert.equal(r.stdout.split('\n')[0], level2(rowName), show(r));
    assert.ok(!/^Fallback\b/m.test(r.stdout), show(r));
    assert.ok(!/^Fetch\b/m.test(r.stdout) && !r.stderr.includes('Fetch '), `the file is there, so no fetch line:\n${show(r)}`);
    const starts = s.fake.events('start');
    assert.equal(starts.length, 1, `one llama-server ran: ${JSON.stringify(s.fake.log())}`);
    const { argv } = starts[0];
    assert.equal(argOf(argv, '-m'), s.place);
    assert.ok(!argv.includes('-mu'), `no -mu: ${argv.join(' ')}`);
    for (const [flag, value] of [['--host', '127.0.0.1'], ['-ngl', ngl], ['-c', '8192'], ['-np', '8'], ['-b', '2048'], ['-ub', '2048'], ['--cache-ram', '0'], ['--pooling', pooling]]) {
      assert.equal(argOf(argv, flag), value, `${flag} ${value}: ${argv.join(' ')}`);
    }
    assert.ok(argv.includes('--embedding'), `--embedding: ${argv.join(' ')}`);
    assert.ok(!argv.includes('--rerank'), `no --rerank: ${argv.join(' ')}`);
    assert.ok(s.fake.requests('/v1/embeddings').length > 0, 'the vectors come from /v1/embeddings');
    noneLeft(s.fake);
  });

  test(`#100 search: {local: ${rowName}}: the vectors come from the server, so each query finds its rule by meaning first`, { timeout: LIMIT }, (t) => {
    const dir = rulesRepo(t, { local: rowName });
    const s = llamaSetup(t, dir, rowName, { conf: { tok: TOK[family], concepts: CONCEPTS } });
    for (const [word, id] of QUERIES) {
      const words = search(dir, [word], { ...s.opts, level: 1 });
      assert.deepEqual(words.hits.filter((h) => h.role !== 'file'), [], `the fixture: no text has the word ${word}`);
      const out = search(dir, [word], s.opts);
      assert.equal(out.level, 2, `level 2 answered (fallback: ${out.fallback})`);
      assert.equal(out.hits[0]?.id, id, `"${word}" finds ${id} first:\n${out.hits.map((h) => `${h.id} ${h.role}`).join('\n')}`);
    }
    noneLeft(s.fake);
  });
}

// --- a reranker row (point 6)

const LLAMA_RERANKERS = [
  ['qwen3-reranker-0.6b q8_0 llama-metal', 'head'],
  ['qwen3-reranker-4b q4_k_m llama-metal', 'yes/no'],
];

for (const [rowName, kind] of LLAMA_RERANKERS) {
  test(`#100 search: {local: ${rowName}} (${kind === 'head' ? 'a rerank head' : 'no head'}): the top 30 word hits are reordered by the server's scores; hits 31-40 keep their place`, { timeout: LIMIT }, (t) => {
    const dir = invoiceWorld(t, { local: rowName });
    const s = llamaSetup(t, dir, rowName, { conf: { scoreBy: SCORE_BY } });
    const words = search(dir, ['invoice', '--limit', '50'], { ...s.opts, level: 1 });
    assert.equal(words.hits.length, 40, `the fixture: word search finds the 40 paragraphs: ${words.hits.map((h) => h.id).join(' ')}`);
    assert.deepEqual(s.fake.events('start'), [], 'level 1 starts no llama-server');
    const r = runOk(dir, ['search', 'invoice', '--limit', '50'], s.opts);
    assert.equal(r.stdout.split('\n')[0], reranks(rowName), show(r));
    assert.ok(!/^Fallback\b/m.test(r.stdout), show(r));
    const out = search(dir, ['invoice', '--limit', '50'], s.opts);
    assert.equal(out.level, 2, `level 2 answered (fallback: ${out.fallback})`);
    assert.deepEqual(out.hits.map((h) => h.id), reranked(words.hits).map((h) => h.id), 'the reranker\'s order of the top 30, then hits 31-40');
    const top30 = new Set(words.hits.slice(0, 30).map((h) => h.text.match(/mk\d\d/)[0]));
    const marks = (texts) => texts.map((x) => String(x).match(/mk\d\d/)?.[0]);
    const starts = s.fake.events('start');
    assert.equal(starts.length, 2, `one llama-server for each of the two searches: ${JSON.stringify(starts.map((x) => x.argv))}`);
    for (const { argv } of starts) {
      assert.equal(argOf(argv, '-c'), '16384', argv.join(' '));
      assert.equal(argOf(argv, '--cache-ram'), '0', argv.join(' '));
      assert.equal(argOf(argv, '-m'), s.place, argv.join(' '));
      assert.ok(!argv.includes('--embedding'), `no --embedding: ${argv.join(' ')}`);
      assert.equal(argv.includes('--rerank'), kind === 'head', `--rerank only for a head row: ${argv.join(' ')}`);
    }
    assert.deepEqual(s.fake.requests('/v1/embeddings'), [], 'no index of vectors for a reranker row');
    if (kind === 'head') {
      const rr = s.fake.requests('/v1/rerank');
      assert.equal(rr.length, 2, 'one POST /v1/rerank for each search');
      for (const q of rr) {
        assert.equal(q.body.documents.length, 30);
        assert.deepEqual(new Set(marks(q.body.documents)), top30, 'the documents are the top 30 word hits');
      }
      assert.deepEqual(s.fake.requests('/completion'), []);
    } else {
      const cs = s.fake.requests('/completion');
      assert.equal(cs.length, 60, 'one POST /completion for each document, 30 for each search');
      const docs = cs.map((q) => String(q.body.prompt).split('<Document>: ')[1]);
      assert.deepEqual(new Set(marks(docs)), top30, 'the documents are the top 30 word hits');
      assert.deepEqual(s.fake.requests('/v1/rerank'), []);
    }
    noneLeft(s.fake);
  });

  test(`#100 search: {local: ${rowName}}: --limit cuts after the rerank, and an exact ID stays first`, { timeout: LIMIT }, (t) => {
    const dir = invoiceWorld(t, { local: rowName });
    const s = llamaSetup(t, dir, rowName, { conf: { scoreBy: SCORE_BY } });
    const words = search(dir, ['invoice', '--limit', '50'], { ...s.opts, level: 1 });
    const five = search(dir, ['invoice', '--limit', '5'], s.opts);
    assert.deepEqual(five.hits.map((h) => h.id), reranked(words.hits).slice(0, 5).map((h) => h.id));
    // RUL-41 holds mk40, which the reranker scores 0.2.
    const id = search(dir, ['RUL-41', 'invoice', '--limit', '50'], s.opts);
    assert.equal(id.level, 2, `level 2 answered (fallback: ${id.fallback})`);
    assert.equal(id.hits[0]?.id, 'RUL-41', id.hits.map((h) => h.id).join(' '));
    assert.equal(id.hits[0].exact, true);
    noneLeft(s.fake);
  });
}

// --- the fetch, and a wrong SHA-256 (point 7)

const FETCH_ROW = 'bge-small-en-v1.5 q4_k_m llama-metal';
const HEX64 = /\b[0-9a-f]{64}\b/g;

test(`#100 search: {local: ${FETCH_ROW}}, file absent: the Fetch line before llama-server, -mu with the pinned URL; the fetched file's SHA-256 is not the pinned one: word search, and the Fallback names both`, { timeout: LIMIT }, (t) => {
  const dir = rulesRepo(t, { local: FETCH_ROW });
  const row = rowOf(FETCH_ROW);
  const file = fileOf(row);
  const s = llamaSetup(t, dir, FETCH_ROW, { present: false, conf: { tok: TOK.bge, concepts: CONCEPTS, fetch: { size: file.bytes } } });
  const r = runOk(dir, ['search', 'link'], s.opts);
  const head = `Fetch     ${FETCH_ROW}: ${(file.bytes / 1e6).toFixed(1)} MB from huggingface.co/${row.repo}@${row.commit.slice(0, 12)}, SHA-256 `;
  const fetchRe = new RegExp(`^${head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([0-9a-f]{12})$`, 'm');
  const inErr = r.stderr.match(fetchRe);
  assert.ok(inErr, `standard error has the Fetch line "${head}<sha 12>":\n${show(r)}`);
  assert.equal(r.stderr.split(inErr[0]).length, 2, 'the line once on standard error');
  assert.ok(fetchRe.test(r.stdout), `the text answer has the same line:\n${show(r)}`);
  const starts = s.fake.events('start');
  assert.equal(starts.length, 1, JSON.stringify(s.fake.log()));
  const { argv } = starts[0];
  assert.equal(argOf(argv, '-m'), s.place);
  assert.equal(argOf(argv, '-mu'), `https://huggingface.co/${row.repo}/resolve/${row.commit}/${file.path}`);
  assert.match(r.stdout.split('\n')[0], /^Level\s+1\b/, show(r));
  const fallback = lineOf(r.stdout, 'Fallback');
  assert.ok(fallback, `a Fallback line:\n${show(r)}`);
  const found = createHash('sha256').update(Buffer.alloc(file.bytes)).digest('hex');
  for (const part of [file.path, s.place, found]) assert.ok(fallback.includes(part), `the Fallback line names ${part}:\n${fallback}`);
  const others = (fallback.match(HEX64) ?? []).filter((h) => h !== found);
  assert.equal(others.length, 1, `the Fallback line names the expected SHA-256 too:\n${fallback}`);
  assert.ok(others[0].startsWith(inErr[1]), `the expected SHA-256 is the pinned one of the Fetch line (${inErr[1]}):\n${fallback}`);
  assert.ok(existsSync(s.place), 'the file is kept');
  assert.equal(statSync(s.place).size, file.bytes);
  assert.equal(s.fake.events('sigterm').length, 1, 'the server is stopped');
  noneLeft(s.fake);
});

// --- a present file of another size (point 8)

test(`#100 search: {local: ${FETCH_ROW}}, a present file of another size: word search; the Fallback names the file, the place and both sizes; no llama-server starts`, { timeout: LIMIT }, (t) => {
  const dir = rulesRepo(t, { local: FETCH_ROW });
  const s = llamaSetup(t, dir, FETCH_ROW, { present: 1234, conf: { tok: TOK.bge, concepts: CONCEPTS } });
  const r = runOk(dir, ['search', 'link'], s.opts);
  assert.match(r.stdout.split('\n')[0], /^Level\s+1\b/, show(r));
  const fallback = lineOf(r.stdout, 'Fallback');
  assert.ok(fallback, `a Fallback line:\n${show(r)}`);
  for (const part of [s.file.path, s.place, '1234', String(s.file.bytes)]) assert.ok(fallback.includes(part), `the Fallback line names ${part}:\n${fallback}`);
  assert.deepEqual(s.fake.events('start'), [], 'no llama-server started');
  assert.equal(statSync(s.place).size, 1234, 'the file is left as it is');
});

// --- no llama-server on PATH (point 9)

test(`#100 search: {local: ${FETCH_ROW}} with no llama-server on PATH: word search; the Fallback says so, and a Not known item says how to add llama.cpp`, { timeout: LIMIT }, (t) => {
  const dir = rulesRepo(t, { local: FETCH_ROW });
  const s = llamaSetup(t, dir, FETCH_ROW);
  const opts = { ...s.opts, env: { ...s.opts.env, PATH: pathWithout('llama-server', s.pc.env.PATH) } };
  const r = runOk(dir, ['search', 'link'], opts);
  assert.match(r.stdout.split('\n')[0], /^Level\s+1\b/, show(r));
  const fallback = lineOf(r.stdout, 'Fallback');
  assert.ok(fallback && fallback.includes('llama.cpp is not installed: no llama-server on PATH'), `the Fallback line:\n${show(r)}`);
  const ls = r.stdout.split('\n');
  const at = ls.findIndex((l) => /^Not known\b/.test(l));
  const nk = at < 0 ? '' : ls.slice(at).join('\n');
  for (const word of ['llama.cpp', 'b11624', 'llama-server']) assert.ok(nk.includes(word), `the Not known line names ${word}:\n${show(r)}`);
  const out = search(dir, ['link'], opts);
  assert.equal(out.level, 1);
  assert.ok(String(out.fallback).includes('llama.cpp is not installed: no llama-server on PATH'), out.fallback);
  assert.ok(out.not_known.some((x) => ['llama.cpp', 'b11624', 'llama-server'].every((w) => x.includes(w))), JSON.stringify(out.not_known));
  assert.deepEqual(s.fake.events('start'), [], 'the fake was not on PATH');
});

// --- another build (point 10)

test(`#100 search: {local: ${FETCH_ROW}} with llama-server build 11800: it still runs, and a Not known item gives the exact note`, { timeout: LIMIT }, (t) => {
  const dir = rulesRepo(t, { local: FETCH_ROW });
  const s = llamaSetup(t, dir, FETCH_ROW, { conf: { version: 'version: 11800 (build 11800, commit 9f8e7d6)', tok: TOK.bge, concepts: CONCEPTS } });
  const note = 'llama.cpp build 11800; measured with b11624; the figures may differ';
  const r = runOk(dir, ['search', 'link'], s.opts);
  assert.equal(r.stdout.split('\n')[0], level2(FETCH_ROW), show(r));
  const ls = r.stdout.split('\n');
  const at = ls.findIndex((l) => /^Not known\b/.test(l));
  assert.ok(at >= 0 && ls.slice(at).join('\n').includes(note), `the Not known line has "${note}":\n${show(r)}`);
  const out = search(dir, ['link'], s.opts);
  assert.equal(out.level, 2);
  assert.ok(out.not_known.includes(note), JSON.stringify(out.not_known));
  noneLeft(s.fake);
});

test(`#100 search: {local: ${FETCH_ROW}} with build 11624: no build note`, { timeout: LIMIT }, (t) => {
  const dir = rulesRepo(t, { local: FETCH_ROW });
  const s = llamaSetup(t, dir, FETCH_ROW, { conf: { tok: TOK.bge, concepts: CONCEPTS } });
  const out = search(dir, ['link'], s.opts);
  assert.equal(out.level, 2, `level 2 answered (fallback: ${out.fallback})`);
  assert.ok(!out.not_known.some((x) => x.includes('measured with b11624')), JSON.stringify(out.not_known));
});

// --- a server that exits (point 11)

test(`#100 search: {local: ${FETCH_ROW}}: llama-server exits before it is ready: word search; the Fallback says level 2 failed and llama-server exited; no process left`, { timeout: LIMIT }, (t) => {
  const dir = rulesRepo(t, { local: FETCH_ROW });
  const s = llamaSetup(t, dir, FETCH_ROW, { conf: { health: 'never', exitAfterMs: 300, exitCode: 3 } });
  const r = runOk(dir, ['search', 'link'], s.opts);
  assert.match(r.stdout.split('\n')[0], /^Level\s+1\b/, show(r));
  const fallback = lineOf(r.stdout, 'Fallback');
  assert.ok(fallback && fallback.includes('level 2 failed: ') && fallback.includes('llama-server exited'), `the Fallback line:\n${show(r)}`);
  assert.equal(s.fake.events('start').length, 1);
  noneLeft(s.fake);
});

// --- another platform (point 12)

for (const computer of [LINUX, INTEL_MAC]) {
  for (const rowName of [FETCH_ROW, 'qwen3-reranker-0.6b q8_0 llama-metal', 'qwen3-embedding-0.6b q8_0 llama-cpu']) {
    test(`#100 search: {local: ${rowName}} on ${computer.platform} ${computer.arch}: not refused; word search with the not-offered reason; no llama-server starts`, { timeout: LIMIT }, (t) => {
      const dir = rulesRepo(t, { local: rowName });
      const s = llamaSetup(t, dir, rowName, { computer });
      const reason = notOffered(computer.platform, computer.arch);
      const r = run(dir, ['search', 'link'], s.opts);
      assert.equal(r.code, 0, show(r));
      assert.match(r.stdout.split('\n')[0], /^Level\s+1\b/, show(r));
      const fallback = lineOf(r.stdout, 'Fallback');
      assert.ok(fallback && fallback.includes(reason), `the Fallback line has "${reason}":\n${show(r)}`);
      const out = search(dir, ['link'], s.opts);
      assert.equal(out.level, 1);
      assert.ok(String(out.fallback).includes(reason), out.fallback);
      assert.deepEqual(s.fake.events('start'), [], 'no llama-server started');
    });
  }
}

// --- the lower levels and --id (point 13)

for (const rowName of [FETCH_ROW, 'qwen3-reranker-0.6b q8_0 llama-metal']) {
  test(`#100 search: {local: ${rowName}}: --level 1, --level 0 and --id with no words start no llama-server`, { timeout: LIMIT }, (t) => {
    const dir = rulesRepo(t, { local: rowName });
    const s = llamaSetup(t, dir, rowName, { conf: { tok: TOK.bge, concepts: CONCEPTS } });
    for (const level of [1, 0]) assert.equal(search(dir, ['link'], { ...s.opts, level }).level, level);
    const id = search(dir, ['--id', 'RUL-4'], s.opts);
    assert.equal(id.hits[0]?.id, 'RUL-4');
    const text = runOk(dir, ['search', '--id', 'RUL-4'], s.opts);
    assert.ok(text.stdout.split('\n').some((l) => HIT.test(l)), show(text));
    assert.deepEqual(s.fake.events('start'), [], 'no llama-server started');
  });
}

// --- the checks (point 17)

// The output with each commit hash and the folder of the repo left out.
const plain = (text, dir) => text.split(dir).join('<repo>').replace(/\b[0-9a-f]{7,64}\b/g, '<sha>');

test('#100 al check and al check --strict give the same output with no setting and with a llama embedding row, a llama reranker row and a transformers.js reranker row; no llama-server starts', { timeout: LIMIT }, (t) => {
  const fake = fakeLlama(t, { version: BUILD });
  const settings = [
    ['no setting', null],
    ['a llama embedding row', { local: FETCH_ROW }],
    ['a llama reranker row', { local: 'qwen3-reranker-0.6b q8_0 llama-metal' }],
    ['a llama reranker row with no head', { local: 'qwen3-reranker-4b q4_k_m llama-metal' }],
    ['a transformers.js reranker row', { local: 'ms-marco-minilm-l-6-v2 q8 tjs-cpu' }],
  ];
  // The model files are there, so that a start would not wait on a fetch.
  for (const [, setting] of settings) {
    if (setting && /llama/.test(setting.local)) sparse(join(fake.cache, fileOf(rowOf(setting.local)).path), fileOf(rowOf(setting.local)).bytes);
  }
  const answers = settings.map(([name, setting]) => {
    const { dir } = smallRepo(t, { search: setting });
    installReranker(dir, {});
    const pc = fakeComputer(join(dir, '.git', 'fake-computer'), BIG_MAC);
    const opts = { nodeArgs: pc.nodeArgs, env: { PATH: `${fake.bin}${delimiter}${pc.env.PATH}`, LLAMA_CACHE: fake.cache } };
    const runs = [['check'], ['check', '--strict'], ['check', '--full']].map((args) => run(dir, args, opts));
    for (const r of runs) assert.equal(r.signal, null, `${name}:\n${show(r)}`);
    return { name, dir, runs };
  });
  const [base] = answers;
  for (const r of base.runs) assert.ok([0, 1].includes(r.code), `the fixture: al check runs to its end:\n${show(r)}`);
  for (const a of answers.slice(1)) {
    a.runs.forEach((r, i) => {
      const b = base.runs[i];
      assert.equal(r.code, b.code, `${a.name}: the same exit code:\n${show(r)}\n--- with no setting\n${show(b)}`);
      assert.equal(plain(r.stdout, a.dir), plain(b.stdout, base.dir), `${a.name}: the same output:\n${show(r)}\n--- with no setting\n${show(b)}`);
      assert.equal(plain(r.stderr, a.dir), plain(b.stderr, base.dir), `${a.name}: the same standard error`);
    });
  }
  assert.deepEqual(fake.events('start'), [], 'al check never starts llama-server');
});
