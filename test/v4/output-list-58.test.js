// #58: the list of `al check` in an output repo (round 3 of the interface
// note, as the architect decided). Written from the public interface only:
//
// - The list comes from the central repo's state at its selected commit.
// - `in force <ID> cited (<file>:<line>) · <central file>:<line> · ...` for a
//   central item that a line of the change names as `central:<ID>`; a bare
//   ID in an output repo does not count.
// - `in force <ID> all files · ...` for a central item with `files:**`.
// - The grouped line names every other central item, with exact counts; an
//   item with a file scope (not `**`) goes to the second group.
// - The limits line says "file scopes name files of the central repo; they
//   are not matched in an output repo", "the items' files are in the central
//   repo at <7-char commit>", and "the change's own request is not read in
//   an output repo". No proposed line.
// - When the central repo cannot be read: no in force line, no grouped line,
//   and the limits line says "the central repo cannot be read: <reason>, so
//   no item in force is listed". Never "0 further items in force".
//
// No model and no network. Nothing here reads src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ADR3, appendSection, commitAll, doc, git, newRequest, ok, organized, req, write, writeConfig } from './helpers/project.js';
import { check, grouped, inForce, notInForce, oneLine, out, show, shown } from './helpers/list-58.js';

const T12 = 'An invoice has a number, a customer, lines, a total and a paid date.';
const T13 = 'An invoice MUST have at least one line.';
const T41 = 'The export link MUST expire 30 minutes after the email is sent.';
const T50 = 'Every invoice number MUST be unique.';
const R1 = req('R1', 'Monthly CSV', 'A user MUST be able to download one month as one CSV file.');

function initRepo(dir) {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'Fixture Author');
  git(dir, 'config', 'user.email', 'author@example.invalid');
  git(dir, 'config', 'commit.gpgsign', 'false');
}

// <root>/invoicer, the central repo on main: INV-12 (no scope), INV-13
// (files:src/export/**), INV-41 (no scope), INV-50 (files:**), the accepted
// ADR-3, and the open request csv-export with R1 signed. <root>/invoicer-web,
// an output repo whose config names the central repo (`central` as given):
// src/export/csv.js and README.md on main, then the branch feature with
// src/export/csv.js changed and src/links.js, whose line 1 names
// central:INV-41 and line 2 the bare INV-12, committed as "csv-export: the
// links".
function outputWorld(t, { central = { path: '../invoicer' }, changed = true } = {}) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-58-output-list-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, 'invoicer');
  initRepo(dir);
  writeConfig(dir, [{ file: 'specs/invoices.md', prefix: 'INV' }], { repo: 'invoicer' });
  write(dir, 'specs/invoices.md', doc([
    ['INV-1 note', '# Invoices'],
    ['INV-12 data', T12],
    ['INV-13 rule files:src/export/**', T13],
    ['INV-41 rule', T41],
    ['INV-50 rule files:**', T50],
  ]));
  write(dir, 'specs/adr/0003-signed-links.md', ADR3);
  newRequest(dir, 'csv-export');
  appendSection(dir, 'csv-export', organized([R1]));
  ok(dir, ['record', 'csv-export', 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  commitAll(dir, 'central base');
  const centralHead = git(dir, 'rev-parse', 'HEAD');

  const web = join(root, 'invoicer-web');
  initRepo(web);
  const centralYaml = Object.entries(central).map(([k, v]) => `${k}: ${v}`).join(', ');
  write(web, '.assuredloop/config.yaml', `repo: invoicer-web\ncentral: {${centralYaml}}\n`);
  write(web, 'src/export/csv.js', 'export const csv = 1;\n');
  write(web, 'README.md', '# Invoicer web\n');
  commitAll(web, 'web base');
  if (changed) {
    git(web, 'checkout', '-q', '-b', 'feature');
    write(web, 'src/export/csv.js', 'export const csv = 2;\n');
    write(web, 'src/links.js', '// central:INV-41\n// INV-12\n');
    commitAll(web, 'csv-export: the links');
  }
  return { root, dir, web, centralHead };
}

// =====================================================================
// The central repo can be read

test('#58 output repo: a line that names central:INV-41 cites it; the place is the output repo file, the item file is the central one', (t) => {
  const { web } = outputWorld(t);
  const r = check(web);
  assert.equal(inForce(r, 'INV-41'), `in force INV-41 cited (src/links.js:1) · specs/invoices.md:15 · rule: ${T41}`, show(r));
});

test('#58 output repo: a bare INV-12 is no citation, and the scope of INV-13 is not matched against src/export/csv.js of the output repo', (t) => {
  const { web } = outputWorld(t);
  const r = check(web);
  notInForce(r, 'INV-12');
  notInForce(r, 'INV-13');
});

test('#58 output repo: a central item with files:** is shown with all files', (t) => {
  const { web } = outputWorld(t);
  const r = check(web);
  assert.equal(inForce(r, 'INV-50'), `in force INV-50 all files · specs/invoices.md:19 · rule: ${T50}`, show(r));
  assert.deepEqual(shown(r).map((l) => l.split(' ')[2]), ['INV-41', 'INV-50'], show(r));
});

test('#58 output repo: the grouped line names every other central item, exact counts, the scoped INV-13 in the second group', (t) => {
  const { web } = outputWorld(t);
  const r = check(web);
  assert.equal(grouped(r).line, '3 further items in force: 2 with no known scope: INV-12, ADR-3; 1 with a scope that does not match this change: INV-13', show(r));
});

test("#58 output repo: the limits line says that file scopes are not matched here, names the central repo's commit, and says that the own request is not read; no proposed line", (t) => {
  const { web, centralHead } = outputWorld(t);
  const r = check(web);
  const limits = oneLine(r, 'list limits: ');
  for (const phrase of [
    'file scopes name files of the central repo; they are not matched in an output repo',
    `the items' files are in the central repo at ${centralHead.slice(0, 7)}`,
    "the change's own request is not read in an output repo",
  ]) assert.ok(limits.includes(phrase), `the limits line says "${phrase}":\n${show(r)}`);
  assert.deepEqual(out(r).filter((l) => l.startsWith('proposed ')), [], show(r));
});

test('#58 round 4: in an output repo the limits line says "al context <ID> in the central repo shows one item", not "al context <ID> one item"', (t) => {
  const { web } = outputWorld(t);
  const limits = oneLine(check(web), 'list limits: ');
  assert.ok(limits.includes('al context <ID> in the central repo shows one item'), limits);
  assert.ok(!limits.includes('al context <ID> one item'), limits);
});

test('#58 output repo: no change selected (on main, clean): "list: no change selected: <reason>"', (t) => {
  const { web } = outputWorld(t, { changed: false });
  const r = check(web);
  const list = out(r).filter((l) => /^(list: |list basis: |list limits: |in force |proposed |\d+ further items in force: )/.test(l));
  assert.equal(list.length, 1, show(r));
  assert.match(list[0], /^list: no change selected: \S/, show(r));
});

// =====================================================================
// The central repo cannot be read

for (const [what, central] of [
  ['no clone at its path', { path: '../nowhere' }],
  ['a commit that is not there', { path: '../invoicer', commit: 'deadbeef'.repeat(5) }],
]) {
  test(`#58 output repo, the central repo cannot be read (${what}): no in force line and no grouped line; the limits line gives the reason; never "0 further items in force"`, (t) => {
    const { web } = outputWorld(t, { central });
    const r = check(web);
    assert.deepEqual(out(r).filter((l) => l.startsWith('in force ')), [], show(r));
    assert.deepEqual(out(r).filter((l) => /^\d+ further items in force: /.test(l)), [], show(r));
    const limits = oneLine(r, 'list limits: ');
    assert.match(limits, /the central repo cannot be read: \S.*, so no item in force is listed/, show(r));
  });
}
