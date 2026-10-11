#!/usr/bin/env node
// al, the v4 command (T17 made it the one in package.json's bin).
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { check } from '../src/v4/check.js';
import { Fail, spec } from '../src/v4/spec.js';
import { newRequest, record } from '../src/v4/commands.js';
import { index } from '../src/v4/indexer.js';
import { exportCommand } from '../src/v4/export.js';
import { search } from '../src/v4/search.js';
import { context } from '../src/v4/views.js';
import { conclude } from '../src/v4/conclude.js';

// positionals: how many positional arguments a command uses, or a function of
// its options that says so; any more are refused. None given: it uses them all.
const COMMANDS = {
  new: { run: newRequest, positionals: 1, options: { from: { type: 'string' }, title: { type: 'string' }, tier: { type: 'string' } } },
  record: {
    run: record,
    positionals: 2,
    options: {
      url: { type: 'string' }, from: { type: 'string' }, fetched: { type: 'string' }, yes: { type: 'boolean' },
      source: { type: 'string' }, words: { type: 'string' }, presented: { type: 'string' }, 'transcribed-by': { type: 'string' },
      text: { type: 'string' }, clarifies: { type: 'string' },
    },
  },
  index: { run: index, positionals: 0, options: { align: { type: 'string' } } },
  spec: { run: spec, positionals: (o) => (o['add-ids'] === undefined ? Infinity : 0), options: { 'add-ids': { type: 'string' }, prefix: { type: 'string' }, yes: { type: 'boolean' } } },
  check: { run: check, positionals: 0, options: { strict: { type: 'boolean' } } },
  export: { run: exportCommand, positionals: 0, options: { at: { type: 'string' }, out: { type: 'string' } } },
  search: {
    run: search,
    options: {
      id: { type: 'string' }, change: { type: 'string' }, history: { type: 'boolean' }, level: { type: 'string' }, at: { type: 'string' },
      limit: { type: 'string' }, section: { type: 'boolean' }, rebuild: { type: 'boolean' }, json: { type: 'boolean' },
    },
  },
  context: { run: context, options: { diff: { type: 'string' }, for: { type: 'string' }, audit: { type: 'boolean' }, at: { type: 'string' } } },
  conclude: { run: conclude, options: { yes: { type: 'boolean' } } },
};
const USAGE = `al <${Object.keys(COMMANDS).join('|')}|--version> [options]`;

const line = (label, text) => `${label.padEnd(10)}${text}`;
// Every output line is one line: control characters but a tab show as \xNN.
const shown = (l) => String(l).replace(/[\x00-\x08\x0a-\x0c\x0e-\x1f\x7f-\x9f]|\r(?!$)/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
const print = (body, read, next, notKnown) => process.stdout.write(
  [...body, line('Read', read), line('Next', next), line('Not known', notKnown.join('; ') || 'nothing beyond what is shown')].map(shown).join('\n') + '\n');

function topLevel(cwd) {
  try {
    return execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new Fail('not in a git repository', 'run it inside a git checkout');
  }
}

// `al --version`: the package version, and the commit of the install folder
// when that folder is the top of a git checkout, so a run says what it runs.
function version() {
  const dir = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
  const pkg = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'));
  // The caller's GIT_DIR and the like point at the caller's repo, not this folder.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  const git = (args) => {
    try {
      return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  };
  const top = git(['rev-parse', '--show-toplevel']);
  const sha = top && realpathSync(top) === dir ? git(['rev-parse', 'HEAD']) : null;
  const where = sha ? `${sha.slice(0, 7)} · ${dir}` : `not a git checkout: ${dir}`;
  print([`al ${pkg.version ?? 'unreleased'} · ${where}`], 'the install folder · no project read', 'al context',
    [sha ? 'whether the install folder has uncommitted changes' : 'which commit it was installed from']);
  return 0;
}

async function main(argv) {
  const cwd = process.cwd();
  let read = 'nothing';
  if (argv.length === 1 && ['--version', '-v'].includes(argv[0])) return version();
  try {
    const top = topLevel(cwd);
    read = 'working tree';
    const [name, ...rest] = argv;
    const command = COMMANDS[name];
    if (!command) throw new Fail(name ? `unknown command: ${name}` : 'no command given', USAGE);
    let parsed;
    try {
      parsed = parseArgs({ args: rest, options: command.options, allowPositionals: true, strict: true });
    } catch (e) {
      throw new Fail(e.message, USAGE);
    }
    const { positionals = Infinity } = command;
    const n = typeof positionals === 'function' ? positionals(parsed.values) : positionals;
    const extra = parsed.positionals[n];
    if (extra !== undefined) {
      const used = name === 'spec' ? 'spec --add-ids' : name;
      throw new Fail(`extra argument ${JSON.stringify(extra)}: ${used} takes ${n === 0 ? 'no' : n} positional argument${n === 1 ? '' : 's'}`,
        'quote an option value that holds spaces, and leave out the extra argument');
    }
    let out;
    try {
      out = await command.run({ top, cwd, args: parsed.positionals, opts: parsed.values });
    } catch (e) {
      // A config or schema file that does not parse is the user's to fix.
      if (e instanceof Fail || !/^\.assuredloop\//.test(e.message)) throw e;
      throw new Fail(e.message, 'fix the file and run it again');
    }
    // A machine stream (the export's JSONL, search --json) is written as it is.
    if (out.raw !== undefined) process.stdout.write(out.raw);
    else print(out.body, out.read ?? read, out.next, out.notKnown ?? []);
    return out.exit ?? 0;
  } catch (e) {
    if (!(e instanceof Fail)) throw e;
    print([`al: ${e.message}`], read, e.next ?? USAGE, ['nothing was written']);
    return 2;
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`al: internal error: ${e.stack || e}\n`);
  process.exitCode = 2;
}
