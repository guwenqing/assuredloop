// #58: the file scope of an item in force (requests/light-design LD-25 and
// LD-26, as the architect decided in round 2 of the interface note). Written
// from the requirement and the public interface only:
//
// - An item's marker line may hold `files:` with one or more globs from the
//   repo root, joined by commas. An ADR holds it in its heading marker.
//   `**` matches any number of folders (also none), `*` any characters
//   within one folder name, `?` one character (not `/`). A space or a comma
//   in a path is written as `?`. All files is `files:**`.
// - `files:` is not a link and not text: adding, changing or removing it
//   gives no marker hint (unknown-link, adr-marker, adr-changed).
// - Basis words, in this order: `changed by this change`, `cited (...)`,
//   `scope changed in this change`, `by scope` (a glob matches a file that
//   the change adds, changes, renames (old or new path) or deletes, outside
//   .assuredloop/), `all files` (`files:**`, shown on every change).
// - The grouped line splits into "<U> with no known scope" and "<K> with a
//   scope that does not match this change"; with --full, the second group
//   gets `in force <ID> grouped, scope does not match · ...` lines.
// - When a change is selected, a scope that matches no file of the working
//   tree (tracked, or untracked and not ignored) gives
//   `hint scope-no-file <file>:<marker line> <ID> its file scope <globs> matches no file`.
// - `list basis:` names `by scope` and `all files`.
//
// No model and no network. Nothing here reads src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { baseProject, commitAll, doc, editFile, git, ok, read, write } from './helpers/project.js';
import {
  check, grouped, hintCodes, hintLines, inForce, isGroupedFull, idOf, lineOf, notInForce, oneLine, out, show, shown,
} from './helpers/list-58.js';

const SPEC = 'specs/invoices.md';
const ADR3_FILE = 'specs/adr/0003-signed-links.md';
const T12 = 'An invoice has a number, a customer, lines, a total and a paid date.';
const T13 = 'An invoice MUST have at least one line.';
const T41 = 'The export link MUST expire 30 minutes after the email is sent.';
const T50 = 'Every invoice number MUST be unique.';

// The scoped spec: INV-12 has no scope; INV-13 concerns src/export/**;
// INV-41 concerns src/mail/*.js; INV-50 concerns all files. Text lines: 7,
// 11, 15, 19; marker lines: 5, 9, 13, 17.
const SCOPED = doc([
  ['INV-1 note', '# Invoices'],
  ['INV-12 data', T12],
  ['INV-13 rule files:src/export/**', T13],
  ['INV-41 rule files:src/mail/*.js', T41],
  ['INV-50 rule files:**', T50],
]);
// ADR-3, accepted, decides INV-13, concerns test/**. Heading text on line 5.
const ADR3 = `Status: accepted\n\n${doc([
  ['ADR-3 choice decides:INV-13 files:test/**', '# ADR-3: Signed links'],
  ['ADR-3-1 rationale', 'Context: a link must not be guessed.'],
])}`;
const FILES = {
  'src/export/csv.js': 'export const csv = 1;\n',
  'src/export/zip.js': 'export const zip = 1;\n',
  'src/mail/send.js': 'export const send = 1;\n',
  'test/export/csv.test.js': 'import "../../src/export/csv.js";\n',
  'README.md': '# Invoicer\n',
  'docs/guide.md': '# Guide\n',
};

// baseProject's config, then the scoped spec, ADR-3 and the files, and what
// `extra` adds, committed on main; then the branch feature.
function world(t, extra) {
  const dir = baseProject(t, { branch: null });
  write(dir, SPEC, SCOPED);
  write(dir, ADR3_FILE, ADR3);
  for (const [file, text] of Object.entries(FILES)) write(dir, file, text);
  if (extra) extra(dir);
  commitAll(dir, 'scoped base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  return dir;
}
const change = (dir, file, text = '// changed\n') => write(dir, file, `${read(dir, file)}${text}`);
const MARKER_HINTS = ['unknown-link', 'adr-marker', 'adr-changed'];
const noMarkerHint = (r) => {
  for (const code of MARKER_HINTS) assert.deepEqual(hintLines(r, code), [], `no ${code} hint:\n${show(r)}`);
};

// =====================================================================
// by scope, all files, and the grouped line (LD-25)

test('#58 LD-26: a glob matches an added file: "in force INV-13 by scope · specs/invoices.md:11 · rule: <text>"; INV-50 (files:**) is shown with all files', (t) => {
  const dir = world(t);
  write(dir, 'src/export/pdf.js', 'export const pdf = 1;\n');
  commitAll(dir, 'pdf');
  const r = check(dir);
  assert.equal(inForce(r, 'INV-13'), `in force INV-13 by scope · specs/invoices.md:11 · rule: ${T13}`, show(r));
  assert.match(inForce(r, 'INV-50'), new RegExp(`^in force INV-50 (by scope, )?all files · specs/invoices\\.md:19 · rule: ${T50}$`), show(r));
  notInForce(r, 'INV-41');
  notInForce(r, 'ADR-3');
  notInForce(r, 'INV-12');
});

test('#58 LD-25: the grouped line splits exactly: "3 further items in force: 1 with no known scope: INV-12; 2 with a scope that does not match this change: INV-41, ADR-3"', (t) => {
  const dir = world(t);
  write(dir, 'src/export/pdf.js', 'export const pdf = 1;\n');
  commitAll(dir, 'pdf');
  const r = check(dir);
  assert.equal(grouped(r).line, '3 further items in force: 1 with no known scope: INV-12; 2 with a scope that does not match this change: INV-41, ADR-3', show(r));
});

for (const [what, act] of [
  ['changed', (dir) => change(dir, 'src/export/csv.js')],
  ['deleted', (dir) => rmSync(join(dir, 'src/export/zip.js'))],
  ['renamed out of the scope (the old path matches)', (dir) => { mkdirSync(join(dir, 'lib')); git(dir, 'mv', 'src/export/csv.js', 'lib/csv.js'); }],
]) {
  test(`#58 LD-26: a glob matches a ${what} file: INV-13 is shown by scope`, (t) => {
    const dir = world(t);
    act(dir);
    commitAll(dir, what);
    const r = check(dir);
    assert.ok(inForce(r, 'INV-13').startsWith('in force INV-13 by scope · specs/invoices.md:11 · '), show(r));
    notInForce(r, 'INV-41');
  });
}

test('#58 LD-26: a file renamed into the scope (the new path matches): INV-41 is shown by scope', (t) => {
  const dir = world(t, (d) => write(d, 'lib/notify.js', 'export const notify = 1;\n'));
  git(dir, 'mv', 'lib/notify.js', 'src/mail/notify.js');
  commitAll(dir, 'move notify');
  const r = check(dir);
  assert.ok(inForce(r, 'INV-41').startsWith('in force INV-41 by scope · specs/invoices.md:15 · '), show(r));
  notInForce(r, 'INV-13');
});

test('#58 LD-26: a file under .assuredloop/ is not part of the change: a scope .assuredloop/** does not match it', (t) => {
  const dir = world(t, (d) => write(d, SPEC, `${read(d, SPEC)}\n${doc([['INV-60 rule files:.assuredloop/**', 'The records MUST stay in the repo.']])}`));
  ok(dir, ['index']);
  change(dir, 'README.md', 'More.\n');
  commitAll(dir, 'records and readme');
  const r = check(dir);
  notInForce(r, 'INV-60');
  assert.ok(grouped(r).mismatch.includes('INV-60'), `INV-60 has a scope that does not match:\n${show(r)}`);
});

test('#58 LD-25: all files (files:**) is shown on every change, here a change to README.md only', (t) => {
  const dir = world(t);
  change(dir, 'README.md', 'More.\n');
  commitAll(dir, 'readme');
  const r = check(dir);
  assert.match(inForce(r, 'INV-50'), /^in force INV-50 (by scope, )?all files · /, show(r));
  assert.deepEqual(shown(r).map(idOf), ['INV-50'], show(r));
  assert.equal(grouped(r).line, '4 further items in force: 1 with no known scope: INV-12; 3 with a scope that does not match this change: INV-13, INV-41, ADR-3', show(r));
});

test('#58 LD-26: the heading marker of an ADR holds files:; a change under test/ shows ADR-3 by scope, and its decides links leave the token out', (t) => {
  const dir = world(t);
  change(dir, 'test/export/csv.test.js');
  commitAll(dir, 'test');
  const r = check(dir);
  const line = inForce(r, 'ADR-3');
  assert.ok(line.startsWith(`in force ADR-3 by scope · ${ADR3_FILE}:5 · ADR accepted, decides INV-13: `), show(r));
  assert.ok(line.endsWith(': # ADR-3: Signed links Context: a link must not be guessed.'), `the whole text of ADR-3:\n${show(r)}`);
});

test('#58 al check --full: each grouped item with a scope that does not match gets "in force <ID> grouped, scope does not match · <file>:<line> · <what>: <text>"', (t) => {
  const dir = world(t);
  write(dir, 'src/export/pdf.js', 'export const pdf = 1;\n');
  commitAll(dir, 'pdf');
  const r = check(dir, '--full');
  const full = out(r).filter(isGroupedFull);
  assert.ok(full.includes(`in force INV-41 grouped, scope does not match · specs/invoices.md:15 · rule: ${T41}`), show(r));
  assert.ok(full.includes(`in force INV-12 grouped, no known scope · specs/invoices.md:7 · data: ${T12}`), show(r));
  const a3 = full.find((l) => l.startsWith('in force ADR-3 '));
  assert.ok(a3?.startsWith(`in force ADR-3 grouped, scope does not match · ${ADR3_FILE}:5 · ADR accepted, decides INV-13: `), show(r));
  assert.deepEqual(full.map(idOf), ['INV-12', 'INV-41', 'ADR-3'], show(r));
});

test('#58 LD-43: the list basis line names by scope and all files', (t) => {
  const dir = world(t);
  write(dir, 'src/export/pdf.js', 'export const pdf = 1;\n');
  commitAll(dir, 'pdf');
  const basis = oneLine(check(dir), 'list basis: ');
  for (const word of ['by scope', 'all files']) assert.ok(basis.includes(word), `the basis line names "${word}": ${basis}`);
});

// =====================================================================
// The glob rules (LD-26)

// [glob, base files, the file that the change adds or changes, matches?]
const GLOBS = [
  ['src/**/x.js', ['src/x.js'], 'src/x.js', true, '** with no folder'],
  ['src/**/x.js', ['src/a/b/c/x.js'], 'src/a/b/c/x.js', true, '** with three folders'],
  ['src/**', ['src/a/b/y.js'], 'src/a/b/y.js', true, 'a glob that ends in **'],
  ['src/*.js', ['src/y.js'], 'src/y.js', true, '* within one folder name'],
  ['src/*.js', ['src/y.js', 'src/a/y.js'], 'src/a/y.js', false, '* stops at /'],
  ['src/v?.js', ['src/v1.js'], 'src/v1.js', true, '? one character'],
  ['src/v?.js', ['src/v1.js', 'src/v10.js'], 'src/v10.js', false, '? not two characters'],
  ['src?x.js', ['srcax.js', 'src/x.js'], 'src/x.js', false, '? is not /'],
  ['docs/my?file.md', ['docs/my file.md'], 'docs/my file.md', true, '? for a space in a path'],
  ['lib/*.js,docs/my?file.md', ['lib/a.js', 'docs/my file.md'], 'docs/my file.md', true, 'two globs joined by a comma'],
];
for (const [glob, files, changed, matches, what] of GLOBS) {
  test(`#58 LD-26 glob rules, ${what}: files:${glob} ${matches ? 'matches' : 'does not match'} a change to ${changed}`, (t) => {
    const dir = world(t, (d) => {
      write(d, SPEC, `${read(d, SPEC)}\n${doc([[`INV-70 rule files:${glob}`, 'A glob MUST be read as written.']])}`);
      for (const f of files) write(d, f, `// ${f}\n`);
    });
    change(dir, changed);
    commitAll(dir, `change ${changed}`);
    const r = check(dir);
    if (matches) {
      assert.ok(inForce(r, 'INV-70').startsWith('in force INV-70 by scope · '), show(r));
    } else {
      notInForce(r, 'INV-70');
      assert.ok(grouped(r).mismatch.includes('INV-70'), `INV-70 has a scope that does not match:\n${show(r)}`);
    }
  });
}

// =====================================================================
// The token is not text (LD-26)

test('#58 LD-26: adding files: to a spec paragraph gives no marker hint, and the item is shown with "scope changed in this change"', (t) => {
  const dir = baseProject(t, { branch: null });
  write(dir, 'src/mail/send.js', 'export const send = 1;\n');
  commitAll(dir, 'mail');
  git(dir, 'checkout', '-q', '-b', 'feature');
  editFile(dir, SPEC, '<!-- INV-41 rule -->', '<!-- INV-41 rule files:src/mail/** -->');
  commitAll(dir, 'scope of INV-41');
  const r = check(dir);
  noMarkerHint(r);
  assert.equal(inForce(r, 'INV-41'), `in force INV-41 scope changed in this change · specs/invoices.md:15 · rule: ${T41}`, show(r));
});

test('#58 LD-26: a scope narrowed so that it no longer matches the change: the item is still shown, "scope changed in this change", and no marker hint', (t) => {
  const dir = world(t, (d) => editFile(d, SPEC, 'INV-13 rule files:src/export/**', 'INV-13 rule files:src/**'));
  editFile(dir, SPEC, 'INV-13 rule files:src/**', 'INV-13 rule files:src/export/**');
  change(dir, 'src/mail/send.js');
  commitAll(dir, 'narrow INV-13');
  const r = check(dir);
  noMarkerHint(r);
  assert.ok(inForce(r, 'INV-13').startsWith('in force INV-13 scope changed in this change · specs/invoices.md:11 · '), show(r));
  assert.doesNotMatch(inForce(r, 'INV-13'), /changed by this change/, show(r));
});

test('#58 LD-26: a scope removed: the item is shown with "scope changed in this change", and no marker hint', (t) => {
  const dir = world(t);
  editFile(dir, SPEC, 'INV-13 rule files:src/export/**', 'INV-13 rule');
  commitAll(dir, 'no scope for INV-13');
  const r = check(dir);
  noMarkerHint(r);
  assert.ok(inForce(r, 'INV-13').startsWith('in force INV-13 scope changed in this change · specs/invoices.md:11 · '), show(r));
});

test('#58 LD-26: files: added to the heading marker of an accepted ADR: no adr-marker, no adr-changed; ADR-3 is shown with "scope changed in this change"', (t) => {
  const dir = baseProject(t, { branch: null });
  editFile(dir, ADR3_FILE, '<!-- ADR-3 choice -->', '<!-- ADR-3 choice decides:INV-13 -->');
  commitAll(dir, 'decides');
  git(dir, 'checkout', '-q', '-b', 'feature');
  editFile(dir, ADR3_FILE, '<!-- ADR-3 choice decides:INV-13 -->', '<!-- ADR-3 choice decides:INV-13 files:src/** -->');
  write(dir, 'src/links.js', 'export const links = 1;\n');
  commitAll(dir, 'scope of ADR-3');
  const r = check(dir);
  noMarkerHint(r);
  assert.match(inForce(r, 'ADR-3'), new RegExp(`^in force ADR-3 scope changed in this change, by scope · ${ADR3_FILE}:5 · ADR accepted, decides INV-13: `), show(r));
  assert.doesNotMatch(inForce(r, 'ADR-3'), /text changed, review open/, show(r));
});

test('#58 LD-26: files: removed from the heading marker of an accepted ADR: no adr-marker, no adr-changed; ADR-3 is shown with "scope changed in this change"', (t) => {
  const dir = world(t);
  editFile(dir, ADR3_FILE, 'ADR-3 choice decides:INV-13 files:test/**', 'ADR-3 choice decides:INV-13');
  commitAll(dir, 'no scope for ADR-3');
  const r = check(dir);
  noMarkerHint(r);
  assert.ok(inForce(r, 'ADR-3').startsWith(`in force ADR-3 scope changed in this change · ${ADR3_FILE}:5 · `), show(r));
});

test('#58 LD-26: a design paragraph whose marker has only files: still gets the no-link hint', (t) => {
  const dir = world(t, (d) => write(d, SPEC, `${read(d, SPEC)}\n${doc([['INV-80 component files:src/export/**', 'The CSV writer turns invoices into rows.']])}`));
  change(dir, 'src/export/csv.js');
  commitAll(dir, 'csv');
  const r = check(dir);
  const at = lineOf(dir, SPEC, '<!-- INV-80 component files:src/export/** -->');
  assert.ok(hintLines(r, 'no-link').some((l) => l.startsWith(`hint no-link specs/invoices.md:${at} INV-80 `)), show(r));
});

// =====================================================================
// The hint scope-no-file (LD-26)

test('#58 LD-26: a scope that matches no file of the working tree: "hint scope-no-file specs/invoices.md:9 INV-13 its file scope src/billing/**,lib/*.js matches no file", at the marker line', (t) => {
  const dir = world(t, (d) => editFile(d, SPEC, 'INV-13 rule files:src/export/**', 'INV-13 rule files:src/billing/**,lib/*.js'));
  change(dir, 'README.md', 'More.\n');
  commitAll(dir, 'readme');
  const r = check(dir);
  // At the marker line, then the place of INV-13's text (#74).
  assert.deepEqual(hintLines(r, 'scope-no-file'), ['hint scope-no-file specs/invoices.md:9 INV-13 its file scope src/billing/**,lib/*.js matches no file · places: INV-13 specs/invoices.md:11'], show(r));
});

test('#58 LD-26: a scope that matches only an ignored file still gets scope-no-file; one that matches an untracked file that is not ignored gets none', (t) => {
  const dir = world(t, (d) => {
    editFile(d, SPEC, 'INV-13 rule files:src/export/**', 'INV-13 rule files:src/billing/**');
    write(d, '.gitignore', '*.log\n');
  });
  change(dir, 'README.md', 'More.\n');
  commitAll(dir, 'readme');
  write(dir, 'src/billing/run.log', 'log\n');
  const ignored = check(dir);
  assert.equal(hintLines(ignored, 'scope-no-file').length, 1, `an ignored file is no file of the working tree:\n${show(ignored)}`);
  write(dir, 'src/billing/bill.js', 'export const bill = 1;\n');
  const r = check(dir);
  assert.deepEqual(hintLines(r, 'scope-no-file'), [], show(r));
});

test('#58 round 3: scope-no-file also fires when the only file that the scope matches was deleted in the working tree, the deletion not staged', (t) => {
  const dir = world(t, (d) => {
    editFile(d, SPEC, 'INV-13 rule files:src/export/**', 'INV-13 rule files:src/billing/**');
    write(d, 'src/billing/bill.js', 'export const bill = 1;\n');
  });
  change(dir, 'README.md', 'More.\n');
  commitAll(dir, 'readme');
  const before = check(dir);
  assert.deepEqual(hintLines(before, 'scope-no-file'), [], `control: the file is there:\n${show(before)}`);
  rmSync(join(dir, 'src/billing/bill.js'));
  const r = check(dir);
  assert.deepEqual(hintLines(r, 'scope-no-file'), ['hint scope-no-file specs/invoices.md:9 INV-13 its file scope src/billing/** matches no file · places: INV-13 specs/invoices.md:11'], show(r));
});

test('#58 LD-26: with no change selected (on main, clean), a scope that matches no file gives no scope-no-file hint', (t) => {
  const dir = baseProject(t, { branch: null });
  editFile(dir, SPEC, '<!-- INV-13 rule -->', '<!-- INV-13 rule files:src/billing/** -->');
  commitAll(dir, 'scope');
  const r = check(dir);
  assert.match(r.stdout, /^list: no change selected: /m, show(r));
  assert.deepEqual(hintLines(r, 'scope-no-file'), [], show(r));
});

// =====================================================================
// Basis order, and no new hint (LD-41)

test('#58 basis order: "changed by this change, cited (...), scope changed in this change, by scope"; and "..., all files" last', (t) => {
  const dir = world(t);
  editFile(dir, SPEC, '<!-- INV-13 rule files:src/export/** -->\n\nAn invoice MUST have at least one line.',
    '<!-- INV-13 rule files:src/export/*.js -->\n\nAn invoice MUST have at least two lines.');
  editFile(dir, SPEC, T50, 'Every invoice number MUST be unique in its year.');
  write(dir, 'src/export/pdf.js', '// INV-13 INV-50\n');
  commitAll(dir, 'all bases');
  const r = check(dir);
  assert.ok(inForce(r, 'INV-13').startsWith('in force INV-13 changed by this change, cited (src/export/pdf.js:1), scope changed in this change, by scope · specs/invoices.md:11 · rule: An invoice MUST have at least two lines.'), show(r));
  assert.match(inForce(r, 'INV-50'), /^in force INV-50 changed by this change, cited \(src\/export\/pdf\.js:1\), (by scope, )?all files · specs\/invoices\.md:19 · /, show(r));
});

test('#58 LD-41: an ordinary change whose files a scope matches gives no new hint, and exit 0, also with --strict', (t) => {
  const dir = world(t);
  change(dir, 'src/export/csv.js');
  commitAll(dir, 'csv');
  const r = check(dir);
  assert.deepEqual(hintCodes(r), ['adr-links', 'no-claim', 'no-link'], `only the hints of today:\n${show(r)}`);
  inForce(r, 'INV-13');
  const strict = check(dir, '--strict');
  assert.equal(strict.code, 0, show(strict));
});
