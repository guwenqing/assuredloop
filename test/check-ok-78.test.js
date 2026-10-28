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
// - a check that a Not known line or a finding says did not run on all that
//   it covers: unresolved-central with no central clone; issue-not-sub with
//   no assuredloop-requests.json, or an item with no parent field;
//   issue-bare-ref when the own repository is not known; unsigned-requirement
//   and record-evidence when an original file is kept outside and not
//   checked here, or when a record has no request.md; used-again in a
//   shallow clone.
//
// Written from the requirement and the public interface only. Nothing here
// reads src/. No model and no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cloneOf, isShallow, mergeRef, tempRoot } from './helpers/check-78.js';
import { world as crossWorld } from './helpers/cross-repo.js';
import {
  al, appendSection, baseProject, commitAll, editRecord, git, index, INVOICES, newRequest, organized, project, read, req, show,
  WORDS_FILE, write, writeConfig,
} from './helpers/project.js';
import { world } from './helpers/map-68.js';

const lines = (r) => r.stdout.split('\n');
const OK = /^ok: nothing found by ([a-z0-9-]+(?:, [a-z0-9-]+)*)$/;

function check(dir, ...args) {
  return checkIn(dir, {}, ...args);
}
// al check with more environment (a worker's config folder).
function checkIn(dir, env, ...args) {
  const r = al(dir, ['check', ...args], { env });
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

// =====================================================================
// LD-41: a check that a Not known line or a finding says did not run on all
// that it covers is not in the ok line.

const notKnownOf = (r) => {
  const found = lines(r).filter((l) => l.startsWith('Not known'));
  assert.equal(found.length, 1, `one Not known line:\n${show(r)}`);
  return found[0];
};
const says = (r, text) => assert.ok(notKnownOf(r).includes(text), `the Not known line says "${text}":\n${show(r)}`);

// 11. An output repo whose changed source file cites a central ID.
function citingBranch(t) {
  const w = crossWorld(t);
  git(w.web, 'checkout', '-q', '-b', 'feature');
  write(w.web, 'src/link.js', '// The link follows central:EXP-4.\nexport const hours = 24;\n');
  commitAll(w.web, 'a source change');
  return w;
}

test('#78 an output repo citing central:EXP-4, the central clone absent: the ok line does not name unresolved-central, and Not known says no central ID was looked up', (t) => {
  const w = citingBranch(t);
  renameSync(w.central, join(w.root, 'moved-away'));
  const r = check(w.web);
  says(r, 'no central ID was looked up');
  namesNone(r, ['unresolved-central']);
});

test('#78 control: an output repo citing central:EXP-4, the central clone present and the ID resolves: the ok line names unresolved-central', (t) => {
  const r = check(citingBranch(t).web);
  assert.ok(lines(r).some((l) => l.startsWith('info cites src/link.js:1 central:EXP-4 ')), `the ID resolves:\n${show(r)}`);
  namesAll(r, ['unresolved-central']);
});

// 12 to 14. Work items in a folder (--issues): <root>/invoicer, with the
// open request inv whose task T1 names an item, and <root>/items.
const OWN_ITEM = 'https://github.com/acme/invoicer/issues/7';
const OWN_PARENT = { number: 7, repository: { nameWithOwner: 'acme/invoicer' }, url: OWN_ITEM };

function itemsWorld(t, { remote = 'git@github.com:acme/invoicer.git', ref = '#31', ownItems = true } = {}) {
  const root = tempRoot(t, 'al-v4-78-ok-');
  const dir = join(root, 'invoicer');
  const items = join(root, 'items');
  mkdirSync(dir);
  mkdirSync(items);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'Fixture Author');
  git(dir, 'config', 'user.email', 'author@example.invalid');
  git(dir, 'config', 'commit.gpgsign', 'false');
  if (remote) git(dir, 'remote', 'add', 'origin', remote);
  writeConfig(dir);
  write(dir, 'specs/invoices.md', INVOICES);
  newRequest(dir, 'inv');
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  editRecord(dir, 'inv', (rec) => { rec.tasks = [{ id: 'T1', ref }]; });
  commitAll(dir, 'inv: a task\n\nTier: 1 — inv');
  if (ownItems) {
    write(items, 'assuredloop-requests.json', `${JSON.stringify({ format: 'assuredloop-items/1', requests: { inv: OWN_ITEM } }, null, 2)}\n`);
  }
  return { dir, items };
}

// An item file in gh's shape; parent 'absent' leaves the parent field out.
function saveItem(w, repo, n, { parent = OWN_PARENT, body = 'Nothing to hint.\n' } = {}) {
  const item = { body, comments: [], number: n, url: `https://github.com/${repo}/issues/${n}` };
  if (parent !== 'absent') item.parent = parent;
  write(w.items, `${n}.json`, `${JSON.stringify(item, null, 2)}\n`);
}

const ISSUES = ['--issues', '../items'];

test('#78 --issues with no assuredloop-requests.json: the ok line does not name issue-not-sub, and Not known says why', (t) => {
  const w = itemsWorld(t, { ownItems: false });
  saveItem(w, 'acme/invoicer', 31);
  const r = check(w.dir, ...ISSUES);
  says(r, 'whether the items of inv are children of its own item');
  namesNone(r, ['issue-not-sub']);
});

test('#78 control: assuredloop-requests.json names the own item, and the named item is its child: the ok line names issue-not-sub', (t) => {
  const w = itemsWorld(t);
  saveItem(w, 'acme/invoicer', 31);
  const r = check(w.dir, ...ISSUES);
  namesAll(r, ['issue-not-sub']);
});

test('#78 --issues, the named item has no parent field: the ok line does not name issue-not-sub, and Not known says why', (t) => {
  const w = itemsWorld(t);
  saveItem(w, 'acme/invoicer', 31, { parent: 'absent' });
  const r = check(w.dir, ...ISSUES);
  says(r, 'the item has no parent field');
  namesNone(r, ['issue-not-sub']);
});

test('#78 --issues, the request\'s own repository is not known (no remote): the ok line does not name issue-bare-ref, and Not known says why; control: with the remote, it does', (t) => {
  const control = itemsWorld(t, { ref: 'acme/web#5' });
  saveItem(control, 'acme/web', 5);
  namesAll(check(control.dir, ...ISSUES), ['issue-bare-ref']);
  const w = itemsWorld(t, { ref: 'acme/web#5', remote: null });
  saveItem(w, 'acme/web', 5);
  const r = check(w.dir, ...ISSUES);
  says(r, 'issue-bare-ref check');
  namesNone(r, ['issue-bare-ref']);
});

// 15. The original files are kept outside the repo (#66), and this machine
// has no place for them. A worker is a config folder (XDG_CONFIG_HOME, HOME).
test('#78 a sign-off whose original file is kept outside and not checked here: the ok line names neither unsigned-requirement nor record-evidence, and Not known says why; control: with the place set, it names both', (t) => {
  const root = tempRoot(t, 'al-v4-78-ok-');
  const place = join(root, 'place');
  mkdirSync(place);
  const worker = (name, places) => {
    const xdg = join(root, name);
    mkdirSync(join(xdg, 'assuredloop'), { recursive: true });
    if (places) writeFileSync(join(xdg, 'assuredloop', 'places.yaml'), places);
    return { XDG_CONFIG_HOME: xdg, HOME: xdg };
  };
  const withPlace = worker('with-place', `assuredloop: ${JSON.stringify(place)}\n`);
  const noPlace = worker('no-place');
  const dir = project(t);
  writeConfig(dir, [{ file: 'specs/invoices.md', prefix: 'INV' }], { originals: { outside: 'assuredloop' } });
  write(dir, 'specs/invoices.md', INVOICES);
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  const run = (args, input = '') => {
    const r = al(dir, args, { env: withPlace, input });
    assert.equal(r.code, 0, show(r));
  };
  run(['new', 'inv', '--from', '-'], 'I want to download my invoices as CSV.\n');
  appendSection(dir, 'inv', organized([req('R1', 'Monthly CSV', 'A user MUST be able to download one month as one CSV file.', [WORDS_FILE])]));
  run(['record', 'inv', 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  commitAll(dir, 'inv: the request\n\nTier: 2 — inv');
  namesAll(checkIn(dir, withPlace), ['unsigned-requirement', 'record-evidence']);
  const r = checkIn(dir, noPlace);
  says(r, 'whether inv/R1 is signed: the original file of its sign-off is not checked');
  namesNone(r, ['unsigned-requirement', 'record-evidence']);
});

// 16. A request record with no request.md.
test('#78 a request record with no request.md: not ok record-unreadable, and the ok line names neither record-evidence nor unsigned-requirement', (t) => {
  const dir = baseProject(t);
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', organized([req('R1', 'Monthly CSV', 'A user MUST be able to download one month as one CSV file.')]));
  index(dir);
  rmSync(join(dir, 'requests/inv/request.md'));
  commitAll(dir, 'inv: the record\n\nTier: 1 — inv');
  const r = check(dir);
  assert.ok(lines(r).some((l) => l.startsWith('not ok record-unreadable ') && l.includes('has no request.md')), `not ok record-unreadable, no request.md:\n${show(r)}`);
  namesNone(r, ['record-evidence', 'unsigned-requirement']);
});

// 17. A shallow clone of a merge commit: the base is known, and the branch's
// earlier commits are cut off.
test('#78 a shallow clone with its base known: the ok line does not name used-again, and Not known says IDs used before the shallow history begins; control: the full repo names it', (t) => {
  const dir = baseProject(t);
  write(dir, 'src/share.js', 'export const hours = 1;\n');
  commitAll(dir, 'one\n\nTier: 0 — restores INV-41');
  write(dir, 'src/share.js', 'export const hours = 24;\n');
  commitAll(dir, 'two');
  namesAll(check(dir), ['used-again']);
  const { mainTip } = mergeRef(dir);
  const c = cloneOf(t, dir, { branch: 'pr-merge', depth: 2, main: mainTip });
  assert.ok(isShallow(c), 'the fixture: a shallow clone');
  assert.equal(git(c, 'merge-base', 'main', 'HEAD'), mainTip, 'the fixture: the base is main\'s tip');
  const r = check(c);
  says(r, 'IDs used before the shallow history begins');
  namesNone(r, ['used-again']);
});
