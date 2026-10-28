// Issue #100: the llama.cpp runtime (src/v4/llama.js). Built from the issue,
// kb-search/R10 and the module's public interface only. Nothing here reads
// src/. A fake llama-server on PATH stands in for llama.cpp
// (helpers/llama.js): no model, no download, no network beyond 127.0.0.1.
// The module is imported in each test, so that the self-check of the fake
// runs while the module does not exist yet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BOS, CLS, EOS, EOS_G, SEP, alive, codes, fakeLlama, freePort, sha256, startFake, versionOf,
} from './helpers/llama.js';

const llama = () => import('../../src/v4/llama.js');

const INSTRUCTION = 'Given the title and description of a code change, retrieve the files and spec paragraphs that the change touches';
const OTHER_BUILD_NOTE = (b) => `llama.cpp build ${b}; measured with b11624; the figures may differ`;

// The bytes that the fake "fetches", and a model that names them.
const BYTES = Buffer.from(Array.from({ length: 4099 }, (_, i) => (i * 7 + 3) % 256));
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const model = (over = {}) => ({
  name: 'test-embed',
  repo: 'example/test-gguf',
  commit: COMMIT,
  file: 'test-embed-q8_0.gguf',
  bytes: BYTES.length,
  sha256: sha256(BYTES),
  ...over,
});
const resolveUrl = (m) => `https://huggingface.co/${m.repo}/resolve/${m.commit}/${m.file}`;
const FETCH = { base64: BYTES.toString('base64') };

// The pid of the one server start in the log.
function onePid(fake) {
  const starts = fake.events('start');
  assert.equal(starts.length, 1, `one server start: ${JSON.stringify(fake.log())}`);
  return starts[0].pid;
}
// A test that hangs fails at this limit, and its after steps still kill the fake.
const LIMIT = 60_000;
const KILL_LIMIT = 40_000;
const assertNoneLeft = (fake) => assert.deepEqual(fake.left(), [], 'no llama-server process is left');

// --- the fake itself (needs no module)

test('#100 self-check: the fake llama-server answers --version, fetches on -mu, serves /health and /tokenize, and stops on SIGTERM', { timeout: LIMIT }, async (t) => {
  const fake = fakeLlama(t, { version: 'version: 11624 (build 11624, commit 1a2b3c4)', fetch: FETCH, tok: { prefix: [CLS], suffix: [SEP] } });
  assert.match(versionOf(fake.server), /build 11624/);
  const { srv, child, fake: other } = await startFake(t, { tok: { prefix: [CLS], suffix: [SEP] } });
  assert.equal(other.running(), true, 'running() sees the fake process');
  assert.equal(fake.running(), false, 'running() sees only its own fake');
  const out = await srv.post('/tokenize', { content: 'ab', add_special: true, parse_special: false });
  assert.deepEqual(out.tokens, [CLS, 97, 98, SEP]);
  assert.deepEqual((await srv.post('/detokenize', { tokens: [CLS, 97, 98, SEP] })).content, 'ab');
  const emb = await srv.post('/v1/embeddings', { input: [[1, 2], [3, 4, 5]] });
  assert.deepEqual(emb.data.map((d) => d.index), [1, 0], 'the fake gives data[] out of order');
  const gone = new Promise((r) => child.on('exit', r));
  child.kill('SIGTERM');
  await gone;
  // The fetch path: a plain start with -mu and no file writes the bytes.
  const place = join(fake.cache, 'f.gguf');
  const port = await freePort();
  const c = spawn(fake.server, ['-m', place, '-mu', 'https://example.invalid/f.gguf', '--host', '127.0.0.1', '--port', String(port)], {
    stdio: 'ignore', env: { PATH: fake.bin },
  });
  t.after(() => c.kill('SIGKILL'));
  const until = Date.now() + 10_000;
  while (!fake.events('fetched').length) {
    assert.ok(Date.now() < until, `the fake fetched: ${JSON.stringify(fake.log())}`);
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.deepEqual(readFileSync(place), BYTES);
  const ended = new Promise((r) => c.on('exit', r));
  c.kill('SIGTERM');
  await ended;
  assert.equal(fake.events('stop').length, 1);
  assertNoneLeft(fake);
});

// --- constants

test('#100 MEASURED_BUILD is 11624, and INSTALL names llama.cpp, b11624 and llama-server', async () => {
  const L = await llama();
  assert.equal(L.MEASURED_BUILD, 11624);
  assert.equal(typeof L.INSTALL, 'string');
  for (const word of ['llama.cpp', 'b11624', 'llama-server']) assert.ok(L.INSTALL.includes(word), `INSTALL names ${word}: ${L.INSTALL}`);
});

// --- notOffered

test('#100 notOffered: null on macOS arm64', async () => {
  const L = await llama();
  assert.equal(L.notOffered({ platform: 'darwin', arch: 'arm64' }), null);
});

for (const [platform, arch] of [['linux', 'x64'], ['darwin', 'x64'], ['win32', 'x64'], ['linux', 'arm64']]) {
  test(`#100 notOffered: ${platform} ${arch} is not offered, with the exact reason`, async () => {
    const L = await llama();
    assert.equal(L.notOffered({ platform, arch }), `not offered on ${platform} ${arch}: llama.cpp b11624 was measured on macOS arm64 only`);
  });
}

// --- findServer

test('#100 findServer: no llama-server on PATH gives the reason and the install text', async (t) => {
  const L = await llama();
  const fake = fakeLlama(t);
  const a = mkdtempSync(join(fake.root, 'empty-'));
  const b = mkdtempSync(join(fake.root, 'empty-'));
  writeFileSync(join(a, 'llama-cli'), '#!/bin/sh\n');
  assert.deepEqual(L.findServer({ PATH: `${a}:${b}` }), {
    reason: 'llama.cpp is not installed: no llama-server on PATH',
    install: L.INSTALL,
  });
});

test('#100 findServer: a file named llama-server that is not executable is not taken', async (t) => {
  const L = await llama();
  const fake = fakeLlama(t, { version: 'version: 11624 (build 11624, commit 1a2b3c4)' });
  const plain = mkdtempSync(join(fake.root, 'plain-'));
  writeFileSync(join(plain, 'llama-server'), '#!/bin/sh\necho build 1\n', { mode: 0o644 });
  const found = L.findServer({ PATH: `${plain}:${fake.bin}` });
  assert.equal(found.path, fake.server);
});

test('#100 findServer: build 11624 gives the path, build 11624 and no note (version on stderr)', async (t) => {
  const L = await llama();
  const fake = fakeLlama(t, { version: 'version: 11624 (build 11624, commit 1a2b3c4)', versionTo: 'stderr' });
  assert.deepEqual(L.findServer({ PATH: fake.bin }), { path: fake.server, build: 11624, note: null });
});

test('#100 findServer: another build gives the exact note (version on stdout), and the first folder on PATH wins', async (t) => {
  const L = await llama();
  const first = fakeLlama(t, { version: 'version: 11800 (build 11800, commit 9f8e7d6)', versionTo: 'stdout' });
  const second = fakeLlama(t, { version: 'version: 11624 (build 11624, commit 1a2b3c4)' }, { root: first.root });
  assert.deepEqual(L.findServer({ PATH: `${first.bin}:${second.bin}` }), {
    path: first.server, build: 11800, note: OTHER_BUILD_NOTE(11800),
  });
});

test('#100 findServer: a version text with no build number gives build null and "unknown" in the note', async (t) => {
  const L = await llama();
  const fake = fakeLlama(t, { version: 'llama-server, a version text with no number' });
  assert.deepEqual(L.findServer({ PATH: fake.bin }), { path: fake.server, build: null, note: OTHER_BUILD_NOTE('unknown') });
});

// --- modelPlace and fetchLine

test('#100 modelPlace: LLAMA_CACHE when it is set; else HOME/Library/Caches/llama.cpp', async () => {
  const L = await llama();
  assert.equal(L.modelPlace('m.gguf', { LLAMA_CACHE: '/c/llama', HOME: '/h' }), join('/c/llama', 'm.gguf'));
  assert.equal(L.modelPlace('m.gguf', { HOME: '/h' }), join('/h', 'Library/Caches/llama.cpp', 'm.gguf'));
  assert.equal(L.modelPlace('m.gguf', { LLAMA_CACHE: '', HOME: '/h' }), join('/h', 'Library/Caches/llama.cpp', 'm.gguf'));
});

test('#100 fetchLine: the size in MB of 10^6 bytes, the repo, the commit and the SHA-256, each cut to 12', async () => {
  const L = await llama();
  const m = model({ name: 'bge-small', repo: 'example/bge-gguf', bytes: 1_500_000 });
  assert.equal(L.fetchLine(m), `Fetch     bge-small: 1.5 MB from huggingface.co/example/bge-gguf@${COMMIT.slice(0, 12)}, SHA-256 ${m.sha256.slice(0, 12)}`);
  // 2^20 bytes is 1.0 MiB but 1.048576 MB: the line uses 10^6.
  assert.match(L.fetchLine(model({ bytes: 1_048_576 })), /: 1\.0 MB from /);
  assert.match(L.fetchLine(model({ bytes: 639_150_592 })), /: 639\.2 MB from /);
});

// --- withServer: the arguments

const common = (port, ngl, ctx) => [
  '--host', '127.0.0.1', '--port', String(port), '-ngl', String(ngl), '-c', String(ctx),
  '-np', '8', '-b', '2048', '-ub', '2048', '--cache-ram', '0', '--no-webui', '--log-disable',
];
const portOf = (argv) => argv[argv.indexOf('--port') + 1];

test('#100 withServer embed, file absent: -m, -mu with the pinned resolve URL, -ngl 99, -c 8192, --cache-ram 0, --embedding --pooling; the env is passed', { timeout: LIMIT }, async (t) => {
  const L = await llama();
  const fake = fakeLlama(t, { fetch: FETCH });
  const m = model();
  const env = { ...fake.env, FAKE_LLAMA_MARK: 'passed' };
  const place = join(fake.cache, m.file);
  const result = await L.withServer({ server: L.findServer(env), model: m, kind: 'embed', pooling: 'cls', env }, async (srv) => {
    assert.equal(srv.fetched, true);
    return srv.url;
  });
  const [start] = fake.events('start');
  const port = portOf(start.argv);
  assert.deepEqual(start.argv, ['-m', place, '-mu', resolveUrl(m), ...common(port, 99, 8192), '--embedding', '--pooling', 'cls']);
  assert.equal(start.mark, 'passed', 'llama-server runs with env');
  assert.equal(result, `http://127.0.0.1:${port}`);
  assertNoneLeft(fake);
});

test('#100 withServer embed, file present: no -mu; -ngl 0 when asked; --pooling mean', { timeout: LIMIT }, async (t) => {
  const L = await llama();
  const fake = fakeLlama(t);
  const m = model();
  const place = join(fake.cache, m.file);
  writeFileSync(place, BYTES);
  await L.withServer({ server: L.findServer(fake.env), model: m, kind: 'embed', pooling: 'mean', ngl: 0, env: fake.env }, async (srv) => {
    assert.equal(srv.fetched, false);
  });
  const [start] = fake.events('start');
  assert.deepEqual(start.argv, ['-m', place, ...common(portOf(start.argv), 0, 8192), '--embedding', '--pooling', 'mean']);
  assertNoneLeft(fake);
});

test('#100 withServer rerank: --rerank, -c 16384, no --embedding', { timeout: LIMIT }, async (t) => {
  const L = await llama();
  const fake = fakeLlama(t);
  const m = model();
  const place = join(fake.cache, m.file);
  writeFileSync(place, BYTES);
  await L.withServer({ server: L.findServer(fake.env), model: m, kind: 'rerank', env: fake.env }, async () => {});
  const [start] = fake.events('start');
  assert.deepEqual(start.argv, ['-m', place, ...common(portOf(start.argv), 99, 16384), '--rerank']);
  assertNoneLeft(fake);
});

test('#100 withServer yesno: -c 16384, neither --rerank nor --embedding, --cache-ram 0', { timeout: LIMIT }, async (t) => {
  const L = await llama();
  const fake = fakeLlama(t, { fetch: FETCH });
  const m = model();
  const place = join(fake.cache, m.file);
  await L.withServer({ server: L.findServer(fake.env), model: m, kind: 'yesno', env: fake.env }, async () => {});
  const [start] = fake.events('start');
  assert.deepEqual(start.argv, ['-m', place, '-mu', resolveUrl(m), ...common(portOf(start.argv), 99, 16384)]);
  assertNoneLeft(fake);
});

// --- withServer: the fetch and the checks of the file

test('#100 withServer: onFetch gets the fetch line before the server process starts', { timeout: LIMIT }, async (t) => {
  const L = await llama();
  const fake = fakeLlama(t, { fetch: FETCH });
  const m = model();
  const lines = [];
  let running = null;
  const onFetch = (line) => { lines.push(line); running = fake.running(); fake.mark({ event: 'onFetch', line }); };
  await L.withServer({ server: L.findServer(fake.env), model: m, kind: 'embed', pooling: 'cls', env: fake.env, onFetch }, async () => {});
  assert.deepEqual(lines, [L.fetchLine(m)]);
  const order = fake.log().map((e) => e.event).filter((e) => e === 'onFetch' || e === 'start');
  assert.deepEqual(order, ['onFetch', 'start']);
  assert.equal(running, false, 'no llama-server process ran when onFetch was called');
  assertNoneLeft(fake);
});

test('#100 withServer: a present file is not fetched, onFetch is not called, and the file is never hashed', { timeout: LIMIT }, async (t) => {
  const L = await llama();
  const fake = fakeLlama(t);
  // The right size, but the model's sha256 does not match: a hash would refuse it.
  const m = model({ sha256: 'f'.repeat(64) });
  writeFileSync(join(fake.cache, m.file), BYTES);
  let called = 0;
  const out = await L.withServer({
    server: L.findServer(fake.env), model: m, kind: 'embed', pooling: 'cls', env: fake.env, onFetch: () => { called += 1; },
  }, async (srv) => {
    assert.equal(srv.fetched, false);
    return 'ran';
  });
  assert.equal(out, 'ran');
  assert.equal(called, 0);
  assert.equal(fake.events('fetch').length, 0);
  assertNoneLeft(fake);
});

test('#100 withServer: a present file of the wrong size is refused, and no server starts', { timeout: LIMIT }, async (t) => {
  const L = await llama();
  const fake = fakeLlama(t);
  const m = model();
  const place = join(fake.cache, m.file);
  writeFileSync(place, BYTES.subarray(0, 1234));
  let ran = false;
  await assert.rejects(
    L.withServer({ server: L.findServer(fake.env), model: m, kind: 'embed', pooling: 'cls', env: fake.env }, async () => { ran = true; }),
    (err) => {
      assert.ok(err instanceof Error);
      for (const part of [m.file, place, '1234', String(m.bytes)]) assert.ok(err.message.includes(part), `the message names ${part}: ${err.message}`);
      return true;
    },
  );
  assert.equal(ran, false);
  assert.deepEqual(fake.events('start'), [], 'no server started');
});

test('#100 withServer: after a fetch, a file with the wrong SHA-256 is refused; the server is stopped and the file is kept', { timeout: LIMIT }, async (t) => {
  const L = await llama();
  const fake = fakeLlama(t, { fetch: FETCH });
  const wrong = 'a'.repeat(64);
  const m = model({ sha256: wrong });
  const place = join(fake.cache, m.file);
  let ran = false;
  await assert.rejects(
    L.withServer({ server: L.findServer(fake.env), model: m, kind: 'embed', pooling: 'cls', env: fake.env }, async () => { ran = true; }),
    (err) => {
      assert.ok(err instanceof Error);
      for (const part of [m.file, place, wrong, sha256(BYTES)]) assert.ok(err.message.includes(part), `the message names ${part}: ${err.message}`);
      return true;
    },
  );
  assert.equal(ran, false, 'fn does not run');
  assert.equal(alive(onePid(fake)), false, 'the server is stopped');
  assert.ok(existsSync(place), 'the file is kept');
  assert.deepEqual(readFileSync(place), BYTES);
});

test('#100 withServer: after a fetch with the right SHA-256, fn runs with the server, and srv.post sends and parses JSON', { timeout: LIMIT }, async (t) => {
  const L = await llama();
  const fake = fakeLlama(t, { fetch: FETCH });
  const m = model();
  const out = await L.withServer({ server: L.findServer(fake.env), model: m, kind: 'embed', pooling: 'cls', env: fake.env }, async (srv) => {
    assert.equal(srv.fetched, true);
    return srv.post('/tokenize', { content: 'ab', add_special: false, parse_special: false });
  });
  assert.deepEqual(out, { tokens: [97, 98] });
  assert.equal(fake.events('fetch').length, 1);
  assert.equal(fake.events('fetch')[0].url, resolveUrl(m));
  assertNoneLeft(fake);
});

// --- withServer: the server is stopped in each case

test('#100 withServer: the server is stopped after fn returns', { timeout: LIMIT }, async (t) => {
  const L = await llama();
  const fake = fakeLlama(t);
  const m = model();
  writeFileSync(join(fake.cache, m.file), BYTES);
  let pid;
  const out = await L.withServer({ server: L.findServer(fake.env), model: m, kind: 'rerank', env: fake.env }, async () => {
    pid = onePid(fake);
    assert.equal(alive(pid), true, 'the server runs while fn runs');
    return 42;
  });
  assert.equal(out, 42);
  assert.equal(alive(pid), false);
  assert.equal(fake.events('sigterm').length, 1, 'stopped with SIGTERM');
});

test('#100 withServer: the server is stopped after fn throws, and fn\'s error is thrown again', { timeout: LIMIT }, async (t) => {
  const L = await llama();
  const fake = fakeLlama(t);
  const m = model();
  writeFileSync(join(fake.cache, m.file), BYTES);
  const boom = new Error('fn failed');
  await assert.rejects(
    L.withServer({ server: L.findServer(fake.env), model: m, kind: 'rerank', env: fake.env }, async () => { throw boom; }),
    (err) => err === boom,
  );
  assert.equal(alive(onePid(fake)), false);
});

test('#100 withServer: a server that ignores SIGTERM is killed after 10 s, and none is left', { timeout: KILL_LIMIT }, async (t) => {
  const L = await llama();
  const fake = fakeLlama(t, { ignoreTerm: true });
  const m = model();
  writeFileSync(join(fake.cache, m.file), BYTES);
  const t0 = Date.now();
  await L.withServer({ server: L.findServer(fake.env), model: m, kind: 'rerank', env: fake.env }, async () => {});
  const took = Date.now() - t0;
  assert.equal(alive(onePid(fake)), false);
  assert.equal(fake.events('sigterm').length, 1);
  assert.ok(took >= 9_000 && took < 30_000, `SIGKILL about 10 s after SIGTERM (took ${took} ms)`);
});

test('#100 withServer: a server that exits before /health is ok gives an error that says llama-server exited, with its code', { timeout: LIMIT }, async (t) => {
  const L = await llama();
  const fake = fakeLlama(t, { health: 'never', exitAfterMs: 300, exitCode: 3 });
  const m = model();
  writeFileSync(join(fake.cache, m.file), BYTES);
  let ran = false;
  await assert.rejects(
    L.withServer({ server: L.findServer(fake.env), model: m, kind: 'embed', pooling: 'cls', env: fake.env }, async () => { ran = true; }),
    (err) => {
      assert.match(err.message, /llama-server exited/);
      assert.match(err.message, /\b3\b/);
      return true;
    },
  );
  assert.equal(ran, false);
  assertNoneLeft(fake);
});

test('#100 withServer: a server that never says ok gives an error after healthMs and is stopped', { timeout: LIMIT }, async (t) => {
  const L = await llama();
  const fake = fakeLlama(t, { health: 'never' });
  const m = model();
  writeFileSync(join(fake.cache, m.file), BYTES);
  const t0 = Date.now();
  let ran = false;
  await assert.rejects(
    L.withServer({ server: L.findServer(fake.env), model: m, kind: 'embed', pooling: 'cls', env: fake.env, healthMs: 500 }, async () => { ran = true; }),
    Error,
  );
  const took = Date.now() - t0;
  assert.equal(ran, false);
  assert.ok(took >= 500 && took < 15_000, `the error comes after healthMs (took ${took} ms)`);
  assert.equal(alive(onePid(fake)), false, 'the server is stopped');
  assert.equal(fake.events('sigterm').length, 1);
});

test('#100 withServer: while the fetch is not complete, the healthMs wait does not start', { timeout: LIMIT }, async (t) => {
  const L = await llama();
  // The fake writes the file in 4 parts, 400 ms apart: more than healthMs in all.
  const fake = fakeLlama(t, { fetch: { ...FETCH, chunks: 4, delayMs: 400 } });
  const m = model();
  const t0 = Date.now();
  const out = await L.withServer({ server: L.findServer(fake.env), model: m, kind: 'embed', pooling: 'cls', env: fake.env, healthMs: 300 }, async (srv) => {
    assert.equal(srv.fetched, true);
    return 'ran';
  });
  assert.equal(out, 'ran');
  assert.ok(Date.now() - t0 >= 1_200, 'the fetch took longer than healthMs');
  assertNoneLeft(fake);
});

test('#100 withServer: a fetch that never completes and a server that then exits gives the "exited" error, not a healthMs timeout', { timeout: LIMIT }, async (t) => {
  const L = await llama();
  const fake = fakeLlama(t, { fetch: { never: true }, exitAfterMs: 1_500, exitCode: 5 });
  const m = model();
  await assert.rejects(
    L.withServer({ server: L.findServer(fake.env), model: m, kind: 'embed', pooling: 'cls', env: fake.env, healthMs: 200 }, async () => {}),
    (err) => {
      assert.match(err.message, /llama-server exited/);
      assert.match(err.message, /\b5\b/);
      return true;
    },
  );
  assertNoneLeft(fake);
});

// --- llamaEmbedding

const QWEN_Q = `Instruct: ${INSTRUCTION}\nQuery:`;
const BGE_Q = 'Represent this sentence for searching relevant passages: ';
const GEMMA_Q = 'task: search result | query: ';
const GEMMA_D = 'title: none | text: ';
const vec = (toks) => [toks.length, toks[0], toks.at(-1), toks.reduce((a, x) => a + x, 0)];
const tokenizeBodies = (fake) => fake.requests('/tokenize').map((r) => r.body);
const embedInputs = (fake) => fake.requests('/v1/embeddings').flatMap((r) => r.body.input);

test('#100 llamaEmbedding bge: no doc prefix, the query prefix; a list over 512 tokens keeps its first 511 and its last', async (t) => {
  const L = await llama();
  const { srv, fake } = await startFake(t, { tok: { prefix: [CLS], suffix: [SEP] } });
  const e = L.llamaEmbedding(srv, 'bge');
  const long = 'a'.repeat(600);
  const exact = 'b'.repeat(510);
  const vs = await e.docs([long, exact, 'short']);
  const longToks = [CLS, ...codes('a'.repeat(510)), SEP];
  const exactToks = [CLS, ...codes(exact), SEP];
  const shortToks = [CLS, ...codes('short'), SEP];
  assert.deepEqual(vs, [vec(longToks), vec(exactToks), vec(shortToks)]);
  const q = await e.query('find x');
  const qToks = [CLS, ...codes(`${BGE_Q}find x`), SEP];
  assert.deepEqual(q, vec(qToks));
  const bodies = tokenizeBodies(fake);
  for (const content of [long, exact, 'short', `${BGE_Q}find x`]) {
    assert.ok(bodies.some((b) => JSON.stringify(b) === JSON.stringify({ content, add_special: true, parse_special: false })),
      `a /tokenize of ${content.slice(0, 40)} with add_special true, parse_special false: ${JSON.stringify(bodies.map((b) => b.content.slice(0, 20)))}`);
  }
  assert.deepEqual(embedInputs(fake), [longToks, exactToks, shortToks, qToks]);
});

test('#100 llamaEmbedding gemma: the doc prefix and the query prefix; the cut only over 512 tokens', async (t) => {
  const L = await llama();
  const { srv, fake } = await startFake(t, { tok: { prefix: [BOS], suffix: [EOS_G] } });
  const e = L.llamaEmbedding(srv, 'gemma');
  const long = 'c'.repeat(600);
  const vs = await e.docs([long, 'one doc']);
  const longAll = [BOS, ...codes(`${GEMMA_D}${long}`), EOS_G];
  const longToks = [...longAll.slice(0, 511), EOS_G];
  const oneToks = [BOS, ...codes(`${GEMMA_D}one doc`), EOS_G];
  assert.deepEqual(vs, [vec(longToks), vec(oneToks)]);
  const q = await e.query('what');
  const qToks = [BOS, ...codes(`${GEMMA_Q}what`), EOS_G];
  assert.deepEqual(q, vec(qToks));
  assert.deepEqual(embedInputs(fake), [longToks, oneToks, qToks]);
  const contents = tokenizeBodies(fake).map((b) => b.content);
  assert.ok(contents.includes(`${GEMMA_D}${long}`) && contents.includes(`${GEMMA_Q}what`), JSON.stringify(contents.map((c) => c.slice(0, 30))));
});

test('#100 llamaEmbedding qwen: EOS from /tokenize of <|endoftext|>; a trailing EOS dropped, the first 511 kept, EOS appended', async (t) => {
  const L = await llama();
  const { srv, fake } = await startFake(t, { tok: { prefix: [], suffix: [EOS], special: { '<|endoftext|>': EOS } } });
  const e = L.llamaEmbedding(srv, 'qwen');
  const long = 'd'.repeat(600);
  const vs = await e.docs([long, 'hi']);
  const longToks = [...codes('d'.repeat(511)), EOS];
  const hiToks = [...codes('hi'), EOS];
  assert.deepEqual(vs, [vec(longToks), vec(hiToks)]);
  const q = await e.query('change x');
  const qToks = [...codes(`${QWEN_Q}change x`), EOS];
  assert.deepEqual(q, vec(qToks));
  assert.deepEqual(embedInputs(fake), [longToks, hiToks, qToks]);
  const bodies = tokenizeBodies(fake);
  assert.ok(bodies.some((b) => JSON.stringify(b) === JSON.stringify({ content: '<|endoftext|>', add_special: false, parse_special: true })),
    `EOS is read by /tokenize of <|endoftext|>: ${JSON.stringify(bodies.map((b) => b.content.slice(0, 20)))}`);
  assert.ok(bodies.some((b) => b.content === `${QWEN_Q}change x` && b.add_special === true && b.parse_special === false));
  assert.ok(bodies.some((b) => b.content === 'hi' && b.add_special === true), 'a qwen doc has no prefix');
});

test('#100 llamaEmbedding qwen: a token list with no trailing EOS gets one appended, and none is dropped', async (t) => {
  const L = await llama();
  const { srv } = await startFake(t, { tok: { prefix: [], suffix: [], special: { '<|endoftext|>': EOS } } });
  const e = L.llamaEmbedding(srv, 'qwen');
  assert.deepEqual(await e.docs(['hi', 'e'.repeat(600)]), [vec([...codes('hi'), EOS]), vec([...codes('e'.repeat(511)), EOS])]);
});

test('#100 llamaEmbedding: at most 32 lists in a request; the vectors in the order of the texts, by index', async (t) => {
  const L = await llama();
  const { srv, fake } = await startFake(t, { tok: { prefix: [CLS], suffix: [SEP] } });
  const e = L.llamaEmbedding(srv, 'bge');
  const texts = Array.from({ length: 70 }, (_, i) => 'w'.repeat(i + 1));
  const vs = await e.docs(texts);
  assert.equal(vs.length, 70);
  vs.forEach((v, i) => assert.deepEqual(v, vec([CLS, ...codes(texts[i]), SEP]), `vector ${i}`));
  const reqs = fake.requests('/v1/embeddings');
  assert.ok(reqs.length >= 3, `70 texts need 3 requests or more: ${reqs.length}`);
  for (const r of reqs) assert.ok(r.body.input.length <= 32, `a request of ${r.body.input.length} lists`);
  assert.equal(reqs.reduce((a, r) => a + r.body.input.length, 0), 70);
});

test('#100 llamaEmbedding: no texts give no vectors', async (t) => {
  const L = await llama();
  const { srv } = await startFake(t, { tok: { prefix: [CLS], suffix: [SEP] } });
  assert.deepEqual(await L.llamaEmbedding(srv, 'bge').docs([]), []);
});

test('#100 withServer: with no LLAMA_CACHE, the model place is under HOME/Library/Caches/llama.cpp', { timeout: LIMIT }, async (t) => {
  const L = await llama();
  const fake = fakeLlama(t, { fetch: FETCH });
  const m = model();
  const env = { PATH: fake.bin, HOME: fake.home };
  const place = join(fake.home, 'Library/Caches/llama.cpp', m.file);
  await L.withServer({ server: L.findServer(env), model: m, kind: 'yesno', env }, async () => {});
  const [start] = fake.events('start');
  assert.equal(start.argv[1], place);
  assert.deepEqual(readFileSync(place), BYTES);
  assertNoneLeft(fake);
});
