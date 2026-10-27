// #99 (kb-search/R10 "It MUST also find each file of the spec repo and the
// output repos"; light-design LD-33; LD-37 "the rough line of a file in the
// spec repo and in an output repo"): the local index has one row for each
// file that git tracks at the selected commit, in the central repo and in
// each output repo at its commit. It is found by the words of its path, and
// says what the file is, from its path only: code, test, doc, config or
// other.
// - The text hit: `<n>. file <path> <kind> @<commit 12>`, and
//   `<n>. file <repo>:<path> <kind> @<commit 12>` for an output repo. In
//   --json the hit has role `file`, its kind, its repo and its path.
// - File rows are in the default query and in a history query (never as
//   history rows), never in `al export`, and only in word search: the model
//   does not embed them.
// Built from the issue and the public interface only; nothing here reads src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { commitAll, doc, git, project, write, writeConfig } from './helpers/project.js';
import {
  SMALL_SPEC, WITH_MODEL, embedded, exportRows, installEmbedder, runOk, search, show,
} from './helpers/search.js';
import { commit, rev, searchWorld } from './helpers/cross-search.js';

const c12 = (sha) => sha.slice(0, 12);
const files = (out) => out.hits.filter((h) => h.role === 'file');
const KINDS = {
  'src/app.js': 'code',
  'test/app.test.js': 'test',
  'docs/guide.md': 'doc',
  'package.json': 'config',
  'logo.png': 'other',
};

// A central repo with a spec and the five files above, committed once.
function repo(t, setting = 'local') {
  const dir = project(t);
  write(dir, '.gitignore', 'node_modules/\n');
  writeConfig(dir, [{ file: 'specs/exports.md', prefix: 'EXP' }], { repo: 'acme', search: setting });
  write(dir, 'specs/exports.md', SMALL_SPEC);
  write(dir, 'src/app.js', 'export const app = 1;\n');
  write(dir, 'test/app.test.js', "import { app } from '../src/app.js';\n");
  write(dir, 'docs/guide.md', '# A guide\n\nRead it first.\n');
  write(dir, 'package.json', '{ "name": "app" }\n');
  write(dir, 'logo.png', 'not really a picture\n');
  const A = commitAll(dir, 'A');
  return { dir, A };
}

// The one file hit of `path` in `out`.
function fileHit(out, path, repoName) {
  const found = files(out).filter((h) => h.path === path && (repoName === undefined || h.repo === repoName));
  assert.equal(found.length, 1, `one file hit ${repoName ? `${repoName}:` : ''}${path}:\n${JSON.stringify(out.hits.map((h) => [h.role, h.repo, h.path ?? h.id]))}`);
  return found[0];
}

test('#99 search: local finds a file of the central repo by the words of its path; the hit says its kind', (t) => {
  const { dir } = repo(t);
  const central = exportRows(dir).rows[0].repo;
  for (const [path, words] of [
    ['src/app.js', ['app']], ['test/app.test.js', ['app']], ['docs/guide.md', ['guide']],
    ['package.json', ['package']], ['logo.png', ['logo']],
  ]) {
    const out = search(dir, words, { level: 1 });
    const h = fileHit(out, path);
    assert.equal(h.kind, KINDS[path], `${path} is ${KINDS[path]}`);
    assert.equal(h.repo, central, `${path} is a file of the central repo`);
  }
});

test('#99 a file hit in the text: <n>. file <path> <kind> @<commit 12>', (t) => {
  const { dir, A } = repo(t);
  const r = runOk(dir, ['search', 'logo']);
  const line = new RegExp(`^\\s*\\d+\\. file logo\\.png other @${c12(A)}\\s*$`);
  assert.ok(r.stdout.split('\n').some((l) => line.test(l)), `the file line:\n${show(r)}`);
  const app = runOk(dir, ['search', 'app']);
  for (const [path, kind] of [['src/app.js', 'code'], ['test/app.test.js', 'test']]) {
    const re = new RegExp(`^\\s*\\d+\\. file ${path.replace(/\./g, '\\.')} ${kind} @${c12(A)}\\s*$`);
    assert.ok(app.stdout.split('\n').some((l) => re.test(l)), `the file line of ${path}:\n${show(app)}`);
  }
});

test('#99 file rows are not in al export', (t) => {
  const { dir } = repo(t);
  const { rows } = exportRows(dir);
  assert.ok(!rows.some((r) => r.role === 'file'), 'no row with role file');
  for (const path of Object.keys(KINDS)) {
    assert.ok(!rows.some((r) => r.id === path || r.file === path), `${path} is not a row of the export`);
  }
});

test('#99 file rows are the files at the selected commit: in the default query, never in history', (t) => {
  const { dir, A } = repo(t);
  write(dir, 'notes/zebra-notes.txt', 'Notes.\n');
  const B = commitAll(dir, 'B: a notes file');
  fileHit(search(dir, ['zebra'], { level: 1 }), 'notes/zebra-notes.txt');
  git(dir, 'rm', '-q', 'notes/zebra-notes.txt');
  commitAll(dir, 'C: the notes file removed');
  assert.deepEqual(files(search(dir, ['zebra'], { level: 1 })), [], 'a removed file has no row at HEAD');
  assert.deepEqual(files(search(dir, ['zebra', '--history'], { level: 1 })), [], 'a file row is never history');
  fileHit(search(dir, ['zebra', '--at', B], { level: 1 }), 'notes/zebra-notes.txt');
  assert.deepEqual(files(search(dir, ['zebra', '--at', A], { level: 1 })), [], 'not at A, before it was added');
});

// #99, second round (DES-64: "A history query adds `history` rows, never
// shown as current promises. A `file` row is never history."): --history
// adds history rows to the default query, so a file that git tracks at the
// selected commit is still found, with role file, as without --history.
const noRank = (h) => { const { rank: _r, ...x } = h; return x; };
for (const level of [1, 2]) {
  test(`#99 a history query keeps the current file rows (level ${level}): --history still finds a tracked file, with role file, never history`, (t) => {
    const { dir } = repo(t, level === 2 ? WITH_MODEL : 'local');
    if (level === 2) installEmbedder(dir, { log: join(dir, '.git', 'embed-test.log') });
    write(dir, 'src/walrus.js', 'export const walrus = 1;\n');
    commitAll(dir, 'B: a walrus module');
    const opts = level === 2 ? {} : { level: 1 };
    const plain = search(dir, ['walrus'], opts);
    assert.equal(plain.level, level, `level ${level} answered (fallback: ${plain.fallback})`);
    const want = fileHit(plain, 'src/walrus.js');
    const hist = search(dir, ['walrus', '--history'], opts);
    assert.equal(hist.level, level, `level ${level} answered with --history (fallback: ${hist.fallback})`);
    const got = fileHit(hist, 'src/walrus.js');
    assert.equal(got.role, 'file');
    assert.equal(got.kind, 'code');
    assert.deepEqual(noRank(got), noRank(want), 'the same file hit as without --history');
    const asHistory = hist.hits.filter((h) => h.role === 'history' && (h.path === 'src/walrus.js' || h.id === 'src/walrus.js'));
    assert.deepEqual(asHistory, [], 'a file row is never history');
    const r = runOk(dir, ['search', 'walrus', '--history', ...(level === 2 ? [] : ['--level', '1'])]);
    assert.ok(/^\s*\d+\. file src\/walrus\.js code @[0-9a-f]{12}\s*$/m.test(r.stdout), `the file line with --history:\n${show(r)}`);
  });
}

test('#99 file rows are in the local index only: level 0 (a scan of the export) has none', (t) => {
  const { dir } = repo(t);
  assert.deepEqual(files(search(dir, ['app'], { level: 0 })), []);
});

test('#99 with a row of the table, file rows are found by their words, and the model does not embed them', (t) => {
  const { dir } = repo(t, WITH_MODEL);
  const log = join(dir, '.git', 'embed-test.log');
  installEmbedder(dir, { log });
  const out = search(dir, ['logo', 'guide']);
  assert.equal(out.level, 2, `level 2 answered (fallback: ${out.fallback})`);
  fileHit(out, 'logo.png');
  fileHit(out, 'docs/guide.md');
  const sent = embedded(log);
  assert.ok(sent.length > 0, 'the fixture: the embedder was used');
  for (const path of Object.keys(KINDS)) {
    assert.ok(!sent.some((x) => x.includes(path)), `${path}: a file row is not embedded:\n${sent.filter((x) => x.includes(path)).join('\n')}`);
  }
});

test('#99 a file of an output repo, at its selected commit: <n>. file <repo>:<path> <kind> @<commit 12>; and a file of the central repo', (t) => {
  const w = searchWorld(t);
  write(w.web, 'docs/walrus-guide.md', '# Walrus\n\nA page.\n');
  const W = commit(w.web, 'A walrus page'); // web is selected as `commit: main`
  write(w.central, 'src/walrus.js', 'export const walrus = 1;\n');
  const C = commit(w.central, 'A walrus module');
  write(w.worker, 'src/walrus-worker.js', 'export const w = 1;\n');
  commit(w.worker, 'A walrus worker'); // the worker is pinned to K5: not its selected commit
  assert.equal(rev(w.web), W);

  const out = search(w.central, ['walrus', '--limit', '500'], { level: 1 });
  const web = fileHit(out, 'docs/walrus-guide.md', 'invoicer-web');
  assert.equal(web.kind, 'doc');
  const central = fileHit(out, 'src/walrus.js', 'invoicer');
  assert.equal(central.kind, 'code');
  assert.ok(!files(out).some((h) => h.path === 'src/walrus-worker.js'), 'a file after the pinned commit of an output repo has no row');

  const r = runOk(w.central, ['search', 'walrus', '--level', '1']);
  const ls = r.stdout.split('\n');
  assert.ok(ls.some((l) => new RegExp(`^\\s*\\d+\\. file invoicer-web:docs/walrus-guide\\.md doc @${c12(W)}\\s*$`).test(l)), `the output repo's file line:\n${show(r)}`);
  assert.ok(ls.some((l) => new RegExp(`^\\s*\\d+\\. file src/walrus\\.js code @${c12(C)}\\s*$`).test(l)), `the central file line:\n${show(r)}`);
});

test('#99 a file of the output repo that is also an evidence row keeps its evidence row in --change, and has a file row in the default query', (t) => {
  const w = searchWorld(t);
  const out = search(w.central, ['export', 'link', '--limit', '500'], { level: 1 });
  fileHit(out, 'src/export-link.js', 'invoicer-web');
  assert.ok(!out.hits.some((h) => h.role === 'evidence'), 'the default query has no evidence row');
  const ch = search(w.central, ['export', 'link', '--change', 'invoice-exports', '--limit', '500'], { level: 1 });
  assert.ok(ch.hits.some((h) => h.role === 'evidence' && h.repo === 'invoicer-web' && h.id === 'src/export-link.js'),
    'the evidence row is still found in the change context');
});

// A spec doc's own path is a file too: a word of a doc's path finds the file row.
test('#99 a spec doc is a file row too (doc), beside its paragraphs', (t) => {
  const dir = project(t);
  writeConfig(dir, [{ file: 'specs/billing.md', prefix: 'BIL' }], { repo: 'acme', search: 'local' });
  write(dir, 'specs/billing.md', doc([['BIL-1 note', '# Billing'], ['BIL-2 rule', 'A statement MUST list every payment.']]));
  commitAll(dir, 'A');
  const out = search(dir, ['billing'], { level: 1 });
  assert.equal(fileHit(out, 'specs/billing.md').kind, 'doc');
  assert.ok(out.hits.some((h) => h.id === 'BIL-1'), 'the heading paragraph is found by its word too');
});
