// The v4 skill and README (#193, T16): written beside v1's, they name only
// commands and options that al-v4 accepts, they do not name the commands v4
// dropped, and each Tier example line is one that `al check` reads as a path
// claim. The tests read the two doc files and run `node bin/al-v4.js` in
// throwaway repos; they do not read or import the code under test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, al, baseProject, git, project, show } from './helpers/project.js';

const DOCS = ['skills/assuredloop/SKILL-v4.md', 'README-v4.md'];
const V1_DOCS = ['skills/assuredloop/SKILL.md', 'README.md'];

function readDoc(rel) {
  const path = join(REPO, rel);
  assert.ok(existsSync(path), `${rel} exists`);
  return readFileSync(path, 'utf8');
}

// The code of a doc: each line of a fenced code block, and each code span of
// the other text, as { text, where }. A code span may wrap over lines inside
// a paragraph (not over a blank line); its line breaks read as spaces, and
// `where` is the line it starts on.
function codeUnits(rel, md) {
  const units = [];
  let fence = null;
  let para = [];
  const endPara = () => {
    if (!para.length) return;
    const text = para.map((p) => p.line).join('\n');
    for (const m of text.matchAll(/`([^`]+)`/g)) {
      const at = para[text.slice(0, m.index).split('\n').length - 1].n;
      units.push({ text: m[1].replace(/[ \t]*\n[ \t]*/g, ' '), where: `${rel}:${at}` });
    }
    para = [];
  };
  md.split('\n').forEach((line, i) => {
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f && (fence === null || f[1].startsWith(fence))) {
      endPara();
      fence = fence === null ? f[1] : null;
      return;
    }
    if (fence !== null) units.push({ text: line, where: `${rel}:${i + 1}` });
    else if (line.trim() === '') endPara();
    else para.push({ line, n: i + 1 });
  });
  endPara();
  return units;
}

// Each `al <command> ...` in a unit: the command, and the --options written
// after it up to a shell separator (;, &&, ||, a | with spaces round it, #)
// or the next `al`. A placeholder such as <name> or <0|1|2> stands for a
// value. An option counts wherever it starts, also after [ ( | " ' or =.
function alCommands(unit) {
  const text = unit.text.replace(/<[^<>]*>/g, 'VALUE');
  const found = [];
  const starts = [...text.matchAll(/(?:^|[\s;&|(\[`$"'])al[ \t]+([a-z][a-z-]*)\b/g)];
  starts.forEach((m, k) => {
    const from = m.index + m[0].length;
    const to = k + 1 < starts.length ? starts[k + 1].index : text.length;
    const rest = text.slice(from, to).split(/;|&&|\|\||\s\|\s|\s#/)[0];
    const options = [...rest.matchAll(/(?<![\w-])--([a-z][a-z0-9-]*)/g)].map((o) => o[1]);
    found.push({ command: m[1], options, where: unit.where, text: unit.text });
  });
  return found;
}

const PROBE = '--al-docs-probe-unknown';

// Is `al <command>` accepted? A run with only an unknown option is refused
// before anything runs; an unknown command is refused as one.
function commandAccepted(dir, command) {
  const r = al(dir, [command, PROBE]);
  assert.equal(r.code, 2, show(r));
  if (r.stdout.includes(`al: unknown command: ${command}`)) return false;
  assert.ok(r.stdout.includes(`'${PROBE}'`), `the refusal names the probe option:\n${show(r)}`);
  return true;
}

// Does `al <command>` accept --option? Given --option and then an unknown one,
// it is refused either way, before anything runs: for an unknown --option the
// refusal names it, for a known one it names the probe or the missing value.
function optionAccepted(dir, command, option) {
  const r = al(dir, [command, `--${option}`, PROBE]);
  assert.equal(r.code, 2, show(r));
  if (r.stdout.includes(`Unknown option '--${option}'`)) return false;
  assert.ok(r.stdout.includes(`'${PROBE}'`) || r.stdout.includes(`'--${option}`),
    `the refusal names the probe or --${option}:\n${show(r)}`);
  return true;
}

test('the v4 skill and the v4 README exist beside v1', () => {
  for (const rel of DOCS) assert.ok(existsSync(join(REPO, rel)), `${rel} exists`);
});

test('each al command and option the v4 docs name is one al-v4 accepts', (t) => {
  const dir = project(t);
  // The probes tell a refused name from an accepted one.
  assert.equal(commandAccepted(dir, 'check'), true, 'check is a command');
  assert.equal(commandAccepted(dir, 'al-docs-no-such-command'), false, 'an unknown command is refused');
  assert.equal(optionAccepted(dir, 'check', 'al-docs-no-such-option'), false, 'an unknown option is refused');

  const commands = new Map();
  const options = new Map();
  for (const rel of DOCS) {
    const named = codeUnits(rel, readDoc(rel)).flatMap(alCommands);
    assert.ok(named.length > 0, `${rel} names at least one al command in code`);
    for (const n of named) {
      if (!commands.has(n.command)) commands.set(n.command, n);
      for (const o of n.options) if (!options.has(`${n.command} --${o}`)) options.set(`${n.command} --${o}`, { ...n, option: o });
    }
  }
  const bad = [];
  const refused = new Set();
  for (const [command, n] of commands) {
    if (commandAccepted(dir, command)) continue;
    refused.add(command);
    bad.push(`${n.where}: al ${command} is not a command (in "${n.text}")`);
  }
  for (const [key, n] of options) {
    if (refused.has(n.command)) continue;
    if (!optionAccepted(dir, n.command, n.option)) bad.push(`${n.where}: al ${key} is not an option of ${n.command} (in "${n.text}")`);
  }
  assert.deepEqual(bad, []);
});

// Each line of a doc, and each code unit (so a code span that wraps is read
// whole), as { text, where }.
const linesAndCode = (rel, md) => [
  ...md.split('\n').map((text, i) => ({ text, where: `${rel}:${i + 1}` })),
  ...codeUnits(rel, md),
];

test('the v4 docs do not name al consolidate or al record ... section', () => {
  const bad = [];
  for (const rel of DOCS) {
    for (const { text, where } of linesAndCode(rel, readDoc(rel))) {
      if (/\bal[ \t]+consolidate\b/.test(text)) bad.push(`${where}: ${text}`);
      if (/\bal[ \t]+record\b[^`\n]*?(?:^|\s)section\b/.test(text)) bad.push(`${where}: ${text}`);
    }
  }
  assert.deepEqual(bad, []);
});

// Each `Tier: <path> — <claim>` example: "Tier:", a path, a dash, a claim, up
// to the end of the line or of the code span (a wrapped span read whole), so
// one example can show twice; the test runs each text once. A template such as
// "Tier: <n> — <claim>" is not an example.
function tierExamples(rel, md) {
  const out = [];
  for (const { text, where } of linesAndCode(rel, md)) {
    for (const m of text.matchAll(/Tier:[ \t]*([^\s`<][^`]*)/g)) {
      const example = m[0].trimEnd();
      if (/^Tier:[ \t]*\S+[ \t]*(?:—|–|--?)[ \t]*\S/.test(example)) out.push({ example, where });
    }
  }
  return out;
}

test('each Tier example line in the v4 docs is read by al check as a path claim', (t) => {
  const examples = DOCS.flatMap((rel) => tierExamples(rel, readDoc(rel)));
  assert.ok(examples.length > 0, 'the v4 docs show at least one Tier example line');

  const dir = baseProject(t, { branch: null });
  const claimOf = (message) => {
    git(dir, 'checkout', '-q', '-B', 'probe', 'main');
    git(dir, 'commit', '-q', '--allow-empty', '-m', message);
    const r = al(dir, ['check']);
    assert.notEqual(r.code, 2, show(r));
    assert.match(r.stdout, /^Read .*base [0-9a-f]{7}/m, `al check read a base:\n${show(r)}`);
    return { read: !r.stdout.includes('no Tier line'), r };
  };
  // The probe tells a claim from no claim.
  assert.equal(claimOf('no claim in this message').read, false, 'a message with no Tier line shows the hint');

  const bad = [];
  for (const e of new Map(examples.map((e) => [e.example, e])).values()) {
    const { read, r } = claimOf(e.example);
    if (!read) bad.push(`${e.where}: "${e.example}" is not read as a path claim\n${show(r)}`);
  }
  assert.deepEqual(bad, []);
});

test("v1's skill and README are unchanged against origin/main", (t) => {
  const has = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'origin/main'], { cwd: REPO, encoding: 'utf8' });
  if (has.status !== 0) {
    t.skip('origin/main is not in this clone, so v1 cannot be compared');
    return;
  }
  for (const rel of V1_DOCS) {
    const r = spawnSync('git', ['diff', '--quiet', 'origin/main', '--', rel], { cwd: REPO, encoding: 'utf8' });
    assert.equal(r.status, 0, `${rel} differs from origin/main (git diff exit ${r.status}) ${r.stderr}`);
  }
});
