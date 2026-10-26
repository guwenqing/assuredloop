// #58: what is in force for a change, the list of `al check`
// (requests/light-design/request.md R1, signed; spec LD-24, LD-25, LD-29,
// LD-41, LD-42, LD-43, LD-47, LD-48 and LD-52). Written from the requirement
// and the public interface only:
//
// - The list is one section of `al check`, after the findings and before
//   the Read line. With no base, or an empty change:
//     list: no change selected: <reason>
// - A shown item in force:
//     in force <ID> <basis> · <file>:<line> · <what>[ · <flag>]...: <text>
//   <basis>: `changed by this change`, `cited (<place>; ...)`, in that
//   order, joined by ", ". <file>:<line> is the item's first line of text,
//   never its marker line. <text> has each run of white space made one space.
// - This change's own proposals: `proposed <name>/<R> signed requirement ...`,
//   `proposed <name>/<SP> change spec ...`, `proposed <path> design
//   document ...`, `proposed <ID> design paragraph ...`; never `in force`.
// - The grouped line names every other item in force, with exact counts:
//     <N> further items in force: <U> with no known scope: <IDs>; <K> with
//     a scope that does not match this change: <IDs>
//   With `--full`, each grouped item also gets its own `in force <ID>
//   grouped, ...` line.
// - `list basis:` and `list limits:` lines.
// - No new hint on an ordinary change; no exit code changes; the same
//   output for the same state; search does not change the list.
//
// The file scope (`by scope`, `all files`) is left out: its form is not
// decided yet. No model and no network. Nothing here reads src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  al, appendSection, baseProject, commitAll, doc, editFile, editRecord, exists, git, move, newRequest, ok, organized,
  project, read, req, show, write, writeConfig, INVOICES,
} from './helpers/project.js';
import { settled } from './helpers/as-78.js';

const SPEC = 'specs/invoices.md';
const ADR3_FILE = 'specs/adr/0003-signed-links.md';
const T12 = 'An invoice has a number, a customer, lines, a total and a paid date.';
const T13 = 'An invoice MUST have at least one line.';
const T41 = 'The export link MUST expire 30 minutes after the email is sent.';
// The items in force of the base, in list order.
const BASE_IN_FORCE = ['INV-12', 'INV-13', 'INV-41', 'ADR-3'];

const R1 = req('R1', 'Monthly CSV', 'A user MUST be able to download one month as one CSV file.');
const R2 = req('R2', 'Yearly ZIP', 'A user MUST be able to download one year as one ZIP file.');

// --- fixtures

// The base of baseProject (config, specs/invoices.md with INV-1 note, INV-12
// data, INV-13 rule, INV-41 rule, and the accepted ADR-3), plus what `extra`
// adds, committed on main; then the branch feature.
function world(t, extra) {
  const dir = baseProject(t, { branch: null });
  if (extra) {
    extra(dir);
    if (git(dir, 'status', '--porcelain')) commitAll(dir, 'more base');
  }
  git(dir, 'checkout', '-q', '-b', 'feature');
  return dir;
}

const adr = (status, marker, heading, more = []) => `Status: ${status}\n\n${doc([[marker, heading], ...more])}`;

// Appends paragraphs to a spec doc.
const addTo = (dir, file, paras) => write(dir, file, `${read(dir, file)}\n${doc(paras)}`);

// An open request with R1, signed by the owner.
function signedRequest(dir, name = 'csv-export', reqs = [R1]) {
  newRequest(dir, name);
  appendSection(dir, name, organized(reqs));
  ok(dir, ['record', name, 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
}

// An open request whose request.md ends with a "## Design" section of these lines.
function designRequest(dir, lines, name = 'streaming') {
  newRequest(dir, name);
  const path = `requests/${name}/request.md`;
  write(dir, path, `${read(dir, path).replace(/\n*$/, '\n')}\n## Design\n\n${lines.join('\n')}\n`);
  return path;
}

// Moves a request to requests/archive/, as a concluded request.
function archive(dir, name) {
  editFile(dir, `requests/${name}/request.md`, 'Status: open', 'Status: concluded');
  move(dir, `requests/${name}`, `requests/archive/${name}`);
  editRecord(dir, name, (rec) => { rec.status = 'concluded'; });
}

// The 1-based number of the first line of file that is exactly text.
function lineOf(dir, file, text) {
  const at = read(dir, file).split('\n').indexOf(text);
  assert.ok(at >= 0, `${file} has the line ${JSON.stringify(text)}`);
  return at + 1;
}

// --- reading the output

function check(dir, ...args) {
  const r = al(dir, ['check', ...args]);
  assert.equal(r.code, 0, show(r));
  return r;
}
const out = (r) => r.stdout.split('\n');
const GROUPED = /^(\d+) further items in force: (\d+) with no known scope: (.*); (\d+) with a scope that does not match this change: (.*)$/;
const isList = (l) => /^(in force |proposed |list: |list basis: |list limits: )/.test(l) || GROUPED.test(l);
const listLines = (r) => out(r).filter(isList);
const isGroupedFull = (l) => /^in force \S+ grouped, /.test(l);
// The shown `in force` lines (not the --full lines of grouped items).
const shown = (r) => out(r).filter((l) => l.startsWith('in force ') && !isGroupedFull(l));
const idOf = (l) => l.split(' ')[2];

function inForce(r, id) {
  const found = shown(r).filter((l) => l.startsWith(`in force ${id} `));
  assert.equal(found.length, 1, `one "in force ${id} " line:\n${show(r)}`);
  return found[0];
}
function notInForce(r, id) {
  assert.deepEqual(out(r).filter((l) => l.startsWith(`in force ${id} `)), [], `no "in force ${id} " line:\n${show(r)}`);
}
function proposed(r, what) {
  const found = out(r).filter((l) => l.startsWith(`proposed ${what} `));
  assert.equal(found.length, 1, `one "proposed ${what} " line:\n${show(r)}`);
  return found[0];
}
function notProposed(r, what) {
  assert.deepEqual(out(r).filter((l) => l.startsWith(`proposed ${what} `)), [], `no "proposed ${what} " line:\n${show(r)}`);
}
function oneLine(r, prefix) {
  const found = out(r).filter((l) => l.startsWith(prefix));
  assert.equal(found.length, 1, `one line that starts with "${prefix}":\n${show(r)}`);
  return found[0];
}

// The grouped line, read; its counts must agree with its lists.
function grouped(r) {
  const found = out(r).filter((l) => GROUPED.test(l));
  assert.equal(found.length, 1, `one grouped line "<N> further items in force: ...":\n${show(r)}`);
  const m = GROUPED.exec(found[0]);
  const ids = (s) => (s === 'none' ? [] : s.split(', '));
  const g = { line: found[0], n: Number(m[1]), u: Number(m[2]), unknown: ids(m[3]), k: Number(m[4]), mismatch: ids(m[5]) };
  assert.equal(g.u, g.unknown.length, `U is the number of IDs named:\n${show(r)}`);
  assert.equal(g.k, g.mismatch.length, `K is the number of IDs named:\n${show(r)}`);
  assert.equal(g.n, g.u + g.k, `N = U + K:\n${show(r)}`);
  return g;
}

// Every item in force is named exactly once in the list: shown or grouped.
function namesEachOnce(r, ids) {
  const g = grouped(r);
  const named = [...shown(r).map(idOf), ...g.unknown, ...g.mismatch];
  assert.deepEqual([...named].sort(), [...ids].sort(), `each item in force named once, no other:\n${show(r)}`);
}

// The list says nothing about these IDs: no line of the list names them.
function listNamesNot(r, ids) {
  const g = grouped(r);
  for (const id of ids) {
    notInForce(r, id);
    assert.ok(!g.unknown.includes(id) && !g.mismatch.includes(id), `${id} is not in the grouped line:\n${show(r)}`);
  }
}

const hintCodes = (r) => [...new Set(out(r).map((l) => /^hint (\S+) /.exec(l)?.[1]).filter(Boolean))].sort();

// =====================================================================
// No change selected

function assertNoChange(r) {
  const ls = listLines(r);
  assert.equal(ls.length, 1, `the list is one line only:\n${show(r)}`);
  assert.match(ls[0], /^list: no change selected: \S/, show(r));
}

test('#58 on main with a clean tree: the list is one line, "list: no change selected: <reason>", and no in force line', (t) => {
  const dir = baseProject(t, { branch: null });
  assertNoChange(check(dir));
});

test('#58 no main branch (the branch trunk only), a new file that names INV-41: "list: no change selected: <reason>", and no in force line', (t) => {
  const dir = project(t, { branch: 'trunk' });
  writeConfig(dir);
  write(dir, SPEC, INVOICES);
  commitAll(dir, 'base');
  write(dir, 'src/export.js', '// INV-41: the link expires\n');
  assertNoChange(check(dir));
});

test('#58 a branch whose only change is under .assuredloop/ (al index wrote the records): no change selected', (t) => {
  const dir = world(t);
  ok(dir, ['index']);
  assert.ok(exists(dir, '.assuredloop/records/specs/invoices.md.yaml'), 'fixture: al index wrote a record');
  commitAll(dir, 'records');
  assertNoChange(check(dir));
});

// =====================================================================
// Cited

test('#58 an added code file names INV-41 on line 2: "in force INV-41 cited (src/export.js:2) · specs/invoices.md:15 · rule: <text>", at the text line, not the marker line', (t) => {
  const dir = world(t);
  assert.equal(lineOf(dir, SPEC, '<!-- INV-41 rule -->'), 13, 'fixture: the marker of INV-41 is on line 13');
  write(dir, 'src/export.js', 'export const ttl = 30;\n// INV-41: the link expires\n');
  commitAll(dir, 'the export link');
  const r = check(dir);
  assert.equal(inForce(r, 'INV-41'), `in force INV-41 cited (src/export.js:2) · specs/invoices.md:15 · rule: ${T41}`, show(r));
  for (const id of ['INV-12', 'INV-13', 'ADR-3']) notInForce(r, id);
  namesEachOnce(r, BASE_IN_FORCE);
});

test('#58 cited places: the first line in each file that names the ID; a changed file, and an untracked file that is not ignored; an ignored file is not part of the change', (t) => {
  const dir = world(t, (d) => {
    write(d, '.gitignore', '*.log\n');
    write(d, 'src/export.js', 'export const ttl = 30;\nexport const rows = [];\n');
  });
  write(dir, 'src/export.js', 'export const ttl = 30;\nexport const rows = [];\n// INV-13: one line at least\nrows.push(1);\n// INV-13 again\n');
  commitAll(dir, 'rows');
  write(dir, 'notes/todo.txt', 'Check INV-13 with the team.\n');
  write(dir, 'debug.log', 'INV-12 was read\n');
  const r = check(dir);
  const line = inForce(r, 'INV-13');
  const cited = /^in force INV-13 cited \(([^)]*)\) · /.exec(line);
  assert.ok(cited, `INV-13 is shown as cited:\n${show(r)}`);
  const places = cited[1].split('; ');
  assert.ok(places.includes('src/export.js:3'), `src/export.js:3 is a place:\n${show(r)}`);
  assert.ok(places.includes('notes/todo.txt:1'), `the untracked notes/todo.txt:1 is a place:\n${show(r)}`);
  assert.ok(!places.includes('src/export.js:5'), `only the first line in each file:\n${show(r)}`);
  assert.equal(places.length, 2, `two places:\n${show(r)}`);
  notInForce(r, 'INV-12');
  namesEachOnce(r, BASE_IN_FORCE);
});

test('#58 a removed line that named INV-13: the base line, followed by " removed"', (t) => {
  const dir = world(t, (d) => write(d, 'src/export.js', 'export const rows = [];\n// INV-13: one line at least\nif (!rows.length) throw new Error();\n'));
  write(dir, 'src/export.js', 'export const rows = [];\n');
  commitAll(dir, 'the guard goes');
  const r = check(dir);
  assert.match(inForce(r, 'INV-13'), /^in force INV-13 cited \(src\/export\.js:2 removed\) · specs\/invoices\.md:11 · rule: /, show(r));
});

test('#58 an ID as a whole word: central:INV-12 names INV-12, ADR-3-1 names ADR-3; INV-410 does not name INV-41', (t) => {
  const dir = world(t);
  write(dir, 'src/links.js', '// central:INV-12\n// ADR-3-1\n// INV-410\n');
  commitAll(dir, 'links');
  const r = check(dir);
  assert.match(inForce(r, 'INV-12'), /^in force INV-12 cited \(src\/links\.js:1\) · /, show(r));
  assert.match(inForce(r, 'ADR-3'), /^in force ADR-3 cited \(src\/links\.js:2\) · /, show(r));
  notInForce(r, 'INV-41');
  namesEachOnce(r, BASE_IN_FORCE);
});

test('#58 R1 "MUST work when code and tests cite no IDs": a change with no ID still gets the list; the grouped line names every item in force', (t) => {
  const dir = world(t);
  write(dir, 'src/plain.js', 'export const plain = true;\n');
  write(dir, 'test/plain.test.js', 'import "../src/plain.js";\n');
  commitAll(dir, 'plain');
  const r = check(dir);
  assert.deepEqual(shown(r), [], show(r));
  assert.equal(grouped(r).line, '4 further items in force: 4 with no known scope: INV-12, INV-13, INV-41, ADR-3; 0 with a scope that does not match this change: none', show(r));
  oneLine(r, 'list basis: ');
  oneLine(r, 'list limits: ');
});

test('#58 files under .assuredloop/ are not part of the change: the records that al index writes cite nothing', (t) => {
  const dir = world(t);
  write(dir, 'src/export.js', '// INV-41\n');
  ok(dir, ['index']);
  assert.match(read(dir, '.assuredloop/records/specs/invoices.md.yaml'), /INV-12/, 'fixture: the record names INV-12');
  commitAll(dir, 'export and records');
  const r = check(dir);
  inForce(r, 'INV-41');
  for (const id of ['INV-12', 'INV-13', 'ADR-3']) notInForce(r, id);
});

// =====================================================================
// Changed by this change

test('#58 the branch edits the text of INV-13 in specs/: "in force INV-13 changed by this change · specs/invoices.md:11 · rule: <new text>"', (t) => {
  const dir = world(t);
  editFile(dir, SPEC, T13, 'An invoice MUST have at least two lines.');
  commitAll(dir, 'two lines');
  const r = check(dir);
  assert.equal(inForce(r, 'INV-13'), 'in force INV-13 changed by this change · specs/invoices.md:11 · rule: An invoice MUST have at least two lines.', show(r));
  namesEachOnce(r, BASE_IN_FORCE);
});

test('#58 changed and cited: the basis is "changed by this change, cited (...)", in that order', (t) => {
  const dir = world(t);
  editFile(dir, SPEC, T13, 'An invoice MUST have at least two lines.');
  write(dir, 'src/check.js', '// INV-13\n');
  commitAll(dir, 'two lines');
  const r = check(dir);
  assert.ok(inForce(r, 'INV-13').startsWith('in force INV-13 changed by this change, cited (src/check.js:1) · specs/invoices.md:11 · rule: '), show(r));
});

test('#58 a text of several lines: the place is its first line of text, and each run of white space is one space', (t) => {
  const dir = world(t, (d) => addTo(d, SPEC, [['INV-50 rule', 'An invoice total MUST\n   equal the sum\nof its lines.']]));
  write(dir, 'src/total.js', '// INV-50\n');
  commitAll(dir, 'total');
  const r = check(dir);
  const at = lineOf(dir, SPEC, 'An invoice total MUST');
  assert.equal(inForce(r, 'INV-50'), `in force INV-50 cited (src/total.js:1) · specs/invoices.md:${at} · rule: An invoice total MUST equal the sum of its lines.`, show(r));
});

// =====================================================================
// What is in force, and what is not (LD-24, LD-42)

const IN_FORCE_KINDS = {
  'INV-30': 'component', 'INV-31': 'interface', 'INV-32': 'data', 'INV-33': 'flow', 'INV-34': 'choice',
  'INV-35': 'purpose', 'INV-36': 'scope', 'INV-37': 'limit', 'INV-38': 'definition', 'INV-39': 'rule',
};
const NOT_IN_FORCE_KINDS = {
  'INV-20': 'approach', 'INV-21': 'rationale', 'INV-22': 'example', 'INV-23': 'open', 'INV-24': 'plan',
  'INV-25': 'note', 'INV-26': 'step', 'INV-27': 'migration',
};

test('#58 kinds: promise and design paragraphs are in force; approach, rationale, example, open, plan, note, step and migration are never in an in force line nor in the grouped line', (t) => {
  const all = { ...NOT_IN_FORCE_KINDS, ...IN_FORCE_KINDS };
  const dir = world(t, (d) => addTo(d, SPEC, Object.entries(all).map(([id, kind]) => [`${id} ${kind}`, `The ${kind} paragraph ${id}.`])));
  write(dir, 'src/all.js', `// ${Object.keys(all).join(' ')} INV-1\n`);
  commitAll(dir, 'all kinds');
  const r = check(dir);
  for (const [id, kind] of Object.entries(IN_FORCE_KINDS)) {
    assert.ok(inForce(r, id).startsWith(`in force ${id} cited (src/all.js:1) · specs/invoices.md:`), show(r));
    assert.ok(inForce(r, id).endsWith(` · ${kind}: The ${kind} paragraph ${id}.`), `${id} is shown as ${kind}:\n${show(r)}`);
  }
  listNamesNot(r, [...Object.keys(NOT_IN_FORCE_KINDS), 'INV-1']);
  namesEachOnce(r, [...BASE_IN_FORCE, ...Object.keys(IN_FORCE_KINDS)]);
});

test('#58 ADRs: a proposed ADR, a superseded ADR and an ADR that an accepted ADR replaces by supersedes: are not in force, though cited; the accepted ones are grouped, in list order', (t) => {
  const dir = world(t, (d) => {
    write(d, 'specs/adr/0005-pdf.md', adr('proposed', 'ADR-5 choice decides:INV-41', '# ADR-5: PDF files'));
    write(d, 'specs/adr/0006-xlsx.md', adr('superseded by ADR-7', 'ADR-6 choice decides:INV-12', '# ADR-6: XLSX files'));
    write(d, 'specs/adr/0007-csv.md', adr('accepted', 'ADR-7 choice supersedes:ADR-6 decides:INV-12', '# ADR-7: CSV files'));
    write(d, 'specs/adr/0008-zip.md', adr('accepted', 'ADR-8 choice decides:INV-13', '# ADR-8: ZIP files'));
    write(d, 'specs/adr/0009-tar.md', adr('accepted', 'ADR-9 choice supersedes:ADR-8 decides:INV-13', '# ADR-9: TAR files'));
  });
  write(dir, 'src/files.js', '// ADR-5 ADR-6 ADR-8\n');
  commitAll(dir, 'files');
  const r = check(dir);
  listNamesNot(r, ['ADR-5', 'ADR-6', 'ADR-8']);
  assert.deepEqual(grouped(r).unknown, ['INV-12', 'INV-13', 'INV-41', 'ADR-3', 'ADR-7', 'ADR-9'], show(r));
  namesEachOnce(r, [...BASE_IN_FORCE, 'ADR-7', 'ADR-9']);
});

test('#58 an accepted ADR is in force with its decides links: "ADR accepted, decides INV-13, INV-41"; with none, "ADR accepted, decides nothing"; the place is its heading text line', (t) => {
  const dir = world(t, (d) => write(d, 'specs/adr/0004-plain-csv.md', adr('accepted', 'ADR-4 choice decides:INV-13,INV-41', '# ADR-4: Plain CSV')));
  write(dir, 'src/csv.js', '// ADR-4 and ADR-3\n');
  commitAll(dir, 'csv');
  const r = check(dir);
  const a4 = inForce(r, 'ADR-4');
  assert.ok(a4.startsWith('in force ADR-4 cited (src/csv.js:1) · specs/adr/0004-plain-csv.md:5 · ADR accepted, decides INV-13, INV-41: '), show(r));
  assert.ok(a4.endsWith('ADR-4: Plain CSV'), show(r));
  const a3 = inForce(r, 'ADR-3');
  assert.ok(a3.startsWith(`in force ADR-3 cited (src/csv.js:1) · ${ADR3_FILE}:5 · ADR accepted, decides nothing: `), show(r));
  assert.ok(a3.endsWith(': # ADR-3: Signed links Context: a link must not be guessed.'), `the whole text of ADR-3:\n${show(r)}`);
});

test('#58 an accepted ADR whose text changed on the branch: changed by this change, flag "text changed, review open"; the adr-changed hint stays', (t) => {
  const dir = world(t);
  editFile(dir, ADR3_FILE, 'Context: a link must not be guessed.', 'Context: a link must never be guessed.');
  commitAll(dir, 'reworded');
  const r = check(dir);
  const line = inForce(r, 'ADR-3');
  assert.ok(line.startsWith(`in force ADR-3 changed by this change · ${ADR3_FILE}:5 · ADR accepted, decides nothing`), show(r));
  assert.match(line, / · text changed, review open[ :]/, show(r));
  assert.ok(hintCodes(r).includes('adr-changed'), `the adr-changed hint stays:\n${show(r)}`);
});

test('#58 another open request names an item by changes: or removes:: "open proposal: <name>/SP-n changes it" (or removes it); its own paragraphs and requirements are not in force', (t) => {
  const dir = world(t, (d) => {
    newRequest(d, 'pdf');
    appendSection(d, 'pdf', organized([R2]));
    write(d, 'requests/pdf/spec.md', doc([
      ['SP-1 rule serves:R2 changes:INV-13', 'An invoice MUST have at least two lines.'],
      ['SP-2 rule serves:R2 removes:INV-41', 'The export link never expires.'],
    ]));
  });
  write(dir, 'src/export.js', '// INV-13 INV-41 INV-12\n// pdf/SP-1 pdf/SP-2 pdf/R2\n');
  commitAll(dir, 'export');
  const r = check(dir);
  // The open proposal names the place of its text (#74).
  assert.match(inForce(r, 'INV-13'), / · open proposal: pdf\/SP-1 \(requests\/pdf\/spec\.md:3\) changes it[ :]/, show(r));
  assert.match(inForce(r, 'INV-41'), / · open proposal: pdf\/SP-2 \(requests\/pdf\/spec\.md:7\) removes it[ :]/, show(r));
  assert.doesNotMatch(inForce(r, 'INV-12'), /open proposal/, show(r));
  listNamesNot(r, ['pdf/SP-1', 'pdf/SP-2', 'pdf/R2', 'SP-1', 'SP-2', 'R2']);
  notProposed(r, 'pdf/');
  namesEachOnce(r, BASE_IN_FORCE);
});

test("#58 an archived request's text is not in force: its paragraphs and requirements, cited, are not in the list", (t) => {
  const dir = world(t, (d) => {
    signedRequest(d, 'old');
    write(d, 'requests/old/spec.md', doc([['SP-1 rule serves:R1', 'An export MUST hold one month.']]));
    archive(d, 'old');
  });
  write(dir, 'src/export.js', '// old/SP-1 old/R1\n');
  commitAll(dir, 'export');
  const r = check(dir);
  listNamesNot(r, ['old/SP-1', 'old/R1', 'SP-1', 'R1']);
  notProposed(r, 'old/');
  namesEachOnce(r, BASE_IN_FORCE);
});

test('#58 order of the shown items: the spec docs by path, each in file order, then the ADRs by number (ADR-4 before ADR-10)', (t) => {
  const dir = world(t, (d) => {
    writeConfig(d, [{ file: SPEC, prefix: 'INV' }, { file: 'specs/billing.md', prefix: 'BIL' }]);
    write(d, 'specs/billing.md', doc([['BIL-1 note', '# Billing'], ['BIL-2 rule', 'A bill MUST name its invoice.']]));
    write(d, 'specs/adr/0004-plain-csv.md', adr('accepted', 'ADR-4 choice decides:INV-13', '# ADR-4: Plain CSV'));
    write(d, 'specs/adr/0010-zip.md', adr('accepted', 'ADR-10 choice decides:INV-12', '# ADR-10: ZIP'));
  });
  write(dir, 'src/all.js', '// ADR-10 ADR-4 ADR-3 INV-41 INV-12 BIL-2\n');
  commitAll(dir, 'all');
  const r = check(dir);
  assert.deepEqual(shown(r).map(idOf), ['BIL-2', 'INV-12', 'INV-41', 'ADR-3', 'ADR-4', 'ADR-10'], show(r));
});

// =====================================================================
// The grouped line, and --full (LD-25, LD-52)

test('#58 the grouped line: exact counts, the IDs in list order, "none" for an empty group', (t) => {
  const dir = world(t);
  write(dir, 'src/export.js', '// INV-41\n');
  commitAll(dir, 'export');
  const r = check(dir);
  assert.equal(grouped(r).line, '3 further items in force: 3 with no known scope: INV-12, INV-13, ADR-3; 0 with a scope that does not match this change: none', show(r));
});

test('#58 every item in force cited: "0 further items in force: 0 with no known scope: none; 0 with a scope that does not match this change: none"', (t) => {
  const dir = world(t);
  write(dir, 'src/all.js', '// INV-12 INV-13 INV-41 ADR-3\n');
  commitAll(dir, 'all');
  const r = check(dir);
  assert.equal(grouped(r).line, '0 further items in force: 0 with no known scope: none; 0 with a scope that does not match this change: none', show(r));
  namesEachOnce(r, BASE_IN_FORCE);
});

test('#58 al check --full: each grouped item gets its own "in force <ID> grouped, no known scope · <file>:<line> · <what>: <text>" line after the grouped line; without --full, none', (t) => {
  const dir = world(t);
  write(dir, 'src/export.js', '// INV-41\n');
  commitAll(dir, 'export');
  const plain = check(dir);
  assert.deepEqual(out(plain).filter(isGroupedFull), [], `no grouped item line without --full:\n${show(plain)}`);
  const r = check(dir, '--full');
  const ls = out(r);
  const g = ls.findIndex((l) => GROUPED.test(l));
  assert.ok(g >= 0, `the grouped line:\n${show(r)}`);
  const full = ls.filter(isGroupedFull);
  assert.deepEqual(full.map(idOf), ['INV-12', 'INV-13', 'ADR-3'], show(r));
  for (const l of full) assert.ok(ls.indexOf(l) > g, `"${l}" comes after the grouped line:\n${show(r)}`);
  assert.ok(full.includes(`in force INV-12 grouped, no known scope · specs/invoices.md:7 · data: ${T12}`), show(r));
  assert.ok(full.includes(`in force INV-13 grouped, no known scope · specs/invoices.md:11 · rule: ${T13}`), show(r));
  const a3 = full.find((l) => l.startsWith('in force ADR-3 '));
  assert.ok(a3.startsWith(`in force ADR-3 grouped, no known scope · ${ADR3_FILE}:5 · ADR accepted, decides nothing: `), show(r));
  assert.ok(a3.endsWith(': # ADR-3: Signed links Context: a link must not be guessed.'), `the whole text of ADR-3:\n${show(r)}`);
  assert.equal(inForce(r, 'INV-41'), inForce(plain, 'INV-41'), 'the shown line is the same with --full');
  assert.equal(grouped(r).line, grouped(plain).line, 'the grouped line is the same with --full');
});

// =====================================================================
// Proposed by this change (LD-24, LD-48)

test("#58 the change's own request: its signed requirement and its change spec paragraphs (promise and design kinds) are proposed, never in force; an unsigned requirement is not listed, and the limits line names it", (t) => {
  const dir = world(t);
  signedRequest(dir, 'csv-export');
  editFile(dir, 'requests/csv-export/request.md', 'Signed off:', `${R2.block}\nSigned off:`);
  write(dir, 'requests/csv-export/spec.md', doc([
    ['SP-1 rule serves:R1', 'An export MUST hold one month.'],
    ['SP-2 approach serves:R1', 'Build the month reader first.'],
    ['SP-3 rationale serves:R1', 'People close their books by month.'],
    ['SP-4 component serves:R1', 'The month reader loads the invoices of a month.'],
    ['SP-5 note', '## The reader'],
  ]));
  commitAll(dir, 'csv-export');
  const r = check(dir);
  const md = 'requests/csv-export/request.md';
  assert.equal(proposed(r, 'csv-export/R1'),
    `proposed csv-export/R1 signed requirement · ${md}:${lineOf(dir, md, '### R1 Monthly CSV')} · signed in S1 (only al's record .assuredloop/records/requests/csv-export.yaml holds this): Monthly CSV: A user MUST be able to download one month as one CSV file.`, show(r));
  notProposed(r, 'csv-export/R2');
  assert.ok(oneLine(r, 'list limits: ').includes('csv-export/R2 is not signed, so it is not listed'), show(r));
  const cs = 'requests/csv-export/spec.md';
  assert.equal(proposed(r, 'csv-export/SP-1'), `proposed csv-export/SP-1 change spec · ${cs}:3 · rule: An export MUST hold one month.`, show(r));
  assert.equal(proposed(r, 'csv-export/SP-2'), `proposed csv-export/SP-2 change spec · ${cs}:7 · approach: Build the month reader first.`, show(r));
  assert.equal(proposed(r, 'csv-export/SP-4'), `proposed csv-export/SP-4 change spec · ${cs}:15 · component: The month reader loads the invoices of a month.`, show(r));
  notProposed(r, 'csv-export/SP-3');
  notProposed(r, 'csv-export/SP-5');
  listNamesNot(r, ['csv-export/R1', 'csv-export/R2', 'csv-export/SP-1', 'csv-export/SP-2', 'csv-export/SP-4', 'R1', 'SP-1']);
  namesEachOnce(r, BASE_IN_FORCE);
});

test('#58 a requirement changed after its sign-off is not signed at its current text: it is not listed as proposed', (t) => {
  const dir = world(t);
  signedRequest(dir, 'csv-export');
  editFile(dir, 'requests/csv-export/request.md', 'one CSV file.', 'one CSV file per month.');
  commitAll(dir, 'csv-export');
  const r = check(dir);
  notProposed(r, 'csv-export/R1');
  oneLine(r, 'list limits: ');
});

test("#58 an open request is the change's own when a commit message of base..HEAD names it as a whole word; another open request is not", (t) => {
  const dir = world(t, (d) => {
    signedRequest(d, 'csv-export');
    write(d, 'requests/csv-export/spec.md', doc([['SP-1 rule serves:R1', 'An export MUST hold one month.']]));
    signedRequest(d, 'pdf', [R2]);
    write(d, 'requests/pdf/spec.md', doc([['SP-1 rule serves:R2', 'A year MUST be one ZIP file.']]));
  });
  write(dir, 'src/writer.js', 'export const writer = 1;\n');
  commitAll(dir, 'csv-export: the CSV writer');
  const r = check(dir);
  assert.match(proposed(r, 'csv-export/R1'), /^proposed csv-export\/R1 signed requirement · requests\/csv-export\/request\.md:\d+ · signed in S1 \(only al's record \.assuredloop\/records\/requests\/csv-export\.yaml holds this\): Monthly CSV: /, show(r));
  assert.match(proposed(r, 'csv-export/SP-1'), /^proposed csv-export\/SP-1 change spec · requests\/csv-export\/spec\.md:3 · rule: /, show(r));
  notProposed(r, 'pdf/R2');
  notProposed(r, 'pdf/SP-1');
});

test("#58 no open request is the change's own: no proposed line, and the limits line says \"no open request is this change's own\"", (t) => {
  const dir = world(t, (d) => {
    signedRequest(d, 'csv-export');
    write(d, 'requests/csv-export/spec.md', doc([['SP-1 rule serves:R1', 'An export MUST hold one month.']]));
  });
  write(dir, 'src/writer.js', 'export const writer = 1;\n');
  commitAll(dir, 'the writer');
  const r = check(dir);
  assert.deepEqual(out(r).filter((l) => l.startsWith('proposed ')), [], show(r));
  assert.ok(oneLine(r, 'list limits: ').includes("no open request is this change's own"), show(r));
});

// --- the design line (LD-48)

const STREAM = 'docs/rfc/0018-streaming.md';
const BATCH = 'docs/rfc/0017-batch.md';
const STREAM_TEXT = '# Streaming exports\n\nThe export streams rows to the client.\n';

test('#58 LD-48: a design line for one document and a plain mention of another: only the first is listed, as a proposed design document', (t) => {
  const dir = world(t, (d) => {
    write(d, STREAM, STREAM_TEXT);
    write(d, BATCH, '# Batch exports\n\nThe export runs at night.\n');
  });
  const md = designRequest(dir, [`Design: ${STREAM}`, '', `For comparison, see ${BATCH}.`]);
  commitAll(dir, 'streaming');
  const r = check(dir);
  assert.equal(proposed(r, STREAM),
    `proposed ${STREAM} design document · design line ${md}:${lineOf(dir, md, `Design: ${STREAM}`)} · state unknown · no markers: supporting evidence`, show(r));
  notProposed(r, BATCH);
  assert.ok(!hintCodes(r).includes('design-doc'), show(r));
  namesEachOnce(r, BASE_IN_FORCE);
});

test('#58 LD-48: a design line may hold the path in backticks; a Design: line inside fenced code does not count', (t) => {
  const dir = world(t, (d) => {
    write(d, STREAM, STREAM_TEXT);
    write(d, BATCH, '# Batch exports\n');
  });
  const md = designRequest(dir, [`Design: \`${STREAM}\``, '', '```', `Design: ${BATCH}`, '```']);
  commitAll(dir, 'streaming');
  const r = check(dir);
  assert.ok(proposed(r, STREAM).startsWith(`proposed ${STREAM} design document · design line ${md}:${lineOf(dir, md, `Design: \`${STREAM}\``)} · `), show(r));
  notProposed(r, BATCH);
  assert.ok(!hintCodes(r).includes('design-doc'), show(r));
});

test('#58 LD-48: a design line removed on the branch removes its document from the list', (t) => {
  const dir = world(t, (d) => {
    write(d, STREAM, STREAM_TEXT);
    designRequest(d, [`Design: ${STREAM}`]);
  });
  const md = 'requests/streaming/request.md';
  write(dir, md, `${read(dir, md)}\nMore words.\n`);
  const control = check(dir);
  proposed(control, STREAM);
  editFile(dir, md, `Design: ${STREAM}\n`, '');
  commitAll(dir, 'no design line');
  const r = check(dir);
  notProposed(r, STREAM);
});

const unreadable = {
  missing: ['docs/rfc/0099-gone.md', 'which is missing', () => {}],
  folder: ['docs/rfc', 'which cannot be read', (d) => write(d, 'docs/rfc/0001-old.md', '# Old\n')],
  outside: ['../outside.md', 'which cannot be read', () => {}],
};
for (const [what, [path, reason, setup]] of Object.entries(unreadable)) {
  test(`#58 LD-48: a design line whose document cannot be used (${what}): "hint design-doc <file>:<line> ${path} the design line names ${path}, ${reason}", and it is not listed`, (t) => {
    const dir = world(t, setup);
    const md = designRequest(dir, [`Design: ${path}`]);
    commitAll(dir, 'streaming');
    const r = check(dir);
    const at = lineOf(dir, md, `Design: ${path}`);
    const want = `hint design-doc ${md}:${at} ${path} the design line names ${path}, ${reason}`;
    assert.ok(out(r).includes(want), `the line "${want}":\n${show(r)}`);
    notProposed(r, path);
  });
}

test('#58 LD-48: a document whose first line is "Status: draft" shows that state', (t) => {
  const dir = world(t, (d) => write(d, STREAM, `Status: draft\n\n${STREAM_TEXT}`));
  const md = designRequest(dir, [`Design: ${STREAM}`]);
  commitAll(dir, 'streaming');
  const r = check(dir);
  assert.equal(proposed(r, STREAM),
    `proposed ${STREAM} design document · design line ${md}:${lineOf(dir, md, `Design: ${STREAM}`)} · Status: draft · no markers: supporting evidence`, show(r));
});

test('#58 LD-48: a proposed design (a proposed ADR) that conflicts with the accepted ADR-3: both are shown; ADR-3 stays in force; the proposed ADR is never in force', (t) => {
  const dir = world(t);
  const file = 'specs/adr/0005-plain-links.md';
  write(dir, file, adr('proposed', 'ADR-5 choice supersedes:ADR-3 decides:INV-41', '# ADR-5: Plain links', [
    ['ADR-5-1 rationale', 'Links need no signature.'],
    ['ADR-5-2 choice', 'A link carries no token.'],
  ]));
  const md = designRequest(dir, [`Design: ${file}`]);
  write(dir, 'src/links.js', '// ADR-3: signed links, for now\n');
  commitAll(dir, 'plain links');
  const r = check(dir);
  assert.equal(proposed(r, file), `proposed ${file} design document · design line ${md}:${lineOf(dir, md, `Design: ${file}`)} · ADR-5 proposed · an ADR; 2 design paragraphs`, show(r));
  // Round 3: the ADR's promise and design paragraphs, its heading (a choice) included.
  assert.equal(proposed(r, 'ADR-5'), `proposed ADR-5 design paragraph · ${file}:5 · choice: # ADR-5: Plain links`, show(r));
  assert.equal(proposed(r, 'ADR-5-2'), `proposed ADR-5-2 design paragraph · ${file}:13 · choice: A link carries no token.`, show(r));
  notProposed(r, 'ADR-5-1');
  const a3 = inForce(r, 'ADR-3');
  assert.match(a3, /^in force ADR-3 cited \([^)]*src\/links\.js:1[^)]*\) · specs\/adr\/0003-signed-links\.md:5 · ADR accepted, /, show(r));
  listNamesNot(r, ['ADR-5', 'ADR-5-1', 'ADR-5-2']);
  namesEachOnce(r, BASE_IN_FORCE);
});

test('#58 LD-48: a design document with paragraph markers: its promise and design paragraphs are listed as "proposed <ID> design paragraph"; never in force', (t) => {
  const dir = world(t, (d) => write(d, STREAM, doc([
    ['STR-1 component', 'The stream writer sends one row at a time.'],
    ['STR-2 rule', 'A stream MUST end with a total row.'],
    ['STR-3 rationale', 'Large months do not fit in memory.'],
  ])));
  const md = designRequest(dir, [`Design: ${STREAM}`]);
  commitAll(dir, 'streaming');
  const r = check(dir);
  assert.match(proposed(r, STREAM),
    new RegExp(`^proposed ${STREAM} design document · design line ${md}:${lineOf(dir, md, `Design: ${STREAM}`)} · state unknown · \\d+ design paragraphs$`), show(r));
  assert.equal(proposed(r, 'STR-1'), `proposed STR-1 design paragraph · ${STREAM}:3 · component: The stream writer sends one row at a time.`, show(r));
  assert.equal(proposed(r, 'STR-2'), `proposed STR-2 design paragraph · ${STREAM}:7 · rule: A stream MUST end with a total row.`, show(r));
  notProposed(r, 'STR-3');
  listNamesNot(r, ['STR-1', 'STR-2', 'STR-3']);
});

test('#58 LD-48: a design document with no markers is supporting evidence: "no markers: supporting evidence", and no design paragraph line', (t) => {
  const dir = world(t, (d) => write(d, STREAM, STREAM_TEXT));
  designRequest(dir, [`Design: ${STREAM}`]);
  commitAll(dir, 'streaming');
  const r = check(dir);
  assert.ok(proposed(r, STREAM).endsWith(' · no markers: supporting evidence'), show(r));
  assert.deepEqual(out(r).filter((l) => / design paragraph · /.test(l)), [], show(r));
});

// A folder of saved work items outside the repo, removed when the test ends.
function itemsFolder(t) {
  const items = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-58-items-'));
  t.after(() => rmSync(items, { recursive: true, force: true }));
  return items;
}

for (const [what, design] of [['one path', STREAM], ['a list of paths', [STREAM, 'docs/rfc/0019-totals.md']]]) {
  test(`#58 LD-48: with --issues <folder>, the field design of a saved JSON work item (${what}) names the change's design; without --issues it is not read`, (t) => {
    const dir = world(t, (d) => {
      write(d, STREAM, STREAM_TEXT);
      write(d, 'docs/rfc/0019-totals.md', '# Totals\n\nEach stream ends with a total.\n');
    });
    newRequest(dir, 'streaming');
    editRecord(dir, 'streaming', (rec) => { rec.tasks = [{ id: 'T1', ref: 'PROJ-12' }]; });
    commitAll(dir, 'streaming');
    const items = itemsFolder(t);
    write(items, 'proj-12.json', `${JSON.stringify({ ref: 'PROJ-12', repository: 'PROJ', body: 'Stream the export.', design })}\n`);
    const r = check(dir, '--issues', items);
    for (const path of [design].flat()) {
      const line = proposed(r, path);
      assert.ok(line.startsWith(`proposed ${path} design document · design of work item PROJ-12 (`), show(r));
      assert.ok(line.includes('proj-12.json) · state unknown · no markers: supporting evidence'), show(r));
    }
    const without = check(dir);
    notProposed(without, STREAM);
  });
}

// =====================================================================
// Hints and exit (LD-41)

test('#58 LD-41: an ordinary change that cites an item gives no new hint (only the hint codes of today), and exit 0, also with --strict', (t) => {
  const dir = world(t);
  write(dir, 'src/export.js', 'export const ttl = 30;\n// INV-41: the link expires\n');
  commitAll(dir, 'the export link');
  const r = check(dir);
  assert.deepEqual(hintCodes(r), ['adr-links', 'no-claim', 'no-link'], `only the hints of today:\n${show(r)}`);
  assert.deepEqual(out(r).filter((l) => l.startsWith('not ok ')), [], show(r));
  const strict = al(dir, ['check', '--strict']);
  assert.equal(strict.code, 0, show(strict));
});

test('#58 LD-41: --strict still exits 1 for a not ok (an unsigned requirement), and the list is still there', (t) => {
  const dir = world(t);
  newRequest(dir, 'csv-export');
  appendSection(dir, 'csv-export', organized([R1]));
  ok(dir, ['index']);
  commitAll(dir, 'csv-export');
  const r = al(dir, ['check', '--strict']);
  assert.equal(r.code, 1, show(r));
  assert.match(r.stdout, /^not ok unsigned-requirement /m, show(r));
  grouped(r);
});

// =====================================================================
// Basis, limits, place in the output, the same output (LD-43, LD-29)

test('#58 LD-43: a "list basis:" line names the basis words; a "list limits:" line names al check --full and al context; the list comes after the findings and before the Read line', (t) => {
  const dir = world(t);
  write(dir, 'src/export.js', '// INV-41\n');
  commitAll(dir, 'export');
  const r = check(dir);
  const basis = oneLine(r, 'list basis: ');
  for (const word of ['cited', 'changed by this change']) assert.ok(basis.includes(word), `the basis line names "${word}":\n${show(r)}`);
  const limits = oneLine(r, 'list limits: ');
  assert.ok(limits.includes('al check --full'), show(r));
  assert.ok(limits.includes('al context'), show(r));
  const ls = out(r);
  const first = ls.findIndex(isList);
  const last = ls.length - 1 - [...ls].reverse().findIndex(isList);
  const read = ls.findIndex((l) => l.startsWith('Read '));
  assert.ok(first >= 0 && read > last, `the list comes before the Read line:\n${show(r)}`);
  const findingAfter = ls.slice(first).filter((l) => /^(hint|not ok|info) /.test(l));
  assert.deepEqual(findingAfter, [], `the findings come before the list:\n${show(r)}`);
});

// A change with an own request, a design document, cited and changed items.
function richChange(t) {
  const dir = world(t, (d) => write(d, STREAM, STREAM_TEXT));
  designRequest(dir, [`Design: ${STREAM}`]);
  appendSection(dir, 'streaming', organized([R1]));
  ok(dir, ['record', 'streaming', 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  write(dir, 'requests/streaming/spec.md', doc([['SP-1 rule serves:R1', 'An export MUST hold one month.']]));
  editFile(dir, SPEC, T13, 'An invoice MUST have at least two lines.');
  write(dir, 'src/export.js', '// INV-41 ADR-3\n');
  commitAll(dir, 'streaming');
  write(dir, 'src/untracked.js', '// INV-12\n');
  return dir;
}

test('#58 R1: the same change, project state and options give the same output, byte for byte', (t) => {
  const dir = richChange(t);
  const a = check(dir);
  const b = check(dir);
  grouped(a);
  // #78: the first run writes the records; the second writes nothing.
  assert.equal(settled(b.stdout), settled(a.stdout), `two runs differ:\n${show(a)}\n${show(b)}`);
  const fa = check(dir, '--full');
  const fb = check(dir, '--full');
  assert.equal(fb.stdout, fa.stdout, `two --full runs differ:\n${show(fa)}\n${show(fb)}`);
});

test('#58 LD-29: a search index built before (al search --level 1) does not change the list', (t) => {
  const dir = richChange(t);
  const before = check(dir);
  grouped(before);
  ok(dir, ['search', '--level', '1', 'invoice', 'export']);
  const after = check(dir);
  assert.deepEqual(listLines(after), listLines(before), `the list changed after al search:\n${show(before)}\n${show(after)}`);
});

// =====================================================================
// Round 3: fixes from the review

test("#58 round 3: an ADR's text is its whole text (the heading and every paragraph below it, no status line, no marker): in the in force line, with --full, and in al context", (t) => {
  const file = 'specs/adr/0004-plain-csv.md';
  const whole = '# ADR-4: Plain CSV We write CSV with a header row. Spreadsheets read CSV without a plugin.';
  const dir = world(t, (d) => write(d, file, adr('accepted', 'ADR-4 choice decides:INV-13', '# ADR-4: Plain CSV', [
    ['ADR-4-1 choice', 'We write CSV\nwith a header row.'],
    ['ADR-4-2 rationale', 'Spreadsheets read CSV without a plugin.'],
  ])));
  write(dir, 'src/csv.js', '// ADR-4\n');
  commitAll(dir, 'csv');
  const r = check(dir);
  assert.equal(inForce(r, 'ADR-4'), `in force ADR-4 cited (src/csv.js:1) · ${file}:5 · ADR accepted, decides INV-13: ${whole}`, show(r));
  const full = check(dir, '--full');
  const a3 = out(full).find((l) => l.startsWith('in force ADR-3 grouped, '));
  assert.ok(a3?.endsWith(': # ADR-3: Signed links Context: a link must not be guessed.'), `the whole text of a grouped ADR with --full:\n${show(full)}`);
  const c = ok(dir, ['context', 'ADR-4']);
  const adrLine = c.stdout.split('\n').find((l) => l.startsWith('ADR       '));
  assert.equal(adrLine, `ADR       ADR-4 · accepted · ${file}:5: ${whole}`, show(c));
});

for (const [what, fenced] of [['a plain token line', 'files:src/**'], ['a marker-like line', '<!-- INV-9 rule files:src/** -->']]) {
  test(`#58 round 3: files: inside fenced code in an accepted ADR is text (${what}): changing it gives adr-changed, "changed by this change" and "text changed, review open"`, (t) => {
    const dir = world(t, (d) => write(d, ADR3_FILE, adr('accepted', 'ADR-3 choice', '# ADR-3: Signed links', [
      ['ADR-3-1 rationale', 'Context: a link must not be guessed.'],
      ['ADR-3-2 example', `A scope is written like this:\n\`\`\`\n${fenced}\n\`\`\``],
    ])));
    editFile(dir, ADR3_FILE, fenced, fenced.replace('files:src/**', 'files:lib/**'));
    commitAll(dir, 'the example');
    const r = check(dir);
    assert.ok(hintCodes(r).includes('adr-changed'), `the adr-changed hint:\n${show(r)}`);
    const line = inForce(r, 'ADR-3');
    assert.ok(line.startsWith(`in force ADR-3 changed by this change · ${ADR3_FILE}:5 · ADR accepted, decides nothing · text changed, review open: `), show(r));
    assert.ok(line.includes('files:lib/**'), `the fenced token is in the text:\n${show(r)}`);
  });
}

// =====================================================================
// Round 4: a design path with a space, the context hint, a C-quoted path

const SPACED = 'docs/My Design.md';
for (const [what, line] of [['plain', `Design: ${SPACED}`], ['in backticks', `Design: \`${SPACED}\``]]) {
  test(`#58 round 4: a design line whose path holds a space (${what}) names that document: "proposed docs/My Design.md design document · ..."; no design-doc hint`, (t) => {
    const dir = world(t, (d) => write(d, SPACED, '# My design\n\nRows stream to the client.\n'));
    const md = designRequest(dir, [line]);
    commitAll(dir, 'streaming');
    const r = check(dir);
    assert.equal(proposed(r, SPACED), `proposed ${SPACED} design document · design line ${md}:${lineOf(dir, md, line)} · state unknown · no markers: supporting evidence`, show(r));
    assert.ok(!hintCodes(r).includes('design-doc'), show(r));
  });
}

test('#58 round 4: a design line whose rest names no file ("docs/a.md and docs/b.md"): "hint design-doc ... which is missing", and neither document is listed', (t) => {
  const dir = world(t, (d) => {
    write(d, 'docs/a.md', '# A\n');
    write(d, 'docs/b.md', '# B\n');
  });
  const rest = 'docs/a.md and docs/b.md';
  const md = designRequest(dir, [`Design: ${rest}`]);
  commitAll(dir, 'streaming');
  const r = check(dir);
  const want = `hint design-doc ${md}:${lineOf(dir, md, `Design: ${rest}`)} ${rest} the design line names ${rest}, which is missing`;
  assert.ok(out(r).includes(want), `the line "${want}":\n${show(r)}`);
  notProposed(r, 'docs/a.md');
  notProposed(r, 'docs/b.md');
});

test("#58 round 4: a work item's design field whose path holds a space names that document", (t) => {
  const dir = world(t, (d) => write(d, SPACED, '# My design\n\nRows stream to the client.\n'));
  newRequest(dir, 'streaming');
  editRecord(dir, 'streaming', (rec) => { rec.tasks = [{ id: 'T1', ref: 'PROJ-12' }]; });
  commitAll(dir, 'streaming');
  const items = itemsFolder(t);
  write(items, 'proj-12.json', `${JSON.stringify({ ref: 'PROJ-12', repository: 'PROJ', body: 'Stream the export.', design: SPACED })}\n`);
  const r = check(dir, '--issues', items);
  assert.ok(proposed(r, SPACED).startsWith(`proposed ${SPACED} design document · design of work item PROJ-12 (`), show(r));
  assert.ok(!hintCodes(r).includes('design-doc'), show(r));
});

test('#58 round 4: in a spec repo the limits line keeps "al context <ID> one item"', (t) => {
  const dir = world(t);
  write(dir, 'src/export.js', '// INV-41\n');
  commitAll(dir, 'export');
  const limits = oneLine(check(dir), 'list limits: ');
  assert.ok(limits.includes('al context <ID> one item'), limits);
  assert.ok(!limits.includes('in the central repo shows one item'), limits);
});

test('#58 round 4: a cited place whose path git writes C-quoted (an emoji and a double quote) shows the real file name', (t) => {
  const file = 'src/😀"quoted.js';
  const dir = world(t, (d) => write(d, file, 'export const q = 1;\n'));
  write(dir, file, 'export const q = 1;\n// INV-41: the link expires\n');
  commitAll(dir, 'quoted');
  const r = check(dir);
  assert.equal(inForce(r, 'INV-41'), `in force INV-41 cited (${file}:2) · specs/invoices.md:15 · rule: ${T41}`, show(r));
});
