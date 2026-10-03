// This repo uses its own tool (issue #129, tier 0). AGENTS.md at the repo
// root carries README.md's Install line with `<dir>/` dropped (this repo is
// the tool itself), and says to use the `al` on the PATH, never
// `node bin/al.js`, and to run `al check` before asking for review.
// CLAUDE.md at the repo root repeats that line or points to AGENTS.md. The
// CI workflow, .github/workflows/test.yml, runs on pull requests; checks out
// with full history (`fetch-depth: 0`); runs `node --test`, then
// `npm install --global .`, then `al check --strict`, in that order; and pins
// every `uses:` action by a full 40-hex commit SHA. The workflow is read as
// text: the project has no YAML parser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WORKFLOW = '.github/workflows/test.yml';

function read(path) {
  assert.ok(existsSync(join(ROOT, path)), `${path} should exist at the repo root`);
  return readFileSync(join(ROOT, path), 'utf8');
}

// README.md's Install line (the one line of the fenced block under
// "## Install"), with `<dir>/` dropped.
function installLine() {
  const readme = read('README.md');
  const body = readme.slice(readme.indexOf('\n## Install\n'));
  const block = body.match(/\n```[^\n]*\n([^\n]*)\n```/);
  assert.ok(block, `README.md's Install section should hold a fenced block:\n${body}`);
  assert.ok(block[1].includes('<dir>/'), `the Install line should name <dir>/: ${block[1]}`);
  return block[1].replaceAll('<dir>/', '');
}

// The workflow's lines, with YAML comments (a # at the start or after a
// space) cut off.
const workflowLines = () => read(WORKFLOW).split('\n').map((l) => l.replace(/(^|\s)#.*$/, ''));

test('AGENTS.md carries the README Install line with <dir>/ dropped', () => {
  const line = installLine();
  assert.ok(line.includes('skills/assuredloop/SKILL.md') && line.includes('al context'), `expected line: ${line}`);
  const agents = read('AGENTS.md');
  assert.ok(agents.includes(line), `AGENTS.md should carry the line:\n${line}\n---\n${agents}`);
});

test('AGENTS.md mentions node bin/al.js (never to be used) and al check (before review)', () => {
  const agents = read('AGENTS.md');
  assert.ok(agents.includes('node bin/al.js'), `AGENTS.md should mention node bin/al.js:\n${agents}`);
  assert.ok(agents.includes('al check'), `AGENTS.md should mention al check:\n${agents}`);
});

test('CLAUDE.md repeats the Install line or points to AGENTS.md', () => {
  const claude = read('CLAUDE.md');
  assert.ok(claude.includes(installLine()) || claude.includes('AGENTS.md'),
    `CLAUDE.md should repeat the line or point to AGENTS.md:\n${claude}`);
});

test('CI runs on pull requests and checks out with fetch-depth: 0', () => {
  const ls = workflowLines();
  const jobs = ls.findIndex((l) => /^jobs:/.test(l));
  assert.ok(ls.slice(0, jobs).some((l) => /\bpull_request\b/.test(l)), `${WORKFLOW} should run on pull_request`);
  const at = ls.findIndex((l) => /^\s*-?\s*uses:\s*actions\/checkout@/.test(l));
  assert.ok(at >= 0, `${WORKFLOW} should use actions/checkout`);
  // The checkout step: its lines up to the next step (a `- ` at the same indent) or the end.
  const indent = ls[at].search(/-/);
  const rest = ls.slice(at + 1);
  const end = rest.findIndex((l) => l.search(/\S/) <= indent && l.trim() !== '');
  const step = end < 0 ? rest : rest.slice(0, end);
  assert.ok(step.some((l) => /^\s*fetch-depth:\s*0\s*$/.test(l)),
    `the checkout step should set fetch-depth: 0:\n${[ls[at], ...step].join('\n')}`);
});

test('CI runs node --test, then npm install --global ., then al check --strict', () => {
  const ls = workflowLines();
  const find = (re, what) => {
    const i = ls.findIndex((l) => re.test(l));
    assert.ok(i >= 0, `${WORKFLOW} should run ${what}`);
    return i;
  };
  const tests = find(/\bnode --test\b/, 'node --test');
  const install = find(/\bnpm install --global \.(\s|$)/, 'npm install --global .');
  const check = find(/\bal check --strict\b/, 'al check --strict');
  assert.ok(tests < install && install < check,
    `the order should be node --test (line ${tests + 1}), npm install --global . (line ${install + 1}), al check --strict (line ${check + 1})`);
});

test('every uses: action is pinned by a full 40-hex commit SHA', () => {
  const uses = workflowLines().filter((l) => /^\s*-?\s*uses:/.test(l));
  assert.ok(uses.length > 0, `${WORKFLOW} should use actions`);
  for (const l of uses) assert.match(l, /uses:\s*[^@\s]+@[0-9a-f]{40}\s*$/, `not pinned by a full SHA: ${l.trim()}`);
});
