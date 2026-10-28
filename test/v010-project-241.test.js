// A 0.1.0 project (#241): .assuredloop at the repo root is a file (0.1.0 kept
// one such as `root: docs/prd`), not a folder. Each al command that reads the
// project refuses with exit 2 and one message, in the refusal form: a line
// `al: <message>`, then the Read, Next and Not known lines, and nothing else.
// Nothing is written. al --version and the usage messages still work there,
// and a project where .assuredloop is a folder, or absent, is not affected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  REPO, al, baseProject, commitAll, git, project, show, tree, write,
} from './helpers/project.js';

const PRD = `# Product

## [PRD-1] Invoices

An invoice MUST have at least one line.

## [PRD-2] Exports

A user MUST be able to export the invoices of one month as a CSV file.
`;

// A project as 0.1.0 left it: the one-line .assuredloop file, the baseline in
// its root, and an open request, all committed on main.
function v010(t, marker = 'root: docs/prd\n') {
  const dir = project(t);
  write(dir, '.assuredloop', marker);
  write(dir, 'docs/prd/prd.md', PRD);
  write(dir, 'requests/late-fees/request.md', '# Late fees\n\nThe owner wants a late fee on overdue invoices.\n');
  commitAll(dir, 'a 0.1.0 project');
  return dir;
}

const KEY_PARTS = ['.assuredloop is a file', '0.1.0 records', 'v4 does not read', 'keep 0.1.0 pinned', 'From 0.1.0'];
const MESSAGE = '.assuredloop is a file, so the project has 0.1.0 records, which v4 does not read; keep 0.1.0 pinned, or move as "From 0.1.0" in the README says';

// Exit 2; stdout is exactly the al: line with the 0.1.0 message, then Read,
// Next and Not known; nothing on stderr; nothing written.
function refusesV010(dir, args, { input = '', cwd = dir } = {}) {
  const before = tree(dir);
  const status = git(dir, 'status', '--porcelain');
  const r = al(cwd, args, { input });
  assert.deepEqual(tree(dir), before, `nothing is written in a 0.1.0 project:\n${show(r)}`);
  assert.equal(git(dir, 'status', '--porcelain'), status, `git status is unchanged:\n${show(r)}`);
  assert.equal(r.code, 2, `a 0.1.0 project is refused with exit 2:\n${show(r)}`);
  assert.equal(r.stderr, '', show(r));
  const ls = r.stdout.replace(/\n$/, '').split('\n');
  assert.equal(ls.length, 4, `only the al: line and the Read, Next and Not known lines:\n${show(r)}`);
  assert.ok(ls[0].startsWith('al: '), `an al: line first:\n${show(r)}`);
  for (const part of KEY_PARTS) assert.ok(ls[0].includes(part), `the al: line says "${part}":\n${show(r)}`);
  assert.ok(ls[0].includes(MESSAGE), `the al: line holds the message:\n${MESSAGE}\n${show(r)}`);
  assert.match(ls[1], /^Read {6}\S/, `Read line:\n${show(r)}`);
  assert.match(ls[2], /^Next {6}\S/, `Next line:\n${show(r)}`);
  assert.match(ls[3], /^Not known \S/, `Not known line:\n${show(r)}`);
  return r;
}

const COMMANDS = [
  { args: ['new', 'tidy-up', '--from', '-'], input: 'The owner wants a tidy invoice list.\n' },
  { args: ['record', 'late-fees', 'signoff', '--source', 'the project chat', '--words', 'R1 ok, sign', '--yes'] },
  { args: ['index'] },
  { args: ['spec'] },
  { args: ['spec', '--add-ids', 'docs/prd/prd.md', '--prefix', 'PRD'] },
  { args: ['spec', '--add-ids', 'docs/prd/prd.md', '--prefix', 'PRD', '--yes'] },
  { args: ['check'] },
  { args: ['check', '--strict'] },
  { args: ['export'] },
  { args: ['search', 'invoice'] },
  { args: ['context'] },
  { args: ['conclude', 'late-fees'] },
  { args: ['conclude', 'late-fees', '--yes'] },
];

for (const { args, input } of COMMANDS) {
  test(`a 0.1.0 project: al ${args.join(' ')} refuses with exit 2 and the 0.1.0 message, and writes nothing`, (t) => {
    refusesV010(v010(t), args, { input });
  });
}

test('the issue\'s case: al check --strict in a 0.1.0 project does not exit 0', (t) => {
  const r = al(v010(t), ['check', '--strict']);
  assert.notEqual(r.code, 0, show(r));
});

test('a 0.1.0 project: al check run in a subfolder of the repo is refused too', (t) => {
  const dir = v010(t);
  refusesV010(dir, ['check'], { cwd: join(dir, 'docs/prd') });
});

test('a 0.1.0 project whose .assuredloop file has another line (results:) or is empty: al check --strict is refused', (t) => {
  refusesV010(v010(t, 'results: results\n'), ['check', '--strict']);
  refusesV010(v010(t, ''), ['check', '--strict']);
});

test('a 0.1.0 project: al --version still works (exit 0, "al <version>")', (t) => {
  const dir = v010(t);
  const { version } = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
  const before = tree(dir);
  const r = al(dir, ['--version']);
  assert.equal(r.code, 0, show(r));
  assert.ok(r.stdout.startsWith(`al ${version}`), `al ${version}:\n${show(r)}`);
  assert.ok(!r.stdout.includes('.assuredloop is a file'), show(r));
  assert.deepEqual(tree(dir), before, show(r));
});

test('a 0.1.0 project: al with no command still gives the usage message, not the 0.1.0 message', (t) => {
  const r = al(v010(t), []);
  assert.equal(r.code, 2, show(r));
  assert.match(r.stdout, /^al: no command given$/m, show(r));
  assert.ok(!r.stdout.includes('.assuredloop is a file'), show(r));
});

test('a 0.1.0 project: an unknown command still gives the usage message, not the 0.1.0 message', (t) => {
  const r = al(v010(t), ['bogus']);
  assert.equal(r.code, 2, show(r));
  assert.match(r.stdout, /^al: unknown command: bogus$/m, show(r));
  assert.ok(!r.stdout.includes('.assuredloop is a file'), show(r));
});

test('control: where .assuredloop is a folder, al check exits 0 as before, with no 0.1.0 message', (t) => {
  const r = al(baseProject(t), ['check']);
  assert.equal(r.code, 0, show(r));
  assert.ok(!r.stdout.includes('.assuredloop is a file'), show(r));
});

test('control: where .assuredloop is absent, al check and al check --strict exit 0 as before, with no 0.1.0 message', (t) => {
  const dir = project(t);
  write(dir, 'specs/invoices.md', '<!-- INV-1 note -->\n\n# Invoices\n');
  commitAll(dir, 'a spec, no .assuredloop');
  for (const args of [['check'], ['check', '--strict']]) {
    const r = al(dir, args);
    assert.equal(r.code, 0, show(r));
    assert.ok(!r.stdout.includes('.assuredloop is a file'), show(r));
  }
});
