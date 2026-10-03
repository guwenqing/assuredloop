#!/usr/bin/env node
// al: AssuredLoop's command line. Every output names what it read and ends
// with a Next line and a Not known line ([VW-9]).
import { parseArgs } from 'node:util';
import { Fail, mainRef, remember, resolveCommit, topLevel } from '../src/git.js';
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
  context: { run: context, options: { at: { type: 'string' }, diff: { type: 'string' }, for: { type: 'string' }, all: { type: 'boolean' }, audit: { type: 'boolean' } } },
  spec: {
    run: spec,
    options: { at: { type: 'string' }, list: { type: 'boolean' }, 'add-ids': { type: 'string' }, prefix: { type: 'string' }, yes: { type: 'boolean' } },
  },
  consolidate: { run: consolidate, options: { section: { type: 'string' }, revert: { type: 'string' }, yes: { type: 'boolean' } } },
  conclude: { run: conclude, options: { dropped: { type: 'string' }, yes: { type: 'boolean' } } },
  check: { run: check, options: { at: { type: 'string' }, strict: { type: 'boolean' }, all: { type: 'boolean' } } },
};
const ONE_LINE = ['words', 'source', 'text', 'url', 'updated', 'title'];
const USAGE = 'al new | record | context | spec | consolidate | conclude | check';

function main(argv) {
  const cwd = process.cwd();
  let top = null;
  let read = 'working tree';
  remember();
  try {
    top = topLevel(cwd);
    const [name, ...rest] = argv;
    const command = COMMANDS[name];
    if (!command) throw new Fail(name ? `unknown command: ${name}` : 'no command given', USAGE);
    let parsed;
    try {
      parsed = parseArgs({ args: rest, options: command.options, allowPositionals: true, strict: true });
    } catch (e) {
      throw new Fail(e.message, USAGE);
    }
    // A one-line value is written into a record line; a line break in it would forge another line.
    const broken = ONE_LINE.find((k) => /[\r\n]/.test(parsed.values[k] ?? ''));
    if (broken) throw new Fail(`--${broken} holds a line break; it takes one line`, `pass --${broken} on one line`);
    // [VW-9]: under --at, every output names the commit, error exits included.
    // [VW-8]: from here on --at is the commit's full id, however it was spelled.
    if (parsed.values.at !== undefined) {
      read = `--at ${parsed.values.at} (not found)`; // stays if the rev does not resolve
      parsed.values.at = resolveCommit(top, parsed.values.at);
      read = `commit ${parsed.values.at.slice(0, 7)}`;
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

// Every line of output is one line: text from files, file names and commit
// subjects are shown with each control character (C0, DEL, C1) but a tab as
// \xNN, so a line break in a file name or an escape code in a subject reaches
// no reader as such. A CR that ends a line (a CRLF file) stays: it hides nothing.
const shown = (l) => String(l).replace(/[\x00-\x08\x0a-\x0c\x0e-\x1f\x7f-\x9f]|\r(?!$)/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);

function print(body, read, main, next, notKnown) {
  const unknown = main.unknown ? [...notKnown, main.unknown] : notKnown;
  const text = [...body, line('Read', `${read} · ${main.label}`), line('Next', next), line('Not known', unknown.join('; ') || 'nothing beyond what is shown')]
    .map(shown).join('\n');
  process.stdout.write(text + '\n');
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`al: internal error: ${e.stack || e}\n`);
  process.exitCode = 2;
}
