// The cross-repo world of T12 (#180): one central repo and its output repos,
// side by side in one folder, so the central config names them as ../<name>.
// Nothing here reads the code under test. The world is built once in each test
// process; each test gets a copy of the whole folder.
//
//   invoicer         the central repo: the shared invoicer state `clean` (main),
//                    and on its branch `pr` one more commit: config outputs,
//                    the tasks with PR references and the declared outputs of
//                    invoice-exports (fixtures/cross-repo/central/).
//   invoicer-web     the shared state `web-base` (W3 and its result), moved to
//                    main, then on main: "Document the export link (#57)"
//                    (names central:invoice-exports/T1) and
//                    "Tidy the link docs (#570)". Selected as `commit: main`.
//   invoicer-worker  built here: K1, K4, the results commit R on main, the
//                    branch zip-names (a "(#13)" commit and the T2 commit),
//                    merged as "Merge pull request #12 ..." = K5. Selected as
//                    the short hash of K5. Its results cover every rule of
//                    `applies`, and one names the unavailable commit K7.
//   invoicer-mobile  listed in config, never cloned (an absent clone).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { invoicer } from './invoicer.js';
import { REPO, git, read, readYaml, write, writeYaml } from './project.js';

export const FIX = fileURLToPath(new URL('../fixtures/cross-repo/', import.meta.url));
const fixture = (rel) => readFileSync(join(FIX, rel), 'utf8');

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const K7 = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
export const MOBILE_URL = 'https://example.invalid/invoicer-mobile.git';
export const ZIP_V1 = fixture('worker/src/zip-export.v1.js');
export const ZIP_V2 = fixture('worker/src/zip-export.v2.js');
export const GONE_SHA = 'a'.repeat(64);

// crossRepo from src/v4/repos.js, imported when a test runs, so a missing
// module fails that test and not the file.
export async function crossRepo(top) {
  const mod = await import(pathToFileURL(join(REPO, 'src/v4/repos.js')).href);
  return mod.crossRepo(top);
}

// The bytes of <file> at <rev> in the clone, untrimmed.
export const blob = (dir, rev, file) => execFileSync('git', ['-C', dir, 'show', `${rev}:${file}`], { env: gitEnv() });
export const blobSha = (dir, rev, file) => sha256(blob(dir, rev, file));
export const rev = (dir, what = 'HEAD') => git(dir, 'rev-parse', what);

function gitEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
}

export function commit(dir, message) {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '--allow-empty', '-m', message);
  return rev(dir);
}

const CACHE = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-xr-'));
process.on('exit', () => rmSync(CACHE, { recursive: true, force: true }));
const keep = { after: () => {} }; // the copy is moved into CACHE, so nothing to clean
let built = null;
let serial = 0;

function initRepo(dir) {
  mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'Fixture Author');
  git(dir, 'config', 'user.email', 'author@example.invalid');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'config', 'gc.auto', '0');
}

function buildWorker(dir) {
  initRepo(dir);
  write(dir, '.assuredloop/config.yaml', fixture('worker/.assuredloop/config.yaml'));
  write(dir, 'src/reminders.js', fixture('worker/src/reminders.js'));
  const K1 = commit(dir, 'Start the worker');
  write(dir, 'src/zip-export.js', ZIP_V1);
  write(dir, 'test/zip-export.test.js', fixture('worker/test/zip-export.test.js'));
  const K4 = commit(dir, 'Reminder job: 7 days after the due date (central:INV-11)');
  const at = (file) => ({ file, sha256: blobSha(dir, K4, file) });
  const results = {
    'a-no-inputs.yaml': { check: 'test/zip-export.test.js', outcome: 'not run', commit: K4 },
    'b-unknown-no-inputs.yaml': { check: 'test/zip-export.test.js', outcome: 'pass', commit: 'unknown' },
    'c-unknown.yaml': { check: 'test/zip-export.test.js', outcome: 'pass', commit: 'unknown', inputs: [{ file: 'src/old-zip.js', sha256: GONE_SHA }] },
    'd-k7.yaml': {
      check: 'test/zip-export.test.js', outcome: 'pass', commit: K7, inputs: [at('src/zip-export.js')],
      by: 'reviewer-7', source: 'https://ci.example.invalid/runs/7', note: 'ran on the worker CI',
    },
    'e-gone.yaml': { check: 'test/zip-export.test.js', outcome: 'fail', commit: K4, inputs: [at('src/zip-export.js'), { file: 'src/old-zip.js', sha256: GONE_SHA }] },
    'f-changed.yaml': { check: 'test/zip-export.test.js', outcome: 'pass', commit: K4, inputs: [at('test/zip-export.test.js'), at('src/zip-export.js')] },
    'g-unchanged.yaml': { check: 'test/zip-export.test.js', outcome: 'pass', commit: K4, inputs: [at('test/zip-export.test.js'), at('src/reminders.js')] },
    'h-short.yaml': { check: 'test/zip-export.test.js', outcome: 'pass', commit: K4.slice(0, 7), inputs: [at('test/zip-export.test.js')] },
  };
  for (const [file, value] of Object.entries(results)) writeYaml(dir, `.assuredloop/results/${file}`, value);
  const R = commit(dir, 'Record the test results');
  git(dir, 'checkout', '-q', '-b', 'zip-names', K4);
  write(dir, 'README.md', 'The invoicer worker.\n');
  const typo = commit(dir, 'Fix a typo (#13)');
  write(dir, 'src/zip-export.js', ZIP_V2);
  const T2 = commit(dir, 'Yearly ZIP file names (central:invoice-exports/T2)');
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'merge', '-q', '--no-ff', 'zip-names', '-m', 'Merge pull request #12 from invoicer/zip-names\n\nYearly ZIP file names');
  const K5 = rev(dir);
  return { K1, K4, R, typo, T2, K5 };
}

function buildWeb(dir) {
  // web-base: main has only "Start the repository"; its commits are on `pr`.
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'merge', '-q', '--ff-only', 'pr');
  git(dir, 'branch', '-q', '-D', 'pr');
  const result = readYaml(dir, '.assuredloop/results/export-link-test.yaml');
  const W3 = result.commit;
  write(dir, 'docs/link.md', fixture('web/docs/link.md'));
  write(dir, '.assuredloop/config.yaml', fixture('web/.assuredloop/config.yaml'));
  write(dir, '.assuredloop/notes.md', fixture('web/.assuredloop/notes.md'));
  const A = commit(dir, 'Document the export link (#57)\n\nDelivers central:invoice-exports/T1. Restores central:EXP-4.');
  write(dir, 'docs/tidy.md', 'Tidy.\n');
  const B = commit(dir, 'Tidy the link docs (#570)');
  return { W3, A, B, main: B };
}

export function centralConfig(dir, outputs) {
  const cfg = readYaml(dir, '.assuredloop/config.yaml');
  writeYaml(dir, '.assuredloop/config.yaml', { ...cfg, repo: 'invoicer', outputs });
}

export const worldOutputs = (k5) => [
  { name: 'invoicer-web', path: '../invoicer-web', commit: 'main' },
  { name: 'invoicer-worker', path: '../invoicer-worker', commit: k5.slice(0, 7) },
  { name: 'invoicer-mobile', url: MOBILE_URL, path: '../invoicer-mobile' },
];

function buildCentral(dir, k5) {
  // `clean`: the invoicer world on main, and the branch `pr` with one empty commit.
  write(dir, 'docs/exports.md', fixture('central/docs/exports.md'));
  const rel = '.assuredloop/records/requests/invoice-exports.yaml';
  const rec = readYaml(dir, rel);
  const add = parse(fixture('central/invoice-exports.yaml'));
  writeYaml(dir, rel, { ...rec, tasks: add.tasks, outputs: add.outputs });
  centralConfig(dir, worldOutputs(k5));
  return { main: rev(dir, 'main'), head: commit(dir, 'Declare the output repos of invoice-exports') };
}

function build() {
  const root = join(CACHE, 'world');
  mkdirSync(root);
  const place = (name, state) => {
    const to = join(root, name);
    renameSync(invoicer(keep, state), to);
    return to;
  };
  const worker = buildWorker(join(root, 'invoicer-worker'));
  const web = buildWeb(place('invoicer-web', 'web-base'));
  const central = buildCentral(place('invoicer', 'clean'), worker.K5);
  return { root, shas: { worker, web, central } };
}

// A copy of the world for one test, removed when the test ends (with t null:
// when the process ends, for a copy that several tests of one file read):
// { root, central, web, worker, mobile (a path that does not exist), shas }.
export function world(t) {
  built ??= build();
  const root = join(CACHE, `w${++serial}`);
  cpSync(built.root, root, { recursive: true });
  t?.after(() => rmSync(root, { recursive: true, force: true }));
  return {
    root,
    central: join(root, 'invoicer'),
    web: join(root, 'invoicer-web'),
    worker: join(root, 'invoicer-worker'),
    mobile: join(root, 'invoicer-mobile'),
    shas: built.shas,
  };
}

// The links of crossRepo that match every field given.
export const linksWhere = (links, where) => links.filter((l) => Object.entries(where).every(([k, v]) => l[k] === v));
export function oneLink(links, where) {
  const found = linksWhere(links, where);
  if (found.length !== 1) throw new Error(`one link ${JSON.stringify(where)}, found ${found.length}:\n${JSON.stringify(links, null, 1)}`);
  return found[0];
}
