// #88, part 3: a binding unknown. A link was in the holder's marker at the
// base, but its binding record is gone. `al index` names it on a line
// `binding unknown: <holder> <link> <target>`, and only `al index --align`
// could bind it again. Now a judgement does:
//
// - `al record <name> judgement --hint binding-unknown --on <holder>
//   --reason <why> [--yes]` binds each unknown link of that holder, in the
//   record of <name> only; <name> is a request whose record would hold the
//   binding. With no unknown binding of that holder, it refuses.
// - Each new binding gets `judgement: J<n>` and the holder's text of now.
//   A target that resolves now gives its text of now. A removed target gives
//   its text in the newest commit that held it; when no commit holds it, the
//   command refuses.
// - The judgement is listed on the grouped info judged line while no binding
//   that names it gives a hint.
// - The Next line of al index for a binding unknown names the judgement, not
//   --align.
//
// Nothing here reads the code under test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY, appendSection, baseProject, binding, bindingsOf, commitAll, doc, editFile, editRecord, git, hashOf, index, newRequest,
  ok, organized, record, refused, req, show, write, writesNothing,
} from './helpers/project.js';
import { check, judgedLine, judgementArgs, namesStale, noJudgedLine, onLink, one } from './helpers/judgement-88.js';

const NAME = 'inv';
const REC = `.assuredloop/records/requests/${NAME}.yaml`;
const SPEC = 'specs/invoices.md';
const CS = 'requests/inv/spec.md';
const R1 = req('R1', 'Monthly CSV download', 'A user MUST be able to download one month as one CSV file.');
const INV41 = '<!-- INV-41 rule -->\n\nThe export link MUST expire 30 minutes after the email is sent.\n';
const UNKNOWN = {
  sp1: 'inv/SP-1 builds-on INV-12', // a target that resolves now
  sp2: 'inv/SP-2 removes INV-41', // a target removed on main, after the commit that bound it
  sp3: 'inv/SP-3 removes INV-99', // a target that no commit holds
};

// On main: the requests inv and other. inv's change spec holds SP-1
// (builds-on:INV-12), SP-2 (removes:INV-41) and SP-3 (removes:INV-99, an ID
// that never existed); indexed and committed as `bound`, so inv's record
// binds SP-1 builds-on INV-12 and SP-2 removes INV-41. Then INV-41 is
// deleted from specs/ on main. The branch feature deletes the two bindings
// from inv's record by hand, and commits.
function unknown(t) {
  const dir = baseProject(t, { branch: null });
  newRequest(dir, NAME, 'The owner wants a monthly export.\n', ['--tier', '2']);
  appendSection(dir, NAME, organized([R1]));
  newRequest(dir, 'other', 'The owner wants an invoice view.\n', ['--tier', '2']);
  appendSection(dir, 'other', organized([req('R1', 'Invoice view', 'A user MUST be able to see one invoice.')]));
  write(dir, CS, doc([
    ['SP-1 component serves:R1 builds-on:INV-12', 'The export holds one row per invoice line.'],
    ['SP-2 rule serves:R1 removes:INV-41', 'The export link no longer expires.'],
    ['SP-3 rule serves:R1 removes:INV-99', 'There is no draft export.'],
  ]));
  index(dir);
  const rec = record(dir, NAME);
  const removed = binding(rec, 'inv/SP-2', 'removes', 'INV-41');
  binding(rec, 'inv/SP-1', 'builds-on', 'INV-12');
  const bound = commitAll(dir, 'The request inv, bound');
  editFile(dir, SPEC, INV41, '');
  index(dir);
  commitAll(dir, 'INV-41 is removed');
  git(dir, 'checkout', '-q', '-b', 'feature');
  editRecord(dir, NAME, (r) => {
    r.bindings = r.bindings.filter((b) => !(b.holder === 'inv/SP-1' && b.link === 'builds-on') && !(b.holder === 'inv/SP-2' && b.link === 'removes'));
  });
  commitAll(dir, 'The two bindings are lost');
  return { dir, bound: bound.slice(0, 7), removedSha: removed.target_sha256 };
}

const unknownLines = (r) => r.stdout.split('\n').filter((l) => l.startsWith('binding unknown: '));
// al check names the bindings unknown on one line: `index binding unknown: a; b; ...`.
const checkUnknown = (r) => {
  const line = r.stdout.split('\n').find((l) => l.startsWith('index binding unknown: '));
  return line ? line.slice('index binding unknown: '.length).split('; ') : [];
};
const judge = (dir, on, reason, opts) => ok(dir, judgementArgs('binding-unknown', on, reason, opts));
const entry = (dir, id) => (record(dir, NAME).judgements ?? []).find((j) => j.id === id);

describe('binding unknown: the world', () => {
  test('al index names the three links "binding unknown"; al check names them on its index line', (t) => {
    const { dir } = unknown(t);
    const r = index(dir);
    assert.deepEqual(unknownLines(r).sort(), Object.values(UNKNOWN).map((u) => `binding unknown: ${u}`).sort(), show(r));
    const c = check(dir);
    assert.deepEqual(checkUnknown(c).sort(), Object.values(UNKNOWN).sort(), show(c));
  });

  test('the Next line of al index names the judgement --hint binding-unknown, and no line names --align', (t) => {
    const { dir } = unknown(t);
    const r = index(dir);
    const next = r.stdout.split('\n').find((l) => l.startsWith('Next '));
    assert.ok(next?.includes('judgement --hint binding-unknown'), show(r));
    assert.ok(!r.stdout.includes('--align'), show(r));
    assert.ok(!check(dir).stdout.includes('--align'), 'al check names no --align');
  });
});

describe('binding unknown: a judgement binds the unknown links of its holder', () => {
  const WHY = 'SP-1 still builds on the invoice data.';

  test('a target that resolves now (inv/SP-1 builds-on INV-12): dry run writes nothing; --yes binds it to now with judgement J1', (t) => {
    const { dir } = unknown(t);
    const dry = writesNothing(dir, judgementArgs('binding-unknown', 'inv/SP-1', WHY, { yes: false }));
    const lines = dry.stdout.split('\n');
    const at = lines.indexOf(`Would add to ${REC}:`);
    assert.ok(at >= 0, show(dry));
    assert.deepEqual(lines.slice(at, at + 3), [`Would add to ${REC}:`, `J1 binding-unknown inv/SP-1: ${WHY}`, '  binds builds-on INV-12 of inv/SP-1 to now'], show(dry));
    const r = judge(dir, 'inv/SP-1', WHY);
    const out = r.stdout.split('\n');
    const from = out.indexOf(`Added to ${REC}:`);
    assert.deepEqual(out.slice(from, from + 3), [`Added to ${REC}:`, `J1 binding-unknown inv/SP-1: ${WHY}`, '  binds builds-on INV-12 of inv/SP-1 to now'], show(r));
    const j = entry(dir, 'J1');
    assert.ok(j, `the record holds J1:\n${show(r)}`);
    assert.equal(j.hint, 'binding-unknown');
    assert.equal(j.on, 'inv/SP-1');
    assert.equal(j.reason, WHY);
    assert.ok(String(j.recorded).startsWith(DAY));
    index(dir);
    const b = binding(record(dir, NAME), 'inv/SP-1', 'builds-on', 'INV-12');
    assert.equal(b.judgement, 'J1');
    assert.equal(b.holder_sha256, hashOf(dir, CS, 'SP-1'), 'the holder hash is its text of now');
    assert.equal(b.target_sha256, hashOf(dir, SPEC, 'INV-12'), 'the target hash is its text of now');
    assert.deepEqual(bindingsOf(record(dir, 'other'), 'inv/SP-1', 'builds-on', 'INV-12'), [], 'the record of other holds no binding');
  });

  test('after the judgement: al index and al check no longer name inv/SP-1 builds-on INV-12; the other two stay; the info judged line lists J1', (t) => {
    const { dir } = unknown(t);
    judge(dir, 'inv/SP-1', WHY);
    const r = index(dir);
    assert.deepEqual(unknownLines(r).sort(), [`binding unknown: ${UNKNOWN.sp2}`, `binding unknown: ${UNKNOWN.sp3}`], show(r));
    commitAll(dir, 'The judgement J1');
    const c = check(dir);
    assert.deepEqual(checkUnknown(c).sort(), [UNKNOWN.sp2, UNKNOWN.sp3], show(c));
    assert.equal(judgedLine(c), `${NAME}/J1 binding-unknown inv/SP-1: ${WHY}`, show(c));
  });

  test('a removed target (inv/SP-2 removes INV-41): the binding takes INV-41\'s text in the newest commit that held it', (t) => {
    const { dir, bound, removedSha } = unknown(t);
    const WHY2 = 'SP-2 removes the expiry rule, as R1 asks.';
    const r = judge(dir, 'inv/SP-2', WHY2);
    const out = r.stdout.split('\n');
    const from = out.indexOf(`Added to ${REC}:`);
    assert.deepEqual(out.slice(from, from + 3), [
      `Added to ${REC}:`,
      `J1 binding-unknown inv/SP-2: ${WHY2}`,
      `  binds removes INV-41 of inv/SP-2 to INV-41's text at ${bound}, the newest commit that held it`,
    ], show(r));
    index(dir);
    const b = binding(record(dir, NAME), 'inv/SP-2', 'removes', 'INV-41');
    assert.equal(b.judgement, 'J1');
    assert.equal(b.holder_sha256, hashOf(dir, CS, 'SP-2'), 'the holder hash is its text of now');
    assert.equal(b.target_sha256, removedSha, `the target hash is INV-41's text at ${bound}`);
    const c = check(dir);
    assert.deepEqual(checkUnknown(c).sort(), [UNKNOWN.sp1, UNKNOWN.sp3], `SP-1 is not judged here, so it stays unknown:\n${show(c)}`);
  });

  test('two judgements: one grouped info judged line, J1 then J2', (t) => {
    const { dir } = unknown(t);
    judge(dir, 'inv/SP-1', 'Checked SP-1');
    judge(dir, 'inv/SP-2', 'Checked SP-2');
    const c = check(dir);
    assert.equal(judgedLine(c), `${NAME}/J1 binding-unknown inv/SP-1: Checked SP-1; ${NAME}/J2 binding-unknown inv/SP-2: Checked SP-2`, show(c));
  });

  test('the target changes after the judgement: stale-base names J1 as stale, and the info judged line no longer lists J1', (t) => {
    const { dir } = unknown(t);
    judge(dir, 'inv/SP-1', WHY);
    commitAll(dir, 'The judgement J1');
    editFile(dir, SPEC, 'An invoice has a number', 'An invoice has a unique number');
    const c = check(dir);
    namesStale(one(onLink(c, 'stale-base', 'inv/SP-1', 'builds-on', 'INV-12'), c, 'stale-base on inv/SP-1 builds-on INV-12'), c, 1);
    noJudgedLine(c);
  });
});

describe('binding unknown: the refusals', () => {
  test('--on a holder with no unknown binding now (inv/SP-1 after its judgement): "--on inv/SP-1: al check gives no binding-unknown hint on inv/SP-1 now"', (t) => {
    const { dir } = unknown(t);
    judge(dir, 'inv/SP-1', 'Checked');
    const r = refused(dir, judgementArgs('binding-unknown', 'inv/SP-1', 'Checked again'));
    assert.ok(r.stdout.includes('--on inv/SP-1: al check gives no binding-unknown hint on inv/SP-1 now'), show(r));
  });

  test('a request whose record would not hold the binding (other): refused, and the link stays unknown', (t) => {
    const { dir } = unknown(t);
    refused(dir, judgementArgs('binding-unknown', 'inv/SP-1', 'Checked', { name: 'other' }));
    assert.ok(unknownLines(index(dir)).includes(`binding unknown: ${UNKNOWN.sp1}`));
  });

  test('a removed target that no commit holds (inv/SP-3 removes INV-99): "--on inv/SP-3: al cannot tell what INV-99 said: no commit in this clone holds it"', (t) => {
    const { dir } = unknown(t);
    const r = refused(dir, judgementArgs('binding-unknown', 'inv/SP-3', 'Checked'));
    assert.ok(r.stdout.includes('--on inv/SP-3: al cannot tell what INV-99 said: no commit in this clone holds it'), show(r));
  });

  test('al index --align on the holder is refused, and the link stays unknown', (t) => {
    const { dir } = unknown(t);
    refused(dir, ['index', '--align', 'inv/SP-1']);
    assert.ok(unknownLines(index(dir)).includes(`binding unknown: ${UNKNOWN.sp1}`));
  });
});
