// Issue #101 (DES-66): al check answers within 10 s on a pull request in a
// project of 1,000 requests and 20 repos. Written before the code, from the
// issue and DES-66, by a different author than the code. It uses only the
// command `node bin/al.js`, git, the helpers and the scale world scripts.
//
// 1. The output of `al check` and `al check --strict` stays what main prints,
//    byte for byte, with the same exit code, and the files that it writes stay
//    what main writes. The expected text below is that output, taken from main
//    before the change. Commit hashes in it are shown by name ({<repo>:<subject>}
//    for a full hash, {...:7} for its first 7), as in check-speed-199, so that
//    the text does not hang on how the worlds are hashed.
// 2. The cost does not grow with the number of concluded requests (5 against
//    60), in a scale world whose records are up to date, so that al check
//    writes nothing:
//    a. al parses the text of each request record as YAML at most once
//       (parse and parseDocument together, in the main thread and in each
//       worker thread);
//    b. the parses of a YAML text that al has already parsed (parse and
//       parseDocument together, in all threads, less one for each distinct
//       text) do not grow;
//    c. the number of git processes does not grow.
// 3. A cache, if any, gives what no cache gives: two runs give the same
//    output, and a run after a new commit or a change in the working tree
//    gives what a run in a fresh clone gives.
// 4. With worker threads and without them, al check gives the same output.
//
// How the YAML calls are counted. al reads its records with the npm package
// `yaml`. The test writes two modules to a temp folder: a module hook and a
// copy of `yaml` whose parse and parseDocument append one line to a log file
// (the function, the thread ID and the sha256 of the input text) and then call
// the real functions. The hook (module.registerHooks) sends each import of
// `yaml` to that copy. The child al process gets the hook twice: with
// --import on its command line and with --import in NODE_OPTIONS. Nothing for
// the count is in src/ or bin/.
//
// What was checked about worker threads, in Node 26.11.1:
// - A worker that runs a file runs the --import modules of the command line,
//   because it takes the execArgv of its parent. With `execArgv: []` it does
//   not run them.
// - It also runs the --import modules of NODE_OPTIONS, also with
//   `execArgv: []`. With an `env` that has no NODE_OPTIONS it does not.
// - A worker made with `eval: true` runs neither of them.
// So the hook also wraps the Worker class of node:worker_threads (with
// syncBuiltinESMExports) and logs the thread ID of each worker made, and each
// thread that loads the hook logs its own thread ID. A test that counts
// fails when a worker did not load the hook, so a count cannot miss the calls
// of a worker without a word.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { availableParallelism, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { invoicer } from './helpers/invoicer.js';
import { world } from './helpers/cross-repo.js';
import { BIN, EPOCH, REPO, baseProject, commitAll, git, move, read, write } from './helpers/project.js';
import { GENERATE, cleanEnv as scaleEnv } from './helpers/scale.js';
import { Repo, closeRequest, entriesOf } from '../scale/world.js';

// al parses the records in worker threads when the request records of the
// working tree (.assuredloop/records/requests/*.yaml) hold more than this
// many characters in all, and the machine has at least 2 cores; then with
// min(4, cores - 1) workers.
const WORKER_CHARS = 1_000_000;
// The scale world of test 4: the smallest world of scale/generate.js that was
// found whose request records are clearly above WORKER_CHARS (about 1.9
// million characters after al index). Few requests with long change specs
// build faster than many short ones.
const WORKER_WORLD = { requests: 20, outputs: 2, paragraphs: 350, open: 2 };
// How far above WORKER_CHARS the world of test 4 must be.
const WORKER_MARGIN = 1.5;
// The scale worlds of test 2: 5 and 60 concluded requests, and 2 open ones.
const FEW = 5;
const MANY = 60;
const costWorld = (concluded) => ({ requests: concluded + 2, outputs: 1, paragraphs: 5, open: 2 });
// How many more git processes, or parses of a text already parsed, a run with
// MANY may make than a run with FEW.
const SLACK = 3;

const RECORDS = '.assuredloop/records/requests/';
const sha = (text) => createHash('sha256').update(text).digest('hex');

// The environment of a child: nothing that points git at another repo or
// config, no NODE_OPTIONS of the parent, and the fixed clock and identities.
function childEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('GIT_') && k !== 'SOURCE_DATE_EPOCH' && k !== 'NODE_OPTIONS') env[k] = v;
  }
  return {
    ...env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    // No automatic maintenance or gc: a detached run writes into .git while the test removes it (#108).
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'maintenance.auto',
    GIT_CONFIG_VALUE_0: 'false',
    GIT_CONFIG_KEY_1: 'gc.auto',
    GIT_CONFIG_VALUE_1: '0',
    GIT_AUTHOR_NAME: 'Fixture Author',
    GIT_AUTHOR_EMAIL: 'author@example.invalid',
    GIT_AUTHOR_DATE: '2026-05-01T00:00:00Z',
    GIT_COMMITTER_NAME: 'Fixture Committer',
    GIT_COMMITTER_EMAIL: 'committer@example.invalid',
    GIT_COMMITTER_DATE: '2026-05-01T00:00:00Z',
    SOURCE_DATE_EPOCH: String(EPOCH),
    ...extra,
  };
}

// One run of `node bin/al.js <args>` in dir. With `hook` (see yamlHook), the
// hook is loaded in the main thread and in each worker; with `PATH`, git is
// found there first.
function al(dir, args, { hook = null, PATH = null } = {}) {
  const env = childEnv({ ...(PATH ? { PATH } : {}), ...(hook ? { NODE_OPTIONS: `--import=${hook.url}` } : {}) });
  const r = spawnSync(process.execPath, [...(hook ? ['--import', hook.url] : []), BIN, ...args], {
    cwd: dir, env, input: '', encoding: 'utf8', timeout: 120_000, maxBuffer: 1 << 28,
  });
  return { code: r.status, signal: r.signal, stdout: r.stdout ?? '', stderr: r.stderr ?? '', args };
}

const show = (r) =>
  `al ${r.args.join(' ')} -> exit ${r.code} (signal ${r.signal})\n--- stdout\n${r.stdout.slice(0, 8000)}--- stderr\n${r.stderr.slice(0, 4000)}`;

// The working tree back to HEAD: tracked files as committed, and no file that
// git does not ignore and does not track.
function reset(dir) {
  git(dir, 'reset', '-q', '--hard');
  git(dir, 'clean', '-q', '-fd');
}

// What a run wrote, as git sees it: the status lines, then for each changed
// file its diff with no context and no `index` line, and for each new file
// its text.
function written(dir) {
  const status = git(dir, 'status', '--porcelain=v1', '-uall');
  if (!status) return [];
  const out = status.split('\n');
  const diff = git(dir, 'diff', '--no-ext-diff', '--no-color', '-U0');
  if (diff) out.push(...diff.split('\n').filter((l) => !l.startsWith('index ')));
  for (const l of status.split('\n').filter((x) => x.startsWith('?? '))) {
    const file = l.slice(3);
    out.push(`+++ new file ${file}`, ...read(dir, file).replace(/\n$/, '').split('\n'));
  }
  return out;
}

// --- counting git processes: a `git` first on PATH that logs a line, then
// runs the real git (as in check-speed-199).

const MARK = 'GITCALL';

function realGit() {
  const r = spawnSync('/bin/sh', ['-c', 'command -v git'], { encoding: 'utf8' });
  const p = r.stdout.trim();
  assert.ok(r.status === 0 && p.startsWith('/'), `command -v git finds git: ${JSON.stringify(r.stdout)} ${r.stderr}`);
  return p;
}

function gitCounter() {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'al4-gitwrap-'));
  after(() => rmSync(dir, { recursive: true, force: true }));
  const log = join(dir, 'calls.log');
  const wrapper = join(dir, 'git');
  writeFileSync(wrapper, ['#!/bin/sh', `printf '${MARK} %s\\n' "$*" >> '${log}'`, `exec '${realGit()}' "$@"`, ''].join('\n'));
  chmodSync(wrapper, 0o755);
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n') : []).filter((l) => l.startsWith(`${MARK} `));
  return { PATH: `${dir}:${process.env.PATH}`, reset: () => rmSync(log, { force: true }), calls };
}

// --- counting YAML calls: the hook and the copy of `yaml` (see the header).
// `workers`: 'on' lets al make its workers; 'throw' makes `new Worker(...)`
// throw; 'fail' gives al a worker that fails as it starts.

const YAML_URL = pathToFileURL(createRequire(join(REPO, 'package.json')).resolve('yaml')).href;

function yamlHook({ workers = 'on' } = {}) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'al4-yamlhook-'));
  after(() => rmSync(dir, { recursive: true, force: true }));
  const log = join(dir, 'calls.log');
  const wrapUrl = pathToFileURL(join(dir, 'yaml-counted.mjs')).href;
  writeFileSync(join(dir, 'yaml-counted.mjs'), `
import real from ${JSON.stringify(YAML_URL)};
import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { threadId } from 'node:worker_threads';
export * from ${JSON.stringify(YAML_URL)};
const LOG = ${JSON.stringify(log)};
const note = (fn, src) => appendFileSync(LOG, 'YAML ' + fn + ' ' + threadId + ' ' +
  (typeof src === 'string' ? createHash('sha256').update(src).digest('hex') : 'not-a-string') + '\\n');
export function parse(src, ...rest) { note('parse', src); return real.parse(src, ...rest); }
export function parseDocument(src, ...rest) { note('parseDocument', src); return real.parseDocument(src, ...rest); }
export default { ...real, parse, parseDocument };
`);
  const hookPath = join(dir, 'hook.mjs');
  writeFileSync(hookPath, `
import { createRequire, registerHooks, syncBuiltinESMExports } from 'node:module';
import { appendFileSync } from 'node:fs';
import { threadId } from 'node:worker_threads';
const KEY = Symbol.for('assuredloop.test.yaml-count');
if (!globalThis[KEY]) {
  globalThis[KEY] = true;
  const LOG = ${JSON.stringify(log)};
  const WRAP = ${JSON.stringify(wrapUrl)};
  const MODE = ${JSON.stringify(workers)};
  appendFileSync(LOG, 'HOOKED ' + threadId + '\\n');
  registerHooks({
    resolve(spec, ctx, next) {
      if (spec === 'yaml' && ctx.parentURL !== WRAP) return { url: WRAP, format: 'module', shortCircuit: true };
      return next(spec, ctx);
    },
  });
  const wt = createRequire(import.meta.url)('node:worker_threads');
  const Real = wt.Worker;
  wt.Worker = class Worker extends Real {
    constructor(file, options) {
      if (MODE === 'throw') throw new Error('test: no worker threads');
      if (MODE === 'fail') super('throw new Error("test: this worker fails at start")', { eval: true });
      else super(file, options);
      appendFileSync(LOG, 'WORKER ' + this.threadId + '\\n');
    }
  };
  syncBuiltinESMExports();
}
`);
  const lines = () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);
  return {
    url: pathToFileURL(hookPath).href,
    reset: () => rmSync(log, { force: true }),
    // The YAML calls: [{ fn, thread, sha }].
    calls: () => lines().filter((l) => l.startsWith('YAML ')).map((l) => {
      const [, fn, thread, h] = l.split(' ');
      return { fn, thread: Number(thread), sha: h };
    }),
    hooked: () => lines().filter((l) => l.startsWith('HOOKED ')).map((l) => Number(l.split(' ')[1])),
    workers: () => lines().filter((l) => l.startsWith('WORKER ')).map((l) => Number(l.split(' ')[1])),
  };
}

// Each worker that al made loaded the hook, so its calls are in the log.
function assertAllHooked(hook) {
  const hooked = new Set(hook.hooked());
  assert.ok(hooked.has(0), `the hook ran in the main thread: ${[...hooked].join(', ')}`);
  const missed = hook.workers().filter((id) => !hooked.has(id));
  assert.deepEqual(missed, [], `workers ${missed.join(', ')} did not load the counting hook (a worker made with eval: true, or with neither the execArgv nor the NODE_OPTIONS of al), so their YAML calls are not counted`);
}

// Every text that a request record has in the working tree, at HEAD and at
// main: { <sha256>: '<file> (<where>)' }.
function recordTexts(dir) {
  const texts = new Map();
  const add = (text, label) => { const h = sha(text); if (!texts.has(h)) texts.set(h, label); };
  for (const rev of ['HEAD', 'main']) {
    const files = git(dir, 'ls-tree', '-r', '--name-only', rev, '--', RECORDS).split('\n').filter((f) => /^\.assuredloop\/records\/requests\/[^/]+\.yaml$/.test(f));
    for (const f of files) add(spawnSync('git', ['show', `${rev}:${f}`], { cwd: dir, env: childEnv(), encoding: 'utf8', maxBuffer: 1 << 28 }).stdout, `${f} at ${rev}`);
  }
  const now = git(dir, 'ls-files', '-co', '--exclude-standard', '--', RECORDS).split('\n').filter((f) => /^\.assuredloop\/records\/requests\/[^/]+\.yaml$/.test(f));
  for (const f of now) add(read(dir, f), `${f} in the working tree`);
  return texts;
}

// The record texts that were parsed more than once: ['<label>: <n> times
// (parse <p>, parseDocument <d>)'], and the number of record texts parsed.
function parsedTwice(calls, texts) {
  const count = new Map();
  for (const c of calls) {
    if (!texts.has(c.sha)) continue;
    const n = count.get(c.sha) ?? { parse: 0, parseDocument: 0 };
    n[c.fn] += 1;
    count.set(c.sha, n);
  }
  const twice = [...count].filter(([, n]) => n.parse + n.parseDocument > 1)
    .map(([h, n]) => `${texts.get(h)}: ${n.parse + n.parseDocument} times (parse ${n.parse}, parseDocument ${n.parseDocument})`);
  return { twice, parsed: count.size };
}

// The first few lines of a long list, and how many more there are.
const firstLines = (list, n = 8) => [...list.slice(0, n), ...(list.length > n ? [`... and ${list.length - n} more`] : [])].join('\n');

// --- 1. The output of al check and al check --strict, as on main

// Each commit of each repo by name: { <full hash>: '<repo>:<subject>' }.
function commitNames(repos) {
  const names = new Map();
  for (const [repo, dir] of Object.entries(repos)) {
    const seen = new Map();
    for (const line of git(dir, 'log', '--all', '--topo-order', '--format=%H %s').split('\n')) {
      const sp = line.indexOf(' ');
      const h = line.slice(0, sp);
      const label = `${repo}:${line.slice(sp + 1)}`;
      const k = (seen.get(label) ?? 0) + 1;
      seen.set(label, k);
      if (!names.has(h)) names.set(h, k === 1 ? label : `${label} (${k})`);
    }
  }
  return names;
}

// The text with each full hash of a commit as {name}, and its first 7 as
// {name:7}; any other text stays as it is. `extra` maps a path to its name,
// wherever it is, longest first.
function named(text, repos, extra = {}) {
  const names = commitNames(repos);
  const short = new Map();
  for (const [h, label] of names) short.set(h.slice(0, 7), short.has(h.slice(0, 7)) ? null : label);
  let out = text;
  for (const [from, to] of Object.entries(extra).sort(([a], [b]) => b.length - a.length)) out = out.split(from).join(to);
  return out.replace(/\b[0-9a-f]{7,40}\b/g, (h) => {
    if (h.length === 40 && names.has(h)) return `{${names.get(h)}}`;
    if (h.length === 7 && short.get(h)) return `{${short.get(h)}:7}`;
    return h;
  });
}

function editText(dir, file, from, to) {
  const text = read(dir, file);
  assert.equal(text.split(from).length, 2, `${file} has ${JSON.stringify(from)} once`);
  write(dir, file, text.replace(from, to));
}

// The invoicer world with cr-chain merged on main, then on main
// portal-downloads and link-refresh archived; so main holds the archived
// requests adoption, invoice-numbers, portal-downloads and link-refresh
// (records with bindings, decisions, sign-offs and dispositions) and the
// open requests invoice-exports, reminder-emails and link-expiry-spike. With
// `onMain`, it changes main before that commit. Then the branch pr2 from
// there, with one commit that `change` makes.
function archivedChain(t, change, onMain = () => {}) {
  const dir = invoicer(t, 'cr-chain');
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'merge', '-q', '--ff-only', 'pr');
  mkdirSync(join(dir, 'requests/archive'), { recursive: true });
  move(dir, 'requests/portal-downloads', 'requests/archive/portal-downloads');
  move(dir, 'requests/link-refresh', 'requests/archive/link-refresh');
  onMain(dir);
  commitAll(dir, 'Archive portal-downloads and link-refresh');
  git(dir, 'checkout', '-q', '-b', 'pr2');
  change(dir);
  return dir;
}

const notesOnly = (dir) => {
  write(dir, 'README.md', 'notes\n');
  commitAll(dir, 'Notes\n\nTier: 0 — notes only');
};

// A PR that concludes link-expiry-spike with al conclude, which moves it to
// requests/archive/.
const concludes = (dir) => {
  const r = al(dir, ['conclude', 'link-expiry-spike', '--yes']);
  assert.equal(r.code, 0, show(r));
  assert.ok(existsSync(join(dir, 'requests/archive/link-expiry-spike/request.md')), show(r));
  commitAll(dir, 'Conclude link-expiry-spike\n\nTier: 0 — notes only');
};

// A PR after which no marker declares the link EXP-9 serves:portal-downloads/R1
// any more, so al index removes its binding from the archived record of
// portal-downloads.
const linkDropped = (dir) => {
  editText(dir, 'specs/exports.md', '<!-- EXP-9 rule serves:portal-downloads/R1 governed-by:ADR-5 -->', '<!-- EXP-9 rule governed-by:ADR-5 -->');
  commitAll(dir, 'Drop a link of EXP-9\n\nTier: 0 — notes only');
};

// A PR that makes one record no valid YAML.
const notYaml = (name) => (dir) => {
  const rel = `${RECORDS}${name}.yaml`;
  write(dir, rel, `${read(dir, rel)}bindings: [ {holder: : x\n`);
  commitAll(dir, `Break the record of ${name}\n\nTier: 0 — notes only`);
};

// The cross-repo world (helpers/cross-repo.js): the central repo on its branch
// pr, with output repos invoicer-web and invoicer-worker, and invoicer-mobile
// with no clone.
function cross(t) {
  const w = world(t);
  return { dir: w.central, repos: { central: w.central, web: w.web, worker: w.worker }, extra: { [w.root]: '<root>' } };
}

const chain = (change) => (t) => ({ dir: archivedChain(t, change) });
const CASES = {
  'archived chain, notes only': chain(notesOnly),
  'archived chain, a PR that concludes and archives a request': chain(concludes),
  'archived chain, a binding that no marker declares': chain(linkDropped),
  'archived chain, an archived record that is not YAML': chain(notYaml('link-refresh')),
  'archived chain, an open record that is not YAML': chain(notYaml('reminder-emails')),
  'cross-repo world with output repos': cross,
};
const RUNS = [['check'], ['check', '--strict']];

// The output of each run on main before the change: the exit code, the lines
// of stdout and of stderr, and what the run wrote (see written()).
const PINNED = {
  "archived chain, notes only: check": {
    code: 0,
    stdout: [
      "index not bound: EXP-7 illustrates EXP-3: no request record holds it; INV-13 serves invoice-numbers/R1: no request record holds it; INV-13 governed-by ADR-1: no request record holds it; INV-15 explains INV-13: no request record holds it; INV-16 illustrates INV-13: no request record holds it; ADR-1 decides INV-13: no request record holds it; ADR-1 source invoice-numbers/S1: no request record holds it",
      "ok: nothing found by spec-root, no-id, no-kind, unknown-kind, no-link, unknown-link, no-blank-before, no-blank-after, duplicate-id, duplicate-heading, lost-id, used-again, record-unreadable, record-evidence, unsigned-requirement, signoff-coverage, superseded-cited, superseded-status, path-claim, no-claim, promise-kind, typo-mark, near-match, adoption, design-link, no-paragraph-link, unresolved-link, replaces-link, serves-replaced, unknown-task, holder-changed, stale-base, stale-ai-hint, overlap, result, phrase, adr-changed, adr-supersede, adr-marker, adr-status, adr-number, adr-none, adr-links, adr-governs, design-doc, scope-no-file",
      "hint target-removed requests/link-expiry-spike/spec.md:5 link-expiry-spike/SP-2 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-2 requests/link-expiry-spike/spec.md:7",
      "hint target-removed requests/link-expiry-spike/spec.md:9 link-expiry-spike/SP-3 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-3 requests/link-expiry-spike/spec.md:11",
      "14 further items in force: 14 with no known scope: EXP-2, EXP-3, EXP-9, INV-2, INV-3, INV-4, INV-6, INV-8, INV-13, INV-10, INV-11, ADR-1, ADR-2, ADR-5; 0 with a scope that does not match this change: none",
      "list basis: changed by this change = the change edits the item; cited = a line that the change added or removed names the ID; scope changed in this change = the change edits its files: scope; by scope = its files: scope matches a file that the change touches; all files = its scope is files:**; proposed = this change's own signed requirements and design, not in force; the grouped line names every other item in force",
      "list limits: an item that is not shown in full may still apply, so ask which requirement or decision governs the changed behaviour; al check --full shows the text of every item, al context <ID> one item; no open request is this change's own (none of its files changed, and no commit message names one); the design field of work items is read only with --issues <folder>",
      "map: no open change of path 2 or 3 is this change's own",
      "Read      working tree · base {central:Archive portal-downloads and link-refresh:7} (merge-base with main)",
      "Next      deal with each hint, or say in the PR why it stays",
      "Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, whether a test really checks the rule it names, whether a result's declared inputs are complete, and whether a change is authorized in substance (the review judges these)",
    ],
    stderr: [],
    written: [],
  },
  "archived chain, notes only: check --strict": {
    code: 0,
    stdout: [
      "index not bound: EXP-7 illustrates EXP-3: no request record holds it; INV-13 serves invoice-numbers/R1: no request record holds it; INV-13 governed-by ADR-1: no request record holds it; INV-15 explains INV-13: no request record holds it; INV-16 illustrates INV-13: no request record holds it; ADR-1 decides INV-13: no request record holds it; ADR-1 source invoice-numbers/S1: no request record holds it",
      "ok: nothing found by spec-root, no-id, no-kind, unknown-kind, no-link, unknown-link, no-blank-before, no-blank-after, duplicate-id, duplicate-heading, lost-id, used-again, record-unreadable, record-evidence, unsigned-requirement, signoff-coverage, superseded-cited, superseded-status, path-claim, no-claim, promise-kind, typo-mark, near-match, adoption, design-link, no-paragraph-link, unresolved-link, replaces-link, serves-replaced, unknown-task, holder-changed, stale-base, stale-ai-hint, overlap, result, phrase, adr-changed, adr-supersede, adr-marker, adr-status, adr-number, adr-none, adr-links, adr-governs, design-doc, scope-no-file",
      "hint target-removed requests/link-expiry-spike/spec.md:5 link-expiry-spike/SP-2 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-2 requests/link-expiry-spike/spec.md:7",
      "hint target-removed requests/link-expiry-spike/spec.md:9 link-expiry-spike/SP-3 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-3 requests/link-expiry-spike/spec.md:11",
      "14 further items in force: 14 with no known scope: EXP-2, EXP-3, EXP-9, INV-2, INV-3, INV-4, INV-6, INV-8, INV-13, INV-10, INV-11, ADR-1, ADR-2, ADR-5; 0 with a scope that does not match this change: none",
      "list basis: changed by this change = the change edits the item; cited = a line that the change added or removed names the ID; scope changed in this change = the change edits its files: scope; by scope = its files: scope matches a file that the change touches; all files = its scope is files:**; proposed = this change's own signed requirements and design, not in force; the grouped line names every other item in force",
      "list limits: an item that is not shown in full may still apply, so ask which requirement or decision governs the changed behaviour; al check --full shows the text of every item, al context <ID> one item; no open request is this change's own (none of its files changed, and no commit message names one); the design field of work items is read only with --issues <folder>",
      "map: no open change of path 2 or 3 is this change's own",
      "Read      working tree · base {central:Archive portal-downloads and link-refresh:7} (merge-base with main)",
      "Next      deal with each hint, or say in the PR why it stays",
      "Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, whether a test really checks the rule it names, whether a result's declared inputs are complete, and whether a change is authorized in substance (the review judges these)",
    ],
    stderr: [],
    written: [],
  },
  "archived chain, a PR that concludes and archives a request: check": {
    code: 0,
    stdout: [
      "index not bound: EXP-7 illustrates EXP-3: no request record holds it; INV-13 serves invoice-numbers/R1: no request record holds it; INV-13 governed-by ADR-1: no request record holds it; INV-15 explains INV-13: no request record holds it; INV-16 illustrates INV-13: no request record holds it; ADR-1 decides INV-13: no request record holds it; ADR-1 source invoice-numbers/S1: no request record holds it",
      "ok: nothing found by spec-root, no-id, no-kind, unknown-kind, no-link, unknown-link, no-blank-before, no-blank-after, duplicate-id, duplicate-heading, lost-id, used-again, record-unreadable, record-evidence, unsigned-requirement, signoff-coverage, superseded-cited, superseded-status, path-claim, no-claim, promise-kind, typo-mark, near-match, adoption, design-link, no-paragraph-link, unresolved-link, replaces-link, serves-replaced, unknown-task, holder-changed, stale-base, stale-ai-hint, overlap, result, phrase, adr-changed, adr-supersede, adr-marker, adr-status, adr-number, adr-none, adr-links, adr-governs, design-doc, scope-no-file",
      "hint target-removed requests/archive/link-expiry-spike/spec.md:5 link-expiry-spike/SP-2 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-2 requests/archive/link-expiry-spike/spec.md:7",
      "hint target-removed requests/archive/link-expiry-spike/spec.md:9 link-expiry-spike/SP-3 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-3 requests/archive/link-expiry-spike/spec.md:11",
      "proposed link-expiry-spike/Q1 signed requirement · requests/archive/link-expiry-spike/request.md:12 · signed in S1 (only al's record .assuredloop/records/requests/link-expiry-spike.yaml holds this): A shorter link time: Can the export link expire sooner than 30 minutes without more support calls about links that no longer work?",
      "proposed link-expiry-spike/SP-2 change spec · requests/archive/link-expiry-spike/spec.md:7 · choice: Candidate A: the export link expires 10 minutes after the email is sent.",
      "proposed link-expiry-spike/SP-3 change spec · requests/archive/link-expiry-spike/spec.md:11 · choice: Candidate B: the export link expires 30 minutes after the email is sent, and a user can ask for a new link from the expired page.",
      "14 further items in force: 14 with no known scope: EXP-2, EXP-3, EXP-9, INV-2, INV-3, INV-4, INV-6, INV-8, INV-13, INV-10, INV-11, ADR-1, ADR-2, ADR-5; 0 with a scope that does not match this change: none",
      "list basis: changed by this change = the change edits the item; cited = a line that the change added or removed names the ID; scope changed in this change = the change edits its files: scope; by scope = its files: scope matches a file that the change touches; all files = its scope is files:**; proposed = this change's own signed requirements and design, not in force; the grouped line names every other item in force",
      "list limits: an item that is not shown in full may still apply, so ask which requirement or decision governs the changed behaviour; al check --full shows the text of every item, al context <ID> one item; the design field of work items is read only with --issues <folder>",
      "review note requests/archive/link-expiry-spike/review.md: none",
      "map: no open change of path 2 or 3 is this change's own",
      "map paragraph · 4 paragraphs · Moved: link-expiry-spike/SP-1 note (requests/archive/link-expiry-spike/spec.md:3), link-expiry-spike/SP-2 choice (requests/archive/link-expiry-spike/spec.md:7), link-expiry-spike/SP-3 choice (requests/archive/link-expiry-spike/spec.md:11), link-expiry-spike/SP-4 plan (requests/archive/link-expiry-spike/spec.md:16)",
      "Read      working tree · base {central:Archive portal-downloads and link-refresh:7} (merge-base with main)",
      "Next      deal with each hint, or say in the PR why it stays",
      "Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, whether a test really checks the rule it names, whether a result's declared inputs are complete, and whether a change is authorized in substance (the review judges these)",
    ],
    stderr: [],
    written: [],
  },
  "archived chain, a PR that concludes and archives a request: check --strict": {
    code: 0,
    stdout: [
      "index not bound: EXP-7 illustrates EXP-3: no request record holds it; INV-13 serves invoice-numbers/R1: no request record holds it; INV-13 governed-by ADR-1: no request record holds it; INV-15 explains INV-13: no request record holds it; INV-16 illustrates INV-13: no request record holds it; ADR-1 decides INV-13: no request record holds it; ADR-1 source invoice-numbers/S1: no request record holds it",
      "ok: nothing found by spec-root, no-id, no-kind, unknown-kind, no-link, unknown-link, no-blank-before, no-blank-after, duplicate-id, duplicate-heading, lost-id, used-again, record-unreadable, record-evidence, unsigned-requirement, signoff-coverage, superseded-cited, superseded-status, path-claim, no-claim, promise-kind, typo-mark, near-match, adoption, design-link, no-paragraph-link, unresolved-link, replaces-link, serves-replaced, unknown-task, holder-changed, stale-base, stale-ai-hint, overlap, result, phrase, adr-changed, adr-supersede, adr-marker, adr-status, adr-number, adr-none, adr-links, adr-governs, design-doc, scope-no-file",
      "hint target-removed requests/archive/link-expiry-spike/spec.md:5 link-expiry-spike/SP-2 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-2 requests/archive/link-expiry-spike/spec.md:7",
      "hint target-removed requests/archive/link-expiry-spike/spec.md:9 link-expiry-spike/SP-3 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-3 requests/archive/link-expiry-spike/spec.md:11",
      "proposed link-expiry-spike/Q1 signed requirement · requests/archive/link-expiry-spike/request.md:12 · signed in S1 (only al's record .assuredloop/records/requests/link-expiry-spike.yaml holds this): A shorter link time: Can the export link expire sooner than 30 minutes without more support calls about links that no longer work?",
      "proposed link-expiry-spike/SP-2 change spec · requests/archive/link-expiry-spike/spec.md:7 · choice: Candidate A: the export link expires 10 minutes after the email is sent.",
      "proposed link-expiry-spike/SP-3 change spec · requests/archive/link-expiry-spike/spec.md:11 · choice: Candidate B: the export link expires 30 minutes after the email is sent, and a user can ask for a new link from the expired page.",
      "14 further items in force: 14 with no known scope: EXP-2, EXP-3, EXP-9, INV-2, INV-3, INV-4, INV-6, INV-8, INV-13, INV-10, INV-11, ADR-1, ADR-2, ADR-5; 0 with a scope that does not match this change: none",
      "list basis: changed by this change = the change edits the item; cited = a line that the change added or removed names the ID; scope changed in this change = the change edits its files: scope; by scope = its files: scope matches a file that the change touches; all files = its scope is files:**; proposed = this change's own signed requirements and design, not in force; the grouped line names every other item in force",
      "list limits: an item that is not shown in full may still apply, so ask which requirement or decision governs the changed behaviour; al check --full shows the text of every item, al context <ID> one item; the design field of work items is read only with --issues <folder>",
      "review note requests/archive/link-expiry-spike/review.md: none",
      "map: no open change of path 2 or 3 is this change's own",
      "map paragraph · 4 paragraphs · Moved: link-expiry-spike/SP-1 note (requests/archive/link-expiry-spike/spec.md:3), link-expiry-spike/SP-2 choice (requests/archive/link-expiry-spike/spec.md:7), link-expiry-spike/SP-3 choice (requests/archive/link-expiry-spike/spec.md:11), link-expiry-spike/SP-4 plan (requests/archive/link-expiry-spike/spec.md:16)",
      "Read      working tree · base {central:Archive portal-downloads and link-refresh:7} (merge-base with main)",
      "Next      deal with each hint, or say in the PR why it stays",
      "Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, whether a test really checks the rule it names, whether a result's declared inputs are complete, and whether a change is authorized in substance (the review judges these)",
    ],
    stderr: [],
    written: [],
  },
  "archived chain, a binding that no marker declares: check": {
    code: 0,
    stdout: [
      "records: al check also wrote .assuredloop/records/requests/portal-downloads.yaml of requests that are not this change's own: their records were not up to date",
      "index not bound: EXP-7 illustrates EXP-3: no request record holds it; INV-13 serves invoice-numbers/R1: no request record holds it; INV-13 governed-by ADR-1: no request record holds it; INV-15 explains INV-13: no request record holds it; INV-16 illustrates INV-13: no request record holds it; ADR-1 decides INV-13: no request record holds it; ADR-1 source invoice-numbers/S1: no request record holds it",
      "index removed: EXP-9 serves portal-downloads/R1 from the record of portal-downloads: no longer declared",
      "ok: nothing found by spec-root, no-id, no-kind, unknown-kind, no-link, unknown-link, no-blank-before, no-blank-after, duplicate-id, duplicate-heading, lost-id, used-again, record-unreadable, record-evidence, unsigned-requirement, signoff-coverage, superseded-cited, superseded-status, path-claim, no-claim, promise-kind, typo-mark, near-match, adoption, design-link, no-paragraph-link, unresolved-link, replaces-link, serves-replaced, unknown-task, holder-changed, stale-base, stale-ai-hint, overlap, result, phrase, adr-changed, adr-supersede, adr-marker, adr-status, adr-number, adr-none, adr-links, adr-governs, design-doc, scope-no-file",
      "hint target-removed requests/link-expiry-spike/spec.md:5 link-expiry-spike/SP-2 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-2 requests/link-expiry-spike/spec.md:7",
      "hint target-removed requests/link-expiry-spike/spec.md:9 link-expiry-spike/SP-3 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-3 requests/link-expiry-spike/spec.md:11",
      "in force ADR-5 cited (specs/exports.md:28 removed) · specs/adr/0005-portal-login.md:5 · ADR accepted, decides EXP-9: # ADR-5: Exports are downloaded after a portal login Context: email links (ADR-4) caused support calls when they expired or were forwarded. Decision: accountants get a portal login and download exports there. There are no email links. Alternatives considered: longer links (rejected: forwarded links stay open longer); one-time tokens (ADR-4; rejected: they still expire in the inbox).",
      "13 further items in force: 13 with no known scope: EXP-2, EXP-3, EXP-9, INV-2, INV-3, INV-4, INV-6, INV-8, INV-13, INV-10, INV-11, ADR-1, ADR-2; 0 with a scope that does not match this change: none",
      "list basis: changed by this change = the change edits the item; cited = a line that the change added or removed names the ID; scope changed in this change = the change edits its files: scope; by scope = its files: scope matches a file that the change touches; all files = its scope is files:**; proposed = this change's own signed requirements and design, not in force; the grouped line names every other item in force",
      "list limits: an item that is not shown in full may still apply, so ask which requirement or decision governs the changed behaviour; al check --full shows the text of every item, al context <ID> one item; no open request is this change's own (none of its files changed, and no commit message names one); the design field of work items is read only with --issues <folder>",
      "map: no open change of path 2 or 3 is this change's own",
      "Read      working tree · base {central:Archive portal-downloads and link-refresh:7} (merge-base with main)",
      "Next      deal with each hint, or say in the PR why it stays",
      "Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, whether a test really checks the rule it names, whether a result's declared inputs are complete, and whether a change is authorized in substance (the review judges these)",
    ],
    stderr: [],
    written: [
      "M .assuredloop/records/requests/portal-downloads.yaml",
      "diff --git a/.assuredloop/records/requests/portal-downloads.yaml b/.assuredloop/records/requests/portal-downloads.yaml",
      "--- a/.assuredloop/records/requests/portal-downloads.yaml",
      "+++ b/.assuredloop/records/requests/portal-downloads.yaml",
      "@@ -69 +68,0 @@ bindings:",
      "-  - { holder: EXP-9, link: serves, target: portal-downloads/R1, holder_sha256: 905a4c4e53732a2ae1d14e2345f4222945830687de8a07277f0a4d65c849f727, target_sha256: 23dec2f35cc2244d35399d196ee5e9d1a479e9db5d004ac598c1fb3262e4279a, target_version: 1 }",
    ],
  },
  "archived chain, a binding that no marker declares: check --strict": {
    code: 0,
    stdout: [
      "records: al check also wrote .assuredloop/records/requests/portal-downloads.yaml of requests that are not this change's own: their records were not up to date",
      "index not bound: EXP-7 illustrates EXP-3: no request record holds it; INV-13 serves invoice-numbers/R1: no request record holds it; INV-13 governed-by ADR-1: no request record holds it; INV-15 explains INV-13: no request record holds it; INV-16 illustrates INV-13: no request record holds it; ADR-1 decides INV-13: no request record holds it; ADR-1 source invoice-numbers/S1: no request record holds it",
      "index removed: EXP-9 serves portal-downloads/R1 from the record of portal-downloads: no longer declared",
      "ok: nothing found by spec-root, no-id, no-kind, unknown-kind, no-link, unknown-link, no-blank-before, no-blank-after, duplicate-id, duplicate-heading, lost-id, used-again, record-unreadable, record-evidence, unsigned-requirement, signoff-coverage, superseded-cited, superseded-status, path-claim, no-claim, promise-kind, typo-mark, near-match, adoption, design-link, no-paragraph-link, unresolved-link, replaces-link, serves-replaced, unknown-task, holder-changed, stale-base, stale-ai-hint, overlap, result, phrase, adr-changed, adr-supersede, adr-marker, adr-status, adr-number, adr-none, adr-links, adr-governs, design-doc, scope-no-file",
      "hint target-removed requests/link-expiry-spike/spec.md:5 link-expiry-spike/SP-2 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-2 requests/link-expiry-spike/spec.md:7",
      "hint target-removed requests/link-expiry-spike/spec.md:9 link-expiry-spike/SP-3 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-3 requests/link-expiry-spike/spec.md:11",
      "in force ADR-5 cited (specs/exports.md:28 removed) · specs/adr/0005-portal-login.md:5 · ADR accepted, decides EXP-9: # ADR-5: Exports are downloaded after a portal login Context: email links (ADR-4) caused support calls when they expired or were forwarded. Decision: accountants get a portal login and download exports there. There are no email links. Alternatives considered: longer links (rejected: forwarded links stay open longer); one-time tokens (ADR-4; rejected: they still expire in the inbox).",
      "13 further items in force: 13 with no known scope: EXP-2, EXP-3, EXP-9, INV-2, INV-3, INV-4, INV-6, INV-8, INV-13, INV-10, INV-11, ADR-1, ADR-2; 0 with a scope that does not match this change: none",
      "list basis: changed by this change = the change edits the item; cited = a line that the change added or removed names the ID; scope changed in this change = the change edits its files: scope; by scope = its files: scope matches a file that the change touches; all files = its scope is files:**; proposed = this change's own signed requirements and design, not in force; the grouped line names every other item in force",
      "list limits: an item that is not shown in full may still apply, so ask which requirement or decision governs the changed behaviour; al check --full shows the text of every item, al context <ID> one item; no open request is this change's own (none of its files changed, and no commit message names one); the design field of work items is read only with --issues <folder>",
      "map: no open change of path 2 or 3 is this change's own",
      "Read      working tree · base {central:Archive portal-downloads and link-refresh:7} (merge-base with main)",
      "Next      deal with each hint, or say in the PR why it stays",
      "Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, whether a test really checks the rule it names, whether a result's declared inputs are complete, and whether a change is authorized in substance (the review judges these)",
    ],
    stderr: [],
    written: [
      "M .assuredloop/records/requests/portal-downloads.yaml",
      "diff --git a/.assuredloop/records/requests/portal-downloads.yaml b/.assuredloop/records/requests/portal-downloads.yaml",
      "--- a/.assuredloop/records/requests/portal-downloads.yaml",
      "+++ b/.assuredloop/records/requests/portal-downloads.yaml",
      "@@ -69 +68,0 @@ bindings:",
      "-  - { holder: EXP-9, link: serves, target: portal-downloads/R1, holder_sha256: 905a4c4e53732a2ae1d14e2345f4222945830687de8a07277f0a4d65c849f727, target_sha256: 23dec2f35cc2244d35399d196ee5e9d1a479e9db5d004ac598c1fb3262e4279a, target_version: 1 }",
    ],
  },
  "archived chain, an archived record that is not YAML: check": {
    code: 0,
    stdout: [
      "index not read: .assuredloop/records/requests/link-refresh.yaml is not a valid record: Map keys must be unique at line 49, column 1:",
      "index not bound: EXP-7 illustrates EXP-3: no request record holds it; INV-13 serves invoice-numbers/R1: no request record holds it; INV-13 governed-by ADR-1: no request record holds it; INV-15 explains INV-13: no request record holds it; INV-16 illustrates INV-13: no request record holds it; ADR-1 decides INV-13: no request record holds it; ADR-1 source invoice-numbers/S1: no request record holds it",
      "index not removed: no binding is removed in this run, as al index could not read .assuredloop/records/requests/link-refresh.yaml is not a valid record: Map keys must be unique at line 49, column 1:",
      "ok: nothing found by spec-root, no-id, no-kind, unknown-kind, no-link, unknown-link, no-blank-before, no-blank-after, duplicate-id, duplicate-heading, lost-id, used-again, signoff-coverage, superseded-cited, superseded-status, path-claim, no-claim, promise-kind, typo-mark, near-match, adoption, design-link, no-paragraph-link, unresolved-link, replaces-link, serves-replaced, unknown-task, holder-changed, stale-base, stale-ai-hint, overlap, result, phrase, adr-changed, adr-supersede, adr-marker, adr-status, adr-number, adr-none, adr-links, adr-governs",
      "hint target-removed requests/link-expiry-spike/spec.md:5 link-expiry-spike/SP-2 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-2 requests/link-expiry-spike/spec.md:7",
      "hint target-removed requests/link-expiry-spike/spec.md:9 link-expiry-spike/SP-3 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-3 requests/link-expiry-spike/spec.md:11",
      "not ok record-unreadable .assuredloop/records/requests/link-refresh.yaml link-refresh .assuredloop/records/requests/link-refresh.yaml cannot be read (Map keys must be unique at line 49, column 1:), so its requirements, sign-offs and evidence are not checked; fix it by hand",
      "list: no change selected: nothing changed against the base {central:Archive portal-downloads and link-refresh:7}",
      "map: no change selected: nothing changed against the base {central:Archive portal-downloads and link-refresh:7}",
      "Read      working tree · base {central:Archive portal-downloads and link-refresh:7} (merge-base with main)",
      "Next      fix each not ok, and deal with each hint or say in the PR why it stays",
      "Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, whether a test really checks the rule it names, whether a result's declared inputs are complete, and whether a change is authorized in substance (the review judges these)",
    ],
    stderr: [],
    written: [],
  },
  "archived chain, an archived record that is not YAML: check --strict": {
    code: 1,
    stdout: [
      "index not read: .assuredloop/records/requests/link-refresh.yaml is not a valid record: Map keys must be unique at line 49, column 1:",
      "index not bound: EXP-7 illustrates EXP-3: no request record holds it; INV-13 serves invoice-numbers/R1: no request record holds it; INV-13 governed-by ADR-1: no request record holds it; INV-15 explains INV-13: no request record holds it; INV-16 illustrates INV-13: no request record holds it; ADR-1 decides INV-13: no request record holds it; ADR-1 source invoice-numbers/S1: no request record holds it",
      "index not removed: no binding is removed in this run, as al index could not read .assuredloop/records/requests/link-refresh.yaml is not a valid record: Map keys must be unique at line 49, column 1:",
      "ok: nothing found by spec-root, no-id, no-kind, unknown-kind, no-link, unknown-link, no-blank-before, no-blank-after, duplicate-id, duplicate-heading, lost-id, used-again, signoff-coverage, superseded-cited, superseded-status, path-claim, no-claim, promise-kind, typo-mark, near-match, adoption, design-link, no-paragraph-link, unresolved-link, replaces-link, serves-replaced, unknown-task, holder-changed, stale-base, stale-ai-hint, overlap, result, phrase, adr-changed, adr-supersede, adr-marker, adr-status, adr-number, adr-none, adr-links, adr-governs",
      "hint target-removed requests/link-expiry-spike/spec.md:5 link-expiry-spike/SP-2 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-2 requests/link-expiry-spike/spec.md:7",
      "hint target-removed requests/link-expiry-spike/spec.md:9 link-expiry-spike/SP-3 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-3 requests/link-expiry-spike/spec.md:11",
      "not ok record-unreadable .assuredloop/records/requests/link-refresh.yaml link-refresh .assuredloop/records/requests/link-refresh.yaml cannot be read (Map keys must be unique at line 49, column 1:), so its requirements, sign-offs and evidence are not checked; fix it by hand",
      "list: no change selected: nothing changed against the base {central:Archive portal-downloads and link-refresh:7}",
      "map: no change selected: nothing changed against the base {central:Archive portal-downloads and link-refresh:7}",
      "Read      working tree · base {central:Archive portal-downloads and link-refresh:7} (merge-base with main)",
      "Next      fix each not ok, and deal with each hint or say in the PR why it stays",
      "Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, whether a test really checks the rule it names, whether a result's declared inputs are complete, and whether a change is authorized in substance (the review judges these)",
    ],
    stderr: [],
    written: [],
  },
  "archived chain, an open record that is not YAML: check": {
    code: 0,
    stdout: [
      "index not read: .assuredloop/records/requests/reminder-emails.yaml is not a valid record: Map keys must be unique at line 40, column 1:",
      "index not bound: reminder-emails/SP-2 serves reminder-emails/R1: no request record holds it; reminder-emails/SP-2 changes INV-11: no request record holds it; reminder-emails/SP-3 serves reminder-emails/R1: no request record holds it; reminder-emails/SP-3 builds-on INV-6: no request record holds it; reminder-emails/SP-4 serves reminder-emails/R1: no request record holds it; reminder-emails/SP-4 builds-on INV-10: no request record holds it; reminder-emails/SP-4 builds-on reminder-emails/SP-2: no request record holds it; EXP-7 illustrates EXP-3: no request record holds it; INV-13 serves invoice-numbers/R1: no request record holds it; INV-13 governed-by ADR-1: no request record holds it; INV-15 explains INV-13: no request record holds it; INV-16 illustrates INV-13: no request record holds it; INV-12 resolved-by reminder-emails/D1: no request record holds it; ADR-1 decides INV-13: no request record holds it; ADR-1 source invoice-numbers/S1: no request record holds it",
      "index not removed: no binding is removed in this run, as al index could not read .assuredloop/records/requests/reminder-emails.yaml is not a valid record: Map keys must be unique at line 40, column 1:",
      "ok: nothing found by spec-root, no-id, no-kind, unknown-kind, no-link, unknown-link, no-blank-before, no-blank-after, duplicate-id, duplicate-heading, lost-id, used-again, signoff-coverage, superseded-cited, superseded-status, path-claim, no-claim, promise-kind, typo-mark, near-match, adoption, design-link, no-paragraph-link, replaces-link, serves-replaced, unknown-task, holder-changed, stale-base, stale-ai-hint, overlap, result, phrase, adr-changed, adr-supersede, adr-marker, adr-status, adr-number, adr-none, adr-links, adr-governs",
      "hint unresolved-link specs/invoices.md:62 INV-12 reminder-emails/D1: no such ID · places: INV-12 specs/invoices.md:64, reminder-emails/D1 requests/reminder-emails/request.md:21",
      "hint target-removed requests/link-expiry-spike/spec.md:5 link-expiry-spike/SP-2 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-2 requests/link-expiry-spike/spec.md:7",
      "hint target-removed requests/link-expiry-spike/spec.md:9 link-expiry-spike/SP-3 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-3 requests/link-expiry-spike/spec.md:11",
      "not ok record-unreadable .assuredloop/records/requests/reminder-emails.yaml reminder-emails .assuredloop/records/requests/reminder-emails.yaml cannot be read (Map keys must be unique at line 40, column 1:), so its requirements, sign-offs and evidence are not checked; fix it by hand",
      "list: no change selected: nothing changed against the base {central:Archive portal-downloads and link-refresh:7}",
      "map: no change selected: nothing changed against the base {central:Archive portal-downloads and link-refresh:7}",
      "Read      working tree · base {central:Archive portal-downloads and link-refresh:7} (merge-base with main)",
      "Next      fix each not ok, and deal with each hint or say in the PR why it stays",
      "Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, whether a test really checks the rule it names, whether a result's declared inputs are complete, and whether a change is authorized in substance (the review judges these)",
    ],
    stderr: [],
    written: [],
  },
  "archived chain, an open record that is not YAML: check --strict": {
    code: 1,
    stdout: [
      "index not read: .assuredloop/records/requests/reminder-emails.yaml is not a valid record: Map keys must be unique at line 40, column 1:",
      "index not bound: reminder-emails/SP-2 serves reminder-emails/R1: no request record holds it; reminder-emails/SP-2 changes INV-11: no request record holds it; reminder-emails/SP-3 serves reminder-emails/R1: no request record holds it; reminder-emails/SP-3 builds-on INV-6: no request record holds it; reminder-emails/SP-4 serves reminder-emails/R1: no request record holds it; reminder-emails/SP-4 builds-on INV-10: no request record holds it; reminder-emails/SP-4 builds-on reminder-emails/SP-2: no request record holds it; EXP-7 illustrates EXP-3: no request record holds it; INV-13 serves invoice-numbers/R1: no request record holds it; INV-13 governed-by ADR-1: no request record holds it; INV-15 explains INV-13: no request record holds it; INV-16 illustrates INV-13: no request record holds it; INV-12 resolved-by reminder-emails/D1: no request record holds it; ADR-1 decides INV-13: no request record holds it; ADR-1 source invoice-numbers/S1: no request record holds it",
      "index not removed: no binding is removed in this run, as al index could not read .assuredloop/records/requests/reminder-emails.yaml is not a valid record: Map keys must be unique at line 40, column 1:",
      "ok: nothing found by spec-root, no-id, no-kind, unknown-kind, no-link, unknown-link, no-blank-before, no-blank-after, duplicate-id, duplicate-heading, lost-id, used-again, signoff-coverage, superseded-cited, superseded-status, path-claim, no-claim, promise-kind, typo-mark, near-match, adoption, design-link, no-paragraph-link, replaces-link, serves-replaced, unknown-task, holder-changed, stale-base, stale-ai-hint, overlap, result, phrase, adr-changed, adr-supersede, adr-marker, adr-status, adr-number, adr-none, adr-links, adr-governs",
      "hint unresolved-link specs/invoices.md:62 INV-12 reminder-emails/D1: no such ID · places: INV-12 specs/invoices.md:64, reminder-emails/D1 requests/reminder-emails/request.md:21",
      "hint target-removed requests/link-expiry-spike/spec.md:5 link-expiry-spike/SP-2 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-2 requests/link-expiry-spike/spec.md:7",
      "hint target-removed requests/link-expiry-spike/spec.md:9 link-expiry-spike/SP-3 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-3 requests/link-expiry-spike/spec.md:11",
      "not ok record-unreadable .assuredloop/records/requests/reminder-emails.yaml reminder-emails .assuredloop/records/requests/reminder-emails.yaml cannot be read (Map keys must be unique at line 40, column 1:), so its requirements, sign-offs and evidence are not checked; fix it by hand",
      "list: no change selected: nothing changed against the base {central:Archive portal-downloads and link-refresh:7}",
      "map: no change selected: nothing changed against the base {central:Archive portal-downloads and link-refresh:7}",
      "Read      working tree · base {central:Archive portal-downloads and link-refresh:7} (merge-base with main)",
      "Next      fix each not ok, and deal with each hint or say in the PR why it stays",
      "Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, whether a test really checks the rule it names, whether a result's declared inputs are complete, and whether a change is authorized in substance (the review judges these)",
    ],
    stderr: [],
    written: [],
  },
  "cross-repo world with output repos: check": {
    code: 0,
    stdout: [
      "records: al check wrote .assuredloop/records/requests/invoice-exports.yaml; commit them with this change",
      "index bound: invoicer-web/src/export-link.js implements central:EXP-4; invoicer-web/test/export-link.test.js verifies central:EXP-4; invoicer-worker/src/zip-export.js implements central:invoice-exports/R3; docs/exports.md documents EXP-4",
      "index not bound: EXP-7 illustrates EXP-3: no request record holds it; EXP-5 explains EXP-4: no request record holds it; INV-13 serves invoice-numbers/R1: no request record holds it; INV-13 governed-by ADR-1: no request record holds it; INV-15 explains INV-13: no request record holds it; INV-16 illustrates INV-13: no request record holds it; ADR-1 decides INV-13: no request record holds it; ADR-1 source invoice-numbers/S1: no request record holds it; invoicer-web/docs/missing.md documents central:EXP-4: output file not found",
      "index unknown: invoicer-mobile/src/link.swift implements central:EXP-4: no clone at ../invoicer-mobile; invoicer-desktop/src/app.js implements central:EXP-4: not an output repo in config",
      "ok: nothing found by spec-root, no-id, no-kind, unknown-kind, no-link, unknown-link, no-blank-before, no-blank-after, duplicate-id, duplicate-heading, lost-id, used-again, record-unreadable, record-evidence, unsigned-requirement, signoff-coverage, superseded-cited, superseded-status, path-claim, no-claim, promise-kind, typo-mark, near-match, adoption, design-link, no-paragraph-link, unresolved-link, replaces-link, serves-replaced, unknown-task, target-removed, holder-changed, stale-base, stale-ai-hint, overlap, result, phrase, adr-changed, adr-supersede, adr-marker, adr-status, adr-number, adr-none, adr-links, adr-governs, design-doc, scope-no-file, map-unnamed",
      "info output-repo invoicer-mobile - unknown: no clone at ../invoicer-mobile",
      "info result invoicer-web/.assuredloop/results/export-link-test.yaml test/export-link.test.js pass at invoicer-web@{web:Move the link time into config/link.json (W3):7}: declared inputs unchanged since invoicer-web@{web:Move the link time into config/link.json (W3):7}",
      "info result invoicer-worker/.assuredloop/results/a-no-inputs.yaml test/zip-export.test.js not run at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: applicability unknown: no declared inputs",
      "info result invoicer-worker/.assuredloop/results/b-unknown-no-inputs.yaml test/zip-export.test.js pass at invoicer-worker@unknown: applicability unknown: no declared inputs",
      "info result invoicer-worker/.assuredloop/results/c-unknown.yaml test/zip-export.test.js pass at invoicer-worker@unknown: applicability unknown: the commit is unknown",
      "info result invoicer-worker/.assuredloop/results/d-k7.yaml test/zip-export.test.js pass at invoicer-worker@deadbee: applicability unknown: commit deadbeefdeadbeefdeadbeefdeadbeefdeadbeef is not in the invoicer-worker clone",
      "info result invoicer-worker/.assuredloop/results/e-gone.yaml test/zip-export.test.js fail at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: applicability unknown: the declared input src/old-zip.js is not there",
      "info result invoicer-worker/.assuredloop/results/f-changed.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: does not apply to the current text: src/zip-export.js changed",
      "info result invoicer-worker/.assuredloop/results/g-unchanged.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: declared inputs unchanged since invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}",
      "info result invoicer-worker/.assuredloop/results/h-short.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: declared inputs unchanged since invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}",
      "hint map-consolidation requests/invoice-exports/spec.md invoice-exports 8 change paragraphs that go into specs/ have no current consolidation judgement: SP-4, SP-5, SP-6, SP-7, SP-9, SP-10, SP-11, SP-12; judge each consolidation in requests/invoice-exports/review.md · places: invoice-exports/SP-4 requests/invoice-exports/spec.md:17, invoice-exports/SP-5 requests/invoice-exports/spec.md:21, invoice-exports/SP-6 requests/invoice-exports/spec.md:26, invoice-exports/SP-7 requests/invoice-exports/spec.md:30, invoice-exports/SP-9 requests/invoice-exports/spec.md:38, invoice-exports/SP-10 requests/invoice-exports/spec.md:43, invoice-exports/SP-11 requests/invoice-exports/spec.md:48, invoice-exports/SP-12 requests/invoice-exports/spec.md:53",
      "in force EXP-4 cited (docs/exports.md:3) · specs/exports.md:30 · rule: The export link MUST expire 30 minutes after the email is sent.",
      "proposed invoice-exports/R1 signed requirement · requests/invoice-exports/request.md:12 · signed in S1 (only al's record .assuredloop/records/requests/invoice-exports.yaml holds this): Monthly CSV download: A user MUST be able to download the invoices of one month as one CSV file.",
      "proposed invoice-exports/R2 signed requirement · requests/invoice-exports/request.md:17 · signed in S1 (only al's record .assuredloop/records/requests/invoice-exports.yaml holds this): An email link that expires: The download link sent by email MUST stop working after a short time.",
      "proposed invoice-exports/R3 signed requirement · requests/invoice-exports/request.md:22 · signed in S1 (only al's record .assuredloop/records/requests/invoice-exports.yaml holds this): A yearly ZIP: A user MUST be able to download the invoices of one year as one ZIP file.",
      "proposed invoice-exports/R4 signed requirement · requests/invoice-exports/request.md:27 · signed in S1 (only al's record .assuredloop/records/requests/invoice-exports.yaml holds this): ISO dates in every export: Every date in every export MUST be an ISO 8601 date.",
      "proposed invoice-exports/SP-4 change spec · requests/invoice-exports/spec.md:17 · rule: A user MUST be able to download the invoices of one month as one CSV file.",
      "proposed invoice-exports/SP-5 change spec · requests/invoice-exports/spec.md:21 · rule: Every date in an export MUST be written as an ISO 8601 calendar date (YYYY-MM-DD).",
      "proposed invoice-exports/SP-6 change spec · requests/invoice-exports/spec.md:26 · rule: The export link MUST expire 30 minutes after the email is sent.",
      "proposed invoice-exports/SP-7 change spec · requests/invoice-exports/spec.md:30 · rule: A user MUST be able to download the invoices of one year as one ZIP file.",
      "proposed invoice-exports/SP-9 change spec · requests/invoice-exports/spec.md:38 · component: The link service issues a one-time token for each export and stores the time at which the token expires.",
      "proposed invoice-exports/SP-10 change spec · requests/invoice-exports/spec.md:43 · data: A yearly ZIP holds twelve monthly CSV files named YYYY-MM.csv, each in the format of a monthly export.",
      "proposed invoice-exports/SP-11 change spec · requests/invoice-exports/spec.md:48 · interface: The worker serves `GET /exports/{year}.zip` and answers 404 for a year with no invoices.",
      "14 further items in force: 14 with no known scope: EXP-2, EXP-3, EXP-6, INV-2, INV-3, INV-4, INV-6, INV-8, INV-13, INV-10, INV-11, ADR-1, ADR-2, ADR-4; 0 with a scope that does not match this change: none",
      "list basis: changed by this change = the change edits the item; cited = a line that the change added or removed names the ID; scope changed in this change = the change edits its files: scope; by scope = its files: scope matches a file that the change touches; all files = its scope is files:**; proposed = this change's own signed requirements and design, not in force; the grouped line names every other item in force",
      "list limits: an item that is not shown in full may still apply, so ask which requirement or decision governs the changed behaviour; al check --full shows the text of every item, al context <ID> one item; the design field of work items is read only with --issues <folder>",
      "review note requests/invoice-exports/review.md: none",
      "map: the change against its base {central:The invoicer world:7} (own changes: invoice-exports), from facts only",
      "map consolidation · 8 change paragraphs · none: invoice-exports/SP-4 (requests/invoice-exports/spec.md:17), invoice-exports/SP-5 (requests/invoice-exports/spec.md:21), invoice-exports/SP-6 (requests/invoice-exports/spec.md:26), invoice-exports/SP-7 (requests/invoice-exports/spec.md:30), invoice-exports/SP-9 (requests/invoice-exports/spec.md:38), invoice-exports/SP-10 (requests/invoice-exports/spec.md:43), invoice-exports/SP-11 (requests/invoice-exports/spec.md:48), invoice-exports/SP-12 (requests/invoice-exports/spec.md:53)",
      "Read      working tree · base {central:The invoicer world:7} (merge-base with main)",
      "Next      deal with each hint, or say in the PR why it stays",
      "Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, whether a test really checks the rule it names, whether a result's declared inputs are complete, and whether a change is authorized in substance (the review judges these)",
    ],
    stderr: [],
    written: [
      "M .assuredloop/records/requests/invoice-exports.yaml",
      "diff --git a/.assuredloop/records/requests/invoice-exports.yaml b/.assuredloop/records/requests/invoice-exports.yaml",
      "--- a/.assuredloop/records/requests/invoice-exports.yaml",
      "+++ b/.assuredloop/records/requests/invoice-exports.yaml",
      "@@ -245,0 +246,4 @@ bindings:",
      "+  - { holder: invoicer-web/src/export-link.js, link: implements, target: central:EXP-4, holder_sha256: afefcc8c71230eaa41b06146d06f4b1a71ec85f045e4e9cee4e309b94b06bacd, target_sha256: f426664deb96240871f88ee4ab9349aac9d07081550c3f89ffc8a3f87681d52a, commit: invoicer-web@{web:Tidy the link docs (#570)} }",
      "+  - { holder: invoicer-web/test/export-link.test.js, link: verifies, target: central:EXP-4, holder_sha256: 914760667f9eec5bd8a4d6c5e085623305ccecf764e81e61582eb756dde8075a, target_sha256: f426664deb96240871f88ee4ab9349aac9d07081550c3f89ffc8a3f87681d52a, commit: invoicer-web@{web:Tidy the link docs (#570)} }",
      "+  - { holder: invoicer-worker/src/zip-export.js, link: implements, target: central:invoice-exports/R3, holder_sha256: 6bcf8459b5b9b74f332efd5dd3e57bb02d06148e97fab45eecdf1a29bc885339, target_sha256: c42bb63a555b55f6351909598d0e3ea2ceccac2222b91a8ad68bcb7402e54442, target_version: 1, commit: invoicer-worker@{worker:Merge pull request #12 from invoicer/zip-names} }",
      "+  - { holder: docs/exports.md, link: documents, target: EXP-4, holder_sha256: c57c32bd117bfb05b0770ece5c1b0618ad09a619015572c4be372a52293550de, target_sha256: f426664deb96240871f88ee4ab9349aac9d07081550c3f89ffc8a3f87681d52a }",
    ],
  },
  "cross-repo world with output repos: check --strict": {
    code: 0,
    stdout: [
      "records: al check wrote .assuredloop/records/requests/invoice-exports.yaml; commit them with this change",
      "index bound: invoicer-web/src/export-link.js implements central:EXP-4; invoicer-web/test/export-link.test.js verifies central:EXP-4; invoicer-worker/src/zip-export.js implements central:invoice-exports/R3; docs/exports.md documents EXP-4",
      "index not bound: EXP-7 illustrates EXP-3: no request record holds it; EXP-5 explains EXP-4: no request record holds it; INV-13 serves invoice-numbers/R1: no request record holds it; INV-13 governed-by ADR-1: no request record holds it; INV-15 explains INV-13: no request record holds it; INV-16 illustrates INV-13: no request record holds it; ADR-1 decides INV-13: no request record holds it; ADR-1 source invoice-numbers/S1: no request record holds it; invoicer-web/docs/missing.md documents central:EXP-4: output file not found",
      "index unknown: invoicer-mobile/src/link.swift implements central:EXP-4: no clone at ../invoicer-mobile; invoicer-desktop/src/app.js implements central:EXP-4: not an output repo in config",
      "ok: nothing found by spec-root, no-id, no-kind, unknown-kind, no-link, unknown-link, no-blank-before, no-blank-after, duplicate-id, duplicate-heading, lost-id, used-again, record-unreadable, record-evidence, unsigned-requirement, signoff-coverage, superseded-cited, superseded-status, path-claim, no-claim, promise-kind, typo-mark, near-match, adoption, design-link, no-paragraph-link, unresolved-link, replaces-link, serves-replaced, unknown-task, target-removed, holder-changed, stale-base, stale-ai-hint, overlap, result, phrase, adr-changed, adr-supersede, adr-marker, adr-status, adr-number, adr-none, adr-links, adr-governs, design-doc, scope-no-file, map-unnamed",
      "info output-repo invoicer-mobile - unknown: no clone at ../invoicer-mobile",
      "info result invoicer-web/.assuredloop/results/export-link-test.yaml test/export-link.test.js pass at invoicer-web@{web:Move the link time into config/link.json (W3):7}: declared inputs unchanged since invoicer-web@{web:Move the link time into config/link.json (W3):7}",
      "info result invoicer-worker/.assuredloop/results/a-no-inputs.yaml test/zip-export.test.js not run at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: applicability unknown: no declared inputs",
      "info result invoicer-worker/.assuredloop/results/b-unknown-no-inputs.yaml test/zip-export.test.js pass at invoicer-worker@unknown: applicability unknown: no declared inputs",
      "info result invoicer-worker/.assuredloop/results/c-unknown.yaml test/zip-export.test.js pass at invoicer-worker@unknown: applicability unknown: the commit is unknown",
      "info result invoicer-worker/.assuredloop/results/d-k7.yaml test/zip-export.test.js pass at invoicer-worker@deadbee: applicability unknown: commit deadbeefdeadbeefdeadbeefdeadbeefdeadbeef is not in the invoicer-worker clone",
      "info result invoicer-worker/.assuredloop/results/e-gone.yaml test/zip-export.test.js fail at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: applicability unknown: the declared input src/old-zip.js is not there",
      "info result invoicer-worker/.assuredloop/results/f-changed.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: does not apply to the current text: src/zip-export.js changed",
      "info result invoicer-worker/.assuredloop/results/g-unchanged.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: declared inputs unchanged since invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}",
      "info result invoicer-worker/.assuredloop/results/h-short.yaml test/zip-export.test.js pass at invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}: declared inputs unchanged since invoicer-worker@{worker:Reminder job: 7 days after the due date (central:INV-11):7}",
      "hint map-consolidation requests/invoice-exports/spec.md invoice-exports 8 change paragraphs that go into specs/ have no current consolidation judgement: SP-4, SP-5, SP-6, SP-7, SP-9, SP-10, SP-11, SP-12; judge each consolidation in requests/invoice-exports/review.md · places: invoice-exports/SP-4 requests/invoice-exports/spec.md:17, invoice-exports/SP-5 requests/invoice-exports/spec.md:21, invoice-exports/SP-6 requests/invoice-exports/spec.md:26, invoice-exports/SP-7 requests/invoice-exports/spec.md:30, invoice-exports/SP-9 requests/invoice-exports/spec.md:38, invoice-exports/SP-10 requests/invoice-exports/spec.md:43, invoice-exports/SP-11 requests/invoice-exports/spec.md:48, invoice-exports/SP-12 requests/invoice-exports/spec.md:53",
      "in force EXP-4 cited (docs/exports.md:3) · specs/exports.md:30 · rule: The export link MUST expire 30 minutes after the email is sent.",
      "proposed invoice-exports/R1 signed requirement · requests/invoice-exports/request.md:12 · signed in S1 (only al's record .assuredloop/records/requests/invoice-exports.yaml holds this): Monthly CSV download: A user MUST be able to download the invoices of one month as one CSV file.",
      "proposed invoice-exports/R2 signed requirement · requests/invoice-exports/request.md:17 · signed in S1 (only al's record .assuredloop/records/requests/invoice-exports.yaml holds this): An email link that expires: The download link sent by email MUST stop working after a short time.",
      "proposed invoice-exports/R3 signed requirement · requests/invoice-exports/request.md:22 · signed in S1 (only al's record .assuredloop/records/requests/invoice-exports.yaml holds this): A yearly ZIP: A user MUST be able to download the invoices of one year as one ZIP file.",
      "proposed invoice-exports/R4 signed requirement · requests/invoice-exports/request.md:27 · signed in S1 (only al's record .assuredloop/records/requests/invoice-exports.yaml holds this): ISO dates in every export: Every date in every export MUST be an ISO 8601 date.",
      "proposed invoice-exports/SP-4 change spec · requests/invoice-exports/spec.md:17 · rule: A user MUST be able to download the invoices of one month as one CSV file.",
      "proposed invoice-exports/SP-5 change spec · requests/invoice-exports/spec.md:21 · rule: Every date in an export MUST be written as an ISO 8601 calendar date (YYYY-MM-DD).",
      "proposed invoice-exports/SP-6 change spec · requests/invoice-exports/spec.md:26 · rule: The export link MUST expire 30 minutes after the email is sent.",
      "proposed invoice-exports/SP-7 change spec · requests/invoice-exports/spec.md:30 · rule: A user MUST be able to download the invoices of one year as one ZIP file.",
      "proposed invoice-exports/SP-9 change spec · requests/invoice-exports/spec.md:38 · component: The link service issues a one-time token for each export and stores the time at which the token expires.",
      "proposed invoice-exports/SP-10 change spec · requests/invoice-exports/spec.md:43 · data: A yearly ZIP holds twelve monthly CSV files named YYYY-MM.csv, each in the format of a monthly export.",
      "proposed invoice-exports/SP-11 change spec · requests/invoice-exports/spec.md:48 · interface: The worker serves `GET /exports/{year}.zip` and answers 404 for a year with no invoices.",
      "14 further items in force: 14 with no known scope: EXP-2, EXP-3, EXP-6, INV-2, INV-3, INV-4, INV-6, INV-8, INV-13, INV-10, INV-11, ADR-1, ADR-2, ADR-4; 0 with a scope that does not match this change: none",
      "list basis: changed by this change = the change edits the item; cited = a line that the change added or removed names the ID; scope changed in this change = the change edits its files: scope; by scope = its files: scope matches a file that the change touches; all files = its scope is files:**; proposed = this change's own signed requirements and design, not in force; the grouped line names every other item in force",
      "list limits: an item that is not shown in full may still apply, so ask which requirement or decision governs the changed behaviour; al check --full shows the text of every item, al context <ID> one item; the design field of work items is read only with --issues <folder>",
      "review note requests/invoice-exports/review.md: none",
      "map: the change against its base {central:The invoicer world:7} (own changes: invoice-exports), from facts only",
      "map consolidation · 8 change paragraphs · none: invoice-exports/SP-4 (requests/invoice-exports/spec.md:17), invoice-exports/SP-5 (requests/invoice-exports/spec.md:21), invoice-exports/SP-6 (requests/invoice-exports/spec.md:26), invoice-exports/SP-7 (requests/invoice-exports/spec.md:30), invoice-exports/SP-9 (requests/invoice-exports/spec.md:38), invoice-exports/SP-10 (requests/invoice-exports/spec.md:43), invoice-exports/SP-11 (requests/invoice-exports/spec.md:48), invoice-exports/SP-12 (requests/invoice-exports/spec.md:53)",
      "Read      working tree · base {central:The invoicer world:7} (merge-base with main)",
      "Next      deal with each hint, or say in the PR why it stays",
      "Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, whether a test really checks the rule it names, whether a result's declared inputs are complete, and whether a change is authorized in substance (the review judges these)",
    ],
    stderr: [],
    written: [
      "M .assuredloop/records/requests/invoice-exports.yaml",
      "diff --git a/.assuredloop/records/requests/invoice-exports.yaml b/.assuredloop/records/requests/invoice-exports.yaml",
      "--- a/.assuredloop/records/requests/invoice-exports.yaml",
      "+++ b/.assuredloop/records/requests/invoice-exports.yaml",
      "@@ -245,0 +246,4 @@ bindings:",
      "+  - { holder: invoicer-web/src/export-link.js, link: implements, target: central:EXP-4, holder_sha256: afefcc8c71230eaa41b06146d06f4b1a71ec85f045e4e9cee4e309b94b06bacd, target_sha256: f426664deb96240871f88ee4ab9349aac9d07081550c3f89ffc8a3f87681d52a, commit: invoicer-web@{web:Tidy the link docs (#570)} }",
      "+  - { holder: invoicer-web/test/export-link.test.js, link: verifies, target: central:EXP-4, holder_sha256: 914760667f9eec5bd8a4d6c5e085623305ccecf764e81e61582eb756dde8075a, target_sha256: f426664deb96240871f88ee4ab9349aac9d07081550c3f89ffc8a3f87681d52a, commit: invoicer-web@{web:Tidy the link docs (#570)} }",
      "+  - { holder: invoicer-worker/src/zip-export.js, link: implements, target: central:invoice-exports/R3, holder_sha256: 6bcf8459b5b9b74f332efd5dd3e57bb02d06148e97fab45eecdf1a29bc885339, target_sha256: c42bb63a555b55f6351909598d0e3ea2ceccac2222b91a8ad68bcb7402e54442, target_version: 1, commit: invoicer-worker@{worker:Merge pull request #12 from invoicer/zip-names} }",
      "+  - { holder: docs/exports.md, link: documents, target: EXP-4, holder_sha256: c57c32bd117bfb05b0770ece5c1b0618ad09a619015572c4be372a52293550de, target_sha256: f426664deb96240871f88ee4ab9349aac9d07081550c3f89ffc8a3f87681d52a }",
    ],
  },
};

// The run, as main gives it.
function asPinned(dir, repos, extra, r) {
  const n = (text) => named(text, repos, { [dir]: '<dir>', ...extra });
  const lines = (text) => (text === '' ? [] : n(text).replace(/\n$/, '').split('\n'));
  return { code: r.code, stdout: lines(r.stdout), stderr: lines(r.stderr), written: written(dir).map(n) };
}

describe('al check and al check --strict print and write what main prints and writes', () => {
  for (const [name, build] of Object.entries(CASES)) {
    test(name, (t) => {
      const { dir, repos = { central: dir }, extra = {} } = build(t);
      for (const args of RUNS) {
        reset(dir);
        const r = al(dir, args);
        assert.equal(r.signal, null, show(r));
        const key = `${name}: ${args.join(' ')}`;
        const got = asPinned(dir, repos, extra, r);
        assert.ok(PINNED[key], `an expected output for ${key}`);
        assert.deepEqual(got, PINNED[key], show(r));
      }
    });
  }
});

// --- 1b. A request record whose YAML makes the yaml library warn (review of
// #101). al's own output (stdout, the exit code and the written files) stays
// what main gives, byte for byte. The yaml warning of the record shows on
// stderr at least once, not once for each parse: main parsed a record several
// times and gave its warning each time. A warning line of Node holds the
// process ID, so stderr is not compared byte for byte. Instead, the warning
// lines, with the process ID left out, must be the same set as main gave.

// An archived request `old` whose record has a tag that yaml does not know.
const warnsArchived = (dir) => {
  write(dir, 'requests/archive/old/request.md', '# Old\nStatus: concluded\n');
  write(dir, `${RECORDS}old.yaml`, 'schema: assuredloop/1\nrequest: old\nstatus: concluded\ncustom: !archived value\n');
};
// The open record of reminder-emails with a tag that yaml does not know.
const warnsOpen = (dir) => {
  const rel = `${RECORDS}reminder-emails.yaml`;
  write(dir, rel, `${read(dir, rel)}custom: !open value\n`);
};
const emptyCommit = (dir) => git(dir, 'commit', '-q', '--allow-empty', '-m', 'Nothing\n\nTier: 0 — notes only');

const WARN_CASES = {
  'a record that warns: an archived one': { build: (t) => archivedChain(t, emptyCommit, warnsArchived), tag: '!archived' },
  'a record that warns: an open one': { build: (t) => archivedChain(t, emptyCommit, warnsOpen), tag: '!open' },
};

// The distinct warning lines of Node on stderr, with the process ID left out.
const NODE_WARNING = /^\(node:\d+\) /;
const warningsOf = (stderr) => [...new Set(stderr.split('\n').filter((l) => NODE_WARNING.test(l)).map((l) => l.replace(NODE_WARNING, '(node:<pid>) ')))].sort();
const timesIn = (stderr, line) => stderr.split('\n').filter((l) => l.replace(NODE_WARNING, '(node:<pid>) ') === line).length;

// The output of each run on main before the change: the exit code, the lines
// of stdout, the distinct warning lines of stderr, and what the run wrote.
const PINNED_WARN = {
  "a record that warns: an archived one: check": {
    code: 0,
    stdout: [
      "index not bound: EXP-7 illustrates EXP-3: no request record holds it; INV-13 serves invoice-numbers/R1: no request record holds it; INV-13 governed-by ADR-1: no request record holds it; INV-15 explains INV-13: no request record holds it; INV-16 illustrates INV-13: no request record holds it; ADR-1 decides INV-13: no request record holds it; ADR-1 source invoice-numbers/S1: no request record holds it",
      "ok: nothing found by spec-root, no-id, no-kind, unknown-kind, no-link, unknown-link, no-blank-before, no-blank-after, duplicate-id, duplicate-heading, lost-id, used-again, record-unreadable, record-evidence, unsigned-requirement, signoff-coverage, superseded-cited, superseded-status, path-claim, no-claim, promise-kind, typo-mark, near-match, adoption, design-link, no-paragraph-link, unresolved-link, replaces-link, serves-replaced, unknown-task, holder-changed, stale-base, stale-ai-hint, overlap, result, phrase, adr-changed, adr-supersede, adr-marker, adr-status, adr-number, adr-none, adr-links, adr-governs",
      "hint target-removed requests/link-expiry-spike/spec.md:5 link-expiry-spike/SP-2 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-2 requests/link-expiry-spike/spec.md:7",
      "hint target-removed requests/link-expiry-spike/spec.md:9 link-expiry-spike/SP-3 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-3 requests/link-expiry-spike/spec.md:11",
      "list: no change selected: nothing changed against the base {central:Archive portal-downloads and link-refresh:7}",
      "map: no change selected: nothing changed against the base {central:Archive portal-downloads and link-refresh:7}",
      "Read      working tree · base {central:Archive portal-downloads and link-refresh:7} (merge-base with main)",
      "Next      deal with each hint, or say in the PR why it stays",
      "Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, whether a test really checks the rule it names, whether a result's declared inputs are complete, and whether a change is authorized in substance (the review judges these)",
    ],
    written: [],
    warnings: [
      "(node:<pid>) [TAG_RESOLVE_FAILED] YAMLWarning: Unresolved tag: !archived at line 4, column 9:",
    ],
  },
  "a record that warns: an archived one: check --strict": {
    code: 0,
    stdout: [
      "index not bound: EXP-7 illustrates EXP-3: no request record holds it; INV-13 serves invoice-numbers/R1: no request record holds it; INV-13 governed-by ADR-1: no request record holds it; INV-15 explains INV-13: no request record holds it; INV-16 illustrates INV-13: no request record holds it; ADR-1 decides INV-13: no request record holds it; ADR-1 source invoice-numbers/S1: no request record holds it",
      "ok: nothing found by spec-root, no-id, no-kind, unknown-kind, no-link, unknown-link, no-blank-before, no-blank-after, duplicate-id, duplicate-heading, lost-id, used-again, record-unreadable, record-evidence, unsigned-requirement, signoff-coverage, superseded-cited, superseded-status, path-claim, no-claim, promise-kind, typo-mark, near-match, adoption, design-link, no-paragraph-link, unresolved-link, replaces-link, serves-replaced, unknown-task, holder-changed, stale-base, stale-ai-hint, overlap, result, phrase, adr-changed, adr-supersede, adr-marker, adr-status, adr-number, adr-none, adr-links, adr-governs",
      "hint target-removed requests/link-expiry-spike/spec.md:5 link-expiry-spike/SP-2 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-2 requests/link-expiry-spike/spec.md:7",
      "hint target-removed requests/link-expiry-spike/spec.md:9 link-expiry-spike/SP-3 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-3 requests/link-expiry-spike/spec.md:11",
      "list: no change selected: nothing changed against the base {central:Archive portal-downloads and link-refresh:7}",
      "map: no change selected: nothing changed against the base {central:Archive portal-downloads and link-refresh:7}",
      "Read      working tree · base {central:Archive portal-downloads and link-refresh:7} (merge-base with main)",
      "Next      deal with each hint, or say in the PR why it stays",
      "Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, whether a test really checks the rule it names, whether a result's declared inputs are complete, and whether a change is authorized in substance (the review judges these)",
    ],
    written: [],
    warnings: [
      "(node:<pid>) [TAG_RESOLVE_FAILED] YAMLWarning: Unresolved tag: !archived at line 4, column 9:",
    ],
  },
  "a record that warns: an open one: check": {
    code: 0,
    stdout: [
      "index not bound: EXP-7 illustrates EXP-3: no request record holds it; INV-13 serves invoice-numbers/R1: no request record holds it; INV-13 governed-by ADR-1: no request record holds it; INV-15 explains INV-13: no request record holds it; INV-16 illustrates INV-13: no request record holds it; ADR-1 decides INV-13: no request record holds it; ADR-1 source invoice-numbers/S1: no request record holds it",
      "ok: nothing found by spec-root, no-id, no-kind, unknown-kind, no-link, unknown-link, no-blank-before, no-blank-after, duplicate-id, duplicate-heading, lost-id, used-again, record-unreadable, record-evidence, unsigned-requirement, signoff-coverage, superseded-cited, superseded-status, path-claim, no-claim, promise-kind, typo-mark, near-match, adoption, design-link, no-paragraph-link, unresolved-link, replaces-link, serves-replaced, unknown-task, holder-changed, stale-base, stale-ai-hint, overlap, result, phrase, adr-changed, adr-supersede, adr-marker, adr-status, adr-number, adr-none, adr-links, adr-governs",
      "hint target-removed requests/link-expiry-spike/spec.md:5 link-expiry-spike/SP-2 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-2 requests/link-expiry-spike/spec.md:7",
      "hint target-removed requests/link-expiry-spike/spec.md:9 link-expiry-spike/SP-3 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-3 requests/link-expiry-spike/spec.md:11",
      "list: no change selected: nothing changed against the base {central:Archive portal-downloads and link-refresh:7}",
      "map: no change selected: nothing changed against the base {central:Archive portal-downloads and link-refresh:7}",
      "Read      working tree · base {central:Archive portal-downloads and link-refresh:7} (merge-base with main)",
      "Next      deal with each hint, or say in the PR why it stays",
      "Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, whether a test really checks the rule it names, whether a result's declared inputs are complete, and whether a change is authorized in substance (the review judges these)",
    ],
    written: [],
    warnings: [
      "(node:<pid>) [TAG_RESOLVE_FAILED] YAMLWarning: Unresolved tag: !open at line 40, column 9:",
    ],
  },
  "a record that warns: an open one: check --strict": {
    code: 0,
    stdout: [
      "index not bound: EXP-7 illustrates EXP-3: no request record holds it; INV-13 serves invoice-numbers/R1: no request record holds it; INV-13 governed-by ADR-1: no request record holds it; INV-15 explains INV-13: no request record holds it; INV-16 illustrates INV-13: no request record holds it; ADR-1 decides INV-13: no request record holds it; ADR-1 source invoice-numbers/S1: no request record holds it",
      "ok: nothing found by spec-root, no-id, no-kind, unknown-kind, no-link, unknown-link, no-blank-before, no-blank-after, duplicate-id, duplicate-heading, lost-id, used-again, record-unreadable, record-evidence, unsigned-requirement, signoff-coverage, superseded-cited, superseded-status, path-claim, no-claim, promise-kind, typo-mark, near-match, adoption, design-link, no-paragraph-link, unresolved-link, replaces-link, serves-replaced, unknown-task, holder-changed, stale-base, stale-ai-hint, overlap, result, phrase, adr-changed, adr-supersede, adr-marker, adr-status, adr-number, adr-none, adr-links, adr-governs",
      "hint target-removed requests/link-expiry-spike/spec.md:5 link-expiry-spike/SP-2 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-2 requests/link-expiry-spike/spec.md:7",
      "hint target-removed requests/link-expiry-spike/spec.md:9 link-expiry-spike/SP-3 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-3 requests/link-expiry-spike/spec.md:11",
      "list: no change selected: nothing changed against the base {central:Archive portal-downloads and link-refresh:7}",
      "map: no change selected: nothing changed against the base {central:Archive portal-downloads and link-refresh:7}",
      "Read      working tree · base {central:Archive portal-downloads and link-refresh:7} (merge-base with main)",
      "Next      deal with each hint, or say in the PR why it stays",
      "Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, whether a test really checks the rule it names, whether a result's declared inputs are complete, and whether a change is authorized in substance (the review judges these)",
    ],
    written: [],
    warnings: [
      "(node:<pid>) [TAG_RESOLVE_FAILED] YAMLWarning: Unresolved tag: !open at line 40, column 9:",
    ],
  },
};

describe('al check and al check --strict on a record that warns: stdout and files as main, each warning at least once', () => {
  for (const [name, { build, tag }] of Object.entries(WARN_CASES)) {
    test(name, (t) => {
      const dir = build(t);
      for (const args of RUNS) {
        reset(dir);
        const r = al(dir, args);
        assert.equal(r.signal, null, show(r));
        const key = `${name}: ${args.join(' ')}`;
        const { stderr, ...rest } = asPinned(dir, { central: dir }, {}, r);
        const got = { ...rest, warnings: warningsOf(r.stderr) };
        const want = PINNED_WARN[key];
        assert.ok(want, `an expected output for ${key}`);
        const ours = want.warnings.filter((w) => w.includes(`Unresolved tag: ${tag}`));
        assert.equal(ours.length, 1, `main gave one warning line for the tag ${tag}: ${want.warnings.join('\n')}`);
        assert.deepEqual(got, want, show(r));
        assert.ok(timesIn(r.stderr, ours[0]) >= 1, `the warning for ${tag} shows at least once:\n${show(r)}`);
      }
    });
  }
});

// --- 1c. Records that yaml parses but cannot turn into data (review of PR
// #103). Their aliases expand to more nodes than the default maxAliasCount of
// yaml allows, so the conversion to data throws. Each text starts with one
// long comment line, so the records are above the worker size. al check must
// give the exit code, stdout and written files below, with worker threads and
// with workers that fail, and no internal error.
//
// Issue #104: such a record is the case record-unreadable, with the message of
// yaml as the reason, and its lines and exit codes are those of a record with
// a YAML syntax error. For the archived record, main lacked the two lines
// "index not read" and "index not removed" that a syntax error gives (a bug of
// main); the pins below have them. The test also checks the archived case
// against the same record with a syntax error in place of the aliases, so
// the expected text comes from al itself.

const ALIASES = 'a: &a [a,a,a,a,a,a,a,a,a,a]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]\n';
const aliasText = (xs) => `#${'x'.repeat(xs)}\n${ALIASES}`;

// A project with five such record files on main, orphan-0 to orphan-4, and no
// requests/ folder; then the branch pr with one empty commit.
function orphans(t) {
  const dir = baseProject(t, { branch: null });
  for (let i = 0; i < 5; i++) write(dir, `${RECORDS}orphan-${i}.yaml`, aliasText(210_000));
  commitAll(dir, 'Orphan records');
  git(dir, 'checkout', '-q', '-b', 'pr');
  emptyCommit(dir);
  return dir;
}

// The archived chain, with such a text as the record of a request that a
// reader reads: the archived request old. (The same text as the record of an
// open request is not here: main stops on it with an internal error.)
const aliasArchived = (dir) => {
  write(dir, 'requests/archive/old/request.md', '# Old\nStatus: concluded\n');
  write(dir, `${RECORDS}old.yaml`, aliasText(1_050_000));
};

// The same record with a YAML syntax error in place of the aliases.
const syntaxArchived = (dir) => {
  write(dir, 'requests/archive/old/request.md', '# Old\nStatus: concluded\n');
  write(dir, `${RECORDS}old.yaml`, `#${'x'.repeat(1_050_000)}\na: [b\nc: d\n`);
};

const ALIAS_CASES = {
  'orphan records that cannot be turned into data': { build: orphans },
  'an archived record that cannot be turned into data': {
    build: (t) => archivedChain(t, emptyCommit, aliasArchived),
    twin: (t) => archivedChain(t, emptyCommit, syntaxArchived),
  },
};

// The reason in the record-unreadable line of old.yaml.
const unreadableReason = (stdout) => /^not ok record-unreadable \.assuredloop\/records\/requests\/old\.yaml old .* cannot be read \((.*)\), so /m.exec(stdout)?.[1];

// The output of each run: the exit code, the lines of stdout, and what the run
// wrote. The orphan case is as main gave it; the archived case is as main gave
// it with the two index lines of #104.
const PINNED_ALIAS = {
  "orphan records that cannot be turned into data: check": {
    code: 0,
    stdout: [
      "records: al check wrote .assuredloop/records/specs/invoices.md.yaml, .assuredloop/records/specs/adr/0003-signed-links.md.yaml; commit them with this change",
      "hint no-link specs/invoices.md:5 INV-12 INV-12 is a data paragraph with no link · places: INV-12 specs/invoices.md:7",
      "hint no-link specs/invoices.md:9 INV-13 INV-13 is a rule paragraph with no link · places: INV-13 specs/invoices.md:11",
      "hint no-link specs/invoices.md:13 INV-41 INV-41 is a rule paragraph with no link · places: INV-41 specs/invoices.md:15",
      "ok: nothing found by spec-root, no-id, no-kind, unknown-kind, unknown-link, no-blank-before, no-blank-after, duplicate-id, duplicate-heading, lost-id, used-again, signoff-coverage, superseded-cited, superseded-status, path-claim, no-claim, promise-kind, typo-mark, near-match, adoption, design-link, no-paragraph-link, unresolved-link, replaces-link, serves-replaced, unknown-task, target-removed, holder-changed, stale-base, stale-ai-hint, overlap, result, phrase, adr-changed, adr-supersede, adr-marker, adr-status, adr-number, adr-none, adr-governs",
      "hint adr-links specs/adr/0003-signed-links.md:3 ADR-3 ADR-3 has no source: and no decides:; add the links to its marker · places: ADR-3 specs/adr/0003-signed-links.md:5",
      "not ok record-unreadable .assuredloop/records/requests/orphan-0.yaml orphan-0 .assuredloop/records/requests/orphan-0.yaml has no request.md in requests/orphan-0/ or requests/archive/orphan-0/, so its requirements, sign-offs and evidence are not checked",
      "not ok record-unreadable .assuredloop/records/requests/orphan-1.yaml orphan-1 .assuredloop/records/requests/orphan-1.yaml has no request.md in requests/orphan-1/ or requests/archive/orphan-1/, so its requirements, sign-offs and evidence are not checked",
      "not ok record-unreadable .assuredloop/records/requests/orphan-2.yaml orphan-2 .assuredloop/records/requests/orphan-2.yaml has no request.md in requests/orphan-2/ or requests/archive/orphan-2/, so its requirements, sign-offs and evidence are not checked",
      "not ok record-unreadable .assuredloop/records/requests/orphan-3.yaml orphan-3 .assuredloop/records/requests/orphan-3.yaml has no request.md in requests/orphan-3/ or requests/archive/orphan-3/, so its requirements, sign-offs and evidence are not checked",
      "not ok record-unreadable .assuredloop/records/requests/orphan-4.yaml orphan-4 .assuredloop/records/requests/orphan-4.yaml has no request.md in requests/orphan-4/ or requests/archive/orphan-4/, so its requirements, sign-offs and evidence are not checked",
      "list: no change selected: nothing changed against the base {central:Orphan records:7}",
      "map: no change selected: nothing changed against the base {central:Orphan records:7}",
      "Read      working tree · base {central:Orphan records:7} (merge-base with main)",
      "Next      fix each not ok, and deal with each hint or say in the PR why it stays",
      "Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, whether a test really checks the rule it names, whether a result's declared inputs are complete, and whether a change is authorized in substance (the review judges these)",
    ],
    written: [
      "?? .assuredloop/records/specs/adr/0003-signed-links.md.yaml",
      "?? .assuredloop/records/specs/invoices.md.yaml",
      "+++ new file .assuredloop/records/specs/adr/0003-signed-links.md.yaml",
      "schema: assuredloop/1",
      "file: specs/adr/0003-signed-links.md",
      "status: accepted",
      "paragraphs:",
      "  - id: ADR-3",
      "    kind: choice",
      "    text_sha256: fee03700df0115e902e56e2c7b75453d8ee943e0bd82238c372e81d2640ac0f2",
      "    display: \"ADR-3 (0, ADR-3: Signed links)\"",
      "  - id: ADR-3-1",
      "    kind: rationale",
      "    text_sha256: 69e7a408d4d2760f3d6f4535e29da1f5dd493ef0caaa6b19b76383af1da6a02e",
      "    display: \"ADR-3-1 (0:1, in ADR-3: Signed links)\"",
      "+++ new file .assuredloop/records/specs/invoices.md.yaml",
      "schema: assuredloop/1",
      "file: specs/invoices.md",
      "paragraphs:",
      "  - id: INV-1",
      "    kind: note",
      "    text_sha256: f0a640a6287884852038e3399dc242bbcec72b522f13cf962dee2f202b1663c2",
      "    display: INV-1 (0, Invoices)",
      "  - id: INV-12",
      "    kind: data",
      "    text_sha256: 12816ead3a1913fe68b0c994be6831f35a248b1ef6f023c8eac8985a8ec0bb14",
      "    display: INV-12 (0:1, in Invoices)",
      "  - id: INV-13",
      "    kind: rule",
      "    text_sha256: 5ce2b2031715960cc144ed3f298ba3cab6b41ec166ca582c461b0d249fef366e",
      "    display: INV-13 (0:2, in Invoices)",
      "  - id: INV-41",
      "    kind: rule",
      "    text_sha256: f426664deb96240871f88ee4ab9349aac9d07081550c3f89ffc8a3f87681d52a",
      "    display: INV-41 (0:3, in Invoices)",
    ],
  },
  "orphan records that cannot be turned into data: check --strict": {
    code: 1,
    stdout: [
      "records: al check wrote .assuredloop/records/specs/invoices.md.yaml, .assuredloop/records/specs/adr/0003-signed-links.md.yaml; commit them with this change",
      "hint no-link specs/invoices.md:5 INV-12 INV-12 is a data paragraph with no link · places: INV-12 specs/invoices.md:7",
      "hint no-link specs/invoices.md:9 INV-13 INV-13 is a rule paragraph with no link · places: INV-13 specs/invoices.md:11",
      "hint no-link specs/invoices.md:13 INV-41 INV-41 is a rule paragraph with no link · places: INV-41 specs/invoices.md:15",
      "ok: nothing found by spec-root, no-id, no-kind, unknown-kind, unknown-link, no-blank-before, no-blank-after, duplicate-id, duplicate-heading, lost-id, used-again, signoff-coverage, superseded-cited, superseded-status, path-claim, no-claim, promise-kind, typo-mark, near-match, adoption, design-link, no-paragraph-link, unresolved-link, replaces-link, serves-replaced, unknown-task, target-removed, holder-changed, stale-base, stale-ai-hint, overlap, result, phrase, adr-changed, adr-supersede, adr-marker, adr-status, adr-number, adr-none, adr-governs",
      "hint adr-links specs/adr/0003-signed-links.md:3 ADR-3 ADR-3 has no source: and no decides:; add the links to its marker · places: ADR-3 specs/adr/0003-signed-links.md:5",
      "not ok record-unreadable .assuredloop/records/requests/orphan-0.yaml orphan-0 .assuredloop/records/requests/orphan-0.yaml has no request.md in requests/orphan-0/ or requests/archive/orphan-0/, so its requirements, sign-offs and evidence are not checked",
      "not ok record-unreadable .assuredloop/records/requests/orphan-1.yaml orphan-1 .assuredloop/records/requests/orphan-1.yaml has no request.md in requests/orphan-1/ or requests/archive/orphan-1/, so its requirements, sign-offs and evidence are not checked",
      "not ok record-unreadable .assuredloop/records/requests/orphan-2.yaml orphan-2 .assuredloop/records/requests/orphan-2.yaml has no request.md in requests/orphan-2/ or requests/archive/orphan-2/, so its requirements, sign-offs and evidence are not checked",
      "not ok record-unreadable .assuredloop/records/requests/orphan-3.yaml orphan-3 .assuredloop/records/requests/orphan-3.yaml has no request.md in requests/orphan-3/ or requests/archive/orphan-3/, so its requirements, sign-offs and evidence are not checked",
      "not ok record-unreadable .assuredloop/records/requests/orphan-4.yaml orphan-4 .assuredloop/records/requests/orphan-4.yaml has no request.md in requests/orphan-4/ or requests/archive/orphan-4/, so its requirements, sign-offs and evidence are not checked",
      "list: no change selected: nothing changed against the base {central:Orphan records:7}",
      "map: no change selected: nothing changed against the base {central:Orphan records:7}",
      "Read      working tree · base {central:Orphan records:7} (merge-base with main)",
      "Next      fix each not ok, and deal with each hint or say in the PR why it stays",
      "Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, whether a test really checks the rule it names, whether a result's declared inputs are complete, and whether a change is authorized in substance (the review judges these)",
    ],
    written: [
      "?? .assuredloop/records/specs/adr/0003-signed-links.md.yaml",
      "?? .assuredloop/records/specs/invoices.md.yaml",
      "+++ new file .assuredloop/records/specs/adr/0003-signed-links.md.yaml",
      "schema: assuredloop/1",
      "file: specs/adr/0003-signed-links.md",
      "status: accepted",
      "paragraphs:",
      "  - id: ADR-3",
      "    kind: choice",
      "    text_sha256: fee03700df0115e902e56e2c7b75453d8ee943e0bd82238c372e81d2640ac0f2",
      "    display: \"ADR-3 (0, ADR-3: Signed links)\"",
      "  - id: ADR-3-1",
      "    kind: rationale",
      "    text_sha256: 69e7a408d4d2760f3d6f4535e29da1f5dd493ef0caaa6b19b76383af1da6a02e",
      "    display: \"ADR-3-1 (0:1, in ADR-3: Signed links)\"",
      "+++ new file .assuredloop/records/specs/invoices.md.yaml",
      "schema: assuredloop/1",
      "file: specs/invoices.md",
      "paragraphs:",
      "  - id: INV-1",
      "    kind: note",
      "    text_sha256: f0a640a6287884852038e3399dc242bbcec72b522f13cf962dee2f202b1663c2",
      "    display: INV-1 (0, Invoices)",
      "  - id: INV-12",
      "    kind: data",
      "    text_sha256: 12816ead3a1913fe68b0c994be6831f35a248b1ef6f023c8eac8985a8ec0bb14",
      "    display: INV-12 (0:1, in Invoices)",
      "  - id: INV-13",
      "    kind: rule",
      "    text_sha256: 5ce2b2031715960cc144ed3f298ba3cab6b41ec166ca582c461b0d249fef366e",
      "    display: INV-13 (0:2, in Invoices)",
      "  - id: INV-41",
      "    kind: rule",
      "    text_sha256: f426664deb96240871f88ee4ab9349aac9d07081550c3f89ffc8a3f87681d52a",
      "    display: INV-41 (0:3, in Invoices)",
    ],
  },
  "an archived record that cannot be turned into data: check": {
    code: 0,
    stdout: [
      "index not read: .assuredloop/records/requests/old.yaml is not a valid record: Excessive alias count indicates a resource exhaustion attack",
      "index not bound: EXP-7 illustrates EXP-3: no request record holds it; INV-13 serves invoice-numbers/R1: no request record holds it; INV-13 governed-by ADR-1: no request record holds it; INV-15 explains INV-13: no request record holds it; INV-16 illustrates INV-13: no request record holds it; ADR-1 decides INV-13: no request record holds it; ADR-1 source invoice-numbers/S1: no request record holds it",
      "index not removed: no binding is removed in this run, as al index could not read .assuredloop/records/requests/old.yaml is not a valid record: Excessive alias count indicates a resource exhaustion attack",
      "ok: nothing found by spec-root, no-id, no-kind, unknown-kind, no-link, unknown-link, no-blank-before, no-blank-after, duplicate-id, duplicate-heading, lost-id, used-again, signoff-coverage, superseded-cited, superseded-status, path-claim, no-claim, promise-kind, typo-mark, near-match, adoption, design-link, no-paragraph-link, unresolved-link, replaces-link, serves-replaced, unknown-task, holder-changed, stale-base, stale-ai-hint, overlap, result, phrase, adr-changed, adr-supersede, adr-marker, adr-status, adr-number, adr-none, adr-links, adr-governs",
      "hint target-removed requests/link-expiry-spike/spec.md:5 link-expiry-spike/SP-2 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-2 requests/link-expiry-spike/spec.md:7",
      "hint target-removed requests/link-expiry-spike/spec.md:9 link-expiry-spike/SP-3 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-3 requests/link-expiry-spike/spec.md:11",
      "not ok record-unreadable .assuredloop/records/requests/old.yaml old .assuredloop/records/requests/old.yaml cannot be read (Excessive alias count indicates a resource exhaustion attack), so its requirements, sign-offs and evidence are not checked; fix it by hand",
      "list: no change selected: nothing changed against the base {central:Archive portal-downloads and link-refresh:7}",
      "map: no change selected: nothing changed against the base {central:Archive portal-downloads and link-refresh:7}",
      "Read      working tree · base {central:Archive portal-downloads and link-refresh:7} (merge-base with main)",
      "Next      fix each not ok, and deal with each hint or say in the PR why it stays",
      "Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, whether a test really checks the rule it names, whether a result's declared inputs are complete, and whether a change is authorized in substance (the review judges these)",
    ],
    written: [],
  },
  "an archived record that cannot be turned into data: check --strict": {
    code: 1,
    stdout: [
      "index not read: .assuredloop/records/requests/old.yaml is not a valid record: Excessive alias count indicates a resource exhaustion attack",
      "index not bound: EXP-7 illustrates EXP-3: no request record holds it; INV-13 serves invoice-numbers/R1: no request record holds it; INV-13 governed-by ADR-1: no request record holds it; INV-15 explains INV-13: no request record holds it; INV-16 illustrates INV-13: no request record holds it; ADR-1 decides INV-13: no request record holds it; ADR-1 source invoice-numbers/S1: no request record holds it",
      "index not removed: no binding is removed in this run, as al index could not read .assuredloop/records/requests/old.yaml is not a valid record: Excessive alias count indicates a resource exhaustion attack",
      "ok: nothing found by spec-root, no-id, no-kind, unknown-kind, no-link, unknown-link, no-blank-before, no-blank-after, duplicate-id, duplicate-heading, lost-id, used-again, signoff-coverage, superseded-cited, superseded-status, path-claim, no-claim, promise-kind, typo-mark, near-match, adoption, design-link, no-paragraph-link, unresolved-link, replaces-link, serves-replaced, unknown-task, holder-changed, stale-base, stale-ai-hint, overlap, result, phrase, adr-changed, adr-supersede, adr-marker, adr-status, adr-number, adr-none, adr-links, adr-governs",
      "hint target-removed requests/link-expiry-spike/spec.md:5 link-expiry-spike/SP-2 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-2 requests/link-expiry-spike/spec.md:7",
      "hint target-removed requests/link-expiry-spike/spec.md:9 link-expiry-spike/SP-3 EXP-4: target removed by portal-downloads; align this link · places: link-expiry-spike/SP-3 requests/link-expiry-spike/spec.md:11",
      "not ok record-unreadable .assuredloop/records/requests/old.yaml old .assuredloop/records/requests/old.yaml cannot be read (Excessive alias count indicates a resource exhaustion attack), so its requirements, sign-offs and evidence are not checked; fix it by hand",
      "list: no change selected: nothing changed against the base {central:Archive portal-downloads and link-refresh:7}",
      "map: no change selected: nothing changed against the base {central:Archive portal-downloads and link-refresh:7}",
      "Read      working tree · base {central:Archive portal-downloads and link-refresh:7} (merge-base with main)",
      "Next      fix each not ok, and deal with each hint or say in the PR why it stays",
      "Not known IDs used on branches that were never fetched here; whether each kind is right, whether a requirement is fully covered, whether a test really checks the rule it names, whether a result's declared inputs are complete, and whether a change is authorized in substance (the review judges these)",
    ],
    written: [],
  },
};

describe('al check and al check --strict on records that cannot be turned into data: as main, with workers and with failing workers', () => {
  for (const [name, { build, twin }] of Object.entries(ALIAS_CASES)) {
    test(name, (t) => {
      const dir = build(t);
      assert.ok(recordChars(dir) > WORKER_CHARS, `the records are above the worker size: ${recordChars(dir)} characters`);
      const twinDir = twin ? twin(t) : null;
      for (const args of RUNS) {
        const key = `${name}: ${args.join(' ')}`;
        if (twinDir) {
          // #104: the same output as the record with a syntax error, but for the reason.
          reset(dir);
          const r = al(dir, args);
          const s = al(twinDir, args);
          const reason = unreadableReason(r.stdout);
          const syntaxReason = unreadableReason(s.stdout);
          assert.match(reason ?? '', /alias/i, `the reason is the message of yaml about the aliases:\n${show(r)}`);
          assert.ok(syntaxReason, `the syntax error gives record-unreadable:\n${show(s)}`);
          assert.equal(r.code, s.code, `the exit code of a syntax error: ${key}\n${show(r)}\n${show(s)}`);
          // Commit hashes by name, as the two worlds hash differently.
          const mine = named(r.stdout, { central: dir }, { [dir]: '<dir>' });
          const theirs = named(s.stdout, { central: twinDir }, { [twinDir]: '<dir>' });
          assert.equal(mine, theirs.split(syntaxReason).join(reason), `the stdout of a syntax error, with the reason of yaml: ${key}`);
        }
        for (const workers of [null, 'fail', 'throw']) {
          reset(dir);
          const r = al(dir, args, workers ? { hook: yamlHook({ workers }) } : {});
          assert.equal(r.signal, null, show(r));
          const label = workers ? `${key}, workers ${workers}` : key;
          assert.doesNotMatch(r.stderr, /internal error/i, `no internal error: ${label}\n${show(r)}`);
          const { stderr, ...got } = asPinned(dir, { central: dir }, {}, r);
          assert.ok(PINNED_ALIAS[key], `an expected output for ${key}`);
          assert.deepEqual(got, PINNED_ALIAS[key], `${label}\n${show(r)}`);
        }
      }
    });
  }
});

// --- the scale worlds of tests 2 to 4, made by scale/generate.js in the
// background as the file starts, side by side, so that they are ready when
// their tests run.

const SCALE_TOP = mkdtempSync(join(realpathSync(tmpdir()), 'al4-scale101-'));
process.on('exit', () => rmSync(SCALE_TOP, { recursive: true, force: true }));

function generated(name, opts) {
  const out = join(SCALE_TOP, name);
  const args = [GENERATE, '--out', out, ...Object.entries(opts).flatMap(([k, v]) => [`--${k}`, String(v)])];
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { cwd: REPO, env: scaleEnv(), stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('exit', (code, signal) => (code === 0 ? resolve(out) : reject(new Error(`generate ${args.slice(1).join(' ')}: exit ${code} ${signal ?? ''}\n${err}`))));
  });
}

const SCALE = {
  few: generated('few', costWorld(FEW)),
  many: generated('many', costWorld(MANY)),
  workers: generated('workers', WORKER_WORLD),
};
for (const p of Object.values(SCALE)) p.catch(() => {}); // a failure shows in the test that awaits it

const specFiles = (dir) => git(dir, 'ls-files', 'specs').split('\n').filter((f) => /^specs\/[^/]+\.md$/.test(f));

// The central repo of a generated world, ready for al check on a pull
// request, as scale/run.js makes its `check` measure: on main, al index run
// and committed, so the records are up to date; then the branch pr, on which
// the oldest open request is consolidated and concluded (closeRequest of
// scale/world.js), and al index run and committed again. So al check writes
// nothing there.
function prepared(top) {
  const dir = join(top, 'central');
  const indexed = (message) => {
    const r = al(dir, ['index']);
    assert.equal(r.code, 0, show(r));
    if (git(dir, 'status', '--porcelain')) commitAll(dir, message);
  };
  indexed('Index the records on main');
  const worldJson = JSON.parse(readFileSync(join(top, 'world.json'), 'utf8'));
  const name = worldJson.openRequests[0];
  assert.ok(name, 'the world has an open request');
  git(dir, 'checkout', '-q', '-b', 'pr');
  const repo = new Repo(dir, 'pr');
  const sp = entriesOf(repo.read(`requests/${name}/spec.md`), '');
  const target = sp.flatMap((p) => [...(p.links.changes ?? []), ...(p.links.buildsOn ?? []), ...(p.links.removes ?? [])])[0];
  const file = target ? `specs/area-${target.split('-')[0].slice(1)}.md` : specFiles(dir)[0];
  const used = new Map();
  const nextId = (prefix) => {
    if (!used.has(prefix)) {
      const nums = [...entriesOf(repo.read(file), file).map((e) => e.id), ...worldJson.removed].filter((id) => id.startsWith(`${prefix}-`)).map((id) => Number(id.split('-')[1]));
      used.set(prefix, Math.max(0, ...nums));
    }
    used.set(prefix, used.get(prefix) + 1);
    return `${prefix}-${used.get(prefix)}`;
  };
  closeRequest(repo, { name, file, ms: Date.UTC(2030, 0, 1), nextId });
  commitAll(dir, `${name}: consolidate and conclude\n\nTier: 2 — ${name}`);
  indexed(`Index the records of ${name}`);
  return { dir, concluded: worldJson.concluded.length + 1 };
}

const ready = new Map();
const scaleWorld = (key) => {
  if (!ready.has(key)) ready.set(key, SCALE[key].then(prepared));
  return ready.get(key);
};

// --- 2. The cost against the number of concluded requests

// Two runs of al check in a prepared world, each with the YAML hook and the
// git wrapper, and one plain run: the counts of each counted run, and the plain
// run. Each run must exit as the plain run does, print what it prints, and
// write nothing.
async function measured(key) {
  const { dir, concluded } = await scaleWorld(key);
  const texts = recordTexts(dir);
  const plain = al(dir, ['check']);
  assert.equal(plain.signal, null, show(plain));
  assert.equal(git(dir, 'status', '--porcelain'), '', `the records are up to date, so al check writes nothing:\n${show(plain)}`);
  const runs = [];
  for (let i = 0; i < 2; i++) {
    const hook = yamlHook();
    const counter = gitCounter();
    const r = al(dir, ['check'], { hook, PATH: counter.PATH });
    assert.equal(r.code, plain.code, show(r));
    assert.equal(r.stdout, plain.stdout, 'the same stdout with the hook and the wrapper');
    assert.equal(r.stderr, plain.stderr, 'the same stderr with the hook and the wrapper');
    assert.equal(git(dir, 'status', '--porcelain'), '', `al check writes nothing:\n${show(r)}`);
    assertAllHooked(hook);
    const calls = hook.calls();
    assert.ok(calls.length > 0, 'the hook saw the YAML calls of al');
    const gitCalls = counter.calls();
    assert.ok(gitCalls.some((l) => l.includes('merge-base')), `the wrapper saw the git of al:\n${gitCalls.join('\n')}`);
    runs.push({ calls, gitCalls, distinct: new Set(calls.map((c) => c.sha)).size, ...parsedTwice(calls, texts) });
  }
  return { dir, concluded, texts, runs };
}

const MEASURED = new Map();
const measure = (key) => {
  if (!MEASURED.has(key)) MEASURED.set(key, measured(key));
  return MEASURED.get(key);
};

describe('the cost of al check does not grow with the concluded requests', { timeout: 240_000 }, () => {
  for (const key of ['few', 'many']) {
    test(`a: each request record is parsed as YAML at most once (${key === 'few' ? FEW : MANY} concluded requests)`, async () => {
      const m = await measure(key);
      m.runs.forEach((run, i) => {
        assert.ok(run.twice.length === 0,
          `run ${i + 1} of al check with ${m.concluded} concluded requests: ${run.twice.length} of the ${run.parsed} request record texts parsed were parsed more than once:\n${firstLines(run.twice)}`);
      });
    });
  }

  test(`b: the YAML parses of a text already parsed are about as many for ${MANY} concluded requests as for ${FEW}`, async (t) => {
    const few = await measure('few');
    const many = await measure('many');
    // The parses of all YAML texts (parse and parseDocument, in all threads),
    // less one for each distinct text: the parses that parse a text again.
    const again = (run) => run.calls.length - run.distinct;
    const what = (m, run) => {
      const byFn = (fn) => run.calls.filter((c) => c.fn === fn).length;
      return `${run.calls.length} parses (parse ${byFn('parse')}, parseDocument ${byFn('parseDocument')}) of ${run.distinct} distinct texts with ${m.concluded} concluded requests`;
    };
    for (let i = 0; i < 2; i++) {
      const a = again(few.runs[i]);
      const b = again(many.runs[i]);
      t.diagnostic(`run ${i + 1}: ${what(few, few.runs[i])}; ${what(many, many.runs[i])}`);
      assert.ok(b <= a + SLACK,
        `run ${i + 1}: parses of a text already parsed: ${a} with ${few.concluded} concluded requests, ${b} with ${many.concluded} (at most ${a + SLACK} allowed)\n${what(few, few.runs[i])}\n${what(many, many.runs[i])}`);
    }
  });

  test(`c: the number of git processes is about the same for ${MANY} concluded requests as for ${FEW}`, async (t) => {
    const few = await measure('few');
    const many = await measure('many');
    for (let i = 0; i < 2; i++) {
      const a = few.runs[i].gitCalls.length;
      const b = many.runs[i].gitCalls.length;
      t.diagnostic(`run ${i + 1}: git processes: ${a} with ${few.concluded} concluded requests, ${b} with ${many.concluded}`);
      assert.ok(b <= a + SLACK,
        `run ${i + 1}: git processes: ${a} with ${few.concluded} concluded requests, ${b} with ${many.concluded} (at most ${a + SLACK} allowed)\n--- with ${many.concluded}:\n${many.runs[i].gitCalls.join('\n')}`);
    }
  });
});

// --- 3. A cache gives what no cache gives

// A fresh clone of dir beside it (so that the output repos at ../<name> are
// found from it too), with the same branches and the same branch checked
// out, and no remote.
let clones = 0;
function freshClone(t, dir) {
  const repo = join(dirname(dir), `${basename(dir)}-clone${++clones}`);
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const branch = git(dir, 'symbolic-ref', '--short', 'HEAD');
  git(dirname(dir), 'clone', '-q', '--no-local', '--no-checkout', dir, repo);
  git(repo, 'fetch', '-q', '--update-head-ok', 'origin', 'refs/heads/*:refs/heads/*');
  git(repo, 'remote', 'remove', 'origin');
  git(repo, 'checkout', '-q', branch);
  return repo;
}

// The run in dir and the run in its clone, the same once each path is named.
function sameAsClone(t, dir, args, label, edit = () => {}) {
  const clone = freshClone(t, dir);
  edit(clone);
  const here = al(dir, args);
  const there = al(clone, args);
  const n = (r, d) => ({ code: r.code, stdout: r.stdout.split(d).join('<dir>'), stderr: r.stderr.split(d).join('<dir>') });
  assert.deepEqual(n(here, dir), n(there, clone), `${label}: the same as in a fresh clone\n${show(here)}`);
  return here;
}

describe('a cache gives what no cache gives', () => {
  test('archived chain: two runs, a new commit, and a change in the working tree', (t) => {
    const dir = archivedChain(t, notesOnly);
    const first = al(dir, ['check']);
    assert.equal(git(dir, 'status', '--porcelain'), '', `al check writes nothing here:\n${show(first)}`);
    const second = al(dir, ['check']);
    assert.deepEqual([second.code, second.stdout, second.stderr], [first.code, first.stdout, first.stderr], 'the second run gives what the first gave');
    sameAsClone(t, dir, ['check'], 'after two runs');
    // A new commit that changes an archived record and an archived request.
    editText(dir, 'requests/archive/portal-downloads/spec.md', 'One PR: the portal download page;', 'One PR: the portal download page, with its tests;');
    const rel = `${RECORDS}portal-downloads.yaml`;
    const lines = read(dir, rel).split('\n');
    const last = lines.findLastIndex((l) => l.startsWith('  - { holder: '));
    assert.ok(last >= 0, `${rel} has a binding`);
    write(dir, rel, lines.filter((_, i) => i !== last).join('\n'));
    write(dir, 'requests/archive/link-refresh/request.md', `${read(dir, 'requests/archive/link-refresh/request.md')}\nA note after the close.\n`);
    commitAll(dir, 'Change archived requests\n\nTier: 0 — notes only');
    sameAsClone(t, dir, ['check'], 'after a new commit');
    reset(dir);
    sameAsClone(t, dir, ['check', '--strict'], 'after a new commit, --strict');
    // A change in the working tree that is not committed: an archived record
    // that is not YAML any more.
    reset(dir);
    const breakIt = (d) => write(d, rel, `${read(d, rel)}bindings: [ {holder: : x\n`);
    breakIt(dir);
    sameAsClone(t, dir, ['check'], 'with an uncommitted change', breakIt);
  });

  test(`the scale world with ${FEW} concluded requests: two runs, and a fresh clone`, async (t) => {
    const { dir } = await scaleWorld('few');
    reset(dir);
    const first = al(dir, ['check']);
    const second = al(dir, ['check']);
    assert.deepEqual([second.code, second.stdout, second.stderr], [first.code, first.stdout, first.stderr], 'the second run gives what the first gave');
    sameAsClone(t, dir, ['check'], 'after two runs');
  });
});

// --- 4. With worker threads and without them

// The characters of the request records in the working tree, in all.
function recordChars(dir) {
  return git(dir, 'ls-files', '-co', '--exclude-standard', '--', RECORDS).split('\n')
    .filter((f) => /^\.assuredloop\/records\/requests\/[^/]+\.yaml$/.test(f))
    .reduce((n, f) => n + read(dir, f).length, 0);
}

describe(`al check gives the same with worker threads and without them (scale world of ${WORKER_WORLD.requests} requests, ${WORKER_WORLD.paragraphs} paragraphs)`, { timeout: 240_000 }, () => {
  test('the same exit code, stdout, stderr and written files; with workers, workers are made and each record is parsed at most once', async (t) => {
    const { dir } = await scaleWorld('workers');
    const texts = recordTexts(dir);
    const chars = recordChars(dir);
    t.diagnostic(`the request records hold ${chars} characters`);
    assert.ok(chars >= WORKER_CHARS * WORKER_MARGIN,
      `the request records hold ${chars} characters: at least ${WORKER_CHARS * WORKER_MARGIN} are needed, so that al uses workers`);
    const run = (workers) => {
      reset(dir);
      const hook = yamlHook({ workers });
      const r = al(dir, ['check'], { hook });
      assert.equal(r.signal, null, show(r));
      return { r, hook, written: written(dir) };
    };
    const on = run('on');
    assertAllHooked(on.hook);
    for (const workers of ['throw', 'fail']) {
      const off = run(workers);
      const label = workers === 'throw' ? 'new Worker() throws' : 'each worker fails as it starts';
      assert.equal(off.r.code, on.r.code, `the exit code when ${label}\n${show(off.r)}`);
      assert.equal(off.r.stdout, on.r.stdout, `the stdout when ${label}`);
      assert.equal(off.r.stderr, on.r.stderr, `the stderr when ${label}`);
      assert.deepEqual(off.written, on.written, `the written files when ${label}`);
    }
    const cores = availableParallelism();
    const made = on.hook.workers().length;
    t.diagnostic(`${made} workers made, on ${cores} cores`);
    if (cores >= 2) {
      assert.ok(made >= 1, `al made no worker thread for ${chars} characters of records on ${cores} cores`);
      assert.ok(made <= Math.min(4, cores - 1), `al made ${made} worker threads on ${cores} cores: at most min(4, cores - 1)`);
    } else {
      t.diagnostic(`one core only: al makes no worker, so the count of workers is not checked`);
    }
    const { twice, parsed } = parsedTwice(on.hook.calls(), texts);
    assert.ok(twice.length === 0,
      `with workers (${on.hook.workers().length} made): ${twice.length} of the ${parsed} request record texts parsed were parsed more than once:\n${firstLines(twice)}`);
  });

  // Review of #101: a record that warns, in a world above the worker size.
  // The warning of each record shows at least once with workers and without
  // them, and al's own output is the same.
  test('records that warn: the same exit code, stdout and written files with workers and without, and each warning at least once', async (t) => {
    const { dir } = await scaleWorld('workers');
    reset(dir);
    warnsArchived(dir);
    const open = git(dir, 'ls-tree', '--name-only', 'HEAD', 'requests/').split('\n').map((p) => p.slice('requests/'.length)).filter((n) => n !== 'archive');
    assert.ok(open.length >= 1, 'the world has an open request');
    const rel = `${RECORDS}${open[0]}.yaml`;
    write(dir, rel, `${read(dir, rel)}custom: !open value\n`);
    commitAll(dir, 'Records that warn\n\nTier: 0 — notes only');
    assert.ok(recordChars(dir) >= WORKER_CHARS * WORKER_MARGIN, `the records are above the worker size: ${recordChars(dir)} characters`);
    const tags = ['!archived', '!open'];
    const runs = {};
    for (const workers of ['on', 'throw', 'fail']) {
      reset(dir);
      const hook = yamlHook({ workers });
      const r = al(dir, ['check'], { hook });
      assert.equal(r.signal, null, show(r));
      runs[workers] = { r, hook, written: written(dir) };
      for (const tag of tags) {
        const lines = warningsOf(r.stderr).filter((w) => w.includes(`Unresolved tag: ${tag} `));
        assert.equal(lines.length, 1, `workers ${workers}: one warning line for the tag ${tag}:\n${r.stderr.slice(0, 3000)}`);
      }
    }
    const cores = availableParallelism();
    t.diagnostic(`${runs.on.hook.workers().length} workers made, on ${cores} cores`);
    if (cores >= 2) assert.ok(runs.on.hook.workers().length >= 1, `al made no worker thread on ${cores} cores`);
    for (const workers of ['throw', 'fail']) {
      const off = runs[workers];
      assert.equal(off.r.code, runs.on.r.code, `the exit code, workers ${workers}\n${show(off.r)}`);
      assert.equal(off.r.stdout, runs.on.r.stdout, `the stdout, workers ${workers}`);
      assert.deepEqual(off.written, runs.on.written, `the written files, workers ${workers}`);
      assert.deepEqual(warningsOf(off.r.stderr), warningsOf(runs.on.r.stderr), `the warning lines, workers ${workers}`);
    }
  });
});
