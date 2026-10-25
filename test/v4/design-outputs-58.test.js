// #58: design lines that name a document of an output repo, and the work
// items that give a design (requests/light-design LD-48, as the architect
// decided in round 2 of the interface note). Written from the requirement
// and the public interface only:
//
// - A design path `<repo>:<path>`, where <repo> is an output repo of the
//   config (`outputs:` with name, path, optional commit), names <path> in
//   that repo at its selected commit, read through git only (never its
//   working tree):
//     proposed <repo>:<path> design document · <source> · <state> · <form>
//     proposed <ID> design paragraph · <repo>:<path>:<line> · <kind>: <text>
// - Not there at that commit:
//     hint design-doc <where> <repo>:<path> the design line names <repo>:<path>, which is missing
// - The output repo cannot be read (no clone):
//     info output-repo <where> <repo>:<path> unknown: <reason>
// - <repo> is no output repo of the config:
//     hint design-doc <where> <repo>:<path> the design line names <repo>:<path>, which cannot be read: <repo> is not an output repo in the config
// - With --issues, only the items that a task of this change's own request
//   names give a design; an item that no such task names gives none, also
//   when another open request's task names it.
//
// No model and no network. Nothing here reads src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  baseProject, commitAll, doc, editRecord, git, newRequest, read, write, writeConfig, INVOICES, ADR3,
} from './helpers/project.js';
import { check, lineOf, notProposed, out, proposed, show } from './helpers/list-58.js';

const MD = 'requests/streaming/request.md';
const STREAM = 'docs/rfc/0018-streaming.md';
const NOTES = 'docs/rfc/0019-notes.md';
const DRAFT = 'docs/rfc/0020-draft.md';
const LATER = 'docs/rfc/0021-later.md';
const WEB = 'invoicer-web';

function initRepo(dir) {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'Fixture Author');
  git(dir, 'config', 'user.email', 'author@example.invalid');
  git(dir, 'config', 'commit.gpgsign', 'false');
}

// An open request whose request.md ends with a "## Design" section of these lines.
function designRequest(dir, lines, name = 'streaming') {
  newRequest(dir, name);
  const path = `requests/${name}/request.md`;
  write(dir, path, `${read(dir, path).replace(/\n*$/, '\n')}\n## Design\n\n${lines.join('\n')}\n`);
  return path;
}

// <root>/invoicer-web, an output repo: on main, W1 holds the streaming
// design (WEB-1 component, WEB-2 rule, WEB-3 rationale) and the notes (no
// markers); W2, after it, adds docs/rfc/0021-later.md; docs/rfc/0020-draft.md
// is only in its working tree. <root>/invoicer, the central repo: the spec
// and ADR-3 of baseProject, and the outputs invoicer-web (selected at W1)
// and invoicer-mobile (no clone), committed on main; then the branch
// feature, where the request streaming gets the design lines.
function outputWorld(t, lines) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-58-outputs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const web = join(root, WEB);
  initRepo(web);
  write(web, '.assuredloop/config.yaml', 'repo: invoicer-web\ncentral: {path: ../invoicer}\n');
  write(web, STREAM, doc([
    ['WEB-1 component', 'The stream writer sends one row at a time.'],
    ['WEB-2 rule', 'A stream MUST end with a total row.'],
    ['WEB-3 rationale', 'Large months do not fit in memory.'],
  ]));
  write(web, NOTES, '# Notes on streaming\n\nThe browser shows rows as they come.\n');
  commitAll(web, 'The streaming design');
  const w1 = git(web, 'rev-parse', 'HEAD');
  write(web, LATER, '# Later\n\nA later idea.\n');
  commitAll(web, 'A later idea');
  write(web, DRAFT, '# Draft\n\nNot committed.\n');

  const dir = join(root, 'invoicer');
  initRepo(dir);
  writeConfig(dir, [{ file: 'specs/invoices.md', prefix: 'INV' }], {
    repo: 'invoicer',
    outputs: [
      { name: WEB, path: `../${WEB}`, commit: w1 },
      { name: 'invoicer-mobile', url: 'https://example.invalid/invoicer-mobile.git', path: '../invoicer-mobile' },
    ],
  });
  write(dir, 'specs/invoices.md', INVOICES);
  write(dir, 'specs/adr/0003-signed-links.md', ADR3);
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  designRequest(dir, lines);
  commitAll(dir, 'streaming');
  return { root, dir, web, w1 };
}
const where = (dir, line) => `${MD}:${lineOf(dir, MD, line)}`;

// =====================================================================
// Design lines to an output repo

test('#58 LD-48: a design line to a document with markers in an output repo, read at its selected commit: the document and its promise and design paragraphs are proposed', (t) => {
  const line = `Design: ${WEB}:${STREAM}`;
  const { dir } = outputWorld(t, [line]);
  const r = check(dir);
  assert.equal(proposed(r, `${WEB}:${STREAM}`), `proposed ${WEB}:${STREAM} design document · design line ${where(dir, line)} · state unknown · 2 design paragraphs`, show(r));
  assert.equal(proposed(r, 'WEB-1'), `proposed WEB-1 design paragraph · ${WEB}:${STREAM}:3 · component: The stream writer sends one row at a time.`, show(r));
  assert.equal(proposed(r, 'WEB-2'), `proposed WEB-2 design paragraph · ${WEB}:${STREAM}:7 · rule: A stream MUST end with a total row.`, show(r));
  notProposed(r, 'WEB-3');
  assert.deepEqual(out(r).filter((l) => /^in force WEB-/.test(l)), [], show(r));
});

test('#58 LD-48: a design line to a document with no markers in an output repo: "no markers: supporting evidence"', (t) => {
  const line = `Design: ${WEB}:${NOTES}`;
  const { dir } = outputWorld(t, [line]);
  const r = check(dir);
  assert.equal(proposed(r, `${WEB}:${NOTES}`), `proposed ${WEB}:${NOTES} design document · design line ${where(dir, line)} · state unknown · no markers: supporting evidence`, show(r));
});

for (const [what, path] of [['only in the working tree of the output repo', DRAFT], ['committed after the selected commit', LATER]]) {
  test(`#58 LD-48: a design line to an output repo document ${what}: "hint design-doc ... which is missing", and it is not listed`, (t) => {
    const line = `Design: ${WEB}:${path}`;
    const { dir } = outputWorld(t, [line]);
    const r = check(dir);
    const want = `hint design-doc ${where(dir, line)} ${WEB}:${path} the design line names ${WEB}:${path}, which is missing`;
    assert.ok(out(r).includes(want), `the line "${want}":\n${show(r)}`);
    notProposed(r, `${WEB}:${path}`);
  });
}

test('#58 LD-48: a design line to an output repo that cannot be read (no clone): "info output-repo <where> invoicer-mobile:<path> unknown: <reason>", and it is not listed', (t) => {
  const line = 'Design: invoicer-mobile:docs/streaming.md';
  const { dir } = outputWorld(t, [line]);
  const r = check(dir);
  const prefix = `info output-repo ${where(dir, line)} invoicer-mobile:docs/streaming.md unknown: `;
  const found = out(r).filter((l) => l.startsWith(prefix));
  assert.equal(found.length, 1, `one line "${prefix}<reason>":\n${show(r)}`);
  assert.ok(found[0].length > prefix.length, `a reason:\n${show(r)}`);
  notProposed(r, 'invoicer-mobile:docs/streaming.md');
  assert.deepEqual(out(r).filter((l) => l.startsWith('hint design-doc ')), [], show(r));
});

test('#58 LD-48: a design line whose <repo>: is no output repo of the config: "hint design-doc ... which cannot be read: billing is not an output repo in the config"', (t) => {
  const line = 'Design: billing:docs/streaming.md';
  const { dir } = outputWorld(t, [line]);
  const r = check(dir);
  const want = `hint design-doc ${where(dir, line)} billing:docs/streaming.md the design line names billing:docs/streaming.md, which cannot be read: billing is not an output repo in the config`;
  assert.ok(out(r).includes(want), `the line "${want}":\n${show(r)}`);
  notProposed(r, 'billing:docs/streaming.md');
});

// A folder of saved work items outside the repo, removed when the test ends.
function itemsFolder(t) {
  const items = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-58-items-'));
  t.after(() => rmSync(items, { recursive: true, force: true }));
  return items;
}
const item = (ref, design) => `${JSON.stringify({ ref, repository: 'PROJ', body: `${ref}.`, design })}\n`;

test('#58 LD-48: the design field of a work item may name an output repo document: "design of work item PROJ-12 (<folder>/proj-12.json)"', (t) => {
  const { dir } = outputWorld(t, []);
  editRecord(dir, 'streaming', (rec) => { rec.tasks = [{ id: 'T1', ref: 'PROJ-12' }]; });
  commitAll(dir, 'the task');
  const items = itemsFolder(t);
  write(items, 'proj-12.json', item('PROJ-12', `${WEB}:${NOTES}`));
  const r = check(dir, '--issues', items);
  assert.equal(proposed(r, `${WEB}:${NOTES}`),
    `proposed ${WEB}:${NOTES} design document · design of work item PROJ-12 (${join(items, 'proj-12.json')}) · state unknown · no markers: supporting evidence`, show(r));
});

// =====================================================================
// Which work items give a design

const BATCH = 'docs/rfc/0017-batch.md';
const LOCAL = 'docs/rfc/0018-local.md';

// The central repo alone, with two local documents; the open request pdf in
// the base, its task naming PROJ-13 when pdfTask; on the branch, the request
// streaming with the task T1 naming PROJ-12.
function itemWorld(t, { pdfTask }) {
  const dir = baseProject(t, { branch: null });
  write(dir, LOCAL, '# Local streaming\n\nThe export streams rows.\n');
  write(dir, BATCH, '# Batch\n\nThe export runs at night.\n');
  newRequest(dir, 'pdf');
  if (pdfTask) editRecord(dir, 'pdf', (rec) => { rec.tasks = [{ id: 'T1', ref: 'PROJ-13' }]; });
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  newRequest(dir, 'streaming');
  editRecord(dir, 'streaming', (rec) => { rec.tasks = [{ id: 'T1', ref: 'PROJ-12' }]; });
  commitAll(dir, 'streaming');
  const items = itemsFolder(t);
  write(items, 'proj-12.json', item('PROJ-12', LOCAL));
  write(items, 'proj-13.json', item('PROJ-13', BATCH));
  return { dir, items };
}

test("#58 LD-48: an item in the --issues folder that no task of the own request names gives no design, even with a design field; the own request's item does", (t) => {
  const { dir, items } = itemWorld(t, { pdfTask: false });
  const r = check(dir, '--issues', items);
  assert.ok(proposed(r, LOCAL).startsWith(`proposed ${LOCAL} design document · design of work item PROJ-12 (`), show(r));
  notProposed(r, BATCH);
});

test("#58 LD-48: an item named only by another open request's task gives no design to this change", (t) => {
  const { dir, items } = itemWorld(t, { pdfTask: true });
  const r = check(dir, '--issues', items);
  proposed(r, LOCAL);
  notProposed(r, BATCH);
});
