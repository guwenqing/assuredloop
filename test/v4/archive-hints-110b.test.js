// #110, part 2: more findings of a request that the branch concludes stay
// after `al conclude <name> --yes` moves it to requests/archive/<name>/, at
// the new paths. A request archived at the base gives none. Written from the
// issue, the review and the architect's decisions, through the al command
// only. The first part is archive-hints-110.test.js.
//
// - stale-base on a declared output (`outputs:` of the record), and its
//   judgement;
// - phrase, from `phrases:` in the config;
// - issue-missing (and issue-changed), with `al check --issues <folder>`;
// - not ok superseded-cited, and the exit 1 of --strict;
// - the map of the closing PR: the map lines, map-consolidation, and no
//   map-unnamed for a paragraph that the concluded request names; and the
//   `proposed` lines of the concluded request.
//
// Each before line is taken from al before the move. Nothing here reads the
// code under test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { check } from './helpers/invoicer.js';
import {
  INVOICES, al, commitAll, doc, editFile, editRecord, git, index, newRequest, ok, project, recordPath, show, write,
  writeConfig,
} from './helpers/project.js';
import { coded, judge, none, one } from './helpers/judgement-88.js';
import * as M from './helpers/map-68.js';

const NAME = 'inv';
const OPEN_DIR = `requests/${NAME}/`;
const ARCHIVE_DIR = `requests/archive/${NAME}/`;
const CS = `${OPEN_DIR}spec.md`;
const TIER = `Tier: 1d — ${NAME}`;
const ITEMS = 'items';
const WHY = 'Checked against the new INV-12.';
const atNewPaths = (line, open = OPEN_DIR, archive = ARCHIVE_DIR) => line.replaceAll(open, archive);

const adr = (status, marker, heading, text) => `Status: ${status}\n\n${doc([[marker, heading], [`${marker.split(' ')[0]}-1 rationale`, text]])}`;

// main: the config with the phrase review-sentinel, specs/invoices.md, ADR-1
// (superseded by ADR-2) and ADR-2. An empty items folder for --issues.
function base(t) {
  const dir = project(t);
  writeConfig(dir, undefined, { phrases: ['review-sentinel'] });
  write(dir, 'specs/invoices.md', INVOICES);
  write(dir, 'specs/adr/0001-paper.md', adr('superseded by ADR-2', 'ADR-1 choice decides:INV-12', '# ADR-1: Paper invoices', 'Context: invoices were posted.'));
  write(dir, 'specs/adr/0002-pdf.md', adr('accepted', 'ADR-2 choice decides:INV-12 supersedes:ADR-1', '# ADR-2: PDF invoices', 'Context: postage cost too much.'));
  commitAll(dir, 'base');
  mkdirSync(join(dir, ITEMS));
  return dir;
}

// The request inv (path 1d), indexed and committed:
// - its record declares the output src/export.js implements INV-12, and the
//   task T1 with the ref ITEM-7, which is not in the items folder;
// - SP-2 holds the phrase review-sentinel;
// - SP-3 names ADR-1, which is superseded, and not ADR-2.
function makeRequest(dir) {
  newRequest(dir, NAME, 'The owner wants a monthly export.\n', ['--tier', '1d']);
  write(dir, CS, doc([
    ['SP-1 plan', 'The exporter reads the invoice data.'],
    ['SP-2 note', 'Check the review-sentinel before the merge.'],
    ['SP-3 note', 'The paper rule of ADR-1 is gone.'],
  ]));
  write(dir, 'src/export.js', 'export const x = 1;\n');
  editRecord(dir, NAME, (rec) => {
    rec.outputs = [{ file: 'src/export.js', implements: ['INV-12'] }];
    rec.tasks = [{ id: 'T1', ref: 'ITEM-7', delivers: [] }];
  });
  index(dir);
  commitAll(dir, `The request inv\n\n${TIER}`);
}

// The branch feature makes inv; then INV-12 changes in the working tree.
function world(t) {
  const dir = base(t);
  git(dir, 'checkout', '-q', '-b', 'feature');
  makeRequest(dir);
  editFile(dir, 'specs/invoices.md', 'An invoice has a number', 'An invoice has a unique number');
  return dir;
}

function concludeHere(dir, { commit = false, name = NAME, tier = TIER } = {}) {
  const r = ok(dir, ['conclude', name, '--yes']);
  assert.match(r.stdout, new RegExp(`^Concluded ${name}: `, 'm'), show(r));
  index(dir);
  if (commit) commitAll(dir, `Conclude ${name}\n\n${tier}`);
}

// The findings: each a [what, al check args, select(r) -> list].
const FINDINGS = [
  ['stale-base on the output src/export.js', [], (r) => coded(r, 'stale-base', 'src/export.js')],
  ['phrase in the change spec', [], (r) => coded(r, 'phrase').filter((f) => f.file.startsWith(OPEN_DIR) || f.file.startsWith(ARCHIVE_DIR))],
  ['issue-missing on inv/T1', ['--issues', ITEMS], (r) => coded(r, 'issue-missing', 'inv/T1')],
  ['issue-changed on inv/T1', ['--issues', ITEMS], (r) => coded(r, 'issue-changed', 'inv/T1')],
  ['not ok superseded-cited on inv/SP-3', ['--strict'], (r) => r.findings.filter((f) => f.code === 'superseded-cited' && f.id === 'inv/SP-3')],
];

const MOMENTS = [['uncommitted', false], ['committed', true]];

// =====================================================================

describe('A request that the branch concludes keeps these findings after the move, at the new paths', () => {
  for (const [what, args, select] of FINDINGS) {
    for (const [moment, commit] of MOMENTS) {
      test(`${what}: the same line after al conclude --yes (${moment}) and al index${args.length ? `, with al check ${args.join(' ')}` : ''}`, (t) => {
        const dir = world(t);
        const r0 = check(dir, ...args);
        const found = select(r0);
        assert.equal(found.length, 1, `one ${what} before the move:\n${show(r0)}`);
        concludeHere(dir, { commit });
        const r = check(dir, ...args);
        assert.deepEqual(select(r).map((f) => f.line), [atNewPaths(found[0].line)], `the line before the move, at the new paths:\n${found[0].line}\n${show(r)}`);
        assert.equal(r.code, r0.code, `the exit code as before the move:\n${show(r)}`);
      });
    }
  }

  test('not ok superseded-cited: al check --strict exits 1 before the move and after it', (t) => {
    const dir = world(t);
    const r0 = check(dir, '--strict');
    assert.equal(r0.code, 1, show(r0));
    concludeHere(dir);
    const r = check(dir, '--strict');
    assert.equal(r.code, 1, show(r));
  });

  test('stale-base on the output src/export.js, judged before the move: no stale-base on it after the move, and al context --audit shows J1 as current', (t) => {
    const dir = world(t);
    one(coded(check(dir), 'stale-base', 'src/export.js'), check(dir), 'stale-base on src/export.js');
    judge(dir, 'stale-base', 'src/export.js', WHY);
    none(coded(check(dir), 'stale-base', 'src/export.js'), check(dir), 'stale-base on src/export.js after the judgement');
    const j1 = (a) => a.stdout.split('\n').find((l) => l.startsWith('Judgement J1 ')) ?? '';
    const state = (a, s) => {
      const line = j1(a);
      assert.ok(line.startsWith('Judgement J1 stale-base src/export.js recorded '), show(a));
      assert.ok(line.includes(` (${recordPath(NAME)}:`), show(a));
      assert.ok(line.endsWith(`): ${s}; reason: ${WHY}`), `J1 is "${s}":\n${show(a)}`);
    };
    state(ok(dir, ['context', NAME, '--audit']), 'current');
    concludeHere(dir);
    const r = check(dir);
    none(coded(r, 'stale-base', 'src/export.js'), r, 'stale-base on src/export.js after the move');
    state(ok(dir, ['context', NAME, '--audit']), 'current');
  });
});

describe('Control: a request archived at the base gives none of these findings', () => {
  // main, then the branch earlier: inv made, concluded and committed; earlier
  // merged into main. Then the branch feature changes INV-12, the target of
  // the output.
  function archivedAtBase(t) {
    const dir = base(t);
    git(dir, 'checkout', '-q', '-b', 'earlier');
    makeRequest(dir);
    concludeHere(dir, { commit: true });
    git(dir, 'checkout', '-q', 'main');
    git(dir, 'merge', '-q', '--no-ff', '-m', 'Merge the branch earlier', 'earlier');
    git(dir, 'checkout', '-q', '-b', 'feature');
    editFile(dir, 'specs/invoices.md', 'An invoice has a number', 'An invoice has a unique number');
    index(dir);
    return dir;
  }

  test('the branch changes INV-12: none of the findings, uncommitted and committed; al check --strict exits 0', (t) => {
    const dir = archivedAtBase(t);
    for (const when of ['uncommitted', 'committed']) {
      if (when === 'committed') commitAll(dir, 'INV-12\n\nTier: 1 — amends INV-12');
      for (const [what, args, select] of FINDINGS) {
        const r = check(dir, ...args);
        assert.deepEqual(select(r).map((f) => f.line), [], `no ${what} (${when}):\n${show(r)}`);
      }
      const s = check(dir, '--strict');
      assert.equal(s.code, 0, `--strict exits 0 (${when}):\n${show(s)}`);
    }
  });
});

// =====================================================================
// The map of the closing PR (path 2): the request share, made on the branch
// feature, with SP-1 rule changes:INV-41 and SP-9 plan; the branch changes
// INV-41 to SP-1's text (with serves:share/R1) and records the disposition.

const SHARE = M.NAME;
const S_OPEN = `requests/${SHARE}/`;
const S_ARCHIVE = `requests/archive/${SHARE}/`;
const N41 = 'The export link MUST expire 24 hours after it is created.';
const FIRST = 'SP-1 complies: the link rule is INV-41.';

// With `judged`, the review note holds a consolidation judgement of SP-1.
// With `other`, a second own request other (path 2) with a plan is open.
function mapWorld(t, { judged = false, other = false } = {}) {
  const dir = M.world(t, [['SP-1 rule serves:R1 changes:INV-41', N41], ['SP-9 plan', 'One PR: the link, then the email.']]);
  M.editSpec(dir, 'INV-41', 'rule', M.T41, N41);
  editRecord(dir, SHARE, (rec) => { rec.dispositions = [{ source: `${SHARE}/SP-1`, disposition: 'incorporated', spec: 'INV-41' }]; });
  if (judged) M.note(dir, M.judged(FIRST, 'Item: "MUST expire 24 hours"', `Spec (INV-41): "${N41}"`));
  if (other) M.openRequest(dir, 'other', [['SP-1 plan', 'Another plan.']]);
  index(dir);
  commitAll(dir, `${SHARE}: INV-41\n\nTier: 2 — ${SHARE}; closes the request`);
  return dir;
}

const runCheck = (dir) => {
  const r = al(dir, ['check']);
  assert.equal(r.code, 0, show(r));
  return r;
};
// The map lines, the map hints, and the proposed lines of share.
const mapPart = (r) => r.stdout.split('\n').filter((l) => /^(hint map-|map[: ])/.test(l) || l.startsWith(`proposed ${SHARE}/`));
const concludeShare = (dir, commit) => concludeHere(dir, { commit, name: SHARE, tier: `Tier: 2 — ${SHARE}` });

describe('The map of a PR that concludes its request stays as before the move, at the new paths', () => {
  for (const [moment, commit] of MOMENTS) {
    test(`no consolidation judgement: the map lines, hint map-consolidation and the proposed lines of share are the same after al conclude --yes (${moment}) and al index`, (t) => {
      const dir = mapWorld(t);
      const before = mapPart(runCheck(dir));
      assert.equal(before.filter((l) => l.startsWith(`hint map-consolidation ${S_OPEN}spec.md ${SHARE} `)).length, 1, before.join('\n'));
      assert.ok(before.includes(M.headerLine(dir, SHARE)), before.join('\n'));
      concludeShare(dir, commit);
      const r = runCheck(dir);
      assert.deepEqual(mapPart(r), before.map((l) => atNewPaths(l, S_OPEN, S_ARCHIVE)), show(r));
    });
  }

  test('a current consolidation judgement in review.md: no map hint before or after the move; the map lines are the same, at the new paths', (t) => {
    const dir = mapWorld(t, { judged: true });
    const before = mapPart(runCheck(dir));
    assert.deepEqual(before.filter((l) => l.startsWith('hint map-')), [], before.join('\n'));
    assert.ok(before.some((l) => l.startsWith(`map consolidation ${SHARE}/SP-1 · `) && l.includes(' · current: its named paragraphs are unchanged ')), before.join('\n'));
    concludeShare(dir, false);
    const r = runCheck(dir);
    assert.deepEqual(mapPart(r), before.map((l) => atNewPaths(l, S_OPEN, S_ARCHIVE)), show(r));
  });

  test('with a second own request open: INV-41, which share/SP-1 changes, gets no map-unnamed before or after the move; the map header and the map spec line of INV-41 stay', (t) => {
    const dir = mapWorld(t, { other: true });
    const r0 = runCheck(dir);
    const ls0 = r0.stdout.split('\n');
    assert.deepEqual(M.hintLines(r0, 'map-unnamed'), [], show(r0));
    const head = M.headerLine(dir, 'other', SHARE);
    assert.ok(ls0.includes(head), show(r0));
    const spec41 = ls0.filter((l) => l.startsWith('map spec INV-41 · '));
    assert.deepEqual(spec41, ['map spec INV-41 · specs/invoices.md:15 · changed; named by share/SP-1 changes'], show(r0));
    concludeShare(dir, false);
    const r = runCheck(dir);
    const ls = r.stdout.split('\n');
    assert.deepEqual(M.hintLines(r, 'map-unnamed'), [], show(r));
    assert.ok(ls.includes(head), show(r));
    assert.deepEqual(ls.filter((l) => l.startsWith('map spec INV-41 · ')), spec41, show(r));
  });

  test('control: share concluded and merged into main before the branch: share is not own; no map hint, no map line naming share as own, no proposed line of share', (t) => {
    const dir = mapWorld(t);
    concludeShare(dir, true);
    git(dir, 'checkout', '-q', 'main');
    git(dir, 'merge', '-q', '--no-ff', '-m', 'Merge the branch feature', 'feature');
    git(dir, 'checkout', '-q', '-b', 'next');
    write(dir, 'README.md', 'notes\n');
    for (const when of ['uncommitted', 'committed']) {
      if (when === 'committed') commitAll(dir, 'Notes\n\nTier: 0 — notes only');
      const r = runCheck(dir);
      const part = mapPart(r);
      assert.deepEqual(part.filter((l) => l.startsWith('hint map-') || l.startsWith('proposed ')), [], `${when}:\n${show(r)}`);
      assert.ok(r.stdout.split('\n').includes('map: no open change of path 2 or 3 is this change\'s own'), `${when}:\n${show(r)}`);
    }
  });
});
