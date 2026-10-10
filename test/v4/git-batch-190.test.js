// Issue #190: read files at a commit with one git process. src/v4/git.js:
// filesAt(top, commit, paths, encoding = 'utf8') and readObjects(top, names),
// beside fileAt and blobAt; and `al-v4 check` and `al-v4 index` start about
// as many git processes for 60 docs (or requests) as for 5. Written before the
// code, from the issue and the interface note (interface-190.md).
// Round b ("Git versions", review of PR #191): the reads use only what git
// 2.31 has (`cat-file --batch`, one name on each line, no -z or -Z); a name
// that holds a newline or ends in a carriage return gets its own process.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as gitjs from '../../src/v4/git.js';
import { makeRepo } from './helpers/repo.js';
import { project, write, writeYaml, commitAll, git as pgit, al, show, newRequest, tree, baseProject } from './helpers/project.js';
import { buildWorld, run as runSearch, show as showSearch } from './helpers/search.js';

const GIT_JS = fileURLToPath(new URL('../../src/v4/git.js', import.meta.url));

// The new functions, with a clear failure while they are not exported.
function fn(name) {
  assert.equal(typeof gitjs[name], 'function', `src/v4/git.js exports ${name}`);
  return gitjs[name];
}
const { fileAt, blobAt } = gitjs;

// --- a repo with files of every kind the interface names

const BINARY = Buffer.concat([
  Buffer.from(Array.from({ length: 256 }, (_, i) => i)),
  Buffer.from([0xff, 0xfe, 0x00, 0xc3, 0x28, 0xe2, 0x82, 0x0a, 0x00]),
]);
// Over 64 KiB, with multi-byte letters, so a read in chunks splits some.
const BIG = 'aé€😀 line of text\n'.repeat(20000);
const HASHLIKE = `${'a'.repeat(40)} blob 5\nHELLO\n${'b'.repeat(40)} missing\n`;

const FILES = {
  'a.txt': 'alpha\n',
  'dir with space/b c.md': 'b and c\n',
  'données/é.md': 'Les données. Ça marche.\n',
  'odd\nname.md': 'a newline in the name\n',
  'sub/deep/c.md': '# Deep\n\nText.\n',
  'sub/top.md': 'top of sub\n',
  'empty.md': '',
  'bin.dat': BINARY,
  'crlf.txt': 'one\r\ntwo\r\nno newline at the end',
  'big.txt': BIG,
  'hashlike.txt': HASHLIKE,
  'tab\tand "quote".md': 'tab and quote\n',
  'sp/ends in space ': 'a name that ends in a space\n',
  '-dash.md': 'a name that starts with a dash\n',
  'cr/ends in cr\r': 'a name that ends in a carriage return\n',
  'cr/cr\rinside.md': 'a carriage return inside the name\n',
};
const MISSING = ['missing.md', 'sub/missing.md', 'a.txt/inside', 'nope/deeper/x.md'];
const FOLDERS = ['sub', 'sub/deep', 'dir with space', 'données'];
const FILE_PATHS = Object.keys(FILES);
const ALL = [...FILE_PATHS, ...MISSING, ...FOLDERS];

const asBuffer = (v) => (Buffer.isBuffer(v) ? v : Buffer.from(v, 'utf8'));

function filesRepo(t) {
  const repo = makeRepo(t);
  for (const [p, content] of Object.entries(FILES)) repo.write(p, content);
  const commit = repo.commit('files of every kind');
  return { repo, top: repo.dir, commit };
}

const UNKNOWN = ['0'.repeat(40), 'no-such-branch'];

describe('filesAt(top, commit, paths, encoding)', () => {
  test('each file gives the same text as fileAt, and its own content', (t) => {
    const { top, commit } = filesRepo(t);
    const got = fn('filesAt')(top, commit, ALL);
    assert.ok(got instanceof Map, 'filesAt returns a Map');
    for (const p of FILE_PATHS) {
      assert.equal(got.get(p), fileAt(top, commit, p), `same as fileAt for ${JSON.stringify(p)}`);
      assert.equal(got.get(p), asBuffer(FILES[p]).toString('utf8'), `the content of ${JSON.stringify(p)}`);
    }
    assert.equal(got.get('empty.md'), '', 'an empty file gives an empty string, not null');
  });

  test('a missing path gives null, as fileAt does', (t) => {
    const { top, commit } = filesRepo(t);
    const got = fn('filesAt')(top, commit, ALL);
    for (const p of MISSING) {
      assert.ok(got.has(p), `${JSON.stringify(p)} is a key`);
      assert.equal(got.get(p), null, `null for ${JSON.stringify(p)}`);
      assert.equal(fileAt(top, commit, p), null, `fileAt gives null for ${JSON.stringify(p)}`);
    }
  });

  test('a folder gives null', (t) => {
    const { top, commit } = filesRepo(t);
    const got = fn('filesAt')(top, commit, ALL);
    for (const p of FOLDERS) {
      assert.ok(got.has(p), `${JSON.stringify(p)} is a key`);
      assert.equal(got.get(p), null, `null for the folder ${JSON.stringify(p)}`);
    }
  });

  test('the keys are the paths given, each once', (t) => {
    const { top, commit } = filesRepo(t);
    const got = fn('filesAt')(top, commit, ALL);
    assert.deepEqual([...got.keys()].sort(), [...ALL].sort());
  });

  test('with encoding null each file gives the same Buffer as blobAt; a missing path and a folder give null', (t) => {
    const { top, commit } = filesRepo(t);
    const got = fn('filesAt')(top, commit, ALL, null);
    for (const p of FILE_PATHS) {
      const v = got.get(p);
      assert.ok(Buffer.isBuffer(v), `a Buffer for ${JSON.stringify(p)}`);
      assert.ok(v.equals(blobAt(top, commit, p)), `same bytes as blobAt for ${JSON.stringify(p)}`);
      assert.ok(v.equals(asBuffer(FILES[p])), `the bytes of ${JSON.stringify(p)}`);
    }
    for (const p of [...MISSING, ...FOLDERS]) assert.equal(got.get(p), null, `null for ${JSON.stringify(p)}`);
  });

  test('another encoding gives the bytes decoded in it', (t) => {
    const { top, commit } = filesRepo(t);
    const got = fn('filesAt')(top, commit, ['bin.dat', 'données/é.md', 'missing.md'], 'latin1');
    assert.equal(got.get('bin.dat'), BINARY.toString('latin1'));
    assert.equal(got.get('données/é.md'), Buffer.from(FILES['données/é.md'], 'utf8').toString('latin1'));
    assert.equal(got.get('missing.md'), null);
  });

  test('a commit that does not resolve gives null for every path', (t) => {
    const { top } = filesRepo(t);
    for (const bad of UNKNOWN) {
      const got = fn('filesAt')(top, bad, ALL);
      assert.deepEqual([...got.keys()].sort(), [...ALL].sort(), `every path is a key for ${bad}`);
      for (const p of ALL) assert.equal(got.get(p), null, `null for ${JSON.stringify(p)} at ${bad}`);
    }
  });

  test('an empty list gives an empty Map', (t) => {
    const { top, commit } = filesRepo(t);
    const got = fn('filesAt')(top, commit, []);
    assert.ok(got instanceof Map);
    assert.equal(got.size, 0);
  });

  test('the same path twice is one key', (t) => {
    const { top, commit } = filesRepo(t);
    const got = fn('filesAt')(top, commit, ['a.txt', 'missing.md', 'a.txt', 'missing.md', 'sub/top.md']);
    assert.equal(got.size, 3);
    assert.equal(got.get('a.txt'), 'alpha\n');
    assert.equal(got.get('missing.md'), null);
    assert.equal(got.get('sub/top.md'), 'top of sub\n');
  });

  test('a file that changed between two commits gives the text at the commit asked for', (t) => {
    const repo = makeRepo(t);
    repo.write('a.txt', 'one\n');
    repo.write('gone.md', 'here at the first commit\n');
    const first = repo.commit('first');
    repo.write('a.txt', 'two\n');
    repo.remove('gone.md');
    repo.write('added.md', 'here at the second commit\n');
    const second = repo.commit('second');
    const paths = ['a.txt', 'gone.md', 'added.md'];
    const filesAt = fn('filesAt');
    const at1 = filesAt(repo.dir, first, paths);
    const at2 = filesAt(repo.dir, second, paths);
    assert.deepEqual(Object.fromEntries(at1), { 'a.txt': 'one\n', 'gone.md': 'here at the first commit\n', 'added.md': null });
    assert.deepEqual(Object.fromEntries(at2), { 'a.txt': 'two\n', 'gone.md': null, 'added.md': 'here at the second commit\n' });
    for (const [c, got] of [[first, at1], [second, at2]]) {
      for (const p of paths) assert.equal(got.get(p), fileAt(repo.dir, c, p), `same as fileAt for ${p} at ${c}`);
    }
  });
});

describe('fileAt and blobAt', () => {
  test('fileAt: a file gives its text; a missing path and an unknown commit give null', (t) => {
    const { top, commit } = filesRepo(t);
    for (const p of FILE_PATHS) assert.equal(fileAt(top, commit, p), asBuffer(FILES[p]).toString('utf8'), JSON.stringify(p));
    for (const p of MISSING) assert.equal(fileAt(top, commit, p), null, JSON.stringify(p));
    for (const bad of UNKNOWN) assert.equal(fileAt(top, bad, 'a.txt'), null, bad);
  });

  test('blobAt: a file gives its bytes; a missing path, a folder and an unknown commit give null', (t) => {
    const { top, commit } = filesRepo(t);
    for (const p of FILE_PATHS) {
      const v = blobAt(top, commit, p);
      assert.ok(Buffer.isBuffer(v), JSON.stringify(p));
      assert.ok(v.equals(asBuffer(FILES[p])), JSON.stringify(p));
    }
    for (const p of [...MISSING, ...FOLDERS]) assert.equal(blobAt(top, commit, p), null, JSON.stringify(p));
    for (const bad of UNKNOWN) assert.equal(blobAt(top, bad, 'a.txt'), null, bad);
  });

  test('fileAt: a folder gives null', (t) => {
    const { top, commit } = filesRepo(t);
    for (const p of FOLDERS) assert.equal(fileAt(top, commit, p), null, `null for the folder ${JSON.stringify(p)}`);
  });
});

describe('readObjects(top, names)', () => {
  test('a blob hash and a <commit>:<path> name give their bytes', (t) => {
    const { repo, top, commit } = filesRepo(t);
    const names = [
      repo.git(['rev-parse', `${commit}:a.txt`]),
      repo.git(['rev-parse', `${commit}:bin.dat`]),
      `${commit}:bin.dat`,
      `${commit}:dir with space/b c.md`,
      `${commit}:données/é.md`,
      `${commit}:big.txt`,
      `${commit}:empty.md`,
    ];
    const got = fn('readObjects')(top, names);
    assert.ok(got instanceof Map, 'readObjects returns a Map');
    const want = [FILES['a.txt'], BINARY, BINARY, FILES['dir with space/b c.md'], FILES['données/é.md'], BIG, ''];
    names.forEach((n, i) => {
      const v = got.get(n);
      assert.ok(Buffer.isBuffer(v), `a Buffer for ${n}`);
      assert.ok(v.equals(asBuffer(want[i])), `the bytes of ${n}`);
    });
    assert.equal(got.size, names.length);
  });

  test('a missing name, a tree name and a commit name are not in the Map', (t) => {
    const { repo, top, commit } = filesRepo(t);
    const blob = `${commit}:a.txt`;
    const notBlobs = [
      '0'.repeat(40),
      `${commit}:missing.md`,
      'no-such-branch:a.txt',
      'not a name at all',
      `${commit}:sub`,
      repo.git(['rev-parse', `${commit}:sub`]),
      `${commit}^{tree}`,
      commit,
      'HEAD',
    ];
    const got = fn('readObjects')(top, [blob, ...notBlobs]);
    assert.ok(got.get(blob)?.equals(Buffer.from('alpha\n')), 'the blob is read beside them');
    for (const n of notBlobs) assert.ok(!got.has(n), `${n} is not in the Map`);
    assert.equal(got.size, 1);
  });

  test('an empty list gives an empty Map', (t) => {
    const { top } = filesRepo(t);
    const got = fn('readObjects')(top, []);
    assert.ok(got instanceof Map);
    assert.equal(got.size, 0);
  });
});

// --- counting git processes: a `git` first on PATH that logs a line, then
// runs the real git.

const MARK = 'GITCALL';

function realGit() {
  const r = spawnSync('/bin/sh', ['-c', 'command -v git'], { encoding: 'utf8' });
  const p = r.stdout.trim();
  assert.ok(r.status === 0 && p.startsWith('/'), `command -v git finds git: ${JSON.stringify(r.stdout)} ${r.stderr}`);
  return p;
}

// A temp folder with the wrapper; `count()` reads how many git processes ran
// since the last `reset()`. With `old: true` the wrapper acts as git 2.31: a
// `cat-file` call with -z or -Z (git 2.38, 2.42) or --batch-command (2.36)
// exits 129 with a usage error, and `refused()` lists those calls.
function gitCounter(t, { old = false } = {}) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'al4-gitwrap-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = join(dir, 'calls.log');
  const wrapper = join(dir, 'git');
  const refuse = old ? [
    'cat=0',
    'for a in "$@"; do',
    '  if [ "$a" = cat-file ]; then cat=1; fi',
    '  if [ $cat = 1 ]; then',
    '    case "$a" in',
    `      -z|-Z|--batch-command) printf 'REFUSED %s\\n' "$*" >> '${log}'; echo "error: unknown switch '$a' (git 2.31)" >&2; echo "usage: git cat-file (-t | -s | -e | -p | <type>) <object>" >&2; exit 129;;`,
    '    esac',
    '  fi',
    'done',
  ] : [];
  writeFileSync(wrapper, ['#!/bin/sh', `printf '${MARK} %s\\n' "$*" >> '${log}'`, ...refuse, `exec '${realGit()}' "$@"`, ''].join('\n'));
  chmodSync(wrapper, 0o755);
  const logLines = () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n') : []);
  const calls = () => logLines().filter((l) => l.startsWith(`${MARK} `));
  return {
    PATH: `${dir}:${process.env.PATH}`,
    reset: () => rmSync(log, { force: true }),
    calls,
    refused: () => logLines().filter((l) => l.startsWith('REFUSED ')),
    count: () => calls().length,
  };
}

function childEnv(PATH) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', PATH };
}

// Runs calls [name, args] of src/v4/git.js in one child node process with the
// wrapper first on PATH, and gives each result: a Map as its entries, a value
// as it is (a Buffer as {b64}, a string as {s}).
const CHILD = `
import { readFileSync } from 'node:fs';
const { mod, calls } = JSON.parse(readFileSync(0, 'utf8'));
const m = await import(mod);
const enc = (v) => (v === null ? null : Buffer.isBuffer(v) ? { b64: v.toString('base64') } : typeof v === 'string' ? { s: v } : { other: String(v) });
const out = [];
for (const [name, args] of calls) {
  if (typeof m[name] !== 'function') { console.log(JSON.stringify({ missing: name })); process.exit(3); }
  const r = await m[name](...args);
  out.push(r instanceof Map ? { map: [...r].map(([k, v]) => [k, enc(v)]) } : { value: enc(r) });
}
console.log(JSON.stringify(out));
`;
const dec = (v) => (v === null ? null : v.b64 !== undefined ? Buffer.from(v.b64, 'base64') : v.s !== undefined ? v.s : v);

function runChild(counter, calls) {
  counter.reset();
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD], {
    input: JSON.stringify({ mod: pathToFileURL(GIT_JS).href, calls }),
    env: childEnv(counter.PATH),
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 1 << 28,
  });
  assert.equal(r.status, 0, `child ${calls.map(([n]) => n).join(', ')}: exit ${r.status} ${r.signal ?? ''}\n${r.stdout}\n${r.stderr}`);
  const results = JSON.parse(r.stdout.trim().split('\n').at(-1))
    .map((x) => (x.map ? new Map(x.map.map(([k, v]) => [k, dec(v)])) : dec(x.value)));
  return { results, processes: counter.count(), calls: counter.calls(), refused: counter.refused() };
}

// One call `name`(...args): the Map's size, its non-null values, and the
// number of git processes the call started.
function countIn(counter, name, args) {
  const { results: [r], ...rest } = runChild(counter, [[name, args]]);
  const map = r instanceof Map;
  return { map, size: map ? r.size : undefined, found: map ? [...r.values()].filter((v) => v !== null).length : undefined, ...rest };
}

function manyFilesRepo(t, n) {
  const repo = makeRepo(t);
  for (let i = 1; i <= n; i++) repo.write(`docs/f${i}.md`, `file ${i}\n`);
  return { top: repo.dir, commit: repo.commit(`${n} files`), repo };
}

describe('one git process for any number of paths', () => {
  test('filesAt starts one git process for 3 paths and for 80, and none for an empty list', (t) => {
    const { top, commit } = manyFilesRepo(t, 80);
    const counter = gitCounter(t);
    const paths80 = [...Array.from({ length: 76 }, (_, i) => `docs/f${i + 1}.md`), 'missing.md', 'docs', 'nope/x.md', 'docs/f1.md'];
    const three = countIn(counter, 'filesAt', [top, commit, ['docs/f1.md', 'docs/f2.md', 'missing.md']]);
    assert.deepEqual([three.map, three.size, three.found], [true, 3, 2], JSON.stringify(three));
    assert.equal(three.processes, 1, `one git process for 3 paths:\n${three.calls.join('\n')}`);
    const eighty = countIn(counter, 'filesAt', [top, commit, paths80]);
    assert.deepEqual([eighty.map, eighty.size, eighty.found], [true, 79, 76], JSON.stringify(eighty));
    assert.equal(eighty.processes, 1, `one git process for 80 paths:\n${eighty.calls.join('\n')}`);
    const none = countIn(counter, 'filesAt', [top, commit, []]);
    assert.equal(none.size, 0);
    assert.equal(none.processes, 0, `no git process for an empty list:\n${none.calls.join('\n')}`);
  });

  test('filesAt with encoding null also starts one git process', (t) => {
    const { top, commit } = manyFilesRepo(t, 80);
    const counter = gitCounter(t);
    const paths = Array.from({ length: 80 }, (_, i) => `docs/f${i + 1}.md`);
    const got = countIn(counter, 'filesAt', [top, commit, paths, null]);
    assert.deepEqual([got.size, got.found], [80, 80], JSON.stringify(got));
    assert.equal(got.processes, 1, got.calls.join('\n'));
  });

  test('readObjects starts one git process for 3 names and for 80, and none for an empty list', (t) => {
    const { top, commit } = manyFilesRepo(t, 80);
    const counter = gitCounter(t);
    const names = (k) => Array.from({ length: k }, (_, i) => `${commit}:docs/f${i + 1}.md`);
    const three = countIn(counter, 'readObjects', [top, names(3)]);
    assert.deepEqual([three.map, three.size, three.found], [true, 3, 3], JSON.stringify(three));
    assert.equal(three.processes, 1, three.calls.join('\n'));
    const eighty = countIn(counter, 'readObjects', [top, [...names(78), `${commit}:missing.md`, commit]]);
    assert.deepEqual([eighty.map, eighty.size, eighty.found], [true, 78, 78], JSON.stringify(eighty));
    assert.equal(eighty.processes, 1, eighty.calls.join('\n'));
    const none = countIn(counter, 'readObjects', [top, []]);
    assert.equal(none.size, 0);
    assert.equal(none.processes, 0, none.calls.join('\n'));
  });

  // "Git versions": a name with a newline, or one that ends in a carriage
  // return, cannot go on a batch line, so it gets one process of its own.
  test('a path or name with a newline or an ending CR adds one git process each, with the right value', (t) => {
    const repo = makeRepo(t);
    for (let i = 1; i <= 76; i++) repo.write(`docs/f${i}.md`, `file ${i}\n`);
    const odd = { 'odd/new\nline.md': 'newline one\n', 'odd/two\nnew\nlines.md': 'newline two\n', 'odd/ends in cr\r': 'cr one\n' };
    for (const [p, text] of Object.entries(odd)) repo.write(p, text);
    repo.write('odd/cr\rinside.md', 'cr inside\n');
    const commit = repo.commit('plain and odd names');
    const counter = gitCounter(t);
    const plain = [...Array.from({ length: 76 }, (_, i) => `docs/f${i + 1}.md`), 'odd/cr\rinside.md', 'missing.md'];
    const oddPaths = Object.keys(odd);

    const files = runChild(counter, [['filesAt', [repo.dir, commit, [...plain, ...oddPaths]]]]);
    const got = files.results[0];
    assert.equal(got.size, plain.length + oddPaths.length);
    for (const [p, text] of Object.entries(odd)) assert.equal(got.get(p), text, JSON.stringify(p));
    assert.equal(got.get('odd/cr\rinside.md'), 'cr inside\n');
    assert.equal(got.get('docs/f76.md'), 'file 76\n');
    assert.equal(got.get('missing.md'), null);
    assert.equal(files.processes, 1 + oddPaths.length,
      `one process for the plain paths, one for each of ${oddPaths.length} odd paths:\n${files.calls.join('\n')}`);

    const names = [...plain.map((p) => `${commit}:${p}`), ...oddPaths.map((p) => `${commit}:${p}`)];
    const objects = runChild(counter, [['readObjects', [repo.dir, names]]]);
    const bytes = objects.results[0];
    for (const [p, text] of Object.entries(odd)) assert.ok(bytes.get(`${commit}:${p}`)?.equals(Buffer.from(text)), JSON.stringify(p));
    assert.ok(!bytes.has(`${commit}:missing.md`));
    assert.equal(bytes.size, names.length - 1);
    assert.equal(objects.processes, 1 + oddPaths.length,
      `one process for the plain names, one for each of ${oddPaths.length} odd names:\n${objects.calls.join('\n')}`);
  });
});

// --- al check and al index: the count of git processes does not grow with N

// How many more git processes a run with 60 may start than a run with 5.
const SLACK = 3;

// Doc i at the base and on the branch: the branch rewords D<i>-2 and adds D<i>-3.
const docName = (i) => (i === 2 ? 'specs/doc 2.md' : i === 3 ? 'specs/données 3.md' : `specs/doc${i}.md`);
const baseDoc = (i) => `<!-- D${i}-1 note -->\n\n# Doc ${i}\n\n<!-- D${i}-2 rule serves:R1 -->\n\nDoc ${i} MUST work.\n`;
const branchDoc = (i) => `${baseDoc(i).replace(`Doc ${i} MUST work.`, `Doc ${i} MUST work every day.`)}\n<!-- D${i}-3 rule serves:R1 -->\n\nDoc ${i} MUST log.\n`;

function checkRepo(t, n) {
  const dir = project(t);
  for (let i = 1; i <= n; i++) write(dir, docName(i), baseDoc(i));
  commitAll(dir, `${n} docs`);
  pgit(dir, 'checkout', '-q', '-b', 'feature');
  for (let i = 1; i <= n; i++) write(dir, docName(i), branchDoc(i));
  commitAll(dir, `change ${n} docs`);
  return dir;
}

const outLines = (r) => r.stdout.replace(/\n+$/, '').split('\n');

function checkRun(t, n) {
  const dir = checkRepo(t, n);
  const counter = gitCounter(t);
  counter.reset();
  const r = al(dir, ['check'], { env: { PATH: counter.PATH } });
  const processes = counter.count();
  const calls = counter.calls();
  assert.equal(r.code, 0, show(r));
  // What a reader needs: each ID the branch changed, and no lint.
  const want = [];
  for (let i = 1; i <= n; i++) want.push(`${docName(i)} D${i}-2 Changed`, `${docName(i)} D${i}-3 New`);
  const changeLines = outLines(r).filter((l) => l.startsWith('specs/'));
  assert.deepEqual([...changeLines].sort(), [...want].sort(), show(r));
  assert.ok(outLines(r).includes('ok: no marker lint'), show(r));
  assert.deepEqual(outLines(r).filter((l) => /^(not ok|hint) /.test(l)), [], show(r));
  assert.match(r.stdout, /^Read {6}working tree · base [0-9a-f]+ \(merge-base with main\)$/m, show(r));
  // The same output without the wrapper.
  const plain = al(dir, ['check']);
  assert.equal(plain.stdout, r.stdout, 'the wrapper does not change the output');
  assert.ok(calls.some((l) => l.includes('merge-base')), `the wrapper saw al's git:\n${calls.join('\n')}`);
  return { processes, calls };
}

function indexRepo(t, n) {
  const dir = project(t);
  write(dir, 'README.md', 'fixture\n');
  commitAll(dir, 'initial');
  for (let i = 1; i <= n; i++) newRequest(dir, `r${i}`);
  commitAll(dir, `${n} requests`);
  pgit(dir, 'checkout', '-q', '-b', 'feature');
  return dir;
}

function indexRun(t, n) {
  const dir = indexRepo(t, n);
  const counter = gitCounter(t);
  counter.reset();
  const r = al(dir, ['index'], { env: { PATH: counter.PATH } });
  const processes = counter.count();
  const calls = counter.calls();
  assert.equal(r.code, 0, show(r));
  assert.match(r.stdout, new RegExp(`\\b${n} request records\\b`), show(r));
  assert.ok(calls.some((l) => l.includes('merge-base')), `the wrapper saw al's git:\n${calls.join('\n')}`);
  // Nothing on the branch to change, so a second run, without the wrapper, gives the same output.
  const plain = al(dir, ['index']);
  assert.equal(plain.code, 0, show(plain));
  assert.equal(plain.stdout, r.stdout, 'the same output without the wrapper');
  return { processes, calls };
}

describe('al-v4 check and al-v4 index start about as many git processes for 60 as for 5', () => {
  test('check: a branch that changes 5 docs and one that changes 60', (t) => {
    const five = checkRun(t, 5);
    const sixty = checkRun(t, 60);
    assert.ok(sixty.processes <= five.processes + SLACK,
      `git processes: ${five.processes} for 5 docs, ${sixty.processes} for 60\n--- 60:\n${sixty.calls.join('\n')}`);
  });

  test('index: a branch with 5 requests and one with 60', (t) => {
    const five = indexRun(t, 5);
    const sixty = indexRun(t, 60);
    assert.ok(sixty.processes <= five.processes + SLACK,
      `git processes: ${five.processes} for 5 requests, ${sixty.processes} for 60\n--- 60:\n${sixty.calls.join('\n')}`);
  });
});

// --- "Git versions": on a git that has no `cat-file -z` or `-Z` (git 2.31,
// the oldest the README allows) every read still gives the right value.

// How al prints a path in a line: control characters as \xNN, as bin/al-v4.js does.
const shownPath = (p) => p.replace(/[\x00-\x1f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);

describe('on git 2.31: no cat-file -z, -Z or --batch-command', () => {
  test('filesAt gives every value, with utf8 and with encoding null', (t) => {
    const { top, commit } = filesRepo(t);
    const old = gitCounter(t, { old: true });
    const { results: [text, raw], refused } = runChild(old, [['filesAt', [top, commit, ALL]], ['filesAt', [top, commit, ALL, null]]]);
    assert.deepEqual([...text.keys()].sort(), [...ALL].sort());
    for (const p of FILE_PATHS) {
      assert.equal(text.get(p), asBuffer(FILES[p]).toString('utf8'), `the text of ${JSON.stringify(p)}`);
      assert.ok(Buffer.isBuffer(raw.get(p)) && raw.get(p).equals(asBuffer(FILES[p])), `the bytes of ${JSON.stringify(p)}`);
    }
    for (const p of [...MISSING, ...FOLDERS]) {
      assert.equal(text.get(p), null, JSON.stringify(p));
      assert.equal(raw.get(p), null, JSON.stringify(p));
    }
    assert.deepEqual(refused, [], 'no cat-file call that git 2.31 refuses');
  });

  test('readObjects gives the bytes of each blob, names with a newline or an ending CR included; the rest are not in the Map', (t) => {
    const { repo, top, commit } = filesRepo(t);
    const old = gitCounter(t, { old: true });
    const blobs = FILE_PATHS.map((p) => [`${commit}:${p}`, asBuffer(FILES[p])]);
    blobs.push([repo.git(['rev-parse', `${commit}:a.txt`]), Buffer.from(FILES['a.txt'])]);
    const notBlobs = ['0'.repeat(40), `${commit}:missing.md`, `${commit}:sub`, commit];
    const { results: [got], refused } = runChild(old, [['readObjects', [top, [...blobs.map(([n]) => n), ...notBlobs]]]]);
    for (const [n, want] of blobs) assert.ok(got.get(n)?.equals(want), `the bytes of ${JSON.stringify(n)}`);
    for (const n of notBlobs) assert.ok(!got.has(n), `${n} is not in the Map`);
    assert.equal(got.size, blobs.length);
    assert.deepEqual(refused, [], 'no cat-file call that git 2.31 refuses');
  });

  test('fileAt and blobAt give each file, and null for a missing path and a folder', (t) => {
    const { top, commit } = filesRepo(t);
    const old = gitCounter(t, { old: true });
    const paths = [...FILE_PATHS, ...MISSING, ...FOLDERS];
    const { results, refused } = runChild(old, [
      ...paths.map((p) => ['fileAt', [top, commit, p]]),
      ...paths.map((p) => ['blobAt', [top, commit, p]]),
    ]);
    paths.forEach((p, i) => {
      const text = results[i];
      const bytes = results[paths.length + i];
      if (FILES[p] === undefined) {
        assert.equal(text, null, `fileAt ${JSON.stringify(p)}`);
        assert.equal(bytes, null, `blobAt ${JSON.stringify(p)}`);
      } else {
        assert.equal(text, asBuffer(FILES[p]).toString('utf8'), `fileAt ${JSON.stringify(p)}`);
        assert.ok(Buffer.isBuffer(bytes) && bytes.equals(asBuffer(FILES[p])), `blobAt ${JSON.stringify(p)}`);
      }
    });
    assert.deepEqual(refused, [], 'no cat-file call that git 2.31 refuses');
  });

  // Docs named in config.yaml, odd names included, and an ID (G-9) that a
  // deleted doc used before, which the branch uses again.
  const ODD_DOCS = [['specs/plain.md', 'P'], ['specs/doc with space.md', 'S'], ['specs/données.md', 'E'], ['specs/new\nline.md', 'N'], ['specs/ends in cr\r', 'C']];
  const oddDoc = (p) => `<!-- ${p}-1 note -->\n\n# Doc ${p}\n\n<!-- ${p}-2 rule serves:R1 -->\n\nDoc ${p} MUST work.\n`;
  function oddCheckRepo(t) {
    const dir = project(t);
    write(dir, 'specs/gone.md', '<!-- G-9 note -->\n\nGone.\n');
    commitAll(dir, 'a doc with G-9');
    rmSync(join(dir, 'specs/gone.md'));
    writeYaml(dir, '.assuredloop/config.yaml', { docs: [...ODD_DOCS.map(([file, prefix]) => ({ file, prefix })), { file: 'specs/reuse.md', prefix: 'G' }] });
    for (const [f, p] of ODD_DOCS) write(dir, f, oddDoc(p));
    commitAll(dir, 'base: G-9 gone, the odd docs');
    pgit(dir, 'checkout', '-q', '-b', 'feature');
    for (const [f, p] of ODD_DOCS) {
      write(dir, f, `${oddDoc(p).replace('MUST work.', 'MUST work every day.')}\n<!-- ${p}-3 rule serves:R1 -->\n\nDoc ${p} MUST log.\n`);
    }
    write(dir, 'specs/reuse.md', '<!-- G-9 note -->\n\nAgain.\n');
    commitAll(dir, 'change the docs, use G-9 again');
    return dir;
  }

  test('al-v4 check gives the same output as on today\'s git', (t) => {
    const dir = oddCheckRepo(t);
    const now = al(dir, ['check']);
    assert.equal(now.code, 0, show(now));
    const want = ['specs/reuse.md G-9 New'];
    for (const [f, p] of ODD_DOCS) want.push(`${shownPath(f)} ${p}-2 Changed`, `${shownPath(f)} ${p}-3 New`);
    const changeLines = outLines(now).filter((l) => l.startsWith('specs/'));
    assert.deepEqual([...changeLines].sort(), [...want].sort(), show(now));
    const usedAgain = outLines(now).filter((l) => l.startsWith('not ok used-again '));
    assert.equal(usedAgain.length, 1, show(now));
    assert.match(usedAgain[0], /^not ok used-again specs\/reuse\.md:1 G-9 \S/, show(now));

    const old = gitCounter(t, { old: true });
    const r = al(dir, ['check'], { env: { PATH: old.PATH } });
    assert.ok(old.calls().some((l) => l.includes('merge-base')), `the wrapper saw al's git:\n${old.calls().join('\n')}`);
    assert.equal(r.code, now.code, show(r));
    assert.equal(r.stdout, now.stdout, `the same output on git 2.31:\n${show(r)}`);
    assert.deepEqual(old.refused(), [], 'no cat-file call that git 2.31 refuses');
  });

  // Two repos built the same way: fixed dates and clock, so the same commits.
  function indexRepoWithAdr(t) {
    const dir = baseProject(t, { branch: null });
    for (const name of ['r1', 'r2', 'r3']) newRequest(dir, name);
    commitAll(dir, 'three requests');
    pgit(dir, 'checkout', '-q', '-b', 'feature');
    newRequest(dir, 'r4');
    return dir;
  }

  test('al-v4 index gives the same output and writes the same records as on today\'s git', (t) => {
    const a = indexRepoWithAdr(t);
    const b = indexRepoWithAdr(t);
    assert.equal(pgit(a, 'rev-parse', 'HEAD'), pgit(b, 'rev-parse', 'HEAD'), 'the two repos are the same');
    assert.deepEqual(tree(a), tree(b), 'the two trees are the same');
    const now = al(a, ['index']);
    assert.equal(now.code, 0, show(now));
    assert.match(now.stdout, /\b4 request records\b/, show(now));

    const old = gitCounter(t, { old: true });
    const r = al(b, ['index'], { env: { PATH: old.PATH } });
    assert.ok(old.calls().some((l) => l.includes('merge-base')), `the wrapper saw al's git:\n${old.calls().join('\n')}`);
    assert.equal(r.code, now.code, show(r));
    assert.equal(r.stdout, now.stdout, `the same output on git 2.31:\n${show(r)}`);
    assert.deepEqual(tree(b), tree(a), 'the same files after the run on git 2.31');
    assert.deepEqual(old.refused(), [], 'no cat-file call that git 2.31 refuses');
  });

  test('al-v4 export and al-v4 search give the same output as on today\'s git', (t) => {
    const W = buildWorld(t);
    const old = gitCounter(t, { old: true });
    const runs = [
      ['export'],
      ['export', '--at', W.A],
      ['search', 'export', 'link', '--level', '0', '--json', '--rebuild'],
      ['search', 'export', 'link', '--history', '--level', '1', '--json', '--rebuild'],
    ];
    // Each run starts with no search index, so both runs start from the same state.
    const noIndex = () => rmSync(resolve(W.dir, pgit(W.dir, 'rev-parse', '--git-path', 'assuredloop')), { recursive: true, force: true });
    for (const args of runs) {
      noIndex();
      const now = runSearch(W.dir, args);
      assert.equal(now.code, 0, showSearch(now));
      assert.ok(now.stdout.length > 0, showSearch(now));
      if (args[0] === 'search') assert.ok(JSON.parse(now.stdout).hits.length > 0, `search finds rows:\n${showSearch(now)}`);
      old.reset();
      noIndex();
      const r = runSearch(W.dir, args, { env: { PATH: old.PATH } });
      assert.ok(old.count() > 0, `the wrapper saw al's git: ${args.join(' ')}`);
      assert.equal(r.code, now.code, showSearch(r));
      assert.equal(r.stdout, now.stdout, `the same output on git 2.31: ${args.join(' ')}`);
      assert.deepEqual(old.refused(), [], `no cat-file call that git 2.31 refuses: ${args.join(' ')}`);
    }
  });
});
