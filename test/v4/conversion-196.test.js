// Issue #196 (T17, the switch): the owner's 0.1.0 sign-off of this request
// moves into the v4 record as S1, with no new sign-off (D19). Built from the
// issue and the record format; it checks this repo's own files. The oracle
// for the requirement hashes is v4's public reader, requirements(text) and
// signedText(md) of src/v4/request-md.js. The one run of the command uses a
// copy of the repo, never the repo itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { requirements, signedText } from '../../src/v4/request-md.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RECORD = '.assuredloop/records/requests/assuredloop-v4.yaml';
const SNAPSHOT_FILE = '2026-10-10-signoff.md';
const SNAPSHOT = `requests/assuredloop-v4/origin/${SNAPSHOT_FILE}`;
const REQUEST = 'requests/assuredloop-v4/request.md';
const MARK = '--- signed text ---\n';
const IDS = Array.from({ length: 14 }, (_, i) => `R${i + 1}`);
const LIMIT = 60_000;

const sha = (data) => createHash('sha256').update(data).digest('hex');
const read = (rel) => readFileSync(join(ROOT, rel));
const record = () => parse(read(RECORD).toString('utf8'));
const byNumber = (a, b) => Number(a.slice(1)) - Number(b.slice(1));

// The snapshot's bytes after the `--- signed text ---` line, and the hash its
// own `SHA-256:` header line states.
function snapshot() {
  const bytes = read(SNAPSHOT);
  const at = bytes.indexOf(MARK);
  assert.ok(at >= 0, `the fixture: ${SNAPSHOT} has a "--- signed text ---" line`);
  assert.ok(at === 0 || bytes[at - 1] === 0x0a, 'the fixture: the marker starts a line');
  const head = bytes.subarray(0, at).toString('utf8');
  const stated = head.match(/^SHA-256:\s*([0-9a-f]{64})\b/m);
  assert.ok(stated, `the fixture: ${SNAPSHOT} has a SHA-256: header line`);
  const signed = bytes.subarray(at + Buffer.byteLength(MARK));
  return { signed, text: signed.toString('utf8'), stated: stated[1] };
}

// requirement id -> sha256, as v4 derives it from `text`.
const hashes = (text) => new Map(requirements(text).map((r) => [r.id, r.sha256]));

test('#196 the v4 record has exactly one sign-off, S1, of 2026-10-10-signoff.md, whose sha256 is the hash of the signed text and the hash the snapshot states', () => {
  const { signed, stated } = snapshot();
  assert.equal(sha(signed), stated, 'the fixture: the snapshot\'s SHA-256: line states the hash of its signed text');
  const so = record().signoff;
  assert.ok(Array.isArray(so), `${RECORD} should have a signoff list`);
  assert.deepEqual(so.map((s) => s.id), ['S1'], 'exactly one sign-off entry, S1');
  assert.equal(so[0].file, SNAPSHOT_FILE);
  assert.equal(so[0].sha256, sha(signed));
});

test('#196 S1 covers R1 to R14, each version 1, each sha256 the hash v4 derives from the signed text and from today\'s request.md', () => {
  const { text } = snapshot();
  const signedHashes = hashes(text);
  assert.deepEqual([...signedHashes.keys()].sort(byNumber), IDS, 'the fixture: the signed text holds R1 to R14');
  const todayHashes = hashes(read(REQUEST).toString('utf8'));
  assert.deepEqual([...todayHashes.keys()].sort(byNumber), IDS, 'request.md holds R1 to R14');
  for (const id of IDS) assert.equal(todayHashes.get(id), signedHashes.get(id), `${id}: request.md's hash should equal the signed one`);

  const covers = record().signoff?.[0]?.covers;
  assert.ok(Array.isArray(covers), 'S1 should have a covers list');
  assert.deepEqual(covers.map((c) => c.id).sort(byNumber), IDS, 'S1 covers R1 to R14, each once');
  for (const c of covers) {
    assert.equal(c.version, 1, `${c.id}: version 1`);
    assert.equal(c.sha256, signedHashes.get(c.id), `${c.id}: sha256 should be the hash v4 derives from the signed text`);
  }
});

test('#196 signedText of today\'s request.md is the snapshot\'s signed text, byte for byte (the markers did not change the signed bytes)', () => {
  const { signed } = snapshot();
  const now = signedText(read(REQUEST).toString('utf8'));
  assert.equal(typeof now, 'string', 'request.md should have an organized requirement');
  assert.ok(Buffer.from(now, 'utf8').equals(signed), `signedText(request.md) should equal the signed text:\n--- now\n${now}--- signed\n${signed}`);
});

test('#196 S1 has a note that says it was converted from 0.1.0', () => {
  const note = record().signoff?.[0]?.note;
  assert.equal(typeof note, 'string', 'S1 should have a note');
  assert.match(note, /converted from\b.*\b0\.1\.0\b/i);
});

// --- The command, in a copy of the repo.

// The environment without anything that points git at another repo or config.
function env() {
  const e = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_') && k !== 'SOURCE_DATE_EPOCH') e[k] = v;
  return {
    ...e, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Fixture Author', GIT_AUTHOR_EMAIL: 'author@example.invalid', GIT_AUTHOR_DATE: '2026-10-10T00:00:00Z',
    GIT_COMMITTER_NAME: 'Fixture Committer', GIT_COMMITTER_EMAIL: 'committer@example.invalid', GIT_COMMITTER_DATE: '2026-10-10T00:00:00Z',
  };
}

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd, env: env(), encoding: 'utf8', timeout: LIMIT });
  assert.equal(r.signal, null, `git ${args.join(' ')} was killed`);
  assert.equal(r.status, 0, `git ${args.join(' ')} failed in ${cwd}:\n${r.stderr}`);
  return r.stdout;
}

// A copy of the repo's working tree (the files git tracks or would track, as
// they are now) in a new one-commit git repo, with node_modules linked in.
function copyRepo(t) {
  const top = mkdtempSync(join(realpathSync(tmpdir()), 'al4-conv-'));
  t.after(() => rmSync(top, { recursive: true, force: true }));
  const dir = join(top, 'repo');
  mkdirSync(dir);
  const files = git(ROOT, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean);
  for (const f of files) {
    if (!existsSync(join(ROOT, f))) continue;
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    cpSync(join(ROOT, f), join(dir, f));
  }
  git(dir, 'init', '-q', '-b', 'main');
  appendFileSync(join(dir, '.git', 'info', 'exclude'), '/node_modules\n');
  if (existsSync(join(ROOT, 'node_modules'))) symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'copy');
  return dir;
}

// Every file under `dir` but .git and node_modules: path -> sha256.
function tree(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (d === dir && (e.name === '.git' || e.name === 'node_modules')) continue;
      if (e.isDirectory()) walk(p);
      else out[relative(dir, p)] = sha(readFileSync(p));
    }
  };
  walk(dir);
  return out;
}

test('#196 node bin/al.js record assuredloop-v4 signoff --source x (no --yes), from the repo top: first line starts "nothing to sign", and it writes nothing', (t) => {
  const dir = copyRepo(t);
  const before = tree(dir);
  const status = git(dir, 'status', '--porcelain');
  const r = spawnSync(process.execPath, ['bin/al.js', 'record', 'assuredloop-v4', 'signoff', '--source', 'x'],
    { cwd: dir, env: env(), input: '', encoding: 'utf8', timeout: LIMIT });
  const show = `exit ${r.status}\n--- stdout\n${r.stdout}--- stderr\n${r.stderr}`;
  assert.equal(r.signal, null, `the run was killed:\n${show}`);
  assert.match(r.stdout.split('\n')[0], /^nothing to sign/, show);
  assert.deepEqual(tree(dir), before, `it should write nothing:\n${show}`);
  assert.equal(git(dir, 'status', '--porcelain'), status, `git status should not change:\n${show}`);
});
