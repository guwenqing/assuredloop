// #78: the line `ok: nothing found by <code>, <code>, ...` names only the
// checks that ran and found nothing (requests/light-design/spec.md LD-41).
// A check that did not run is not named:
// - with no base: lost-id, used-again, path-claim, no-claim,
//   signoff-coverage, promise-kind, typo-mark, near-match, adoption and
//   adr-changed;
// - with a base and no commit on the branch: path-claim and no-claim;
// - with commits and no Tier line: path-claim;
// - with no own request of path 2 or 3: map-unnamed and map-consolidation;
// - with no change selected: design-doc and scope-no-file;
// - in an output repo (a repo whose config names a central repo), where the
//   list does not match file scopes and does not read the change's own
//   request: scope-no-file, and design-doc without --issues; with a central
//   repo that cannot be read, neither of the two.
//
// Written from the requirement and the public interface only. Nothing here
// reads src/. No model and no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { world as crossWorld } from './helpers/cross-repo.js';
import { al, commitAll, git, INVOICES, project, read, show, write, writeConfig } from './helpers/project.js';
import { world } from './helpers/map-68.js';

const lines = (r) => r.stdout.split('\n');
const OK = /^ok: nothing found by ([a-z0-9-]+(?:, [a-z0-9-]+)*)$/;

function check(dir, ...args) {
  const r = al(dir, ['check', ...args]);
  assert.equal(r.code, 0, show(r));
  return r;
}

// The codes of the one ok line.
function okCodes(r) {
  const found = lines(r).filter((l) => l.startsWith('ok: '));
  assert.equal(found.length, 1, `one "ok: " line:\n${show(r)}`);
  const m = OK.exec(found[0]);
  assert.ok(m, `the line "ok: nothing found by <code>, ...":\n${found[0]}`);
  return m[1].split(', ');
}

// The ok line names none of `codes`.
function names(r, codes, wanted) {
  const ok = okCodes(r);
  const wrong = codes.filter((c) => ok.includes(c) !== wanted);
  assert.deepEqual(wrong, [], `the ok line ${wanted ? 'names' : 'does not name'} these codes:\n${show(r)}`);
}
const namesNone = (r, codes) => names(r, codes, false);
const namesAll = (r, codes) => names(r, codes, true);

// 1. No base: a repo with no main branch.
test('#78 no base: the ok line names none of the checks that need a base, and Not known says lost and used-again IDs are not checked', (t) => {
  const dir = project(t, { branch: 'trunk' });
  writeConfig(dir);
  write(dir, 'specs/invoices.md', INVOICES);
  commitAll(dir, 'spec');
  write(dir, 'src/share.js', 'export const hours = 24;\n');
  commitAll(dir, 'a source change');
  const r = check(dir);
  namesNone(r, [
    'lost-id', 'used-again', 'path-claim', 'no-claim', 'signoff-coverage', 'promise-kind', 'typo-mark', 'near-match',
    'adoption', 'adr-changed',
  ]);
  const notKnown = lines(r).filter((l) => l.startsWith('Not known'));
  assert.equal(notKnown.length, 1, show(r));
  assert.match(notKnown[0], /lost/i, show(r));
  assert.match(notKnown[0], /used.again/i, show(r));
});

// 2. A base, and no commit on the branch.
test('#78 a base and no commit on the branch: the ok line names neither path-claim nor no-claim', (t) => {
  const r = check(world(t, null, { link: false }));
  namesNone(r, ['path-claim', 'no-claim']);
});

// 3. A base, a commit, and no Tier line.
test('#78 a commit with no Tier line: a hint no-claim line, and the ok line does not name path-claim', (t) => {
  const dir = world(t, null, { link: false });
  write(dir, 'src/share.js', 'export const hours = 24;\n');
  commitAll(dir, 'a source change');
  const r = check(dir);
  assert.ok(lines(r).some((l) => l.startsWith('hint no-claim ')), `a hint no-claim line:\n${show(r)}`);
  namesNone(r, ['path-claim']);
});

// 4. A change with no own request of path 2 or 3.
test('#78 no own request of path 2 or 3: the ok line names neither map-unnamed nor map-consolidation', (t) => {
  const dir = world(t, null, { link: false });
  write(dir, 'src/share.js', 'export const hours = 24;\n');
  commitAll(dir, 'a source change\n\nTier: 0 — restores INV-41');
  const r = check(dir);
  assert.ok(lines(r).includes("map: no open change of path 2 or 3 is this change's own"), show(r));
  namesNone(r, ['map-unnamed', 'map-consolidation']);
});

// 5. No change selected.
test('#78 no change selected: the ok line names neither design-doc nor scope-no-file', (t) => {
  const r = check(world(t, null, { link: false }));
  assert.ok(lines(r).some((l) => l.startsWith('list: no change selected: ')), show(r));
  namesNone(r, ['design-doc', 'scope-no-file']);
});

// 6. Control: a base, a Tier line, and an own request of path 2 with a map.
test('#78 control: a base, a Tier line and an own request of path 2: the ok line names lost-id, used-again and path-claim', (t) => {
  const dir = world(t, [['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.']]);
  const r = check(dir);
  assert.ok(lines(r).some((l) => /^map: the change against its base \S+ \(own changes: share\)/.test(l)), show(r));
  for (const code of ['lost-id', 'used-again', 'path-claim']) {
    assert.ok(!lines(r).some((l) => l.split(' ')[1] === code || l.split(' ')[2] === code), `no finding of ${code}:\n${show(r)}`);
  }
  namesAll(r, ['lost-id', 'used-again', 'path-claim']);
});

// =====================================================================
// An output repo: the list does not match file scopes, and does not read the
// change's own request. The world is the cross-repo world of
// helpers/cross-repo.js; invoicer-web names ../invoicer as its central repo.

// invoicer-web on the branch feature, with one source commit.
function outputBranch(t) {
  const w = crossWorld(t);
  git(w.web, 'checkout', '-q', '-b', 'feature');
  write(w.web, 'src/share.js', 'export const hours = 24;\n');
  commitAll(w.web, 'a source change');
  return w;
}

const SCOPES_LIMIT = 'file scopes name files of the central repo; they are not matched in an output repo';

// 7. The central repo can be read; no --issues.
test('#78 an output repo, the central repo readable: the ok line names neither scope-no-file nor design-doc', (t) => {
  const w = outputBranch(t);
  const r = check(w.web);
  assert.ok(lines(r).some((l) => l.startsWith('list limits: ') && l.includes(SCOPES_LIMIT)), `the list limits say "${SCOPES_LIMIT}":\n${show(r)}`);
  namesNone(r, ['scope-no-file', 'design-doc']);
});

// 8. The same, with --issues and an empty folder of items.
test('#78 an output repo with --issues <folder>: the ok line does not name scope-no-file', (t) => {
  const w = outputBranch(t);
  mkdirSync(join(w.root, 'items'));
  const r = check(w.web, '--issues', '../items');
  namesNone(r, ['scope-no-file']);
});

// 9. The central path points at no clone.
test('#78 an output repo whose central repo cannot be read: the ok line names neither scope-no-file nor design-doc', (t) => {
  const w = outputBranch(t);
  renameSync(w.central, join(w.root, 'moved-away'));
  const r = check(w.web);
  assert.ok(lines(r).some((l) => l.startsWith('list limits: ') && l.includes('the central repo cannot be read')), show(r));
  namesNone(r, ['scope-no-file', 'design-doc']);
});

// 10. Control: in the central repo itself, scope-no-file runs.
test('#78 control: the central repo, with an item whose files: scope matches no file, gets a hint scope-no-file line', (t) => {
  const w = crossWorld(t);
  const spec = 'specs/invoices.md';
  const text = read(w.central, spec);
  const marker = text.split('\n').find((l) => l.startsWith('<!-- INV-13 rule'));
  assert.ok(marker, `${spec} has the marker of INV-13`);
  write(w.central, spec, text.replaceAll(marker, marker.replace(/ -->$/, ' files:src/nothing/** -->')));
  git(w.central, 'checkout', '-q', '-b', 'feature');
  write(w.central, 'src/share.js', 'export const hours = 24;\n');
  commitAll(w.central, 'a file scope, and a source change');
  const r = check(w.central);
  assert.ok(lines(r).some((l) => l.startsWith('hint scope-no-file ') && l.includes('INV-13')), `a hint scope-no-file line for INV-13:\n${show(r)}`);
});
