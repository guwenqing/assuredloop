#!/usr/bin/env node
// al: AssuredLoop's command line. Every output names what it read and ends
// with a Next line and a Not known line ([VW-9]).
import { parseArgs } from 'node:util';
import { Fail, mainRef, topLevel } from '../src/git.js';
import { newRequest, recordOrigin, context, line } from '../src/commands.js';
import { spec } from '../src/spec.js';

const COMMANDS = {
  new: { run: newRequest, options: { from: { type: 'string' }, title: { type: 'string' }, tier: { type: 'string' } } },
  record: {
    run: recordOrigin,
    options: {
      from: { type: 'string' }, url: { type: 'string' }, verify: { type: 'string' },
      fetched: { type: 'string' }, updated: { type: 'string' }, yes: { type: 'boolean' },
    },
  },
  context: { run: context, options: { at: { type: 'string' } } },
  spec: {
    run: spec,
    options: { at: { type: 'string' }, list: { type: 'boolean' }, 'add-ids': { type: 'string' }, prefix: { type: 'string' }, yes: { type: 'boolean' } },
  },
};
const USAGE = 'al new | record | context | spec  (check, consolidate and conclude are not built yet)';

function main(argv) {
  const cwd = process.cwd();
  let top = null;
  let read = 'working tree';
  try {
    top = topLevel(cwd);
    const [name, ...rest] = argv;
    const command = COMMANDS[name];
    if (!command) throw new Fail(name ? `unknown or not yet built command: ${name}` : 'no command given', USAGE);
    let parsed;
    try {
      parsed = parseArgs({ args: rest, options: command.options, allowPositionals: true, strict: true });
    } catch (e) {
      throw new Fail(e.message, USAGE);
    }
    const out = command.run({ top, cwd, args: parsed.positionals, opts: parsed.values });
    if (out.tree) read = out.tree.label;
    print(out.body, read, mainRef(top), out.next, out.notKnown);
    return 0;
  } catch (e) {
    if (!(e instanceof Fail)) throw e;
    let main = 'no main read (not in a git repository)';
    if (top) try { main = mainRef(top); } catch { /* keep the fallback */ }
    if (!top) read = 'nothing';
    print([`al: ${e.message}`], read, main, e.next ?? USAGE, ['nothing was written']);
    return 2;
  }
}

function print(body, read, main, next, notKnown) {
  const text = [...body, line('Read', `${read} · ${main}`), line('Next', next), line('Not known', notKnown.join('; '))]
    .join('\n');
  process.stdout.write(text + '\n');
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`al: internal error: ${e.stack || e}\n`);
  process.exitCode = 2;
}
