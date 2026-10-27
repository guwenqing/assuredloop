// #110, part 3: the review note of a request that the branch concludes stays
// after `al conclude <name> --yes` moves it to requests/archive/<name>/, for
// a judgement of a paragraph of the proposed design that a saved work item
// names (LD-48). The review lines are the same as before the move, at the
// new paths, but for the judgement's state: its identity holds a hash of the
// whole change, and al conclude changes the change, so after the move the
// judgement is "stale: judged at <commit>" (LD-28; the architect's decision,
// until #113). A request archived at the base gives none. Written from the
// review and the architect's rule, through the al command only. Parts 1 and
// 2 are archive-hints-110.test.js and archive-hints-110b.test.js.
//
// The request is path 1d, so its map is "no open change of path 2 or 3",
// and it has no map consolidation line. Nothing here reads the code under
// test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  INVOICES, al, commitAll, doc, editRecord, git, newRequest, ok, project, show, write, writeConfig,
} from './helpers/project.js';

const NAME = 'inv';
const OPEN_DIR = `requests/${NAME}/`;
const ARCHIVE_DIR = `requests/archive/${NAME}/`;
const TIER = `Tier: 1d — ${NAME}`;
const UX1 = 'The panel lists the exports of the month.';
const CODE = "export const panel = 'exports';";
const NOTE = `# Review of ${NAME}\n\n- UX-1 complies: the panel lists the exports.\n  - Item: "${UX1}"\n  - Code (src/panel.js): "${CODE}"\n`;

// The items folder, a temp dir outside the repo, with the saved item
// ITEM-7 in JSON, whose field design names docs/panel.md.
function itemsFolder(t) {
  const items = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-110c-items-'));
  t.after(() => rmSync(items, { recursive: true, force: true }));
  write(items, 'item-7.json', `${JSON.stringify({ ref: 'ITEM-7', repository: 'ITEM', body: 'Build the export panel.', design: 'docs/panel.md' }, null, 2)}\n`);
  return items;
}

// The request inv (path 1d), with the task T1 naming ITEM-7; docs/panel.md
// with UX-1 component; src/panel.js; and review.md, which judges UX-1 with
// an Item quote and a Code quote. al index --issues, then a commit.
function makeRequest(dir, items) {
  newRequest(dir, NAME, 'The owner wants an export panel.\n', ['--tier', '1d']);
  write(dir, `${OPEN_DIR}spec.md`, doc([['SP-1 plan', 'Build the panel of docs/panel.md.']]));
  write(dir, 'docs/panel.md', doc([['UX-1 component', UX1]]));
  write(dir, 'src/panel.js', `${CODE}\n`);
  write(dir, `${OPEN_DIR}review.md`, NOTE);
  editRecord(dir, NAME, (rec) => { rec.tasks = [{ id: 'T1', ref: 'ITEM-7' }]; });
  ok(dir, ['index', '--issues', items]);
  commitAll(dir, `The request inv\n\n${TIER}`);
}

function base(t) {
  const dir = project(t);
  writeConfig(dir);
  write(dir, 'specs/invoices.md', INVOICES);
  commitAll(dir, 'base');
  return dir;
}

function concludeHere(dir, items, { commit = false } = {}) {
  const r = ok(dir, ['conclude', NAME, '--yes']);
  assert.match(r.stdout, new RegExp(`^Concluded ${NAME}: `, 'm'), show(r));
  ok(dir, ['index', '--issues', items]);
  if (commit) commitAll(dir, `Conclude inv\n\n${TIER}`);
}

const checkIssues = (dir, items) => {
  const r = al(dir, ['check', '--issues', items]);
  assert.equal(r.code, 0, show(r));
  return r;
};
// The review lines of inv, and the proposed line of UX-1.
const reviewPart = (r) => r.stdout.split('\n').filter((l) =>
  l.startsWith(`review note ${OPEN_DIR}`) || l.startsWith(`review note ${ARCHIVE_DIR}`) || l.startsWith('judgement UX-1 ') || l.startsWith('proposed UX-1 '));

describe('The review note of a request that the branch concludes stays as before the move, at the new paths', () => {
  for (const [moment, commit] of [['uncommitted', false], ['committed', true]]) {
    test(`a judgement of UX-1, the design paragraph that ITEM-7 names: after al conclude --yes (${moment}) and al index --issues, the same review lines at the new paths, with the same version and quotes found, and the state stale: judged at <commit>`, (t) => {
      const dir = base(t);
      const items = itemsFolder(t);
      git(dir, 'checkout', '-q', '-b', 'feature');
      makeRequest(dir, items);
      const before = reviewPart(checkIssues(dir, items));
      assert.ok(before.includes(`proposed UX-1 design paragraph · docs/panel.md:3 · component: ${UX1}`), before.join('\n'));
      const j = before.filter((l) => l.startsWith('judgement UX-1 '));
      assert.equal(j.length, 1, before.join('\n'));
      assert.ok(j[0].includes(' · item quote found; item proposed by this change · code quote found (src/panel.js) · current'), j[0]);
      assert.equal(before.filter((l) => l.startsWith(`review note ${OPEN_DIR}review.md: 1 judgements, 1 current, `)).length, 1, before.join('\n'));

      concludeHere(dir, items, { commit });
      const r = checkIssues(dir, items);
      const after = reviewPart(r);
      const msg = `the lines before the move, at the new paths, the judgement stale:\n${before.join('\n')}\n${show(r)}`;
      assert.equal(after.length, before.length, msg);
      before.map((l) => l.replaceAll(OPEN_DIR, ARCHIVE_DIR)).forEach((want, i) => {
        if (want.startsWith('review note ')) {
          assert.equal(after[i], want.replace(': 1 judgements, 1 current, 0 stale, ', ': 1 judgements, 0 current, 1 stale, '), msg);
        } else if (want.startsWith('judgement UX-1 ')) {
          assert.ok(want.endsWith(' · current'), want);
          const head = want.slice(0, -' · current'.length);
          assert.ok(after[i].startsWith(`${head} · stale: judged at `), msg);
          assert.match(after[i].slice(head.length), /^ · stale: judged at [0-9a-f]{7}$/, msg);
        } else {
          assert.equal(after[i], want, msg);
        }
      });
    });
  }
});

describe('Control: a request archived at the base gives no review lines', () => {
  test('inv concluded on the branch earlier, merged into main; the branch feature changes README.md: no review note of inv and no judgement UX-1 line, uncommitted and committed', (t) => {
    const dir = base(t);
    const items = itemsFolder(t);
    git(dir, 'checkout', '-q', '-b', 'earlier');
    makeRequest(dir, items);
    const open = reviewPart(checkIssues(dir, items));
    assert.equal(open.filter((l) => l.startsWith('judgement UX-1 ')).length, 1, open.join('\n'));
    concludeHere(dir, items, { commit: true });
    git(dir, 'checkout', '-q', 'main');
    git(dir, 'merge', '-q', '--no-ff', '-m', 'Merge the branch earlier', 'earlier');
    git(dir, 'checkout', '-q', '-b', 'feature');
    write(dir, 'README.md', 'notes\n');
    for (const when of ['uncommitted', 'committed']) {
      if (when === 'committed') commitAll(dir, 'Notes\n\nTier: 0 — notes only');
      const r = checkIssues(dir, items);
      const part = reviewPart(r).filter((l) => !l.startsWith('proposed UX-1 '));
      assert.deepEqual(part, [], `no review line of inv (${when}):\n${show(r)}`);
    }
  });
});
