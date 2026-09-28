#!/usr/bin/env node
// al: AssuredLoop's command line. Every output names what it read and ends
// with a Next line and a Not known line ([VW-9]).
import { parseArgs } from 'node:util';
import { Fail, mainRef, resolveCommit, topLevel } from '../src/git.js';
import { newRequest, recordOrigin, context, line } from '../src/commands.js';
import { spec } from '../src/spec.js';
import { consolidate } from '../src/consolidate.js';
import { conclude } from '../src/conclude.js';
import { check } from '../src/check.js';

const COMMANDS = {
  new: { run: newRequest, options: { from: { type: 'string' }, title: { type: 'string' }, tier: { type: 'string' } } },
  record: {
    run: recordOrigin,
    options: {
      from: { type: 'string' }, url: { type: 'string' }, verify: { type: 'string' },
      fetched: { type: 'string' }, updated: { type: 'string' }, yes: { type: 'boolean' },
      source: { type: 'string' }, words: { type: 'string' },
      'builds-on': { type: 'string' }, accept: { type: 'boolean' }, decision: { type: 'string' }, text: { type: 'string' },
    },
  },
  context: { run: context, options: { at: { type: 'string' }, diff: { type: 'string' }, for: { type: 'string' }, all: { type: 'boolean' } } },
  spec: {
    run: spec,
    options: { at: { type: 'string' }, list: { type: 'boolean' }, 'add-ids': { type: 'string' }, prefix: { type: 'string' }, yes: { type: 'boolean' } },
  },
  consolidate: { run: consolidate, options: { section: { type: 'string' }, revert: { type: 'string' }, yes: { type: 'boolean' } } },
  conclude: { run: conclude, options: { dropped: { type: 'string' }, yes: { type: 'boolean' } } },
  check: { run: check, options: { strict: { type: 'boolean' }, all: { type: 'boolean' } } },
};
const USAGE = 'al new | record | context | spec | consolidate | conclude | check';

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
    // [VW-9]: under --at, every output names the commit, error exits included.
    if (parsed.values.at !== undefined) {
      read = `--at ${parsed.values.at} (not found)`; // stays if the rev does not resolve
      read = `commit ${resolveCommit(top, parsed.values.at).slice(0, 7)}`;
    }
    const out = command.run({ top, cwd, args: parsed.positionals, opts: parsed.values });
    if (out.tree) read = out.tree.label;
    print(out.body, read, mainRef(top), out.next, out.notKnown);
    return out.exit ?? (out.refused ? 1 : 0); // consolidate and conclude refusing, and check --strict ([HNT-3])
  } catch (e) {
    if (!(e instanceof Fail)) throw e;
    let main = { label: 'no main read (not in a git repository)' };
    if (top) try { main = mainRef(top); } catch { /* keep the fallback */ }
    if (!top) read = 'nothing';
    print([`al: ${e.message}`], read, main, e.next ?? USAGE, ['nothing was written']);
    return 2;
  }
}

function print(body, read, main, next, notKnown) {
  const unknown = main.unknown ? [...notKnown, main.unknown] : notKnown;
  const text = [...body, line('Read', `${read} · ${main.label}`), line('Next', next), line('Not known', unknown.join('; '))]
    .join('\n');
  process.stdout.write(text + '\n');
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`al: internal error: ${e.stack || e}\n`);
  process.exitCode = 2;
}
