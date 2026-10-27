// #104: a request record that YAML can parse but cannot turn into data (for
// example, a record with too many aliases) is the record-unreadable case,
// with yaml's message as the reason. The lines and the exit codes are those
// of a record with a YAML syntax error. There is no new message text.
//
// Each test runs the same commands on two copies of one world: one copy with
// a syntax error appended to the record, one with too many aliases. Each run
// must give its own exact lines, and the two runs must give the same output
// when each reason is replaced by "<reason>". The syntax-error case is what
// main already does.
//
// - al check and al check --strict: exit 0 and 1, nothing on stderr, the
//   "index not read" line and the "not ok record-unreadable" line.
// - al record and al conclude, with and without --yes: for an open request,
//   exit 2 and "al: <path> is not a valid record: <reason>"; for an archived
//   request, the refusal for an archived request. Nothing is written.
// - al conclude refuses an unreadable record before its sign-off and promise
//   reasons: exit 2, the same "al:" line, and no "refused:" line. So does a
//   record that is missing, or whose path is a folder, with the refusal
//   "al: <name> has no record <path>" that al gives today when nothing else
//   refuses first.
// - al context: exit 0; it names the record and the reason, as it does now.
//
// The worlds: a small project (one request made by al new, open, or
// concluded by al conclude), and the invoicer world (the open request
// invoice-exports and the archived request invoice-numbers). Each record is
// changed in the working tree only.
//
// Written from the requirement and the public interface only. Nothing here
// reads src/. No model and no network.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { invoicer } from './helpers/invoicer.js';
import {
  al, baseProject, commitAll, git, newRequest, ok, read, recordPath, show, tree,
} from './helpers/project.js';

const SMALL = 'tidy-up';

// The two cases. `reason` gives the reason that al prints, from the text of
// the whole record after the lines are appended.
const SYNTAX = {
  label: 'a YAML syntax error',
  lines: 'zz: [unclosed\n',
  // yaml's message, its first line.
  reason: (text) => {
    const errors = parseDocument(text).errors;
    assert.ok(errors.length > 0, `the record has a YAML syntax error:\n${text}`);
    return errors[0].message.split('\n')[0];
  },
};
const ALIASES = {
  label: 'too many aliases',
  lines: [
    'zz_a: &a [a,a,a,a,a,a,a,a,a,a]',
    'zz_b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]',
    'zz_c: [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]',
    '',
  ].join('\n'),
  reason: () => 'Excessive alias count indicates a resource exhaustion attack',
};
const CASES = [SYNTAX, ALIASES];

// --- the worlds. Each gives { dir, name } with the record not yet changed.

// A small project on the branch `feature` with one open request, made by al
// new and committed.
function smallOpen(t) {
  const dir = baseProject(t);
  newRequest(dir, SMALL);
  commitAll(dir, `request ${SMALL}`);
  return { dir, name: SMALL };
}

// The same request, concluded by al conclude --yes and committed: its folder
// is in requests/archive/.
function smallArchived(t) {
  const { dir, name } = smallOpen(t);
  ok(dir, ['conclude', name, '--yes']);
  commitAll(dir, `conclude ${name}`);
  return { dir, name };
}

const invoicerOpen = (t) => ({ dir: invoicer(t, 'clean'), name: 'invoice-exports' });
const invoicerArchived = (t) => ({ dir: invoicer(t, 'clean'), name: 'invoice-numbers' });

const WORLDS = [
  { label: 'the small project, open request', make: smallOpen, archived: false },
  { label: 'the small project, archived request', make: smallArchived, archived: true },
  { label: 'the invoicer world, open request invoice-exports', make: invoicerOpen, archived: false },
  { label: 'the invoicer world, archived request invoice-numbers', make: invoicerArchived, archived: true },
];

// A fresh copy of the world with the case's lines appended to the record.
function broken(t, world, kase) {
  const { dir, name } = world.make(t);
  const path = recordPath(name);
  appendFileSync(join(dir, path), kase.lines);
  const reason = kase.reason(read(dir, path));
  return { dir, name, path, reason };
}

const normal = (text, reason) => text.split(reason).join('<reason>');

// The runs of args in one copy, with each reason replaced by "<reason>".
const normalized = (runs, reason) => runs.map((r) => ({
  args: r.args.join(' '), code: r.code, stdout: normal(r.stdout, reason), stderr: normal(r.stderr, reason),
}));

// The alias case gives what the syntax-error case gives, but for the reason.
function sameAsSyntax(t, world, aliasRuns, aliasReason, commands) {
  const s = broken(t, world, SYNTAX);
  const syntaxRuns = commands(s).map((args) => al(s.dir, args));
  assert.deepEqual(
    normalized(aliasRuns, aliasReason),
    normalized(syntaxRuns, s.reason),
    `the same output as for a YAML syntax error, but for the reason:\n${aliasRuns.map(show).join('\n')}\n${syntaxRuns.map(show).join('\n')}`,
  );
}

const lines = (r) => r.stdout.split('\n');
const noInternalError = (r) => {
  assert.doesNotMatch(r.stderr, /internal error/, show(r));
  assert.equal(r.stderr, '', `nothing on stderr:\n${show(r)}`);
};

// --- al check

const indexLine = (path, reason) => `index not read: ${path} is not a valid record: ${reason}`;
const unreadableLine = (path, name, reason) =>
  `not ok record-unreadable ${path} ${name} ${path} cannot be read (${reason}), so its requirements, sign-offs and evidence are not checked; fix it by hand`;

const checkCommands = () => [['check'], ['check', '--strict']];

describe('#104 al check: a record whose data cannot be made is not ok record-unreadable, as a YAML syntax error is', () => {
  for (const world of WORLDS) {
    for (const kase of CASES) {
      test(`${world.label}, ${kase.label}: check exits 0, --strict exits 1, nothing on stderr, the index not read line and the not ok record-unreadable line`, (t) => {
        const b = broken(t, world, kase);
        const runs = checkCommands(b).map((args) => al(b.dir, args));
        const [plain, strict] = runs;
        assert.equal(plain.code, 0, show(plain));
        assert.equal(strict.code, 1, show(strict));
        for (const r of runs) {
          noInternalError(r);
          assert.ok(lines(r).includes(indexLine(b.path, b.reason)), `the line "${indexLine(b.path, b.reason)}":\n${show(r)}`);
          assert.ok(lines(r).includes(unreadableLine(b.path, b.name, b.reason)), `the line "${unreadableLine(b.path, b.name, b.reason)}":\n${show(r)}`);
        }
        if (kase === ALIASES) sameAsSyntax(t, world, runs, b.reason, checkCommands);
      });
    }
  }
});

// --- al record and al conclude

const recordCommands = ({ name }) => [
  ['record', name, 'decision', '--source', 'x', '--text', 'y'],
  ['record', name, 'decision', '--source', 'x', '--text', 'y', '--yes'],
];
const concludeCommands = ({ name }) => [['conclude', name], ['conclude', name, '--yes']];

// Each run: exit 2, nothing on stderr, nothing written (file tree and git status).
function refusedRuns(b, commands) {
  const before = tree(b.dir);
  const status = git(b.dir, 'status', '--porcelain');
  return commands(b).map((args) => {
    const r = al(b.dir, args);
    assert.equal(r.code, 2, show(r));
    noInternalError(r);
    assert.deepEqual(tree(b.dir), before, `a refusal writes nothing:\n${show(r)}`);
    assert.equal(git(b.dir, 'status', '--porcelain'), status, `git status is unchanged:\n${show(r)}`);
    return r;
  });
}

const COMMANDS = [
  { label: 'al record <name> decision', commands: recordCommands, archivedRefusal: (b) => `al: ${b.name} is archived, and an archived request is not edited` },
  {
    label: 'al conclude <name>',
    commands: concludeCommands,
    archivedRefusal: (b) => `al: ${b.name} is already archived (requests/archive/${b.name}); an archived request is not concluded again`,
  },
];

describe('#104 al record and al conclude refuse a record whose data cannot be made, as they refuse a YAML syntax error', () => {
  const [open, archived] = WORLDS;
  for (const { label, commands, archivedRefusal } of COMMANDS) {
    for (const kase of CASES) {
      test(`${open.label}, ${kase.label}: ${label}, with and without --yes, exits 2 with "al: <path> is not a valid record: <reason>" and writes nothing`, (t) => {
        const b = broken(t, open, kase);
        const runs = refusedRuns(b, commands);
        const refusal = `al: ${b.path} is not a valid record: ${b.reason}`;
        for (const r of runs) assert.equal(lines(r)[0], refusal, `the refusal "${refusal}":\n${show(r)}`);
        if (kase === ALIASES) sameAsSyntax(t, open, runs, b.reason, commands);
      });

      test(`${archived.label}, ${kase.label}: ${label}, with and without --yes, exits 2 with the refusal for an archived request and writes nothing`, (t) => {
        const b = broken(t, archived, kase);
        const runs = refusedRuns(b, commands);
        for (const r of runs) assert.equal(lines(r)[0], archivedRefusal(b), show(r));
        if (kase === ALIASES) sameAsSyntax(t, archived, runs, b.reason, commands);
      });
    }
  }
});

// The architect's decision for #104: al conclude refuses first when the
// request's record cannot be read, right after the check for an archived
// request and before its sign-off and promise reasons, which al works out
// without the record. The open request invoice-exports of the invoicer world
// has such reasons: with a good record, al conclude refuses it with a
// "refused:" line.
describe('#104 al conclude refuses an unreadable record before its other refusal reasons', () => {
  const world = WORLDS[2];
  const REFUSED = /^refused: /m;

  test(`control: ${world.label}, its record good: al conclude, with and without --yes, refuses with a "refused:" line and names no record`, (t) => {
    const { dir, name } = world.make(t);
    for (const args of concludeCommands({ name })) {
      const r = al(dir, args);
      assert.equal(r.code, 1, show(r));
      assert.match(r.stdout, REFUSED, show(r));
      assert.doesNotMatch(r.stdout, /is not a valid record/, show(r));
    }
  });

  for (const kase of CASES) {
    test(`${world.label}, ${kase.label}: al conclude <name>, with and without --yes, exits 2 with "al: <path> is not a valid record: <reason>", no "refused:" line, and writes nothing`, (t) => {
      const b = broken(t, world, kase);
      const runs = refusedRuns(b, concludeCommands);
      const refusal = `al: ${b.path} is not a valid record: ${b.reason}`;
      for (const r of runs) {
        assert.equal(lines(r)[0], refusal, `the refusal "${refusal}":\n${show(r)}`);
        assert.doesNotMatch(r.stdout, REFUSED, `no "refused:" line:\n${show(r)}`);
      }
      if (kase === ALIASES) sameAsSyntax(t, world, runs, b.reason, concludeCommands);
    });
  }

  // A record that is missing, or a folder at its path. The expected stdout is
  // what al conclude prints today for the request of the small project, which
  // has no other refusal reason (the reference test below).
  const NO_RECORD = [
    { label: 'the record is missing', make: (dir, path) => rmSync(join(dir, path)) },
    { label: 'a folder stands at the record path', make: (dir, path) => { rmSync(join(dir, path)); mkdirSync(join(dir, path)); } },
  ];
  const noRecordStdout = (name) => [
    `al: ${name} has no record ${recordPath(name)}`,
    'Read      working tree',
    'Next      a v4 request is made with al new',
    'Not known nothing was written',
    '',
  ].join('\n');

  for (const gone of NO_RECORD) {
    test(`reference: ${WORLDS[0].label}, ${gone.label}: al conclude, with and without --yes, exits 2 with "al: <name> has no record <path>" and writes nothing`, (t) => {
      const { dir, name } = WORLDS[0].make(t);
      gone.make(dir, recordPath(name));
      for (const r of refusedRuns({ dir, name }, concludeCommands)) assert.equal(r.stdout, noRecordStdout(name), show(r));
    });

    test(`${world.label}, ${gone.label}: al conclude <name>, with and without --yes, exits 2 with "al: <name> has no record <path>", no "refused:" line, and writes nothing`, (t) => {
      const { dir, name } = world.make(t);
      gone.make(dir, recordPath(name));
      for (const r of refusedRuns({ dir, name }, concludeCommands)) {
        assert.doesNotMatch(r.stdout, REFUSED, `no "refused:" line:\n${show(r)}`);
        assert.equal(r.stdout, noRecordStdout(name), show(r));
      }
    });
  }
});

// --- al context

// The commands of each world, and the Records text that each command that
// names the record must print. A requirement ID (invoice-exports/R1) gives
// no Records line, for either case: only the same output is asked of it.
const CONTEXTS = [
  { world: WORLDS[0], commands: ({ name }) => [['context', name]] },
  { world: WORLDS[1], commands: ({ name }) => [['context', name]] },
  { world: WORLDS[2], commands: ({ name }) => [['context', name], ['context', 'EXP-2'], ['context'], ['context', `${name}/R1`]] },
  { world: WORLDS[3], commands: ({ name }) => [['context', name]] },
];
const recordsText = (b, args) => {
  if (args.length === 1) return `not known: the record of ${b.name} (${b.reason})`;
  if (args[1] === b.name) return `al's record ${b.path} cannot be read (${b.reason}), so its sign-offs, versions, tasks and close lines are not known`;
  if (args[1] === 'EXP-2') return `not known: the record ${b.path} (${b.reason}), so al cannot check the version and the sign-off state on its Serves lines`;
  return null;
};

describe('#104 al context names a record whose data cannot be made and its reason, as for a YAML syntax error', () => {
  for (const { world, commands } of CONTEXTS) {
    for (const kase of CASES) {
      test(`${world.label}, ${kase.label}: ${commands({ name: '<name>' }).map((a) => `al ${a.join(' ')}`).join(', ')} exit 0 and name the record and the reason in the Records line`, (t) => {
        const b = broken(t, world, kase);
        const runs = commands(b).map((args) => al(b.dir, args));
        for (const r of runs) {
          assert.equal(r.code, 0, show(r));
          noInternalError(r);
          const expected = recordsText(b, r.args);
          if (expected === null) continue;
          const records = lines(r).filter((l) => l.startsWith('Records '));
          assert.equal(records.length, 1, `one Records line:\n${show(r)}`);
          assert.ok(records[0].endsWith(expected), `the Records line ends with "${expected}":\n${show(r)}`);
        }
        if (kase === ALIASES) sameAsSyntax(t, world, runs, b.reason, commands);
      });
    }
  }
});
