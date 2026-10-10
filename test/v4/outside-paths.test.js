// A config docs entry whose path leaves the repository is not read nor
// indexed; a config root that leaves it is refused. Nothing is written
// outside the project (#175, review findings).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  INVOICES, doc, docRecord, git, index, paragraph, refused, tree, write, writeConfig,
} from './helpers/project.js';

// <scratch>/a/b/project is the project; <scratch>/outside.md is a marked doc.
function nested(t) {
  const scratch = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-nest-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const dir = join(scratch, 'a/b/project');
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  write(scratch, 'outside.md', doc([['OUT-1 rule', 'A rule outside the repo MUST hold.']]));
  write(dir, 'specs/invoices.md', INVOICES);
  return { scratch, dir };
}

// Everything in scratch that is not inside the project.
const around = (scratch) => Object.fromEntries(
  Object.entries(tree(scratch)).filter(([path]) => !path.startsWith('a/b/project/')),
);

function check(t, file) {
  const { scratch, dir } = nested(t);
  writeConfig(dir, [{ file: file(scratch), prefix: 'OUT' }, { file: 'specs/invoices.md', prefix: 'INV' }]);
  const before = around(scratch);
  const r = index(dir);
  assert.ok(r.stdout.split('\n').includes(`not indexed: ${file(scratch)}: outside the repository`), r.stdout);
  assert.deepEqual(around(scratch), before, 'nothing is written outside the project');
  const paths = Object.keys(tree(dir));
  assert.deepEqual(paths.filter((p) => p.split('/').includes('..')), []);
  assert.deepEqual(paths.filter((p) => p.includes('outside')), [], 'no record of the outside doc');
  assert.equal(paragraph(dir, 'specs/invoices.md', 'INV-41').kind, 'rule', 'the other docs are indexed as usual');
  assert.equal(docRecord(dir, 'specs/invoices.md').file, 'specs/invoices.md');
}

test('index skips a config docs entry with a .. part: "not indexed", exit 0, nothing written outside', (t) => {
  check(t, () => '../../../outside.md');
});

test('index skips a config docs entry with an absolute path: "not indexed", exit 0, nothing written outside', (t) => {
  check(t, (scratch) => join(scratch, 'outside.md'));
});

// config root: a folder above the project that holds marked *.md files.
function checkRoot(t, root) {
  const { scratch, dir } = nested(t);
  write(scratch, 'a/b/outside-spec/x.md', doc([['X-1 rule', 'A rule in the outside root MUST hold.']]));
  write(scratch, 'a/b/outside-spec/adr/0001-out.md', `Status: proposed\n\n${doc([['ADR-1 choice', '# ADR-1: Out']])}`);
  writeConfig(dir, [], { root: root(scratch) });
  const before = around(scratch);
  refused(dir, ['index']);
  assert.deepEqual(around(scratch), before, 'nothing is written outside the project');
}

test('index refuses a config root with a .. part: exit 2, nothing written inside or outside', (t) => {
  checkRoot(t, () => '../outside-spec');
});

test('index refuses an absolute config root: exit 2, nothing written inside or outside', (t) => {
  checkRoot(t, (scratch) => join(scratch, 'a/b/outside-spec'));
});
