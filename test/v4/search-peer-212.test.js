// Issue #212: level 2 search with no second package of ours. Built from the
// issue's requirement and the public interface only: `al` run through the
// helpers, and a stand-in @huggingface/transformers in the test project
// (helpers/search.js, standIn). Nothing here reads src/.
// - Item 3: with no @huggingface/transformers, `al search` answers at
//   level 1, keeps its Fallback line, and a Not known line (and an item of
//   not_known in --json) says how to install it: npm install and
//   @huggingface/transformers@4.3.1. An explicit --level 1 or --level 0 has
//   no such line. With the library in the project, level 2 is the default.
// - Item 4: only `al search` loads the library, and only when it embeds (a
//   query with words at level 2). The stand-in writes a marker file each time
//   it is imported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { git, project, write } from './helpers/project.js';
import {
  TRANSFORMERS, TRANSFORMERS_VERSION, besideAl, importsOf, installEmbedder, run, runOk, search, show, smallRepo,
} from './helpers/search.js';

const INSTALL = `${TRANSFORMERS}@${TRANSFORMERS_VERSION}`;
const NO_LIBRARY = '@huggingface/transformers resolves beside bin/al.js, so "not installed" cannot be shown here';

// The Not known part of a text output: from the first line that starts with
// "Not known" to the end, so an item on a later line counts too.
function notKnown(stdout) {
  const ls = stdout.replace(/\n+$/, '').split('\n');
  const at = ls.findIndex((l) => /^Not known\b/.test(l));
  assert.ok(at >= 0, `a Not known line:\n${stdout}`);
  return ls.slice(at).join('\n');
}
// True when the text says how to install level 2: npm install and the pinned library.
const saysInstall = (text) => /\bnpm install\b/.test(text) && text.includes(INSTALL);
const mentionsLibrary = (text) => text.includes(TRANSFORMERS);

// --- item 3: absent, level 1 and how to add level 2

test('#212 no @huggingface/transformers: al search <words> answers at level 1, with a Fallback line, and a Not known line says npm install @huggingface/transformers@4.3.1', (t) => {
  if (besideAl()) { t.skip(NO_LIBRARY); return; }
  const { dir } = smallRepo(t);
  const r = runOk(dir, ['search', 'export', 'link']);
  const ls = r.stdout.split('\n');
  assert.match(ls[0], /^Level\s+1\b/, show(r));
  assert.ok(ls.some((l) => /^Fallback\s+\S/.test(l)), `the Fallback line still gives the reason:\n${show(r)}`);
  assert.ok(saysInstall(notKnown(r.stdout)), `the Not known line names npm install and ${INSTALL}:\n${show(r)}`);
  assert.ok(!r.stdout.includes('@assuredloop/search'), `@assuredloop/search is gone; the output does not name it:\n${show(r)}`);
});

test('#212 no @huggingface/transformers: al search <words> --json answers at level 1, fallback gives the reason, and an item of not_known says npm install @huggingface/transformers@4.3.1', (t) => {
  if (besideAl()) { t.skip(NO_LIBRARY); return; }
  const { dir } = smallRepo(t);
  const out = search(dir, ['export', 'link']);
  assert.equal(out.level, 1);
  assert.equal(typeof out.fallback, 'string');
  assert.ok(out.fallback.length > 0, 'fallback gives the reason');
  assert.ok(Array.isArray(out.not_known), 'not_known is a list of texts');
  assert.ok(out.not_known.some(saysInstall), `an item of not_known names npm install and ${INSTALL}: ${JSON.stringify(out.not_known)}`);
  assert.ok(!JSON.stringify(out).includes('@assuredloop/search'), `@assuredloop/search is gone; the output does not name it: fallback ${out.fallback}; not_known ${JSON.stringify(out.not_known)}`);
});

test('#212 no @huggingface/transformers: al search --id <ID> (no words) also answers at level 1 with the install line in Not known and in not_known', (t) => {
  if (besideAl()) { t.skip(NO_LIBRARY); return; }
  const { dir } = smallRepo(t);
  const r = runOk(dir, ['search', '--id', 'EXP-4']);
  assert.match(r.stdout.split('\n')[0], /^Level\s+1\b/, show(r));
  assert.ok(saysInstall(notKnown(r.stdout)), `the Not known line names npm install and ${INSTALL}:\n${show(r)}`);
  const out = search(dir, ['--id', 'EXP-4']);
  assert.equal(out.level, 1);
  assert.equal(out.hits[0]?.id, 'EXP-4');
  assert.ok(out.not_known.some(saysInstall), JSON.stringify(out.not_known));
});

for (const level of [1, 0]) {
  test(`#212 no @huggingface/transformers: an explicit --level ${level} gives no Not known line about installing level 2, and no such not_known item`, (t) => {
    if (besideAl()) { t.skip(NO_LIBRARY); return; }
    const { dir } = smallRepo(t);
    const r = runOk(dir, ['search', 'export', 'link', '--level', String(level)]);
    assert.match(r.stdout.split('\n')[0], new RegExp(`^Level\\s+${level}\\b`), show(r));
    const nk = notKnown(r.stdout);
    assert.ok(!saysInstall(nk) && !mentionsLibrary(nk), `no install line at --level ${level}:\n${show(r)}`);
    const out = search(dir, ['export', 'link'], { level });
    assert.equal(out.level, level);
    assert.equal(out.fallback, null, 'the user\'s choice is no fallback');
    assert.ok(!out.not_known.some((x) => saysInstall(x) || mentionsLibrary(x)), JSON.stringify(out.not_known));
  });
}

test('#212 @huggingface/transformers in the project: level 2 is the default, with no Fallback and no install line', (t) => {
  const { dir } = smallRepo(t, { embedder: {} });
  const out = search(dir, ['export', 'link']);
  assert.equal(out.level, 2, `level 2 answered (fallback: ${out.fallback})`);
  assert.equal(out.fallback, null);
  assert.ok(!out.not_known.some(saysInstall), JSON.stringify(out.not_known));
  const r = runOk(dir, ['search', 'export', 'link']);
  assert.match(r.stdout.split('\n')[0], /^Level\s+2\b/, show(r));
  assert.ok(!/^Fallback\b/m.test(r.stdout), show(r));
  assert.ok(!saysInstall(notKnown(r.stdout)), show(r));
});

// --- item 4: only search loads it, and only when it embeds

// The other commands, each with the exit code it gives in smallRepo's repo
// (an open request `links` with no sign-off): `al check --strict` finds
// not ok lines, and `al conclude links` refuses, so both exit 1. Each must run
// to its end (no crash), and none may import the library.
const OTHERS = [
  [['--version'], 0],
  [['check'], 0],
  [['check', '--strict'], 1],
  [['index'], 0],
  [['spec'], 0],
  [['export'], 0],
  [['context'], 0],
  [['context', 'links'], 0],
  [['context', 'EXP-4'], 0],
  [['conclude', 'links'], 1],
  [['record', 'links', 'decision', '--source', 'owner', '--text', 'A reminder goes by email only.'], 0],
];

test('#212 al --version, check, index, spec, export, context, conclude and record never import @huggingface/transformers, though it is in the project', (t) => {
  const { dir } = smallRepo(t);
  const marker = join(dir, '.git', 'imported.log');
  installEmbedder(dir, { marker });
  for (const [args, code] of OTHERS) {
    const r = run(dir, args);
    assert.equal(r.signal, null, show(r));
    assert.equal(r.code, code, `al ${args.join(' ')} runs to its end:\n${show(r)}`);
    assert.deepEqual(importsOf(marker), [], `al ${args.join(' ')} imported the library`);
  }
  // The control: the same stand-in is found and imported by a search with words.
  assert.equal(search(dir, ['export', 'link']).level, 2);
  assert.ok(importsOf(marker).length > 0, 'al search <words> imports the library');
});

test('#212 al search --id <ID> (no words) reports level 2 and does not import @huggingface/transformers; al search <words> does', (t) => {
  const { dir } = smallRepo(t);
  const marker = join(dir, '.git', 'imported.log');
  installEmbedder(dir, { marker });
  const out = search(dir, ['--id', 'EXP-4']);
  assert.equal(out.level, 2, `the library is there, so the level is 2 (fallback: ${out.fallback})`);
  assert.equal(out.hits[0]?.id, 'EXP-4');
  const r = runOk(dir, ['search', '--id', 'EXP-4', '--history']);
  assert.match(r.stdout.split('\n')[0], /^Level\s+2\b/, show(r));
  assert.deepEqual(importsOf(marker), [], 'al search --id did not import the library');
  search(dir, ['URL']);
  const seen = importsOf(marker);
  assert.equal(seen.length, 1, `one import, by al search URL: ${seen.join(' | ')}`);
  assert.match(seen[0], /\bsearch\b.*\bURL\b/, 'the import came from the search with words');
});

test('#212 al search <words> at an explicit --level 1 or --level 0 does not import @huggingface/transformers', (t) => {
  const { dir } = smallRepo(t);
  const marker = join(dir, '.git', 'imported.log');
  installEmbedder(dir, { marker });
  for (const level of [1, 0]) {
    assert.equal(search(dir, ['export', 'link'], { level }).level, level);
    assert.deepEqual(importsOf(marker), [], `al search --level ${level} imported the library`);
  }
});

test('#212 al new does not import @huggingface/transformers', (t) => {
  const dir = project(t);
  write(dir, '.gitignore', 'node_modules/\n');
  write(dir, 'words.md', 'The owner wants reminders.\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'A');
  const marker = join(dir, '.git', 'imported.log');
  installEmbedder(dir, { marker });
  const r = run(dir, ['new', 'reminders', '--from', 'words.md']);
  assert.equal(r.code, 0, show(r));
  assert.deepEqual(importsOf(marker), [], 'al new imported the library');
});
