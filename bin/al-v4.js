#!/usr/bin/env node
// al-v4: the v4 commands, built beside v1 until T17 switches `al` to them.
// Not published: bin/al.js stays the package's command.
import { parseArgs } from 'node:util';
import { git } from '../src/v4/git.js';
import { Fail } from '../src/v4/base.js';
import { newRequest, record } from '../src/v4/commands.js';
import { index } from '../src/v4/indexer.js';

const COMMANDS = {
  new: { run: newRequest, options: { from: { type: 'string' }, title: { type: 'string' }, tier: { type: 'string' } } },
  record: {
    run: record,
    options: {
      url: { type: 'string' }, from: { type: 'string' }, fetched: { type: 'string' }, yes: { type: 'boolean' },
      source: { type: 'string' }, words: { type: 'string' }, presented: { type: 'string' }, 'transcribed-by': { type: 'string' },
      text: { type: 'string' }, clarifies: { type: 'string' },
    },
  },
  index: { run: index, options: { align: { type: 'string' } } },
};
const USAGE = `al-v4 ${Object.keys(COMMANDS).join(' | ')}`;

function main(argv) {
  const [name, ...rest] = argv;
  try {
    const command = COMMANDS[name];
    if (!command) throw new Fail(name ? `unknown command: ${name}` : 'no command given', USAGE);
    let parsed;
    try {
      parsed = parseArgs({ args: rest, options: command.options, allowPositionals: true, strict: true });
    } catch (e) {
      throw new Fail(e.message, USAGE);
    }
    const top = git(process.cwd(), ['rev-parse', '--show-toplevel'], { allowFail: true });
    if (!top) throw new Fail('not in a git repository', 'run al-v4 inside the project\'s repository');
    const out = command.run({ top, cwd: process.cwd(), args: parsed.positionals, opts: parsed.values });
    print([...out.body, `Next      ${out.next}`]);
    return 0;
  } catch (e) {
    if (!(e instanceof Fail)) throw e;
    print([`al: ${e.message}`, `Next      ${e.next ?? USAGE}`, 'Not known nothing was written']);
    return 2;
  }
}

// One line per line: a control character in a file's text or name is shown as \xNN.
const shown = (l) => String(l).replace(/[\x00-\x08\x0a-\x1f\x7f-\x9f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
const print = (lines) => process.stdout.write(lines.map(shown).join('\n') + '\n');

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`al: internal error: ${e.stack || e}\n`);
  process.exitCode = 2;
}
