// Each al command and option that the skill names exists (#79). The skill
// names an al command in code (a code span or a fenced code line) or in plain
// text, and names an --option only in code, in the same code span or code line
// as its `al <command>`, so the command it belongs to is known. The tests read
// only skills/assuredloop/SKILL.md and run `node bin/al.js` (the helpers' BIN)
// in a throwaway repo: al has no --help, so a probe asks the CLI whether it
// accepts each name. They do not read or import the code under test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, al, project, show } from './helpers/project.js';

const SKILL = 'skills/assuredloop/SKILL.md';

function readSkill() {
  const path = join(REPO, SKILL);
  assert.ok(existsSync(path), `${SKILL} exists`);
  return readFileSync(path, 'utf8');
}

// A placeholder such as <name> or <1|1d|2> stands for a value. It becomes
// VALUE, which is not a command or an option; a line break in it is kept, so
// line numbers do not move.
const values = (text) => text.replace(/<[^<>]*>/g, (m) => `VALUE${m.replace(/[^\n]/g, '')}`);

// `al <command>`: al as a word of its own, then a command name or --version.
const AL = /(?<![\w.\/-])al\s+(--version|[a-z][a-z-]*)\b/g;
// An --option counts wherever it starts, also after [ ( | " ' or =.
const OPTION = /(?<![\w-])--([a-z][a-z0-9-]*)/g;

// The skill as code units and prose paragraphs. A code unit is each line of a
// fenced code block, and each code span of the other text, as { text, where }.
// A code span may wrap over lines inside a paragraph (not over a blank line);
// its line breaks read as spaces, and `where` is the line it starts on. A
// paragraph is the other text with its code spans blanked out, as
// { text, line }: `line` is the line it starts on.
function parse(md, rel = SKILL) {
  const units = [];
  const paragraphs = [];
  let fence = null;
  let para = [];
  const endPara = () => {
    if (!para.length) return;
    const text = para.map((p) => p.line).join('\n');
    for (const m of text.matchAll(/`([^`]+)`/g)) {
      const at = para[text.slice(0, m.index).split('\n').length - 1].n;
      units.push({ text: m[1].replace(/[ \t]*\n[ \t]*/g, ' '), where: `${rel}:${at}` });
    }
    paragraphs.push({ text: text.replace(/`[^`]+`/g, (m) => ` ${m.replace(/[^\n]/g, '')} `), line: para[0].n });
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
  return { units, paragraphs };
}

// Each `al <command> ...` in a code unit: the command, and the --options
// written after it up to a shell separator (;, &&, ||, a | with spaces round
// it, #) or the next `al`. Also each --option of the unit that is in no such
// command, as an orphan.
function scanUnit(unit) {
  const text = values(unit.text);
  const commands = [];
  const covered = [];
  const starts = [...text.matchAll(AL)];
  starts.forEach((m, k) => {
    const from = m.index + m[0].length;
    const to = k + 1 < starts.length ? starts[k + 1].index : text.length;
    const rest = text.slice(from, to).split(/;|&&|\|\||\s\|\s|\s#/)[0];
    covered.push([m.index, from + rest.length]);
    const options = [...rest.matchAll(OPTION)].map((o) => o[1]);
    commands.push({ command: m[1], options, where: unit.where, text: unit.text });
  });
  const orphans = [...text.matchAll(OPTION)]
    .filter((o) => !covered.some(([a, b]) => o.index >= a && o.index < b))
    .map((o) => ({ option: o[1], where: unit.where, text: unit.text }));
  return { commands, orphans };
}

// Each `al <command>` of a prose paragraph, with the line it is on. It may
// wrap over a line break.
function scanParagraph(p, rel = SKILL) {
  const text = values(p.text);
  return [...text.matchAll(AL)].map((m) => {
    const line = p.line + text.slice(0, m.index).split('\n').length - 1;
    return { command: m[1], options: [], where: `${rel}:${line}`, text: m[0].replace(/\s+/g, ' '), prose: true };
  });
}

// What a Markdown text names: the al commands (in code and in prose) and the
// --options in code that are in no al command.
function scan(md, rel = SKILL) {
  const { units, paragraphs } = parse(md, rel);
  const inCode = units.map(scanUnit);
  return {
    commands: [...inCode.flatMap((s) => s.commands), ...paragraphs.flatMap((p) => scanParagraph(p, rel))],
    orphans: inCode.flatMap((s) => s.orphans),
  };
}

const PROBE = '--al-skill-probe-unknown';

// Is `al <command>` accepted? A run with only an unknown option is refused
// before anything runs; an unknown command is refused as one. A name that is
// refused as a command with the probe is run once alone: `al --version` takes
// no option, and alone it exits 0.
function commandAccepted(dir, command) {
  const r = al(dir, [command, PROBE]);
  assert.equal(r.code, 2, show(r));
  if (r.stdout.includes(`al: unknown command: ${command}`)) {
    const alone = al(dir, [command]);
    if (alone.code === 0) return true;
    assert.equal(alone.code, 2, show(alone));
    assert.ok(alone.stdout.includes(`al: unknown command: ${command}`), show(alone));
    return false;
  }
  assert.ok(r.stdout.includes(`'${PROBE}'`), `the refusal names the probe option:\n${show(r)}`);
  return true;
}

// Does `al <command>` accept --option? Given --option and then an unknown one,
// it is refused either way, before anything runs: for an unknown --option the
// refusal names it, for a known one it names the probe or the missing value.
// A command that takes no option (`al --version`) is refused as a command.
function optionAccepted(dir, command, option) {
  const r = al(dir, [command, `--${option}`, PROBE]);
  assert.equal(r.code, 2, show(r));
  if (r.stdout.includes(`Unknown option '--${option}'`)) return false;
  if (r.stdout.includes(`al: unknown command: ${command}`)) return false;
  assert.ok(r.stdout.includes(`'${PROBE}'`) || r.stdout.includes(`'--${option}`),
    `the refusal names the probe or --${option}:\n${show(r)}`);
  return true;
}

const brief = ({ command, options }) => ({ command, options });

test('the finder reads al commands from code and prose, and options only with their command', () => {
  // A bare option span: no command, one orphan.
  let s = scan('Add `--history` to see more.\n', 'x.md');
  assert.deepEqual(s.commands, []);
  assert.deepEqual(s.orphans.map((o) => [o.option, o.where]), [['history', 'x.md:1']]);

  // An al command in prose, also over a line break, with its line.
  s = scan('Intro line.\nThen run al check before you\ncommit, and al\nsearch for the rest.\n', 'x.md');
  assert.deepEqual(s.commands.map((c) => [c.command, c.where, c.prose]), [
    ['check', 'x.md:2', true],
    ['search', 'x.md:3', true],
  ]);
  assert.deepEqual(s.orphans, []);

  // An option in a span with its command; a placeholder is a value.
  s = scan('Run `al record <name> signoff --by owner` and `al search --level <1|1d|2> --id <id>`.\n', 'x.md');
  assert.deepEqual(s.commands.map(brief), [
    { command: 'record', options: ['by'] },
    { command: 'search', options: ['level', 'id'] },
  ]);
  assert.deepEqual(s.orphans, []);

  // A placeholder command in prose or code names no command.
  s = scan('Each al <command> refuses. `al <new|check> [options]`\n', 'x.md');
  assert.deepEqual(s.commands, []);

  // A span that wraps over a line; an option before the command, or after a
  // shell separator, is an orphan.
  s = scan('See `al export\n--out <file>` and `--yes al check` and `al check; git log --oneline`.\n', 'x.md');
  assert.deepEqual(s.commands.map(brief), [
    { command: 'export', options: ['out'] },
    { command: 'check', options: [] },
    { command: 'check', options: [] },
  ]);
  assert.deepEqual(s.orphans.map((o) => [o.option, o.where]), [['yes', 'x.md:2'], ['oneline', 'x.md:2']]);
  assert.equal(s.commands[0].where, 'x.md:1', 'a wrapped span is where it starts');

  // A fenced block: each line is code, read once and not as prose.
  s = scan('Text.\n\n```sh\nal check --strict\n--full\nal context --diff | head\n```\n\nAfter.\n', 'x.md');
  assert.deepEqual(s.commands.map((c) => ({ ...brief(c), where: c.where, prose: c.prose })), [
    { command: 'check', options: ['strict'], where: 'x.md:4', prose: undefined },
    { command: 'context', options: ['diff'], where: 'x.md:6', prose: undefined },
  ]);
  assert.deepEqual(s.orphans.map((o) => [o.option, o.where]), [['full', 'x.md:5']]);

  // `al --version` is a command and not an orphan option.
  s = scan('Run `al --version`, or al --version in prose.\n', 'x.md');
  assert.deepEqual(s.commands.map((c) => c.command), ['--version', '--version']);
  assert.deepEqual(s.orphans, []);

  // al inside a word, after a dot or in a path names no command.
  s = scan('The legal check, et al. found, bin/al.js and al-tool run.\n', 'x.md');
  assert.deepEqual(s.commands, []);
});

test('the probes tell a refused name from an accepted one', (t) => {
  const dir = project(t);
  assert.equal(commandAccepted(dir, 'check'), true, 'check is a command');
  assert.equal(commandAccepted(dir, '--version'), true, '--version is accepted alone');
  assert.equal(commandAccepted(dir, 'al-skill-no-such-command'), false, 'an unknown command is refused');
  assert.equal(optionAccepted(dir, 'check', 'al-skill-no-such-option'), false, 'an unknown option is refused');
  assert.equal(optionAccepted(dir, 'check', 'strict'), true, 'check --strict is accepted (a flag)');
  assert.equal(optionAccepted(dir, 'export', 'out'), true, 'export --out is accepted (an option with a value)');
  assert.equal(optionAccepted(dir, '--version', 'strict'), false, 'al --version takes no option');
});

test('each al command that the skill names, in code or in plain text, is a command that al accepts', (t) => {
  const { commands } = scan(readSkill());
  assert.ok(commands.length > 0, `${SKILL} names at least one al command`);
  const dir = project(t);
  const first = new Map();
  for (const c of commands) if (!first.has(c.command)) first.set(c.command, []);
  for (const c of commands) first.get(c.command).push(c);
  const bad = [];
  for (const [command, all] of first) {
    if (commandAccepted(dir, command)) continue;
    for (const c of all) bad.push(`${c.where}: al ${command} is not a command (in ${c.prose ? 'prose' : 'code'} "${c.text}")`);
  }
  assert.deepEqual(bad, []);
});

test('each --option that the skill names in code is in the same code span or code line as its al command', () => {
  const { orphans } = scan(readSkill());
  const bad = orphans.map((o) => `${o.where}: --${o.option} is named with no al command (in "${o.text}")`);
  assert.deepEqual(bad, []);
});

test('each --option that the skill names with its al command is one that the command accepts', (t) => {
  const { commands } = scan(readSkill());
  const dir = project(t);
  const options = new Map();
  for (const c of commands) {
    for (const o of c.options) {
      const key = `${c.command} --${o}`;
      if (!options.has(key)) options.set(key, []);
      options.get(key).push({ ...c, option: o });
    }
  }
  const refusedCommands = new Set();
  const bad = [];
  for (const [key, all] of options) {
    const { command, option } = all[0];
    if (refusedCommands.has(command)) continue;
    if (!commandAccepted(dir, command)) {
      refusedCommands.add(command);
      continue; // the command test lists it
    }
    if (optionAccepted(dir, command, option)) continue;
    for (const n of all) bad.push(`${n.where}: al ${key} is not an option of ${command} (in "${n.text}")`);
  }
  assert.deepEqual(bad, []);
});
