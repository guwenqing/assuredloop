// #99 (kb-search/R10; light-design LD-64 "The checks never use search";
// LD-37 "an upgrade that keeps every task, declared output, decision and
// sign-off readable, and gives the same facts in al check before and after";
// the issue's "the checks unchanged by the setting").
// - al check and al check --strict give the same exit code and output with
//   no setting, none, local, a row, own, a wrong form, an unknown row, a
//   llama.cpp row (#99: a row this version could not run yet; #100 runs it),
//   and an excluded row.
// - An upgrade from 4.0.0 with no setting: a project made by al 4.0.0 (the
//   tag v4.0.0, from git archive) gives the same al check and al check
//   --strict with this al, and its request stays readable (al context).
// Built from the issue and the public interface only; nothing here reads src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BIN, EPOCH, REPO, appendSection, commitAll, doc, editRecord, git, organized, project, req, write, writeConfig,
} from './helpers/project.js';
import { ROW, SMALL_SPEC, smallRepo } from './helpers/search.js';

// One run of `node <bin> ...args` in dir, with the fixed clock and no git
// setting from outside (as helpers/project.js runs al).
function runBin(bin, dir, args, { input = '' } = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_') && k !== 'SOURCE_DATE_EPOCH' && k !== 'NODE_OPTIONS') env[k] = v;
  Object.assign(env, {
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Fixture Author', GIT_AUTHOR_EMAIL: 'author@example.invalid', GIT_AUTHOR_DATE: '2026-05-01T00:00:00Z',
    GIT_COMMITTER_NAME: 'Fixture Committer', GIT_COMMITTER_EMAIL: 'committer@example.invalid', GIT_COMMITTER_DATE: '2026-05-01T00:00:00Z',
    SOURCE_DATE_EPOCH: String(EPOCH),
  });
  const r = spawnSync(process.execPath, [bin, ...args], { cwd: dir, env, input, encoding: 'utf8', timeout: 60_000 });
  return { code: r.status, signal: r.signal, stdout: r.stdout ?? '', stderr: r.stderr ?? '', args, bin };
}
const show = (r) => `${r.bin} ${r.args.join(' ')} -> exit ${r.code} (signal ${r.signal})\n--- stdout\n${r.stdout}--- stderr\n${r.stderr}`;

// The output with each commit hash and the folder of the repo left out, so
// that two repos that differ only in their config can be compared.
const plain = (text, dir) => text.split(dir).join('<repo>').replace(/\b[0-9a-f]{7,64}\b/g, '<sha>');

// --- the checks do not read the setting

const SETTINGS = [
  ['no setting', null],
  ['none', 'none'],
  ['local', 'local'],
  ['a row', { local: ROW }],
  ['own', { own: 'team-kb' }],
  ['a bare own (a wrong form)', 'own'],
  ['a number (a wrong form)', 3],
  ['a list (a wrong form)', ['local']],
  ['a map with another key (a wrong form)', { remote: 'team-kb' }],
  ['an unknown row', { local: 'all-minilm-l6-v2 fp32 tjs-cpu' }],
  ['a llama.cpp row (#100: no longer a row this version cannot run)', { local: 'qwen3-embedding-4b q8_0 llama-metal' }],
  ['an excluded row', { local: 'qwen3-embedding-0.6b q8 tjs-cpu' }],
];

test('#99 al check and al check --strict give the same exit code and output with any search setting, a wrong one included, and with none', (t) => {
  const answers = SETTINGS.map(([name, setting]) => {
    const { dir } = smallRepo(t, { search: setting });
    const runs = [['check'], ['check', '--strict'], ['check', '--full']].map((args) => runBin(BIN, dir, args));
    for (const r of runs) assert.equal(r.signal, null, `${name}:\n${show(r)}`);
    return { name, dir, runs };
  });
  const [base] = answers;
  for (const r of base.runs) assert.ok([0, 1].includes(r.code), `the fixture: al check runs to its end:\n${show(r)}`);
  for (const a of answers.slice(1)) {
    a.runs.forEach((r, i) => {
      const b = base.runs[i];
      assert.equal(r.code, b.code, `${a.name}: the same exit code as with no setting:\n${show(r)}\n--- with no setting\n${show(b)}`);
      assert.equal(plain(r.stdout, a.dir), plain(b.stdout, base.dir), `${a.name}: the same output as with no setting:\n${show(r)}\n--- with no setting\n${show(b)}`);
      assert.equal(plain(r.stderr, a.dir), plain(b.stderr, base.dir), `${a.name}: the same standard error`);
    });
  }
});

test('#99 al check gives the same answer when the setting changes in the working tree', (t) => {
  const { dir } = smallRepo(t, { search: null });
  const first = [runBin(BIN, dir, ['check']), runBin(BIN, dir, ['check', '--strict'])];
  for (const [, setting] of SETTINGS.slice(1)) {
    write(dir, '.assuredloop/config.yaml', `repo: acme\ndocs:\n  - {file: specs/exports.md, prefix: EXP}\nsearch: ${JSON.stringify(setting)}\n`);
    git(dir, 'add', '--', '.assuredloop/config.yaml');
    const now = [runBin(BIN, dir, ['check']), runBin(BIN, dir, ['check', '--strict'])];
    now.forEach((r, i) => {
      assert.equal(r.code, first[i].code, `search: ${JSON.stringify(setting)}:\n${show(r)}`);
      assert.equal(r.stdout, first[i].stdout, `search: ${JSON.stringify(setting)}: the same output:\n${show(r)}\n--- with no setting\n${show(first[i])}`);
    });
    git(dir, 'checkout', '-q', 'HEAD', '--', '.assuredloop/config.yaml');
  }
});

// --- an upgrade from 4.0.0

// bin/al.js of the tag v4.0.0, from git archive, with the repo's node_modules.
function oldAl(t) {
  const tags = spawnSync('git', ['tag', '--list', 'v4.0.0'], { cwd: REPO, encoding: 'utf8' });
  assert.equal(tags.stdout.trim(), 'v4.0.0', 'the tag v4.0.0 is in this clone (CI fetches all history; fetch the tags)');
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'al-99-v400-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const tar = join(dir, 'v4.0.0.tar');
  const a = spawnSync('git', ['archive', '--format=tar', '-o', tar, 'v4.0.0'], { cwd: REPO, encoding: 'utf8' });
  assert.equal(a.status, 0, a.stderr);
  const top = join(dir, 'al');
  mkdirSync(top);
  const x = spawnSync('tar', ['-xf', tar, '-C', top], { encoding: 'utf8' });
  assert.equal(x.status, 0, x.stderr);
  symlinkSync(join(REPO, 'node_modules'), join(top, 'node_modules'), 'dir');
  const bin = join(top, 'bin', 'al.js');
  const v = runBin(bin, dir, ['--version']);
  assert.match(v.stdout, /^al 4\.0\.0\b/, `the fixture: al 4.0.0 runs:\n${show(v)}`);
  return bin;
}

const R1 = req('R1', 'Reminders', 'Invoicer MUST send a reminder 7 days after the due date of an unpaid invoice.');
const D1 = 'A reminder goes by email only.';

// A project made with al 4.0.0: a spec on main, then on a branch an open
// request with a signed requirement, a decision, a change spec that serves
// it, a declared output and a result.
function madeBy(t, bin) {
  const ok = (dir, args, opts) => {
    const r = runBin(bin, dir, args, opts);
    assert.equal(r.code, 0, `the fixture, made by al 4.0.0:\n${show(r)}`);
    return r;
  };
  const dir = project(t);
  writeConfig(dir, [{ file: 'specs/exports.md', prefix: 'EXP' }], { repo: 'acme' });
  write(dir, 'specs/exports.md', SMALL_SPEC);
  commitAll(dir, 'A: the spec');
  git(dir, 'checkout', '-q', '-b', 'reminders');
  ok(dir, ['new', 'reminders', '--from', '-', '--tier', '2'], { input: 'Customers forget to pay. Remind them once.\n' });
  appendSection(dir, 'reminders', organized([R1]));
  ok(dir, ['record', 'reminders', 'signoff', '--source', 'owner by email', '--words', 'yes, sign it', '--yes']);
  ok(dir, ['record', 'reminders', 'decision', '--source', 'owner', '--text', D1, '--yes']);
  write(dir, 'requests/reminders/spec.md', doc([
    ['SP-1 note', '# Reminders: the change'],
    ['SP-2 rule serves:R1 changes:EXP-4', 'Invoicer MUST send one reminder email 7 days after the due date.'],
  ]));
  write(dir, 'src/reminders.js', '// cites reminders/SP-2\nexport const days = 7;\n');
  editRecord(dir, 'reminders', (rec) => { rec.outputs = [{ file: 'src/reminders.js', implements: ['SP-2'] }]; });
  ok(dir, ['index']);
  commitAll(dir, 'B: the reminders request');
  return dir;
}

// The facts of an al check output: each line, but the "ok: nothing found by"
// line as the set of the checks it names. A check added after 4.0.0 (#95
// added no-paragraph-link, for example) adds a name to that line and no fact.
function facts(stdout) {
  const ok = new Set();
  const lines = [];
  for (const l of stdout.split('\n')) {
    const m = l.match(/^ok: nothing found by (.*)$/);
    if (m) m[1].split(', ').forEach((x) => ok.add(x));
    else lines.push(l);
  }
  return { lines, ok };
}

test('#99 an upgrade from 4.0.0 with no setting: al check and al check --strict give the same facts before and after', (t) => {
  const bin = oldAl(t);
  const dir = madeBy(t, bin);
  for (const args of [['check'], ['check', '--strict'], ['check', '--full']]) {
    const before = runBin(bin, dir, args);
    const after = runBin(BIN, dir, args);
    assert.equal(after.code, before.code, `the same exit code:\n${show(after)}\n--- al 4.0.0\n${show(before)}`);
    const [a, b] = [facts(after.stdout), facts(before.stdout)];
    assert.deepEqual(a.lines, b.lines, `the same lines:\n${show(after)}\n--- al 4.0.0\n${show(before)}`);
    assert.ok(b.ok.size > 0, `the fixture: al 4.0.0 gives an ok line:\n${show(before)}`);
    for (const x of b.ok) assert.ok(a.ok.has(x), `${x} still finds nothing:\n${show(after)}`);
  }
});

test('#99 an upgrade from 4.0.0 with no setting: the request, its sign-off, decision and declared output stay readable (al context)', (t) => {
  const bin = oldAl(t);
  const dir = madeBy(t, bin);
  const before = runBin(bin, dir, ['context', 'reminders']);
  assert.equal(before.code, 0, show(before));
  const after = runBin(BIN, dir, ['context', 'reminders']);
  assert.equal(after.code, 0, show(after));
  for (const text of [D1, 'src/reminders.js', 'R1']) {
    if (before.stdout.includes(text)) assert.ok(after.stdout.includes(text), `al context still shows "${text}":\n${show(after)}`);
  }
  assert.ok(after.stdout.includes(D1), `al context shows the decision:\n${show(after)}`);
});
