// Issue #39: level 2 and the network. Built from the requirement and the
// public interface only (al search --json); nothing here reads src/.
// - After the first download, level 2 loads only from the local cache, at the
//   pinned revision, with no network request.
// - The first download is the only network use, and it fetches every file of
//   the model at the pinned revision:
//   https://huggingface.co/<model>/resolve/<revision>/<file>.
// - When the model cannot load (no network and no cache, or a broken cache),
//   al search falls back to level 1 and says why:
//   `level 2 failed: the model <model> did not load: <first line of the error>`.
// A preload (helpers/search.js, netGuard) watches each network road of al's
// process and writes each attempt to a file that the test reads.
//
// The tests with the real model run as the smoke test does
// (search-real-model.test.js): only when @huggingface/transformers resolves
// from the repo top, and never skip with AL_REQUIRE_REAL_MODEL=1. Each one
// uses its own copy of the library in the test project's node_modules (its
// dependencies are links into the repo's node_modules), with a scratch HOME,
// so the cache starts empty and the shared cache is never emptied or broken.
// The first download (about 34 MB) is made once for the file.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MODEL, REPO, REVISION, TRANSFORMERS, netAttempts, netGuard, search, smallRepo } from './helpers/search.js';

const TEN_MINUTES = 600_000;
const required = process.env.AL_REQUIRE_REAL_MODEL === '1';
const installed = (() => {
  try {
    createRequire(join(REPO, 'package.json')).resolve(TRANSFORMERS);
    return true;
  } catch {
    return false;
  }
})();
const realModel = {
  skip: installed || required ? false : `${TRANSFORMERS} does not resolve from the repo top: install it there to run the real-model tests of #39`,
  timeout: TEN_MINUTES * 2,
};

const QUERY = ['how', 'long', 'does', 'the', 'emailed', 'download', 'URL', 'keep', 'working'];
const OTHER = ['when', 'does', 'the', 'emailed', 'download', 'URL', 'stop', 'working'];
// Words that level 1 finds in EXP-4.
const WORDS = ['export', 'link'];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PINNED = new RegExp(`^https://huggingface\\.co/${esc(MODEL)}/resolve/${REVISION}/[^?#]+$`);
const NOT_LOADED = new RegExp(`^level 2 failed: the model ${esc(MODEL)} did not load: \\S[^\\n]*$`);
const list = (attempts) => attempts.map((a) => `${a.road} ${a.target}`).join('\n');
const url = (file) => pathToFileURL(file).href;

// Projects that outlive one test (the first download is shared), removed at the end.
const cleanups = [];
const holder = { after: (fn) => cleanups.push(fn) };
after(() => { for (const fn of cleanups.splice(0)) fn(); });

// The library at the repo top, and its copy in a project.
const LIB = join(REPO, 'node_modules', TRANSFORMERS);
function libCopy(dir) {
  assert.ok(existsSync(join(LIB, 'package.json')), `the fixture: ${LIB} holds the library`);
  const to = join(dir, 'node_modules', TRANSFORMERS);
  // No cache and no local models from the shared copy.
  cpSync(LIB, to, {
    recursive: true,
    filter: (src) => !/^(\.cache|models)(\/|$)/.test(relative(LIB, src).split(sep).join('/')),
  });
  // The library's bundle imports packages that are not in its own
  // dependencies (onnxruntime-common, for example). So every other package
  // of the repo's node_modules gets a link, as npm would lay them out.
  const top = join(REPO, 'node_modules');
  const names = [];
  for (const e of readdirSync(top)) {
    if (e.startsWith('.')) continue;
    if (e.startsWith('@')) for (const s of readdirSync(join(top, e))) names.push(`${e}/${s}`);
    else names.push(e);
  }
  for (const d of names) {
    if (d === TRANSFORMERS) continue;
    const link = join(dir, 'node_modules', d);
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(realpathSync(join(top, d)), link, 'dir');
  }
  const deps = Object.keys(JSON.parse(readFileSync(join(LIB, 'package.json'), 'utf8')).dependencies ?? {});
  for (const d of deps) assert.ok(existsSync(join(dir, 'node_modules', d)), `the fixture: the dependency ${d} of the library is linked`);
}

// A small repo with its own copy of the library (which al finds first) and a
// scratch HOME, XDG_CACHE_HOME and HF_HOME inside the project.
function world() {
  const { dir } = smallRepo(holder);
  libCopy(dir);
  return { dir, env: worldEnv(dir) };
}
function worldEnv(dir) {
  const home = join(dir, '.git', 'test-home');
  mkdirSync(join(home, '.cache'), { recursive: true });
  return { HOME: home, XDG_CACHE_HOME: join(home, '.cache'), HF_HOME: join(home, '.cache', 'huggingface') };
}

// One al search with the network watched; mode 'block' or 'record'.
function watched(w, args, mode, name) {
  const log = join(w.dir, '.git', `network-${name}.log`);
  const guard = netGuard(join(w.dir, '.git', `network-${name}.mjs`), { log, mode });
  const out = search(w.dir, args, { nodeArgs: ['--import', url(guard)], env: w.env, timeout: TEN_MINUTES });
  return { out, attempts: netAttempts(log) };
}

// The first load, from an empty cache, with the network open and recorded.
// Made once for this file; a failure is kept and given to each test.
let first = null;
function firstLoad() {
  if (first === null) {
    try {
      const w = world();
      first = { ...w, ...watched(w, QUERY, 'record', 'first') };
    } catch (error) {
      first = { error };
    }
  }
  if (first.error) throw first.error;
  return first;
}

// The files of the model that the first load stored, wherever al keeps them
// inside the world: not in the library's own code, not in git's objects, and
// never through a link (the dependencies are links into the repo).
const MODEL_FILES = /^(config\.json|tokenizer\.json|tokenizer_config\.json|.*\.onnx(_data)?)$/;
function storedModelFiles(dir) {
  const found = [];
  const skip = new Set(['dist', 'src', 'types'].map((d) => join(dir, 'node_modules', TRANSFORMERS, d)).concat(join(dir, '.git', 'objects')));
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isSymbolicLink() || skip.has(p)) continue;
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && MODEL_FILES.test(e.name)) found.push(p);
    }
  };
  walk(dir);
  return found;
}

// --- the preload itself, with no model and no network

test('#39 the fixture: the network preload records and refuses a fetch, an https request, a socket and a dns lookup', () => {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'al-39-guard-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const log = join(dir, 'network.log');
  const guard = netGuard(join(dir, 'guard.mjs'), { log, mode: 'block' });
  const probe = join(dir, 'probe.mjs');
  writeFileSync(probe, [
    "import https from 'node:https';",
    "import net from 'node:net';",
    "import dns from 'node:dns';",
    'const out = [];',
    "try { await fetch('https://huggingface.co/probe'); out.push('fetch went out'); } catch { out.push('fetch refused'); }",
    "try { https.get('https://huggingface.co/probe2'); out.push('https went out'); } catch { out.push('https refused'); }",
    "await new Promise((ok) => { const s = net.connect(443, 'huggingface.co'); s.on('error', () => { out.push('socket refused'); ok(); }); s.on('connect', () => { out.push('socket went out'); s.destroy(); ok(); }); });",
    "await new Promise((ok) => dns.lookup('huggingface.co', (e) => { out.push(e ? 'dns refused' : 'dns went out'); ok(); }));",
    "await dns.promises.lookup('example.com').then(() => out.push('dns promise went out'), () => out.push('dns promise refused'));",
    'console.log(JSON.stringify(out));',
    '',
  ].join('\n'));
  const r = spawnSync(process.execPath, ['--import', url(guard), probe], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.deepEqual(JSON.parse(r.stdout), ['fetch refused', 'https refused', 'socket refused', 'dns refused', 'dns promise refused']);
  const seen = netAttempts(log);
  for (const [road, target] of [['fetch', 'https://huggingface.co/probe'], ['https', 'https://huggingface.co/probe2'],
    ['socket', 'huggingface.co:443'], ['dns', 'huggingface.co'], ['dns', 'example.com']]) {
    assert.ok(seen.some((a) => a.road === road && a.target === target), `the log has ${road} ${target}:\n${list(seen)}`);
  }
});

// --- the real model

test('#39 the first download, from an empty cache: every request is for a file of the model at the pinned revision', realModel, () => {
  assert.ok(installed, `${TRANSFORMERS} does not resolve from the repo top, and AL_REQUIRE_REAL_MODEL=1 asks for the real model`);
  const f = firstLoad();
  const urls = f.attempts.filter((a) => ['fetch', 'http', 'https'].includes(a.road)).map((a) => a.target);
  const other = urls.filter((u) => !PINNED.test(u));
  assert.deepEqual(other, [], `each request of the first download is ${PINNED}; these are not:\n${other.join('\n')}\n--- every attempt\n${list(f.attempts)}`);
  assert.ok(urls.some((u) => /\.onnx$/.test(u)), `the first download fetched the model file, by a road the test sees (fallback: ${f.out.fallback}):\n${list(f.attempts)}`);
  assert.equal(f.out.level, 2, `level 2 answered after the first download (fallback: ${f.out.fallback})`);
  assert.equal(f.out.fallback, null);
});

test('#39 after the first download, level 2 loads with the network blocked and makes no network attempt', realModel, () => {
  assert.ok(installed, `${TRANSFORMERS} does not resolve from the repo top, and AL_REQUIRE_REAL_MODEL=1 asks for the real model`);
  const f = firstLoad();
  assert.equal(f.out.level, 2, `the fixture: the first load answered at level 2 (fallback: ${f.out.fallback})`);
  const { out, attempts } = watched(f, OTHER, 'block', 'offline');
  assert.deepEqual(attempts, [], `with the model in the cache, level 2 makes no network attempt:\n${list(attempts)}`);
  assert.equal(out.level, 2, `level 2 answered with the network blocked (fallback: ${out.fallback})`);
  assert.equal(out.fallback, null);
  assert.ok(out.hits.some((h) => h.id === 'EXP-4' && h.role === 'baseline'), out.hits.map((h) => h.id).join(', '));
});

test('#39 a broken cache and no network: al search falls back to level 1 and says that the model did not load', realModel, () => {
  assert.ok(installed, `${TRANSFORMERS} does not resolve from the repo top, and AL_REQUIRE_REAL_MODEL=1 asks for the real model`);
  const f = firstLoad();
  // A copy of the world after the first download; the links stay links.
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'al-39-broken-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(f.dir, dir, { recursive: true, verbatimSymlinks: true });
  const w = { dir, env: worldEnv(dir) };
  const files = storedModelFiles(dir);
  assert.ok(files.some((p) => p.endsWith('.onnx')),
    `the fixture: the first download stored the model file inside the test's world (the project, its node_modules or its HOME):\n${files.join('\n')}`);
  for (const p of files) writeFileSync(p, '{ this file is broken');
  const { out } = watched(w, WORDS, 'block', 'broken');
  assert.equal(out.level, 1, `level 1 answered: ${JSON.stringify(out.fallback)}`);
  assert.match(String(out.fallback), NOT_LOADED);
  assert.ok(out.hits.some((h) => h.id === 'EXP-4' && h.role === 'baseline'), out.hits.map((h) => h.id).join(', '));
});

test('#39 no cache and no network: al search falls back to level 1 and says that the model did not load', realModel, () => {
  assert.ok(installed, `${TRANSFORMERS} does not resolve from the repo top, and AL_REQUIRE_REAL_MODEL=1 asks for the real model`);
  const w = world();
  assert.deepEqual(storedModelFiles(w.dir), [], 'the fixture: the cache is empty');
  const { out } = watched(w, WORDS, 'block', 'none');
  assert.equal(out.level, 1, `level 1 answered: ${JSON.stringify(out.fallback)}`);
  assert.match(String(out.fallback), NOT_LOADED);
  assert.ok(out.hits.some((h) => h.id === 'EXP-4' && h.role === 'baseline'), out.hits.map((h) => h.id).join(', '));
});
