// A fake llama-server and a fake @huggingface/transformers for the tests of
// issue #100. Nothing here reads src/. No model, no download and no network
// beyond 127.0.0.1.
//
// The fake server is an executable Node script named `llama-server` in a temp
// bin folder. The bin folder also holds a `node` link, so that a PATH of the
// bin folder alone runs the script, and no real llama-server is found.
// The script reads its behaviour from fake-llama.json next to it, and writes
// fake-llama.log (JSON lines: start, fetch, sigterm, stop, exit) and
// fake-llama-requests.jsonl (one line per HTTP request) next to it. It does
// not take these from the environment, because the interface does not say
// with which environment `al` runs `llama-server --version`.
//
// Behaviour (fake-llama.json, all optional):
//   version, versionTo ('stderr' | 'stdout'): the answer to --version.
//   fetch: { base64, chunks, delayMs, never }: with -mu and no file at -m, the
//     bytes it writes to -m (in chunks, delayMs apart; never: it writes none).
//     It answers HTTP only after the fetch, as llama-server does.
//   health: 'ok' | 'never'; healthDelayMs: 503 "Loading model" until then.
//   exitAfterMs, exitCode: it exits by itself after this time.
//   ignoreTerm: it does not stop on SIGTERM.
//   tok: { prefix, suffix, special }: /tokenize gives one token per code point;
//     add_special adds prefix and suffix; parse_special maps a whole special
//     text to its id. Special ids are above 0x10FFFF, so /detokenize drops them.
//   rerankScores: the relevance_score of each document by index (default i / 10).
//     /v1/rerank returns the results sorted by score, highest first.
//   yesno: { <document text>: { yes, no, as } }: the reply of /completion for the
//     document in the prompt. as 'logprobs' (default): yes and no are log
//     probabilities; as 'probs': probabilities (top_probs). null leaves a token out.
//   completionDelayMs: each /completion waits this long before it answers.
//   (stage 2, through `al search`)
//   fetch.size: with -mu, it writes a file of this many zero bytes (sparse)
//     in place of fetch.base64.
//   concepts: a list of regular expressions. /v1/embeddings then gives, for
//     the text of each token list (its code points, specials dropped), one
//     dimension per concept (1 when the text matches) and a constant 0.1.
//   scoreBy: [[text, p], ...]: the score of a document is the p of the first
//     text that it contains, else scoreDefault (0.01). /v1/rerank gives it as
//     the relevance_score (when rerankScores is not set); /completion gives
//     log(p) for "yes" and log(1 - p) for "no" (when yesno has no entry).
// /v1/embeddings: one vector per token list: [length, first, last, sum]
// (when concepts is not set), and data[] in the reverse order, so that only
// `index` gives the order.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// The special token ids of the fake tokenizers. Each is above 0x10FFFF.
export const CLS = 1_200_101;
export const SEP = 1_200_102;
export const BOS = 1_200_002;
export const EOS_G = 1_200_001;
export const EOS = 1_351_643;
export const codes = (s) => [...s].map((c) => c.codePointAt(0));

const SCRIPT = String.raw`#!/usr/bin/env node
// A fake llama-server for tests. See test/helpers/llama.js.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const here = __dirname;
const conf = JSON.parse(fs.readFileSync(path.join(here, 'fake-llama.json'), 'utf8'));
const logFile = path.join(here, 'fake-llama.log');
const reqFile = path.join(here, 'fake-llama-requests.jsonl');
const log = (o) => fs.appendFileSync(logFile, JSON.stringify({ t: Date.now(), pid: process.pid, ...o }) + '\n');
const argv = process.argv.slice(2);
if (argv[0] === '--version') {
  (conf.versionTo === 'stdout' ? process.stdout : process.stderr).write((conf.version ?? '') + '\n');
  process.exitCode = 0;
  return;
}
log({ event: 'start', argv, mark: process.env.FAKE_LLAMA_MARK ?? null });
const arg = (name) => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };
process.on('SIGTERM', () => {
  log({ event: 'sigterm' });
  if (conf.ignoreTerm) return;
  log({ event: 'stop' });
  process.exit(0);
});
if (conf.exitAfterMs != null) {
  setTimeout(() => { log({ event: 'exit', code: conf.exitCode ?? 1 }); process.exit(conf.exitCode ?? 1); }, conf.exitAfterMs);
}
const keep = setInterval(() => {}, 1 << 30);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tok = conf.tok ?? {};
function tokenize({ content, add_special, parse_special }) {
  let core;
  if (parse_special && tok.special && Object.hasOwn(tok.special, content)) core = [tok.special[content]];
  else core = [...content].map((c) => c.codePointAt(0));
  return add_special ? [...(tok.prefix ?? []), ...core, ...(tok.suffix ?? [])] : core;
}
const textOf = (t) => String.fromCodePoint(...t.filter((x) => x <= 0x10ffff));
const concepts = (conf.concepts ?? []).map((x) => new RegExp(x, 'i'));
const scoreOf = (doc) => {
  const hit = (conf.scoreBy ?? []).find(([w]) => String(doc).includes(w));
  return hit ? hit[1] : (conf.scoreDefault ?? 0.01);
};
let listenedAt = 0;
async function answer(p, b) {
  if (p === '/health') {
    if (conf.health === 'never' || Date.now() - listenedAt < (conf.healthDelayMs ?? 0)) {
      return [503, { error: { code: 503, message: 'Loading model', type: 'unavailable_error' } }];
    }
    return [200, { status: 'ok' }];
  }
  if (p === '/tokenize') return [200, { tokens: tokenize(b) }];
  if (p === '/detokenize') return [200, { content: String.fromCodePoint(...b.tokens.filter((x) => x <= 0x10ffff)) }];
  if (p === '/v1/embeddings') {
    const vec = (t) => (conf.concepts
      ? [...concepts.map((re) => (re.test(textOf(t)) ? 1 : 0)), 0.1]
      : [t.length, t[0], t[t.length - 1], t.reduce((a, x) => a + x, 0)]);
    const data = b.input.map((t, index) => ({ object: 'embedding', index, embedding: vec(t) }));
    return [200, { object: 'list', model: 'fake', data: data.reverse() }];
  }
  if (p === '/v1/rerank') {
    const scores = conf.rerankScores ?? (conf.scoreBy ? b.documents.map(scoreOf) : b.documents.map((_, i) => i / 10));
    const results = b.documents.map((_, index) => ({ index, relevance_score: scores[index] }));
    results.sort((x, y) => y.relevance_score - x.relevance_score);
    return [200, { model: 'fake', object: 'list', results: results.slice(0, b.top_n ?? results.length) }];
  }
  if (p === '/completion') {
    await sleep(conf.completionDelayMs ?? 0);
    const doc = String(b.prompt).split('<Document>: ')[1]?.split('<|im_end|>')[0];
    const p0 = scoreOf(doc);
    const e = (conf.yesno ?? {})[doc] ?? (conf.scoreBy ? { yes: Math.log(p0), no: Math.log(1 - p0) } : { yes: -1, no: -2 });
    const probs = e.as === 'probs';
    const entry = (id, token, v) => (probs
      ? { id, token, bytes: [...Buffer.from(token)], prob: v }
      : { id, token, bytes: [...Buffer.from(token)], logprob: v });
    const top = [];
    if (e.yes != null) top.push(entry(9693, 'yes', e.yes));
    if (e.no != null) top.push(entry(2152, 'no', e.no));
    top.push(entry(1234, 'maybe', probs ? 0.01 : -5));
    top.sort((x, y) => (probs ? y.prob - x.prob : y.logprob - x.logprob));
    const first = { ...top[0], [probs ? 'top_probs' : 'top_logprobs']: top };
    return [200, { content: top[0].token, completion_probabilities: [first] }];
  }
  return [404, { error: { code: 404, message: 'File Not Found' } }];
}
const inflight = {};
function serve() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      const p = req.url;
      let json = null;
      try { json = body ? JSON.parse(body) : null; } catch { json = body; }
      inflight[p] = (inflight[p] ?? 0) + 1;
      if (p !== '/health') fs.appendFileSync(reqFile, JSON.stringify({ path: p, method: req.method, body: json, inflight: inflight[p] }) + '\n');
      try {
        const [code, out] = await answer(p, json);
        res.writeHead(code, { 'content-type': 'application/json' });
        res.end(JSON.stringify(out));
      } catch (err) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 500, message: String(err) } }));
      } finally {
        inflight[p] -= 1;
      }
    });
  });
  server.listen(Number(arg('--port')), arg('--host') ?? '127.0.0.1', () => { listenedAt = Date.now(); log({ event: 'listen' }); });
}
const m = arg('-m');
const mu = arg('-mu');
const f = conf.fetch ?? {};
if (mu && m && !fs.existsSync(m)) {
  log({ event: 'fetch', url: mu });
  if (f.size != null) {
    fs.mkdirSync(path.dirname(m), { recursive: true });
    const fd = fs.openSync(m, 'w');
    fs.ftruncateSync(fd, f.size);
    fs.closeSync(fd);
    log({ event: 'fetched' });
    serve();
  } else if (!f.never) {
    const bytes = Buffer.from(f.base64 ?? '', 'base64');
    fs.mkdirSync(path.dirname(m), { recursive: true });
    fs.writeFileSync(m, Buffer.alloc(0));
    const per = Math.max(1, Math.ceil(bytes.length / (f.chunks ?? 1)));
    let at = 0;
    const step = () => {
      fs.appendFileSync(m, bytes.subarray(at, at + per));
      at += per;
      if (at >= bytes.length) { log({ event: 'fetched' }); serve(); return; }
      setTimeout(step, f.delayMs ?? 0);
    };
    step();
  }
} else {
  serve();
}
void keep;
`;

// True when a process with this pid still runs.
export function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

const lines = (file) => (existsSync(file)
  ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : []);

// A temp folder with a bin folder that holds the fake llama-server, a model
// cache (LLAMA_CACHE) and a home folder. Removed when the test ends; any fake
// server process still running then is killed.
// Returns { root, bin, server, cache, home, env, conf(c), log(), events(name),
// requests(path), maxInFlight(path), pids(), left() }.
// The kill steps of the fakes under each temp folder. The folder's own after
// step runs them before it removes the folder, because the pids are in it.
const killers = new Map();

export function fakeLlama(t, conf = {}, { root } = {}) {
  const top = root ?? mkdtempSync(join(realpathSync(tmpdir()), 'al-llama-'));
  if (!root) {
    killers.set(top, []);
    t.after(() => {
      for (const kill of killers.get(top)) kill();
      killers.delete(top);
      rmSync(top, { recursive: true, force: true });
    });
  }
  const bin = mkdtempSync(join(top, 'bin-'));
  const server = join(bin, 'llama-server');
  writeFileSync(server, SCRIPT);
  chmodSync(server, 0o755);
  symlinkSync(process.execPath, join(bin, 'node'));
  const cache = join(top, 'cache');
  const home = join(top, 'home');
  mkdirSync(cache, { recursive: true });
  mkdirSync(home, { recursive: true });
  const setConf = (c) => writeFileSync(join(bin, 'fake-llama.json'), JSON.stringify(c));
  setConf(conf);
  const logFile = join(bin, 'fake-llama.log');
  const reqFile = join(bin, 'fake-llama-requests.jsonl');
  const log = () => lines(logFile);
  const pids = () => [...new Set(log().filter((e) => e.event === 'start').map((e) => e.pid))];
  killers.get(top).push(() => { for (const pid of pids()) if (alive(pid)) process.kill(pid, 'SIGKILL'); });
  return {
    root: top,
    bin,
    server,
    cache,
    home,
    env: { PATH: bin, LLAMA_CACHE: cache, HOME: home },
    conf: setConf,
    log,
    events: (name) => log().filter((e) => e.event === name),
    requests: (path) => lines(reqFile).filter((r) => path === undefined || r.path === path),
    maxInFlight: (path) => Math.max(0, ...lines(reqFile).filter((r) => r.path === path).map((r) => r.inflight)),
    pids,
    left: () => pids().filter(alive),
    // True when a process runs this fake's script (it may not have logged its start yet).
    running: () => spawnSync('ps', ['-A', '-ww', '-o', 'args='], { encoding: 'utf8' }).stdout.split('\n').some((l) => l.includes(server)),
    // Appends a line of the test's own to the log, to compare the order of events.
    mark: (o) => appendFileSync(logFile, `${JSON.stringify({ t: Date.now(), ...o })}\n`),
  };
}

// A free TCP port on 127.0.0.1.
export function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

// POST JSON, parse the JSON answer.
async function postJson(url, path, body) {
  const r = await fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}

// Starts the fake server directly (not through al) on a model file that is
// already there, and waits for /health. Returns { srv: { url, fetched, post }, fake }.
// srv has the shape that withServer gives to its fn. The process is killed
// when the test ends.
export async function startFake(t, conf = {}) {
  const fake = fakeLlama(t, conf);
  const model = join(fake.cache, 'present.gguf');
  writeFileSync(model, 'x');
  const port = await freePort();
  const child = spawn(process.execPath, [fake.server, '-m', model, '--host', '127.0.0.1', '--port', String(port)], {
    stdio: 'ignore', env: { ...process.env },
  });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  const url = `http://127.0.0.1:${port}`;
  const until = Date.now() + 20_000;
  for (;;) {
    try {
      const r = await fetch(`${url}/health`);
      if ((await r.json()).status === 'ok') break;
    } catch { /* not up yet */ }
    assert.ok(Date.now() < until, 'the fake llama-server answers /health within 20 s');
    await new Promise((r) => setTimeout(r, 25));
  }
  return { srv: { url, fetched: false, post: (path, body) => postJson(url, path, body) }, fake, child };
}

// Runs `<server> --version` as a plain process, for the self-check.
export function versionOf(server) {
  const r = spawnSync(server, ['--version'], { encoding: 'utf8', env: { ...process.env } });
  return `${r.stdout}${r.stderr}`;
}

// --- a fake @huggingface/transformers

// The fake Tensor keeps what it was given.
class Tensor {
  constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims; }
}

// A fake library object for tjsHead and tjsYesNo.
// The tokenizer gives one id per code point; add_special_tokens adds CLS and
// SEP around it. words: whole texts with their own ids (for 'yes' and 'no').
// The head model gives, for row b, the logit headScore(ids of row b, mask of row b).
// The causal model gives logits of dims [1, L, V]: at the last position, yes
// and no get the values yesno(prompt) returns; at the first position, other
// values, so that a read of the wrong row shows.
// Each call is kept in lib.calls.
export function fakeLibrary({
  words = { yes: [7], no: [8] }, V = 10,
  headScore = (ids, mask) => mask.reduce((a, x) => a + x, 0) / 1000,
  yesno = () => ({ yes: 0, no: 0 }),
} = {}) {
  const calls = [];
  const lib = { env: {}, Tensor, calls };
  const encode = (text, { add_special_tokens = true } = {}) => {
    const core = Object.hasOwn(words, text) ? [...words[text]] : codes(text);
    return add_special_tokens ? [CLS, ...core, SEP] : core;
  };
  const decode = (ids) => String.fromCodePoint(...ids.filter((x) => Number(x) <= 0x10ffff).map(Number));
  const tok = (text, opts = {}) => {
    const ids = encode(text, opts);
    const enc = {
      input_ids: new Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      attention_mask: new Tensor('int64', BigInt64Array.from(ids.map(() => 1n)), [1, ids.length]),
      prompt: text,
    };
    calls.push({ call: 'tok', text, opts, enc });
    return enc;
  };
  tok.encode = encode;
  tok.decode = decode;
  const head = async (inputs) => {
    calls.push({ call: 'head', inputs });
    const [B, L] = inputs.input_ids.dims;
    const data = new Float32Array(B);
    for (let b = 0; b < B; b += 1) {
      const ids = [...inputs.input_ids.data.slice(b * L, (b + 1) * L)].map(Number);
      const mask = [...inputs.attention_mask.data.slice(b * L, (b + 1) * L)].map(Number);
      data[b] = headScore(ids, mask);
    }
    return { logits: new Tensor('float32', data, [B, 1]) };
  };
  const causal = async (enc) => {
    calls.push({ call: 'causal', enc });
    const L = enc.input_ids.dims[1];
    const data = new Float32Array(L * V);
    const { yes, no } = yesno(enc.prompt);
    const [y] = words.yes;
    const [n] = words.no;
    data[y] = 50; // the first position: a value that must not be read
    data[n] = -50;
    data[(L - 1) * V + y] = yes;
    data[(L - 1) * V + n] = no;
    return { logits: new Tensor('float32', data, [1, L, V]) };
  };
  const loader = (name, model) => ({
    from_pretrained: async (...args) => {
      calls.push({ call: name, args, remotePathTemplate: lib.env.remotePathTemplate });
      return model;
    },
  });
  lib.AutoTokenizer = loader('AutoTokenizer', tok);
  lib.AutoModelForSequenceClassification = loader('AutoModelForSequenceClassification', head);
  lib.AutoModelForCausalLM = loader('AutoModelForCausalLM', causal);
  return lib;
}
