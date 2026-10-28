// #113: al conclude keeps the identity of a review judgement (DES-154). A
// judgement that is current before `al conclude <name> --yes` stays current
// after it, when the branch has no other change: the move of the request's
// folder and the Outcome and Status lines are al's own work. Any other change
// of a file that the change holds still makes it "stale: judged at
// <commit>". The review note of an archived request is left out of the
// change, as an open one's is. Written from the issue and DES-154, through
// the al command only. Nothing here reads the code under test.
//
// The world (as in archive-hints-110c.test.js): a path 1d request inv, made
// on the branch feature. Its review.md judges two items:
// - UX-1, a paragraph of docs/panel.md, the design that the saved work item
//   ITEM-7 names (task T1), with a Code quote from src/panel.js;
// - INV-50, a design paragraph that the branch adds to specs/, with a Code
//   quote from src/export.js.
// Every run uses --issues <folder>, so that UX-1 is read.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  INVOICES, al, appendSection, commitAll, doc, editRecord, git, index, newRequest, ok, organized, project, read, req, show,
  write, writeConfig,
} from './helpers/project.js';

const NAME = 'inv';
const OPEN_DIR = `requests/${NAME}/`;
const ARCHIVE_DIR = `requests/archive/${NAME}/`;
const TIER = `Tier: 1d — ${NAME}`;
const UX1 = 'The panel lists the exports of the month.';
const INV50 = 'The exporter reads each invoice of the month.';
const PANEL = "export const panel = 'exports';";
const EXPORT = "export const month = 'each invoice';";
const SP1 = 'Build the panel of docs/panel.md.';
const NOTE = [
  `# Review of ${NAME}`,
  '',
  '- UX-1 complies: the panel lists the exports.',
  `  - Item: "${UX1}"`,
  `  - Code (src/panel.js): "${PANEL}"`,
  '- INV-50 complies: the exporter reads each invoice.',
  `  - Item: "${INV50}"`,
  `  - Code (src/export.js): "${EXPORT}"`,
  '',
].join('\n');
// A third judgement, added after the move.
const NEW_JUDGEMENT = `- SP-1 complies: the plan is one PR.\n  - Item: "${SP1}"\n  - Test: tests not examined\n`;
const STALE = / · stale: judged at [0-9a-f]{7}$/;

function world(t) {
  const items = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-113-items-'));
  t.after(() => rmSync(items, { recursive: true, force: true }));
  write(items, 'item-7.json', `${JSON.stringify({ ref: 'ITEM-7', repository: 'ITEM', body: 'Build the export panel.', design: 'docs/panel.md' }, null, 2)}\n`);
  const dir = project(t);
  writeConfig(dir);
  write(dir, 'specs/invoices.md', INVOICES);
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  newRequest(dir, NAME, 'The owner wants an export panel.\n', ['--tier', '1d']);
  write(dir, `${OPEN_DIR}spec.md`, doc([['SP-1 plan', SP1]]));
  write(dir, 'docs/panel.md', doc([['UX-1 component', UX1]]));
  write(dir, 'src/panel.js', `${PANEL}\n`);
  write(dir, 'specs/invoices.md', `${INVOICES}\n${doc([['INV-50 component builds-on:INV-12', INV50]])}`);
  write(dir, 'src/export.js', `${EXPORT}\n`);
  write(dir, `${OPEN_DIR}review.md`, NOTE);
  editRecord(dir, NAME, (rec) => { rec.tasks = [{ id: 'T1', ref: 'ITEM-7' }]; });
  ok(dir, ['index', '--issues', items]);
  commitAll(dir, `The request inv\n\n${TIER}`);
  return { dir, items };
}

const indexIssues = (w) => ok(w.dir, ['index', '--issues', w.items]);
function concludeHere(w, { commit = false } = {}) {
  const r = ok(w.dir, ['conclude', NAME, '--yes']);
  assert.match(r.stdout, new RegExp(`^Concluded ${NAME}: `, 'm'), show(r));
  indexIssues(w);
  if (commit) commitAll(w.dir, `Conclude inv\n\n${TIER}`);
}
function checkIssues(w) {
  const r = al(w.dir, ['check', '--issues', w.items]);
  assert.equal(r.code, 0, show(r));
  return r;
}
// The review lines: the review note line and the judgement lines.
const reviewLines = (r) => r.stdout.split('\n').filter((l) => l.startsWith('review note ') || l.startsWith('judgement '));
const judgementOf = (r, id) => {
  const found = reviewLines(r).filter((l) => l.startsWith(`judgement ${id} `));
  assert.equal(found.length, 1, `one judgement line of ${id}:\n${show(r)}`);
  return found[0];
};
const noteLine = (r) => {
  const found = reviewLines(r).filter((l) => l.startsWith('review note '));
  assert.equal(found.length, 1, `one review note line:\n${show(r)}`);
  return found[0];
};
const atNewPaths = (ls) => ls.map((l) => l.replaceAll(OPEN_DIR, ARCHIVE_DIR));

// Both judgements current, before the conclude.
function currentBefore(w) {
  const r = checkIssues(w);
  assert.equal(noteLine(r), `review note ${OPEN_DIR}review.md: 2 judgements, 2 current, 0 stale, 0 not known when judged, 0 identity not kept, 0 not read`, show(r));
  for (const id of ['UX-1', 'INV-50']) assert.ok(judgementOf(r, id).endsWith(' · current'), show(r));
  return reviewLines(r);
}

// =====================================================================

describe('A judgement that is current before al conclude --yes is current after it', () => {
  for (const [moment, commit] of [['uncommitted', false], ['committed', true]]) {
    test(`UX-1 and INV-50: after al conclude --yes and al index (${moment}), the review lines are the lines before the move, at the new paths: 2 current, 0 stale`, (t) => {
      const w = world(t);
      const before = currentBefore(w);
      concludeHere(w, { commit });
      const r = checkIssues(w);
      assert.deepEqual(reviewLines(r), atNewPaths(before), `the lines before the move, at the new paths:\n${before.join('\n')}\n${show(r)}`);
    });
  }
});

describe('After the move, a change of a file that the change holds makes the judgements stale', () => {
  for (const [what, file, text] of [
    ['src/panel.js, which UX-1 quotes (the quote kept)', 'src/panel.js', `${PANEL}\nexport const more = 1;\n`],
    ['src/notes.js, which no judgement quotes', 'src/notes.js', 'export const notes = 1;\n'],
  ]) {
    test(`after al conclude --yes and a commit, the branch changes ${what}: UX-1 and INV-50 are "stale: judged at <commit>", also after a commit`, (t) => {
      const w = world(t);
      const before = currentBefore(w);
      concludeHere(w, { commit: true });
      const moved = checkIssues(w);
      assert.deepEqual(reviewLines(moved), atNewPaths(before), `current after the move:\n${show(moved)}`);
      write(w.dir, file, text);
      for (const when of ['uncommitted', 'committed']) {
        if (when === 'committed') commitAll(w.dir, `${file}\n\n${TIER}`);
        const r = checkIssues(w);
        for (const id of ['UX-1', 'INV-50']) assert.match(judgementOf(r, id), STALE, `${id} is stale (${when}):\n${show(r)}`);
        assert.ok(noteLine(r).includes(': 2 judgements, 0 current, 2 stale, '), show(r));
      }
    });
  }
});

describe('After the move, a new judgement in requests/archive/<name>/review.md', () => {
  test('a third judgement (SP-1) added after al conclude --yes and a commit, then al index: UX-1 and INV-50 stay current, and SP-1 gets its identity and is current', (t) => {
    const w = world(t);
    const before = currentBefore(w);
    concludeHere(w, { commit: true });
    write(w.dir, `${ARCHIVE_DIR}review.md`, `${read(w.dir, `${ARCHIVE_DIR}review.md`)}${NEW_JUDGEMENT}`);
    indexIssues(w);
    for (const when of ['uncommitted', 'committed']) {
      if (when === 'committed') commitAll(w.dir, `The review of SP-1\n\n${TIER}`);
      const r = checkIssues(w);
      const want = atNewPaths(before).filter((l) => l.startsWith('judgement '));
      for (const line of want) assert.ok(reviewLines(r).includes(line), `the line, as before the move (${when}):\n${line}\n${show(r)}`);
      const sp1 = judgementOf(r, 'SP-1');
      assert.ok(sp1.startsWith(`judgement SP-1 version `) && sp1.includes(` · ${ARCHIVE_DIR}review.md:`), show(r));
      assert.ok(!sp1.includes('identity not kept'), `SP-1 has its identity (${when}):\n${show(r)}`);
      assert.ok(sp1.endsWith(' · current'), `SP-1 is current (${when}):\n${show(r)}`);
      assert.equal(noteLine(r), `review note ${ARCHIVE_DIR}review.md: 3 judgements, 3 current, 0 stale, 0 not known when judged, 0 identity not kept, 0 not read`, show(r));
    }
  });
});

describe('Control: a judgement that is stale before al conclude --yes stays stale after it', () => {
  test('src/export.js changes after the judgements (and is committed): UX-1 and INV-50 are stale before the conclude, and stay stale after it, uncommitted and committed', (t) => {
    const w = world(t);
    currentBefore(w);
    write(w.dir, 'src/export.js', `${EXPORT}\nexport const year = 1;\n`);
    commitAll(w.dir, `src/export.js\n\n${TIER}`);
    const r0 = checkIssues(w);
    for (const id of ['UX-1', 'INV-50']) assert.match(judgementOf(r0, id), STALE, `${id} is stale before the conclude:\n${show(r0)}`);
    concludeHere(w);
    for (const when of ['uncommitted', 'committed']) {
      if (when === 'committed') commitAll(w.dir, `Conclude inv\n\n${TIER}`);
      const r = checkIssues(w);
      for (const id of ['UX-1', 'INV-50']) assert.match(judgementOf(r, id), STALE, `${id} stays stale (${when}):\n${show(r)}`);
      assert.ok(noteLine(r).includes(': 2 judgements, 0 current, 2 stale, '), show(r));
    }
  });
});

// =====================================================================
// The item state of a judgement on the request's own items: a path 2
// request inv2, with R1 signed, SP-1 component serves:R1, and INV-50 in
// specs/ that serves inv2/R1 (so al conclude has a declared link for R1).
// review.md judges SP-1 and R1. Before the move, both read "item proposed by
// this change"; after al conclude --yes, the same.

const OWN = 'inv2';
const OWN_OPEN = `requests/${OWN}/`;
const OWN_ARCHIVE = `requests/archive/${OWN}/`;
const R1 = req('R1', 'Monthly export', 'A user MUST be able to download one month as one CSV file.');
const OWN_SP1 = 'The month writer builds one CSV file.';
const OWN_NOTE = [
  `# Review of ${OWN}`,
  '',
  '- SP-1 complies: one writer for each month.',
  `  - Item: "${OWN_SP1}"`,
  '  - Test: tests not examined',
  '- R1 complies: the export is one CSV file a month.',
  '  - Item: "download one month as one CSV file"',
  '  - Test: tests not examined',
  '',
].join('\n');
const PROPOSED = ' · item quote found; item proposed by this change · tests not examined · current';

// main: the config and specs/invoices.md; then the branch `branch` makes
// inv2, indexed and committed.
function ownWorld(t, branch = 'feature') {
  const dir = project(t);
  writeConfig(dir);
  write(dir, 'specs/invoices.md', INVOICES);
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', branch);
  newRequest(dir, OWN, 'The owner wants a monthly export.\n', ['--tier', '2']);
  appendSection(dir, OWN, organized([R1]));
  ok(dir, ['record', OWN, 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  write(dir, `${OWN_OPEN}spec.md`, doc([['SP-1 component serves:R1 builds-on:INV-12', OWN_SP1]]));
  write(dir, 'specs/invoices.md', `${INVOICES}\n${doc([[`INV-50 component serves:${OWN}/R1 builds-on:INV-12`, 'The exporter writes one CSV file for each month.']])}`);
  write(dir, `${OWN_OPEN}review.md`, OWN_NOTE);
  index(dir);
  commitAll(dir, `The request ${OWN}\n\nTier: 2 — ${OWN}`);
  return dir;
}
const plainCheck = (dir) => {
  const r = al(dir, ['check']);
  assert.equal(r.code, 0, show(r));
  return r;
};
const ownJudgements = (r) => r.stdout.split('\n').filter((l) => l.startsWith('judgement SP-1 ') || l.startsWith('judgement R1 '));
function concludeOwn(dir, commit) {
  const r = ok(dir, ['conclude', OWN, '--yes']);
  assert.match(r.stdout, new RegExp(`^Concluded ${OWN}: `, 'm'), show(r));
  index(dir);
  if (commit) commitAll(dir, `Conclude ${OWN}\n\nTier: 2 — ${OWN}`);
}

describe('A judgement of the concluded request\'s own change paragraph and signed requirement keeps "item proposed by this change" after the move', () => {
  for (const [moment, commit] of [['uncommitted', false], ['committed', true]]) {
    test(`SP-1 and R1 read "item proposed by this change" before the move and after al conclude --yes and al index (${moment}), at the new paths`, (t) => {
      const dir = ownWorld(t);
      const r0 = plainCheck(dir);
      const before = ownJudgements(r0);
      assert.equal(before.length, 2, show(r0));
      for (const l of before) assert.ok(l.endsWith(PROPOSED), `before the move:\n${l}\n${show(r0)}`);
      concludeOwn(dir, commit);
      const r = plainCheck(dir);
      assert.deepEqual(ownJudgements(r), before.map((l) => l.replaceAll(OWN_OPEN, OWN_ARCHIVE)), `the lines before the move, at the new paths:\n${before.join('\n')}\n${show(r)}`);
    });
  }

  test('control: inv2 concluded on the branch earlier and merged into main; the branch feature changes README.md: no judgement line of SP-1 or R1, and no review note line of inv2', (t) => {
    const dir = ownWorld(t, 'earlier');
    concludeOwn(dir, true);
    git(dir, 'checkout', '-q', 'main');
    git(dir, 'merge', '-q', '--no-ff', '-m', 'Merge the branch earlier', 'earlier');
    git(dir, 'checkout', '-q', '-b', 'feature');
    write(dir, 'README.md', 'notes\n');
    for (const when of ['uncommitted', 'committed']) {
      if (when === 'committed') commitAll(dir, 'Notes\n\nTier: 0 — notes only');
      const r = plainCheck(dir);
      assert.deepEqual(ownJudgements(r), [], `${when}:\n${show(r)}`);
      assert.deepEqual(r.stdout.split('\n').filter((l) => l.startsWith(`review note ${OWN_ARCHIVE}`) || l.startsWith(`review note ${OWN_OPEN}`)), [], `${when}:\n${show(r)}`);
    }
  });
});
