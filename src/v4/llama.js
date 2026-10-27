// The llama.cpp runtime of `al search` (LD-32): the rows of the measured
// table that run in llama-server. `al` never downloads llama.cpp: the user
// installs it, and `al` finds `llama-server` on PATH. The GGUF file is
// fetched by llama-server itself, pinned to the measured commit, into
// llama-server's own place; `al` keeps no cache of its own. `al` starts one
// server for a search and stops it after, also after a failure.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, constants, createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { delimiter, join } from 'node:path';
import { INSTRUCTION } from './rerank.js';

export const MEASURED_BUILD = 11624;
export const INSTALL = 'install llama.cpp, so that llama-server is on PATH: the measured release is b11624 (https://github.com/ggml-org/llama.cpp/releases/tag/b11624); another build, for example from a package manager, may differ from the measured one';

// The platform rule: llama.cpp was measured on macOS arm64 only.
export function notOffered({ platform, arch } = process) {
  return platform === 'darwin' && arch === 'arm64' ? null : `not offered on ${platform} ${arch}: llama.cpp b11624 was measured on macOS arm64 only`;
}

function executable(path) {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// The first llama-server on PATH and its build, or the reason and how to add it.
export function findServer(env = process.env) {
  const path = (env.PATH ?? '').split(delimiter).filter(Boolean).map((d) => join(d, 'llama-server')).find(executable);
  if (!path) return { reason: 'llama.cpp is not installed: no llama-server on PATH', install: INSTALL };
  // llama.cpp prints "version: <v> (build <n>, commit <h>)", to stdout or stderr.
  const r = spawnSync(path, ['--version'], { env, encoding: 'utf8', timeout: 30_000 });
  const m = /\bbuild (\d+)/.exec(`${r.stdout ?? ''}\n${r.stderr ?? ''}`);
  const build = m ? Number(m[1]) : null;
  return { path, build, note: build === MEASURED_BUILD ? null : `llama.cpp build ${build ?? 'unknown'}; measured with b11624; the figures may differ` };
}

// Where llama-server keeps a file that it fetches by -mu (b11624): LLAMA_CACHE,
// else ~/Library/Caches/llama.cpp on macOS.
export function modelPlace(file, env = process.env) {
  return env.LLAMA_CACHE ? join(env.LLAMA_CACHE, file) : join(env.HOME ?? '', 'Library/Caches/llama.cpp', file);
}

// The line shown before a fetch (MB = 10^6 bytes).
export function fetchLine(model) {
  return `Fetch     ${model.name}: ${(model.bytes / 1e6).toFixed(1)} MB from huggingface.co/${model.repo}@${model.commit.slice(0, 12)}, SHA-256 ${model.sha256.slice(0, 12)}`;
}

const sizeOf = (path) => { try { return statSync(path).size; } catch { return null; } };

function freePort() {
  return new Promise((ok, fail) => {
    const s = createServer();
    s.once('error', fail);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
  });
}

function sha256Of(path) {
  return new Promise((ok, fail) => {
    const h = createHash('sha256');
    createReadStream(path).on('error', fail).on('data', (b) => h.update(b)).on('end', () => ok(h.digest('hex')));
  });
}

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

// The arguments that bench-28 measured, `--cache-ram 0` included: by default
// llama-server keeps the state of past inputs, and an index build grows to 16 GB.
function argsOf({ place, model, fetching, port, kind, pooling, ngl }) {
  return [
    '-m', place,
    ...(fetching ? ['-mu', `https://huggingface.co/${model.repo}/resolve/${model.commit}/${model.file}`] : []),
    '--host', '127.0.0.1', '--port', String(port), '-ngl', String(ngl), '-c', kind === 'embed' ? '8192' : '16384',
    '-np', '8', '-b', '2048', '-ub', '2048', '--cache-ram', '0', '--no-webui', '--log-disable',
    ...(kind === 'embed' ? ['--embedding', '--pooling', pooling] : kind === 'rerank' ? ['--rerank'] : []),
  ];
}

// Runs fn(srv) with a llama-server for `model`, and stops the server after,
// whatever happens. A present file is checked by its size; a file that this
// run fetched is checked once by its SHA-256, and is kept when it differs.
export async function withServer({ server, model, kind, pooling, ngl = 99, env = process.env, onFetch = () => {}, healthMs = 120_000 }, fn) {
  const place = modelPlace(model.file, env);
  const size = sizeOf(place);
  if (size !== null && size !== model.bytes) throw new Error(`${model.file} at ${place} has ${size} bytes, expected ${model.bytes}`);
  const fetching = size === null;
  if (fetching) onFetch(fetchLine(model));
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(server.path, argsOf({ place, model, fetching, port, kind, pooling, ngl }), { env, stdio: 'ignore' });
  let exit = null;
  const exited = new Promise((ok) => child.once('exit', (code, signal) => { exit = { code, signal }; ok(); }));
  child.once('error', (e) => { exit = { code: null, signal: null, error: e.message }; });
  const onSigint = () => { child.kill('SIGKILL'); process.exit(130); };
  process.once('SIGINT', onSigint);
  try {
    // healthMs counts from the time the file is complete; while llama-server
    // fetches it, the wait goes on as long as the process lives.
    let since = null;
    for (;;) {
      if (exit) throw new Error(`llama-server exited before it was ready (${exit.error ?? `code ${exit.code}${exit.signal ? `, signal ${exit.signal}` : ''}`})`);
      if (since === null && sizeOf(place) === model.bytes) since = Date.now();
      if (since !== null && Date.now() - since > healthMs) throw new Error(`llama-server did not get ready within ${healthMs / 1000} s after ${model.file} was complete`);
      try {
        const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2_000) });
        if (r.ok && (await r.json())?.status === 'ok') break;
      } catch { /* not up yet */ }
      await sleep(100);
    }
    if (fetching) {
      const found = await sha256Of(place);
      if (found !== model.sha256) throw new Error(`${model.file} at ${place}: SHA-256 ${found}, expected ${model.sha256}`);
    }
    const post = async (path, body) => {
      const r = await fetch(`${url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`llama-server ${path}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
      return r.json();
    };
    return await fn({ url, fetched: fetching, post });
  } finally {
    process.removeListener('SIGINT', onSigint);
    if (!exit) {
      child.kill('SIGTERM');
      const timer = setTimeout(() => { if (!exit) child.kill('SIGKILL'); }, 10_000);
      await exited;
      clearTimeout(timer);
    }
  }
}

// An embedder on a running server, as bench-28 measured it: each input is
// tokenized, cut to 512 tokens with its closing token kept, and sent as a
// token list.
const PREFIX = {
  bge: { query: 'Represent this sentence for searching relevant passages: ', doc: '' },
  gemma: { query: 'task: search result | query: ', doc: 'title: none | text: ' },
  qwen: { query: `Instruct: ${INSTRUCTION}\nQuery:`, doc: '' },
};
const BATCH = 32;

export function llamaEmbedding(srv, family) {
  const prefix = PREFIX[family];
  if (!prefix) throw new Error(`no llama.cpp embedding family ${family}`);
  let eos = null;
  async function cut(text) {
    const t = (await srv.post('/tokenize', { content: text, add_special: true, parse_special: false })).tokens;
    if (family === 'qwen') {
      // Qwen3-Embedding pools on its closing <|endoftext|>, which ends each input once.
      eos ??= (await srv.post('/tokenize', { content: '<|endoftext|>', add_special: false, parse_special: true })).tokens;
      const tail = t.slice(-eos.length);
      const body = eos.length && tail.length === eos.length && tail.every((x, i) => x === eos[i]) ? t.slice(0, -eos.length) : t;
      return [...body.slice(0, 511), ...eos];
    }
    return t.length > 512 ? [...t.slice(0, 511), t.at(-1)] : t;
  }
  async function embed(texts) {
    const lists = [];
    for (const t of texts) lists.push(await cut(t));
    const out = [];
    for (let i = 0; i < lists.length; i += BATCH) {
      const { data } = await srv.post('/v1/embeddings', { input: lists.slice(i, i + BATCH) });
      out.push(...[...data].sort((a, b) => a.index - b.index).map((d) => d.embedding));
    }
    return out;
  }
  return {
    docs: (texts) => embed(texts.map((t) => `${prefix.doc}${t}`)),
    query: async (text) => (await embed([`${prefix.query}${text}`]))[0],
  };
}
