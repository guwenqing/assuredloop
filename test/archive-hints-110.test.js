// #110: on a branch that concludes a request, al check gives the same hints
// of that request after `al conclude <name> --yes` moves it to
// requests/archive/<name>/ as before the move, at the new paths. Written
// before the code, from the issue and the architect's decisions, through
// the al command only:
//
// - A request that the branch concludes (archived now, and not archived at
//   the base; also one made and concluded on the branch) gives the same
//   hints as before the move, at the new paths. A judgement clears them as
//   before (#107).
// - A request archived at the base stays not checked: it gives none of these
//   hints.
// - With no base, al is as today.
// - No hint text changes.
// - The binding judgements of a request that the branch concludes are
//   checked again, as for an open request.
//
// The codes: stale-base, unresolved-link, near-match, and unknown-task (the
// one more code; on main it also goes away after the move). al record
// refuses an archived request ("inv is archived, and an archived request is
// not edited"), so each judgement here is recorded before the move. Nothing
// here reads the code under test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { check } from './helpers/invoicer.js';
import {
  INVOICES, commitAll, doc, editFile, editRecord, git, index, newRequest, ok, project, recordPath, show, write, writeConfig,
} from './helpers/project.js';
import { coded, judge, none, one } from './helpers/judgement-88.js';

const NAME = 'inv';
const OPEN_DIR = `requests/${NAME}/`;
const ARCHIVE_DIR = `requests/archive/${NAME}/`;
const CS = `${OPEN_DIR}spec.md`;
const ARCHIVED = `${ARCHIVE_DIR}spec.md`;
const REC = recordPath(NAME);
const TIER = `Tier: 1d — ${NAME}`;
const WHY = 'Checked.';

// The change spec of inv (path 1d). With INV-12 changed and a task T1 in
// the record, each paragraph gets one hint:
// - SP-1 plan builds-on:INV-12: stale-base;
// - SP-2 note builds-on:INV-99: unresolved-link (no such ID);
// - SP-3 example, close to INV-41 with no link: near-match;
// - SP-4 step for:T9: unknown-task (the record has only T1).
const CHANGE_SPEC = doc([
  ['SP-1 plan builds-on:INV-12', 'The exporter reads the invoice data.'],
  ['SP-2 note builds-on:INV-99', 'See the old rule.'],
  ['SP-3 example', 'The export link expires 30 minutes after the mail is sent.'],
  ['SP-4 step for:T9', 'Build the CSV writer.'],
]);
const HINTS = [
  ['stale-base', 'inv/SP-1'],
  ['unresolved-link', 'inv/SP-2'],
  ['near-match', 'inv/SP-3'],
  ['unknown-task', 'inv/SP-4'],
];
const CODES = HINTS.map(([code]) => code);
const INV12 = ['An invoice has a number', 'An invoice has a unique number'];
const INV41 = ['after the email is sent.', 'after the email is sent to the customer.'];

// The change spec without SP-3. near-match is given only on a paragraph
// that the change makes or edits, so a request open at the base gets SP-3 on
// the branch.
const BASE_SPEC = doc([
  ['SP-1 plan builds-on:INV-12', 'The exporter reads the invoice data.'],
  ['SP-2 note builds-on:INV-99', 'See the old rule.'],
  ['SP-4 step for:T9', 'Build the CSV writer.'],
]);

// Makes inv with a change spec and the task T1, indexed and committed.
function makeRequest(dir, spec = CHANGE_SPEC) {
  newRequest(dir, NAME, 'The owner wants a monthly export.\n', ['--tier', '1d']);
  write(dir, CS, spec);
  editRecord(dir, NAME, (rec) => { rec.tasks = [{ id: 'T1', ref: 'tasks.md T1', delivers: [] }]; });
  index(dir);
  commitAll(dir, `The request inv\n\n${TIER}`);
}

// The world: config and specs/invoices.md on main. `at` says where inv is
// made: 'base', on main before the branch feature, which then adds SP-3;
// 'branch', on feature; 'none', on main, which is then renamed trunk, so
// there is no base. Then INV-12 changes in the working tree.
function world(t, { at = 'base' } = {}) {
  const dir = project(t);
  writeConfig(dir);
  write(dir, 'specs/invoices.md', INVOICES);
  if (at === 'branch') {
    commitAll(dir, 'base');
    git(dir, 'checkout', '-q', '-b', 'feature');
    makeRequest(dir);
  } else if (at === 'none') {
    makeRequest(dir);
    git(dir, 'branch', '-m', 'main', 'trunk');
  } else {
    makeRequest(dir, BASE_SPEC);
    git(dir, 'checkout', '-q', '-b', 'feature');
    write(dir, CS, CHANGE_SPEC);
    index(dir);
    commitAll(dir, `SP-3 of inv\n\n${TIER}`);
  }
  editFile(dir, 'specs/invoices.md', ...INV12);
  return dir;
}

// al conclude inv --yes, then al index; with `commit`, also a commit.
function concludeHere(dir, { commit = false } = {}) {
  const r = ok(dir, ['conclude', NAME, '--yes']);
  assert.ok(r.stdout.startsWith(`Concluded ${NAME}: `), show(r));
  index(dir);
  if (commit) commitAll(dir, `Conclude inv\n\n${TIER}`);
}

// The one hint of `code` on `id`, in the open change spec.
function before(r, code, id) {
  const f = one(coded(r, code, id), r, `${code} on ${id} before the move`);
  assert.equal(f.file, CS, show(r));
  return f;
}

// The hint after the move is the line before it, with the new paths.
function sameAtNewPath(r, f, code, id) {
  const g = one(coded(r, code, id), r, `${code} on ${id} after the move`);
  assert.equal(g.line, f.line.replaceAll(OPEN_DIR, ARCHIVE_DIR), `the line before the move, at the new paths:\n${f.line}\n${show(r)}`);
}

const auditOf = (dir) => {
  const r = ok(dir, ['context', NAME, '--audit']);
  const ls = r.stdout.split('\n');
  return { r, bindings: ls.filter((l) => l.startsWith('Binding ')), judgement: (n) => ls.find((l) => l.startsWith(`Judgement J${n} `)) };
};
function judgementIs(a, n, code, on, state) {
  const line = a.judgement(n) ?? '';
  assert.ok(line.startsWith(`Judgement J${n} ${code} ${on} recorded `), `a Judgement line for J${n}:\n${show(a.r)}`);
  assert.ok(line.includes(` (${REC}:`), show(a.r));
  assert.ok(line.endsWith(`): ${state}; reason: ${WHY}`), `J${n} is "${state}":\n${show(a.r)}`);
}

const MOMENTS = [['uncommitted', false], ['committed', true]];

// =====================================================================

describe('A request that the branch concludes gives the same hints after the move, at the new paths', () => {
  for (const [code, id] of HINTS) {
    for (const [moment, commit] of MOMENTS) {
      test(`${code} on ${id}: before the move in ${CS}; after al conclude --yes (${moment}) and al index, the same line at ${ARCHIVED}`, (t) => {
        const dir = world(t);
        const f = before(check(dir), code, id);
        concludeHere(dir, { commit });
        const after = check(dir);
        assert.equal(after.code, 0, show(after));
        sameAtNewPath(after, f, code, id);
      });
    }
  }

  test('a request made and concluded on the branch: each of the four hints, the same line at the new paths', (t) => {
    const dir = world(t, { at: 'branch' });
    const r = check(dir);
    const found = HINTS.map(([code, id]) => before(r, code, id));
    concludeHere(dir);
    const after = check(dir);
    HINTS.forEach(([code, id], i) => sameAtNewPath(after, found[i], code, id));
  });
});

describe('A judgement recorded before the move still clears the hint after the move, and al context --audit shows it as current', () => {
  HINTS.forEach(([code, id], i) => {
    test(`${code} on ${id}: judged before the move; after al conclude --yes and al index: no ${code} on ${id}, and the judgement is current`, (t) => {
      const dir = world(t);
      before(check(dir), code, id);
      judge(dir, code, id, WHY);
      const judged = check(dir);
      none(coded(judged, code, id), judged, `${code} on ${id} after the judgement`);
      const open = auditOf(dir);
      judgementIs(open, 1, code, id, 'current');

      concludeHere(dir);
      const after = check(dir);
      none(coded(after, code, id), after, `${code} on ${id} after the move`);
      const a = auditOf(dir);
      judgementIs(a, 1, code, id, 'current');
      if (code === 'stale-base') {
        assert.equal(a.bindings.length, 1, show(a.r));
        assert.match(a.bindings[0], /^Binding {3}inv\/SP-1 builds-on INV-12 target [0-9a-f]{12} holder [0-9a-f]{12} judgement J1: bound$/, show(a.r));
      }
      // The other three hints show: only the judged one is cleared.
      for (const [c, x] of HINTS.filter((_, j) => j !== i)) one(coded(after, c, x), after, `${c} on ${x} after the move`);
    });
  });
});

// =====================================================================
// Controls

describe('Control: a request archived at the base gives none of these hints', () => {
  // main, then the branch earlier: inv made, then concluded and committed;
  // earlier merged into main. Then the branch feature, which changes INV-12
  // (the target of SP-1) and INV-41 (the paragraph that SP-3 is close to).
  function archivedAtBase(t) {
    const dir = project(t);
    writeConfig(dir);
    write(dir, 'specs/invoices.md', INVOICES);
    commitAll(dir, 'base');
    git(dir, 'checkout', '-q', '-b', 'earlier');
    makeRequest(dir);
    const open = check(dir);
    for (const [code, id] of HINTS.filter(([c]) => c !== 'stale-base')) before(open, code, id);
    concludeHere(dir, { commit: true });
    git(dir, 'checkout', '-q', 'main');
    git(dir, 'merge', '-q', '--no-ff', '-m', 'Merge the branch earlier', 'earlier');
    git(dir, 'checkout', '-q', '-b', 'feature');
    editFile(dir, 'specs/invoices.md', ...INV12);
    editFile(dir, 'specs/invoices.md', ...INV41);
    index(dir);
    return dir;
  }

  test('the branch changes INV-12 and INV-41: no stale-base, unresolved-link, near-match or unknown-task on inv, uncommitted and committed', (t) => {
    const dir = archivedAtBase(t);
    for (const when of ['uncommitted', 'committed']) {
      if (when === 'committed') commitAll(dir, 'INV-12 and INV-41\n\nTier: 1 — amends INV-12 and INV-41');
      const r = check(dir);
      const onInv = r.findings.filter((f) => CODES.includes(f.code) && (f.id.startsWith(`${NAME}/`) || f.file.startsWith(ARCHIVE_DIR)));
      assert.deepEqual(onInv.map((f) => f.line), [], `no such hint on inv (${when}):\n${show(r)}`);
    }
  });
});

describe('Control: with no base, al is as today', () => {
  test('only the branch trunk: after al conclude --yes and al index, none of the four hints on inv', (t) => {
    const dir = world(t, { at: 'none' });
    concludeHere(dir);
    const r = check(dir);
    assert.match(r.stdout, /^Read {6}working tree · no base$/m, show(r));
    const onInv = r.findings.filter((f) => CODES.includes(f.code) && f.id.startsWith(`${NAME}/`));
    assert.deepEqual(onInv.map((f) => f.line), [], show(r));
  });
});
