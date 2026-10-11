// Issue #220: the release gate runs the real level-2 model smoke test.
// Built from the architect's decision and the public interface only: the
// switch AL_REQUIRE_REAL_MODEL, the smoke test file
// test/v4/search-real-model.test.js, and the two workflow files read as
// GitHub Actions files. Nothing here reads src/.
// - With AL_REQUIRE_REAL_MODEL=1 the smoke test does not skip: it fails when
//   @huggingface/transformers does not resolve from the repo top, and when
//   the library loads but cannot be used (al falls back from level 2).
//   Without the switch (or with any value but 1) it skips as before.
//   These runs use a copy of al and the smoke test in a scratch folder, with
//   no library or a stand-in (helpers/search.js), so they pass whether or not
//   this clone has the real library installed. No run downloads anything.
// - publish.yml, the test job: after the full `node --test` step, one step
//   installs exactly @huggingface/transformers@4.3.1 at the repo top with
//   --no-save (and --save-peer), --ignore-scripts and --before 24 hours
//   before the run. A later step runs the smoke test with
//   AL_REQUIRE_REAL_MODEL=1. The publish job installs nothing. test.yml names
//   neither the library nor the switch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { TRANSFORMERS, TRANSFORMERS_VERSION, standIn } from './helpers/search.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SMOKE = 'test/v4/search-real-model.test.js';
const SWITCH = 'AL_REQUIRE_REAL_MODEL';
const INSTALL = `${TRANSFORMERS}@${TRANSFORMERS_VERSION}`;
// A nested node --test with a stand-in takes seconds; a hang is killed.
const LIMIT = 180_000;
const DAY_MS = 86_400_000;

// --- the smoke test, run in a scratch copy of al
//
// The copy holds what the smoke test and al need: package.json, bin/, src/,
// skills/, node_modules/yaml, test/v4/helpers/ and the smoke test itself, as
// they are in this clone now. It holds no @huggingface/transformers, and it
// lives in the system's temp folder, so nothing above it gives one either.

function world(t) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'al4-gate-220-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  copyFileSync(join(ROOT, 'package.json'), join(dir, 'package.json'));
  for (const d of ['bin', 'src', 'skills', 'node_modules/yaml', 'test/v4/helpers']) {
    if (existsSync(join(ROOT, d))) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
  }
  copyFileSync(join(ROOT, SMOKE), join(dir, SMOKE));
  mkdirSync(join(dir, 'home'));
  return dir;
}

const resolves = (dir) => {
  try {
    createRequire(join(dir, 'package.json')).resolve(TRANSFORMERS);
    return true;
  } catch {
    return false;
  }
};

// Puts a stand-in library at the top of the copy, where the smoke test and
// the copied al find it (beside al).
const besideCopy = (dir, mode) => standIn(join(dir, 'node_modules', TRANSFORMERS), { mode });

// `node --test --test-reporter=tap <smoke test>` in the copy. `value`
// undefined: the switch is not set. The environment has no test runner
// context of this run, no NODE_OPTIONS or NODE_PATH, and a scratch HOME.
function smoke(dir, value) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!['NODE_TEST_CONTEXT', 'NODE_OPTIONS', 'NODE_PATH', SWITCH].includes(k)) env[k] = v;
  }
  env.HOME = join(dir, 'home');
  if (value !== undefined) env[SWITCH] = value;
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', SMOKE], {
    cwd: dir, env, input: '', encoding: 'utf8', timeout: LIMIT, maxBuffer: 1 << 26,
  });
  const count = (name) => {
    const m = r.stdout.match(new RegExp(`^# ${name} (\\d+)$`, 'm'));
    return m ? Number(m[1]) : null;
  };
  return {
    code: r.status, signal: r.signal, out: `${r.stdout}\n${r.stderr}`,
    tests: count('tests'), pass: count('pass'), fail: count('fail'), skipped: count('skipped'),
    value,
  };
}

const showSmoke = (r) => `${SWITCH}=${r.value ?? '(unset)'}: exit ${r.code} (signal ${r.signal}), `
  + `tests ${r.tests}, pass ${r.pass}, fail ${r.fail}, skipped ${r.skipped}\n--- output\n${r.out.slice(0, 6000)}`;

function assertFails(r) {
  assert.equal(r.signal, null, `the smoke test was killed:\n${showSmoke(r)}`);
  assert.notEqual(r.code, 0, `the smoke test should fail, not pass or skip:\n${showSmoke(r)}`);
  assert.equal(r.fail, 1, `1 failed:\n${showSmoke(r)}`);
  assert.equal(r.skipped, 0, `0 skipped:\n${showSmoke(r)}`);
}

function assertSkips(r) {
  assert.equal(r.signal, null, `the smoke test was killed:\n${showSmoke(r)}`);
  assert.equal(r.code, 0, `the smoke test should exit 0:\n${showSmoke(r)}`);
  assert.equal(r.skipped, 1, `1 skipped:\n${showSmoke(r)}`);
  assert.equal(r.fail, 0, `0 failed:\n${showSmoke(r)}`);
}

test(`#220 with ${SWITCH}=1 and no @huggingface/transformers at the repo top, the smoke test fails, not skips`, (t) => {
  const dir = world(t);
  assert.ok(!resolves(dir), `the fixture: ${TRANSFORMERS} does not resolve from the copy ${dir}`);
  assertFails(smoke(dir, '1'));
});

test(`#220 without ${SWITCH}, or with a value other than 1, and no library at the repo top, the smoke test skips as before`, (t) => {
  const dir = world(t);
  assert.ok(!resolves(dir), `the fixture: ${TRANSFORMERS} does not resolve from the copy ${dir}`);
  for (const value of [undefined, '0', '']) assertSkips(smoke(dir, value));
});

// The copy works: with a working stand-in, the smoke test runs and passes.
// So the two tests after it fail because of the library, not because of
// the copy.
test(`#220 the fixture: with ${SWITCH}=1 and a working stand-in beside the copied al, the smoke test runs and passes`, (t) => {
  const dir = world(t);
  besideCopy(dir, 'ok');
  assert.ok(resolves(dir), 'the fixture: the stand-in resolves from the copy');
  const r = smoke(dir, '1');
  assert.equal(r.signal, null, `the smoke test was killed:\n${showSmoke(r)}`);
  assert.equal(r.code, 0, `the smoke test should pass with a working stand-in:\n${showSmoke(r)}`);
  assert.equal(r.pass, 1, `1 passed:\n${showSmoke(r)}`);
  assert.equal(r.skipped, 0, `0 skipped:\n${showSmoke(r)}`);
});

for (const [mode, what] of [['load-throws', 'throws on import'], ['embed-throws', 'has an extractor that throws']]) {
  test(`#220 with ${SWITCH}=1 and a library beside al that ${what}, al falls back from level 2 and the smoke test fails, not skips`, (t) => {
    const dir = world(t);
    besideCopy(dir, mode);
    assert.ok(resolves(dir), 'the fixture: the stand-in resolves from the copy');
    assertFails(smoke(dir, '1'));
  });
}

// --- the workflows, read as YAML

const WF = (file) => join(ROOT, '.github', 'workflows', file);
const workflow = (file) => parseYaml(readFileSync(WF(file), 'utf8'));
const LIB = /huggingface|transformers/i;

// Each npm command in a run script that installs something, with its words.
const INSTALLS = 'install|i|add|isntall|in|ins|inst|insta|instal|isnt|isnta|isntal|ci|clean-install|install-clean';
const npmInstalls = (run) => [...run.replace(/\\\n/g, ' ').matchAll(new RegExp(`\\bnpm\\s+((?:${INSTALLS}|cache)\\b[^;&|\\n]*)`, 'g'))]
  .map((m) => m[1].trim());

const isFull = (s) => typeof s.run === 'string' && s.run.trim() === 'node --test';
const isSmoke = (s) => typeof s.run === 'string'
  && /\bnode\b[^\n]*--test\b[^\n]*test\/v4\/search-real-model\.test\.js\b/.test(s.run);
const switchOn = (s) => String(s.env?.[SWITCH] ?? '') === '1' || new RegExp(`\\b${SWITCH}=['"]?1\\b`).test(s.run);
const installsLib = (s) => typeof s.run === 'string' && LIB.test(s.run) && npmInstalls(s.run).length > 0;
const label = (s, i) => s.name ?? (typeof s.run === 'string' ? s.run.split('\n')[0] : s.uses) ?? `step ${i}`;

function testJob() {
  const wf = workflow('publish.yml');
  const job = wf?.jobs?.test;
  assert.ok(job, 'the fixture: publish.yml has a job named test');
  assert.ok(Array.isArray(job.strategy?.matrix?.node), 'the fixture: the test job is a matrix over Node versions');
  return { wf, job, steps: job.steps ?? [] };
}

test('#220 publish.yml, the test job: one step installs @huggingface/transformers, after the full node --test step, and a later step runs the smoke test with AL_REQUIRE_REAL_MODEL=1', () => {
  const { wf, job, steps } = testJob();
  const full = steps.findIndex(isFull);
  assert.ok(full >= 0, 'the test job keeps a step whose run is `node --test`');
  const installing = steps.map((s, i) => [s, i]).filter(([s]) => installsLib(s));
  assert.equal(installing.length, 1,
    `one step of the test job installs the library: ${installing.map(([s, i]) => label(s, i)).join(', ') || 'none'}`);
  const [inst, at] = installing[0];
  assert.ok(at > full, `the install step ("${label(inst, at)}") comes after the full node --test step`);
  for (const k of ['if', 'continue-on-error', 'working-directory']) {
    assert.equal(inst[k], undefined, `the install step has no ${k}: it always runs, at the repo top, and its failure fails the job`);
  }

  const smokeAt = steps.findIndex((s, i) => i > at && isSmoke(s));
  assert.ok(smokeAt > at, `a step after the install runs node --test ${SMOKE}`);
  const sm = steps[smokeAt];
  assert.ok(switchOn(sm), `the smoke step sets ${SWITCH}=1 in its env or its command: ${JSON.stringify({ env: sm.env, run: sm.run })}`);
  for (const k of ['if', 'continue-on-error', 'working-directory']) {
    assert.equal(sm[k], undefined, `the smoke step has no ${k}: it always runs, at the repo top, and its failure fails the job`);
  }

  // The full step runs the tests that need the library absent, so the switch
  // is not on there: not in the step, the job or the workflow.
  const f = steps[full];
  assert.equal(f.env?.[SWITCH], undefined, `the full node --test step does not set ${SWITCH}`);
  assert.equal(job.env?.[SWITCH], undefined, `the test job does not set ${SWITCH} for every step`);
  assert.equal(wf.env?.[SWITCH], undefined, `publish.yml does not set ${SWITCH} for every job`);
});

// --- the install step, run with a stub npm
//
// The step's script runs as GitHub runs a bash step, in a scratch copy of
// package.json and package-lock.json, with a stub `npm` first on PATH. The
// stub logs each call (cwd and arguments) and exits 0. When this machine's
// `date` is not GNU date (macOS), a stub `date` that knows a small part of
// GNU date's syntax comes first on PATH too; on GitHub's runner the real one
// runs.

const NPM_STUB = `#!/usr/bin/env node
const { appendFileSync } = require('node:fs');
appendFileSync(process.env.STUB_LOG, JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }) + '\\n');
`;

const DATE_STUB = `#!/usr/bin/env node
// A stand-in for GNU date: -u, -d/--date with now, yesterday, @seconds or
// "[+-]N unit ... [ago]", +FORMAT and -I/--iso-8601.
const args = process.argv.slice(2);
let utc = false, when = 'now', format = null, iso = null;
const fail = (m) => { console.error('stub date (a part of GNU date only): ' + m); process.exit(1); };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-u' || a === '--utc' || a === '--universal') utc = true;
  else if (a === '-d' || a === '--date') when = args[++i];
  else if (a === '-ud') { utc = true; when = args[++i]; }
  else if (a.startsWith('--date=')) when = a.slice(7);
  else if (a.startsWith('-d')) when = a.slice(2);
  else if (a.startsWith('+')) format = a.slice(1);
  else if (a.startsWith('-I')) iso = a.slice(2) || 'date';
  else if (a.startsWith('--iso-8601')) iso = a.includes('=') ? a.split('=')[1] : 'date';
  else fail('unknown argument ' + a);
}
const UNIT = { sec: 1, second: 1, min: 60, minute: 60, hour: 3600, day: 86400, week: 604800 };
function at(s) {
  let t = String(s).trim().toLowerCase();
  const now = Date.now();
  if (t === '' || t === 'now') return now;
  if (t === 'yesterday') return now - 86400e3;
  if (/^@-?\\d+$/.test(t)) return Number(t.slice(1)) * 1000;
  let sign = 1;
  if (/\\s+ago$/.test(t)) { sign = -1; t = t.replace(/\\s+ago$/, ''); }
  t = t.replace(/^now\\s*/, '');
  let ms = 0, rest = t;
  const re = /^\\s*([+-])?\\s*(\\d+)?\\s*(sec|second|min|minute|hour|day|week)s?\\b/;
  while (rest.trim() !== '') {
    const m = rest.match(re);
    if (!m) fail('invalid date ' + JSON.stringify(s));
    ms += (m[1] === '-' ? -1 : 1) * Number(m[2] ?? 1) * UNIT[m[3]] * 1000;
    rest = rest.slice(m[0].length);
  }
  return now + sign * ms;
}
const d = new Date(at(when));
const p = (n, w = 2) => String(n).padStart(w, '0');
const g = utc
  ? { Y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), H: d.getUTCHours(), M: d.getUTCMinutes(), S: d.getUTCSeconds(), off: 0 }
  : { Y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), H: d.getHours(), M: d.getMinutes(), S: d.getSeconds(), off: -d.getTimezoneOffset() };
const z = (colon) => (g.off < 0 ? '-' : '+') + p(Math.floor(Math.abs(g.off) / 60)) + (colon ? ':' : '') + p(Math.abs(g.off) % 60);
const F = { Y: () => g.Y, m: () => p(g.m), d: () => p(g.d), H: () => p(g.H), M: () => p(g.M), S: () => p(g.S),
  s: () => Math.floor(d.getTime() / 1000), Z: () => (utc ? 'UTC' : ''), z: () => z(false), F: () => g.Y + '-' + p(g.m) + '-' + p(g.d),
  T: () => p(g.H) + ':' + p(g.M) + ':' + p(g.S), '%': () => '%' };
const fmt = (f) => f.replace(/%(.)/g, (_, c) => (F[c] ? String(F[c]()) : fail('unknown format %' + c)));
if (format !== null) console.log(fmt(format));
else if (iso !== null) {
  const isoF = { date: '%F', hours: '%FT%H', minutes: '%FT%H:%M', seconds: '%FT%T' }[iso];
  if (!isoF) fail('unknown -I ' + iso);
  console.log(fmt(isoF) + (iso === 'date' ? '' : z(true)));
} else console.log(d.toUTCString());
`;

// True when this machine's `date` takes GNU date's -d.
const gnuDate = () => {
  const r = spawnSync('date', ['-u', '-d', '1 day ago', '+%s'], { encoding: 'utf8', timeout: LIMIT });
  return r.status === 0;
};

// Runs the one install step of the test job; returns its exit code, its
// output, the npm calls, the workspace, and the time before and after it ran.
function runInstall(t) {
  const { steps } = testJob();
  const found = steps.filter(installsLib);
  assert.equal(found.length, 1, 'the fixture: one step of the test job installs the library');
  const s = found[0];
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'al4-gate-220-step-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const ws = join(dir, 'ws');
  mkdirSync(ws);
  for (const f of ['package.json', 'package-lock.json']) copyFileSync(join(ROOT, f), join(ws, f));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'npm'), NPM_STUB);
  chmodSync(join(bin, 'npm'), 0o755);
  if (!gnuDate()) {
    writeFileSync(join(bin, 'date'), DATE_STUB);
    chmodSync(join(bin, 'date'), 0o755);
  }
  for (const d of ['home', 'runner-temp']) mkdirSync(join(dir, d));
  const log = join(dir, 'npm.log');
  for (const f of [log, join(dir, 'output'), join(dir, 'env'), join(dir, 'path'), join(dir, 'summary')]) writeFileSync(f, '');
  const stepEnv = {};
  for (const [k, v] of Object.entries(s.env ?? {})) stepEnv[k] = String(v);
  const left = `${JSON.stringify(stepEnv)}\n${s.run}`.match(/\$\{\{[^}]*\}\}/);
  assert.equal(left, null, `the install step uses an expression this test does not know: ${left?.[0]}`);
  const file = join(dir, 'step.sh');
  writeFileSync(file, s.run);
  const start = Date.now();
  const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', file], {
    cwd: realpathSync(ws), encoding: 'utf8', input: '', timeout: LIMIT,
    env: {
      PATH: [bin, dirname(process.execPath), '/usr/bin', '/bin'].join(delimiter),
      HOME: join(dir, 'home'), RUNNER_TEMP: join(dir, 'runner-temp'),
      GITHUB_ACTIONS: 'true', GITHUB_WORKSPACE: realpathSync(ws), GITHUB_OUTPUT: join(dir, 'output'),
      GITHUB_ENV: join(dir, 'env'), GITHUB_PATH: join(dir, 'path'), GITHUB_STEP_SUMMARY: join(dir, 'summary'),
      STUB_LOG: log, ...stepEnv,
    },
  });
  const end = Date.now();
  assert.equal(r.signal, null, `the install step was killed (signal ${r.signal}):\n${r.stdout}\n${r.stderr}`);
  const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const files = Object.fromEntries(['package.json', 'package-lock.json'].map((f) => [f, readFileSync(join(ws, f), 'utf8')]));
  return { code: r.status, out: `${r.stdout}\n${r.stderr}`, calls, ws: realpathSync(ws), start, end, files };
}

const showRun = (r) => `exit ${r.code}\n--- output\n${r.out}--- npm calls\n${r.calls.map((c) => `${c.cwd}: npm ${c.args.join(' ')}`).join('\n')}`;
const verbOf = (args) => args.find((a) => !a.startsWith('-'));
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]00:?00)$/;

test('#220 publish.yml, the install step, run with a stub npm: one npm install at the repo top of exactly @huggingface/transformers@4.3.1, with --no-save, --save-peer and --ignore-scripts', (t) => {
  const r = runInstall(t);
  assert.equal(r.code, 0, `the install step should succeed:\n${showRun(r)}`);
  const installs = r.calls.filter((c) => new RegExp(`^(${INSTALLS})$`).test(verbOf(c.args) ?? ''));
  assert.equal(installs.length, 1, `one npm install:\n${showRun(r)}`);
  const { cwd, args } = installs[0];
  assert.equal(cwd, r.ws, `npm install runs at the repo top, where the smoke test and al resolve the library:\n${showRun(r)}`);
  const named = args.filter((a, i) => !a.startsWith('-') && args[i - 1] !== '--before').slice(1);
  assert.deepEqual(named, [INSTALL], `it installs exactly ${INSTALL} and nothing else:\n${showRun(r)}`);
  for (const flag of ['--no-save', '--save-peer', '--ignore-scripts']) {
    assert.ok(args.includes(flag), `npm install has ${flag}:\n${showRun(r)}`);
  }
  for (const a of args) {
    assert.ok(!/^(-g|--global|--prefix|--location|--package-lock-only|--save$|-S$|--save-prod|--save-dev|-D$|--save-optional|-O$)/.test(a),
      `npm install has no ${a}: the library goes into the repo's own node_modules and into no file:\n${showRun(r)}`);
  }
  assert.equal(r.files['package.json'], readFileSync(join(ROOT, 'package.json'), 'utf8'), 'package.json is unchanged');
  assert.equal(r.files['package-lock.json'], readFileSync(join(ROOT, 'package-lock.json'), 'utf8'), 'package-lock.json is unchanged');
});

test('#220 publish.yml, the install step, run with a stub npm: --before is an ISO UTC time 24 hours before the run', (t) => {
  const r = runInstall(t);
  assert.equal(r.code, 0, `the install step should succeed:\n${showRun(r)}`);
  const inst = r.calls.find((c) => new RegExp(`^(${INSTALLS})$`).test(verbOf(c.args) ?? ''));
  assert.ok(inst, `one npm install:\n${showRun(r)}`);
  const i = inst.args.indexOf('--before');
  const value = i >= 0 ? inst.args[i + 1] : inst.args.find((a) => a.startsWith('--before='))?.slice('--before='.length);
  assert.ok(value, `npm install has --before <time>:\n${showRun(r)}`);
  assert.match(value, ISO_UTC, `--before is an ISO time in UTC: ${value}`);
  const when = Date.parse(value);
  // The value may be cut to the second: allow two seconds on each side.
  const lo = r.start - DAY_MS - 2000;
  const hi = r.end - DAY_MS + 2000;
  assert.ok(when >= lo && when <= hi,
    `--before ${value} is 24 hours before the run (between ${new Date(lo).toISOString()} and ${new Date(hi).toISOString()})`);
});

test('#220 publish.yml, the publish job installs nothing and names no library', () => {
  const wf = workflow('publish.yml');
  const jobs = Object.entries(wf?.jobs ?? {}).filter(([, j]) => (j.steps ?? []).some((s) => /\bnpm publish\b/.test(String(s.run ?? ''))));
  assert.equal(jobs.length, 1, 'the fixture: publish.yml has one job with an npm publish step');
  const [id, job] = jobs[0];
  for (const [i, s] of (job.steps ?? []).entries()) {
    const text = JSON.stringify(s);
    assert.ok(!LIB.test(text), `job ${id}, step "${label(s, i)}" names the library`);
    assert.ok(!text.includes(SWITCH), `job ${id}, step "${label(s, i)}" names ${SWITCH}`);
    if (typeof s.run === 'string') {
      assert.deepEqual(npmInstalls(s.run), [], `job ${id}, step "${label(s, i)}" installs something`);
    }
  }
});

test('#220 test.yml names neither @huggingface/transformers nor AL_REQUIRE_REAL_MODEL, so the smoke test skips there', () => {
  const text = readFileSync(WF('test.yml'), 'utf8');
  assert.ok(!LIB.test(text), 'test.yml names the library');
  assert.ok(!text.includes(SWITCH), `test.yml names ${SWITCH}`);
});
