// #82: a signed requirement that replaces a requirement of another request
// (light-design/R1, assuredloop-v4/R9; spec LD-68 of requests/light-design).
// Written from the requirement and the public interface only. Nothing here
// reads src/ or bin/.
//
// - The link. A requirement's marker in request.md may name a requirement of
//   another request that it replaces: `<!-- R5 replaces:old/R5 -->`. A marker
//   may hold several `replaces:` tokens, each a comma list. The marker is
//   outside the signed text, so adding the link changes no signed hash. A
//   target is `<request>/R<n>` of another request (open or archived) that
//   has that requirement in its request.md.
// - "<new> replaces <old>" HOLDS when the new requirement's current version
//   is signed (the sign-off is valid and checked). It is NOT KNOWN when the
//   only sign-off that covers it has an original file that is not checked
//   (`originals: {outside: ...}` with no place set). Else it is PROPOSED, and
//   the old one stays as it is.
// - Places are `<file>:<line>`; for a requirement, its `### R<n>` heading.
// 1. `al context <old>`: the Requirement line gets ` · replaced` (holds) or
//    ` · replaced: not known` right after the sign state; none when
//    proposed. After the Signed line, one line for each requirement that
//    replaces it:
//      Replaced  by new/R5 (<place>), version 1: <sign state>; <words> (only al's record .assuredloop/records/requests/new.yaml holds the version and the sign-off state)
//    <words>: `the replacement holds`, `a proposed replacement: it holds
//    once this version is signed`, `not known whether the replacement holds`.
// 2. `al context <new>`: after the Signed line, for each link:
//      Replaces  old/R5 (<place>), last signed version 1 (only al's record .assuredloop/records/requests/old.yaml holds this)
//      Replaces  old/R5 (<place>), never signed
//      Replaces  x/R9: not found
//    `al context spike/Q1`, a question whose marker has replaces:old/R5:
//      Replaces  old/R5: on a question, so no replacement
// 3. The list of `al check`: an own request's signed requirement whose
//    replacement holds is shown as
//      replaced old/R5 signed requirement · <place> · replaced by new/R5 (<place>), version 1: signed in S1 (only al's record .assuredloop/records/requests/new.yaml holds this): <new title>: <new text>
//    An own signed requirement that replaces another gets ` · replaces
//    old/R5 (<place>)` right after its `signed in S1 (only al's record ...
//    holds this)`. The `list basis:` line explains `replaced`. Proposed or
//    not known: listed as today; not known: `list limits:` says
//    `whether new/R5 replaces old/R5: not known: the original file of its
//    sign-off is not checked`.
// 4. Hint `serves-replaced` on each specs/ paragraph that serves <old> and
//    not <new>, for each holding replacement: where = the paragraph's text
//    place, id = its ID: `INV-39 serves old/R5, which new/R5 replaces: check
//    that it still holds, then serve new/R5`. Cleared when the paragraph
//    serves new/R5 too or instead, or no longer serves old/R5. Not known: no
//    hint; Not known says `whether INV-39 serves a replaced requirement: the
//    sign-off of new/R5 is not checked`. Proposed: no hint. A change-spec
//    paragraph never gets it. Never `not ok`; no exit code changes.
// 5. Hint `replaces-link`, where = the marker line, id = the new requirement:
//    `replaces:x/R9 names no requirement of another request` (also a Q<n> or
//    a spec ID); `replaces:new/R1 names a requirement of its own request: a
//    new version there is a change of its text, not a replaces: link` (also a
//    bare `replaces:R1`); `new/R5 replaces old/R5, and so does other/R2: keep
//    one replaces: link` on each marker. Only a requirement replaces a
//    requirement: a `replaces:` token on a question's marker (for example
//    `<!-- Q1 replaces:old/R5 -->` of a signed spike/Q1) is a mistake, never
//    a replacement: `hint replaces-link <marker place> spike/Q1
//    replaces:old/R5 is on a question: only a requirement R<n> replaces a
//    requirement`; old/R5 gets no Replaced line and no status segment, the
//    list shows it as today, and INV-39 gets no serves-replaced hint.
// 6. `al context <old request> --audit`: for each of its replaced
//    requirements,
//      Replaced  R5 (<place of old/R5>) by new/R5 (<place>), version 1: <sign state>; <words> (only al's record .assuredloop/records/requests/new.yaml holds the version and the sign-off state)
//    (the same words as 1).
//
// A hint line of `al check` is `hint <code> <where> <id> <message>`,
// optionally followed by ` · places: ...`. No model and no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  al, appendSection, baseProject, commitAll, doc, editFile, editRecord, git, move, organized, read, req, show, write,
  writeConfig,
} from './helpers/project.js';

const SPEC = 'specs/invoices.md';
const OLD_ARCH = 'requests/archive/old/request.md';
const OLD_OPEN = 'requests/old/request.md';
const NEW_MD = 'requests/new/request.md';
const OTHER_MD = 'requests/other/request.md';
const OLD_REC = '.assuredloop/records/requests/old.yaml';
const NEW_REC = '.assuredloop/records/requests/new.yaml';

const OLD_R5 = req('R5', 'Monthly CSV', 'A user MUST be able to download one month as one CSV file.');
const OLD_HEAD = '### R5 Monthly CSV';
const OLD_ONE_LINE = 'Monthly CSV: A user MUST be able to download one month as one CSV file.';
const NEW_TITLE = 'Monthly CSV with header';
const NEW_HEAD = `### R5 ${NEW_TITLE}`;
const NEW_BODY = 'A user MUST be able to download one month as one CSV file with a header line.';
const NEW_ONE_LINE = `${NEW_TITLE}: ${NEW_BODY}`;
const NEW_R1 = { block: '<!-- R1 -->\n\n### R1 Header names\nThe header line MUST name each column.\n' };
const OTHER_R2 = { block: '<!-- R2 replaces:old/R5 -->\n\n### R2 Yearly CSV\nA user MUST be able to download one year as one CSV file.\n' };
const SPIKE_Q1 = { block: '<!-- Q1 -->\n\n### Q1 Signed links\nCan a signed link replace the token table?\n' };
const SPIKE_MD = 'requests/spike/request.md';
const SPIKE_Q1_HEAD = '### Q1 Header line';
const SPIKE_Q1_BODY = 'Does a monthly CSV file need a header line?';
const T39 = 'An export MUST be one CSV file per month.';
const SIGN = ['--source', 'owner', '--words', 'Yes, sign it', '--yes'];

const HOLDS = 'the replacement holds';
const PROPOSED = 'a proposed replacement: it holds once this version is signed';
const UNKNOWN = 'not known whether the replacement holds';
const NOT_CHECKED = 'not known: S1 covers it, but its original file is not checked';
const NEW_NOTE = `(only al's record ${NEW_REC} holds the version and the sign-off state)`;

// The new requirement R5 with this marker (the text after `<!-- `).
const newR5 = (marker) => ({ block: `<!-- ${marker} -->\n\n${NEW_HEAD}\n${NEW_BODY}\n` });

// --- fixtures

// Two workers for originals kept outside: one with the place set, one with none.
function workers(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-82-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const place = join(root, 'place');
  mkdirSync(place);
  const worker = (name, places) => {
    const xdg = join(root, name);
    mkdirSync(join(xdg, 'assuredloop'), { recursive: true });
    if (places) writeFileSync(join(xdg, 'assuredloop', 'places.yaml'), places);
    return { XDG_CONFIG_HOME: xdg, HOME: xdg };
  };
  return { withPlace: worker('with-place', `assuredloop: ${JSON.stringify(place)}\n`), noPlace: worker('no-place') };
}

function run(dir, args, env = {}, input = '') {
  const r = al(dir, args, { env, input });
  assert.equal(r.code, 0, show(r));
  return r;
}

// Concludes a request by hand: the folder moves to requests/archive/.
function archive(dir, name) {
  editFile(dir, `requests/${name}/request.md`, 'Status: open', 'Status: concluded');
  move(dir, `requests/${name}`, `requests/archive/${name}`);
  editRecord(dir, name, (rec) => { rec.status = 'concluded'; });
}

// On main: the request old with R5 (signed in S1 unless oldSigned is false),
// INV-39 in specs/ that serves old/R5, and with spike a request spike whose
// Q1 is signed; old archived unless archived is false. Then on the branch
// feature: the request new with R5 under `marker` (and R1 with newR1), signed
// in S1 unless sign is false; with other, the request other whose R2 also
// replaces old/R5, signed; with touchOld, a new file in requests/old/, so old
// is an own request of the change. With outside, the branch sets
// `originals: {outside: assuredloop}`, the new request is made by a worker
// with the place, and w.env is a worker with no place. With question, the
// branch also adds the request spike whose Q1 has that marker, signed.
function world(t, {
  marker = 'R5 replaces:old/R5', archived = true, oldSigned = true, sign = true, touchOld = false, outside = false,
  newR1 = false, other = false, spike = false, question = null,
} = {}) {
  const ws = outside ? workers(t) : { withPlace: {}, noPlace: {} };
  const dir = baseProject(t, { branch: null });
  run(dir, ['new', 'old', '--from', '-'], {}, 'The owner wants monthly CSV files.\n');
  appendSection(dir, 'old', organized([OLD_R5]));
  if (oldSigned) run(dir, ['record', 'old', 'signoff', ...SIGN]);
  if (spike) {
    run(dir, ['new', 'spike', '--from', '-'], {}, 'The owner asks about signed links.\n');
    appendSection(dir, 'spike', organized([SPIKE_Q1]));
    run(dir, ['record', 'spike', 'signoff', ...SIGN]);
  }
  write(dir, SPEC, `${read(dir, SPEC)}\n${doc([['INV-39 rule serves:old/R5', T39]])}`);
  run(dir, ['index']);
  if (archived) {
    archive(dir, 'old');
    run(dir, ['index']);
  }
  commitAll(dir, 'old');
  git(dir, 'checkout', '-q', '-b', 'feature');
  const env = ws.withPlace;
  if (outside) writeConfig(dir, [{ file: SPEC, prefix: 'INV' }], { originals: { outside: 'assuredloop' } });
  if (touchOld) write(dir, 'requests/old/notes.md', 'A note on the old request.\n');
  run(dir, ['new', 'new', '--from', '-'], env, 'The owner wants a header line.\n');
  appendSection(dir, 'new', organized(newR1 ? [NEW_R1, newR5(marker)] : [newR5(marker)]));
  run(dir, ['index'], env);
  if (sign) run(dir, ['record', 'new', 'signoff', ...SIGN], env);
  if (other) {
    run(dir, ['new', 'other', '--from', '-'], env, 'The owner wants yearly CSV files.\n');
    appendSection(dir, 'other', organized([OTHER_R2]));
    run(dir, ['index'], env);
    run(dir, ['record', 'other', 'signoff', ...SIGN], env);
  }
  if (question) {
    run(dir, ['new', 'spike', '--from', '-'], env, 'The owner asks about monthly CSV files.\n');
    appendSection(dir, 'spike', organized([{ block: `<!-- ${question} -->\n\n${SPIKE_Q1_HEAD}\n${SPIKE_Q1_BODY}\n` }]));
    run(dir, ['index'], env);
    run(dir, ['record', 'spike', 'signoff', ...SIGN], env);
  }
  run(dir, ['index'], env);
  return { dir, env: ws.noPlace, oldMd: archived ? OLD_ARCH : OLD_OPEN };
}

// The 1-based line of the exact line `text` in a file.
function lineOf(dir, file, text) {
  const at = read(dir, file).split('\n').indexOf(text);
  assert.ok(at >= 0, `${file} has the line ${JSON.stringify(text)}`);
  return at + 1;
}
const place = (dir, file, text) => `${file}:${lineOf(dir, file, text)}`;
const oldPlace = (w) => place(w.dir, w.oldMd, OLD_HEAD);
const newPlace = (w) => place(w.dir, NEW_MD, NEW_HEAD);
const markerPlace = (w, file, marker) => place(w.dir, file, `<!-- ${marker} -->`);

// --- reading the output

const outLines = (r) => r.stdout.split('\n');
const context = (w, ...args) => run(w.dir, ['context', ...args], w.env);
const check = (w, ...args) => run(w.dir, ['check', ...args], w.env);
function labelled(r, label) {
  const found = outLines(r).filter((l) => l.startsWith(label));
  assert.equal(found.length, 1, `one line that starts with "${label}":\n${show(r)}`);
  return found[0];
}
const allLabelled = (r, label) => outLines(r).filter((l) => l.startsWith(label));
// The line right after the one line that starts with the label.
function after(r, label) {
  const ls = outLines(r);
  const at = ls.findIndex((l) => l.startsWith(label));
  assert.ok(at >= 0, `a line that starts with "${label}":\n${show(r)}`);
  return ls[at + 1];
}
const notOkLines = (r) => outLines(r).filter((l) => l.startsWith('not ok '));
const hintLines = (r, code) => outLines(r).filter((l) => l.startsWith(`hint ${code} `));
// The hint lines that are exactly `hint <code> <where> <id> <message>`, with or without a places tail.
function hintsOf(r, code, where, id, message) {
  const want = `hint ${code} ${where} ${id} ${message}`;
  return outLines(r).filter((l) => l === want || l.startsWith(`${want} · places: `));
}
function oneHint(r, code, where, id, message) {
  const found = hintsOf(r, code, where, id, message);
  assert.equal(found.length, 1, `one line "hint ${code} ${where} ${id} ${message}":\n${show(r)}`);
  return found[0];
}
const notKnownLine = (r) => outLines(r).find((l) => l.startsWith('Not known')) ?? '';
const listLine = (r, prefix) => outLines(r).filter((l) => l.startsWith(prefix));

// The exit codes of al check: 0 plain; --strict 1 exactly when a not ok prints.
function exitCodesAsBefore(w) {
  const plain = al(w.dir, ['check'], { env: w.env });
  assert.equal(plain.code, 0, show(plain));
  const strict = al(w.dir, ['check', '--strict'], { env: w.env });
  assert.equal(strict.code, notOkLines(strict).length ? 1 : 0, show(strict));
  return { plain, strict };
}

const reqLine = (w, id, state, segment, file, head, oneLine) =>
  `Requirement ${id} version 1 · ${state}${segment} · ${place(w.dir, file, head)}: ${oneLine}`;
const replacedLine = (w, version, state, words, id = 'new/R5', at = newPlace(w), note = NEW_NOTE) =>
  `Replaced  by ${id} (${at}), version ${version}: ${state}; ${words} ${note}`;

// --- 1. al context <old>

test('#82 al context old/R5, the new requirement signed: "· replaced" after the sign state, and a Replaced line right after Signed', (t) => {
  const w = world(t);
  const r = context(w, 'old/R5');
  assert.equal(labelled(r, 'Requirement '), reqLine(w, 'old/R5', 'signed in S1', ' · replaced', OLD_ARCH, OLD_HEAD, OLD_ONE_LINE), show(r));
  assert.equal(after(r, 'Signed    '), replacedLine(w, 1, 'signed in S1', HOLDS), show(r));
  assert.equal(allLabelled(r, 'Replaced  ').length, 1, show(r));
});

test('#82 al context old/R5 before and after the sign-off of new/R5: proposed first (no segment), then it holds', (t) => {
  const w = world(t, { sign: false });
  const before = context(w, 'old/R5');
  assert.equal(labelled(before, 'Requirement '), reqLine(w, 'old/R5', 'signed in S1', '', OLD_ARCH, OLD_HEAD, OLD_ONE_LINE), show(before));
  assert.equal(after(before, 'Signed    '), replacedLine(w, 1, 'not signed', PROPOSED), show(before));
  run(w.dir, ['record', 'new', 'signoff', ...SIGN]);
  run(w.dir, ['index']);
  const now = context(w, 'old/R5');
  assert.equal(labelled(now, 'Requirement '), reqLine(w, 'old/R5', 'signed in S1', ' · replaced', OLD_ARCH, OLD_HEAD, OLD_ONE_LINE), show(now));
  assert.equal(after(now, 'Signed    '), replacedLine(w, 1, 'signed in S1', HOLDS), show(now));
});

test('#82 al context old/R5 after the text of new/R5 changed since S1: version 2 is a proposed replacement, and old/R5 is not replaced', (t) => {
  const w = world(t);
  editFile(w.dir, NEW_MD, 'with a header line.', 'with a header line and a footer line.');
  run(w.dir, ['index']);
  const r = context(w, 'old/R5');
  assert.equal(labelled(r, 'Requirement '), reqLine(w, 'old/R5', 'signed in S1', '', OLD_ARCH, OLD_HEAD, OLD_ONE_LINE), show(r));
  assert.equal(after(r, 'Signed    '), replacedLine(w, 2, 'changed since S1', PROPOSED), show(r));
});

test('#82 al context old/R5 when the sign-off of new/R5 has an original file that is not checked: "replaced: not known", and the Replaced line says not known', (t) => {
  const w = world(t, { outside: true });
  const nr = context(w, 'new/R5');
  assert.ok(labelled(nr, 'Requirement ').startsWith(`Requirement new/R5 version 1 · ${NOT_CHECKED} · `), `the fixture: new/R5 is not known:\n${show(nr)}`);
  const r = context(w, 'old/R5');
  assert.equal(labelled(r, 'Requirement '),
    reqLine(w, 'old/R5', 'signed in S1', ' · replaced: not known', OLD_ARCH, OLD_HEAD, OLD_ONE_LINE), show(r));
  assert.equal(after(r, 'Signed    '), replacedLine(w, 1, NOT_CHECKED, UNKNOWN), show(r));
});

test('#82 control: al context old/R5 with no replaces: link: no Replaced line, and the Requirement line as today', (t) => {
  const w = world(t, { marker: 'R5' });
  const r = context(w, 'old/R5');
  assert.equal(labelled(r, 'Requirement '), reqLine(w, 'old/R5', 'signed in S1', '', OLD_ARCH, OLD_HEAD, OLD_ONE_LINE), show(r));
  assert.deepEqual(allLabelled(r, 'Replaced  '), [], show(r));
  assert.deepEqual(allLabelled(context(w, 'new/R5'), 'Replaces  '), []);
});

// --- 2. al context <new>

test('#82 al context new/R5: a Replaces line right after Signed names old/R5, its place and its last signed version', (t) => {
  const w = world(t);
  const r = context(w, 'new/R5');
  assert.equal(after(r, 'Signed    '),
    `Replaces  old/R5 (${oldPlace(w)}), last signed version 1 (only al's record ${OLD_REC} holds this)`, show(r));
  assert.equal(allLabelled(r, 'Replaces  ').length, 1, show(r));
});

test('#82 al context new/R5 not signed yet: the Replaces line is the same', (t) => {
  const w = world(t, { sign: false });
  const r = context(w, 'new/R5');
  assert.equal(after(r, 'Signed    '),
    `Replaces  old/R5 (${oldPlace(w)}), last signed version 1 (only al's record ${OLD_REC} holds this)`, show(r));
});

test('#82 al context new/R5 that replaces a requirement that was never signed: "Replaces  old/R5 (<place>), never signed"', (t) => {
  const w = world(t, { archived: false, oldSigned: false });
  const old = context(w, 'old/R5');
  assert.equal(labelled(old, 'Signed    '), 'Signed    never signed', `the fixture: old/R5 was never signed:\n${show(old)}`);
  const r = context(w, 'new/R5');
  assert.equal(after(r, 'Signed    '), `Replaces  old/R5 (${place(w.dir, OLD_OPEN, OLD_HEAD)}), never signed`, show(r));
});

test('#82 al context new/R5 with replaces:x/R9: "Replaces  x/R9: not found"', (t) => {
  const w = world(t, { marker: 'R5 replaces:x/R9' });
  const r = context(w, 'new/R5');
  assert.equal(after(r, 'Signed    '), 'Replaces  x/R9: not found', show(r));
});

// --- the link is outside the signed text

test('#82 adding replaces:old/R5 to the marker of a signed requirement keeps its sign-off valid: new/R5 still says "signed in S1"', (t) => {
  const w = world(t, { marker: 'R5' });
  editFile(w.dir, NEW_MD, '<!-- R5 -->', '<!-- R5 replaces:old/R5 -->');
  run(w.dir, ['index']);
  const r = context(w, 'new/R5');
  assert.ok(labelled(r, 'Requirement ').startsWith('Requirement new/R5 version 1 · signed in S1 · '), show(r));
  const c = check(w);
  assert.deepEqual(notOkLines(c).filter((l) => l.includes('new/R5')), [], show(c));
});

test('#82 after replaces:old/R5 is added to the marker of the signed new/R5, the replacement holds at once', (t) => {
  const w = world(t, { marker: 'R5' });
  editFile(w.dir, NEW_MD, '<!-- R5 -->', '<!-- R5 replaces:old/R5 -->');
  run(w.dir, ['index']);
  const r = context(w, 'old/R5');
  assert.equal(labelled(r, 'Requirement '), reqLine(w, 'old/R5', 'signed in S1', ' · replaced', OLD_ARCH, OLD_HEAD, OLD_ONE_LINE), show(r));
  assert.equal(after(r, 'Signed    '), replacedLine(w, 1, 'signed in S1', HOLDS), show(r));
});

// --- 3. the list of al check

test('#82 al check, the list: an own signed requirement whose replacement holds is shown as "replaced old/R5 ..." with the new one, not as proposed', (t) => {
  const w = world(t, { archived: false, touchOld: true });
  const r = check(w);
  const want = `replaced old/R5 signed requirement · ${place(w.dir, OLD_OPEN, OLD_HEAD)} · replaced by new/R5 (${newPlace(w)}), version 1: signed in S1`
    + ` (only al's record ${NEW_REC} holds this): ${NEW_ONE_LINE}`;
  assert.deepEqual(listLine(r, 'replaced old/R5 '), [want], show(r));
  assert.deepEqual(listLine(r, 'proposed old/R5 '), [], show(r));
});

test('#82 al check, the list: own new/R5 that replaces old/R5 names it after its sign state', (t) => {
  const w = world(t);
  const r = check(w);
  const want = `proposed new/R5 signed requirement · ${newPlace(w)} · signed in S1 (only al's record ${NEW_REC} holds this)`
    + ` · replaces old/R5 (${place(w.dir, OLD_ARCH, OLD_HEAD)}): ${NEW_ONE_LINE}`;
  assert.deepEqual(listLine(r, 'proposed new/R5 '), [want], show(r));
});

test('#82 al check, the list with old/R5 open and own: new/R5 names old/R5 at its place in requests/old/', (t) => {
  const w = world(t, { archived: false, touchOld: true });
  const r = check(w);
  const want = `proposed new/R5 signed requirement · ${newPlace(w)} · signed in S1 (only al's record ${NEW_REC} holds this)`
    + ` · replaces old/R5 (${place(w.dir, OLD_OPEN, OLD_HEAD)}): ${NEW_ONE_LINE}`;
  assert.deepEqual(listLine(r, 'proposed new/R5 '), [want], show(r));
});

test('#82 al check, the list basis says what "replaced" means', (t) => {
  const w = world(t, { archived: false, touchOld: true });
  const r = check(w);
  const basis = labelled(r, 'list basis: ');
  assert.ok(basis.includes('replaced = a signed requirement of another request replaces it; the line shows that one'), show(r));
});

test('#82 control: al check, the list with a proposed replacement (new/R5 not signed): old/R5 is listed as today, and no "replaced" line', (t) => {
  const w = world(t, { archived: false, touchOld: true, sign: false });
  const r = check(w);
  assert.deepEqual(listLine(r, 'proposed old/R5 '),
    [`proposed old/R5 signed requirement · ${place(w.dir, OLD_OPEN, OLD_HEAD)} · signed in S1 (only al's record ${OLD_REC} holds this): ${OLD_ONE_LINE}`], show(r));
  assert.deepEqual(listLine(r, 'replaced '), [], show(r));
});

test('#82 al check, the list when it is not known whether new/R5 replaces old/R5: old/R5 is listed as today, and the limits say why', (t) => {
  const w = world(t, { archived: false, touchOld: true, outside: true });
  const r = check(w);
  assert.deepEqual(listLine(r, 'proposed old/R5 '),
    [`proposed old/R5 signed requirement · ${place(w.dir, OLD_OPEN, OLD_HEAD)} · signed in S1 (only al's record ${OLD_REC} holds this): ${OLD_ONE_LINE}`], show(r));
  assert.deepEqual(listLine(r, 'replaced '), [], show(r));
  assert.ok(labelled(r, 'list limits: ').includes('whether new/R5 replaces old/R5: not known: the original file of its sign-off is not checked'), show(r));
});

// --- 4. the hint serves-replaced

const SERVES_MSG = 'INV-39 serves old/R5, which new/R5 replaces: check that it still holds, then serve new/R5';
const at39 = (w) => place(w.dir, SPEC, T39);

test('#82 al check: INV-39 serves old/R5, which new/R5 replaces: one hint serves-replaced at the text of INV-39; a hint, no exit code changes', (t) => {
  const w = world(t);
  const { plain, strict } = exitCodesAsBefore(w);
  oneHint(plain, 'serves-replaced', at39(w), 'INV-39', SERVES_MSG);
  assert.equal(hintLines(plain, 'serves-replaced').length, 1, show(plain));
  assert.deepEqual(notOkLines(plain), [], `no not ok in this fixture:\n${show(plain)}`);
  assert.equal(strict.code, 0, show(strict));
  oneHint(strict, 'serves-replaced', at39(w), 'INV-39', SERVES_MSG);
});

test('#82 control: al check with a proposed replacement (new/R5 not signed): no hint serves-replaced', (t) => {
  const w = world(t, { sign: false });
  const r = check(w);
  assert.deepEqual(hintLines(r, 'serves-replaced'), [], show(r));
});

test('#82 control: al check with no replaces: link: no hint serves-replaced', (t) => {
  const w = world(t, { marker: 'R5' });
  const r = check(w);
  assert.deepEqual(hintLines(r, 'serves-replaced'), [], show(r));
});

for (const [what, marker] of [
  ['serves new/R5 too', 'INV-39 rule serves:old/R5,new/R5'],
  ['serves new/R5 instead', 'INV-39 rule serves:new/R5'],
  ['no longer serves old/R5', 'INV-39 rule'],
]) {
  test(`#82 al check: the hint serves-replaced clears when INV-39 ${what}`, (t) => {
    const w = world(t);
    oneHint(check(w), 'serves-replaced', at39(w), 'INV-39', SERVES_MSG);
    editFile(w.dir, SPEC, '<!-- INV-39 rule serves:old/R5 -->', `<!-- ${marker} -->`);
    run(w.dir, ['index']);
    const r = check(w);
    assert.deepEqual(hintLines(r, 'serves-replaced'), [], show(r));
  });
}

test('#82 al check when it is not known whether new/R5 replaces old/R5: no hint serves-replaced, and Not known says why', (t) => {
  const w = world(t, { outside: true });
  const r = check(w);
  assert.deepEqual(hintLines(r, 'serves-replaced'), [], show(r));
  assert.ok(notKnownLine(r).includes('whether INV-39 serves a replaced requirement: the sign-off of new/R5 is not checked'), show(r));
});

test('#82 al check: a paragraph of an open change spec that serves old/R5 gets no hint serves-replaced; INV-39 does', (t) => {
  const w = world(t);
  write(w.dir, 'requests/new/spec.md', doc([['SP-1 rule serves:old/R5', 'A month is one CSV file.']]));
  run(w.dir, ['index']);
  const r = check(w);
  oneHint(r, 'serves-replaced', at39(w), 'INV-39', SERVES_MSG);
  assert.equal(hintLines(r, 'serves-replaced').length, 1, `only INV-39:\n${show(r)}`);
});

// --- 5. mistakes: the hint replaces-link

function mistake(t, marker, message, opts = {}) {
  const w = world(t, { marker, ...opts });
  const { plain, strict } = exitCodesAsBefore(w);
  const where = markerPlace(w, NEW_MD, marker);
  oneHint(plain, 'replaces-link', where, 'new/R5', message);
  oneHint(strict, 'replaces-link', where, 'new/R5', message);
  assert.deepEqual(notOkLines(plain).filter((l) => l.includes('replaces')), [], show(plain));
  assert.equal(strict.code, 0, `no not ok, so --strict exits 0:\n${show(strict)}`);
  return { w, r: plain };
}

const NONE = 'names no requirement of another request';
const OWN = 'names a requirement of its own request: a new version there is a change of its text, not a replaces: link';

test('#82 al check: replaces:x/R9 (no such request): hint replaces-link on the marker line, never not ok', (t) => {
  mistake(t, 'R5 replaces:x/R9', `replaces:x/R9 ${NONE}`);
});

test('#82 al check: replaces:old/R9 (old has no R9): hint replaces-link', (t) => {
  mistake(t, 'R5 replaces:old/R9', `replaces:old/R9 ${NONE}`);
});

test('#82 al check: replaces:spike/Q1 (a question of another request): hint replaces-link', (t) => {
  mistake(t, 'R5 replaces:spike/Q1', `replaces:spike/Q1 ${NONE}`, { spike: true });
});

test('#82 al check: replaces:INV-13 (a spec ID): hint replaces-link', (t) => {
  mistake(t, 'R5 replaces:INV-13', `replaces:INV-13 ${NONE}`);
});

test('#82 al check: replaces:new/R1 (its own request): hint replaces-link', (t) => {
  mistake(t, 'R5 replaces:new/R1', `replaces:new/R1 ${OWN}`, { newR1: true });
});

test('#82 al check: a bare replaces:R1 (its own request): hint replaces-link, written as given', (t) => {
  mistake(t, 'R5 replaces:R1', `replaces:R1 ${OWN}`, { newR1: true });
});

test('#82 al check: a comma list replaces:old/R5,x/R9: a hint for x/R9, and the link to old/R5 holds', (t) => {
  const { w } = mistake(t, 'R5 replaces:old/R5,x/R9', `replaces:x/R9 ${NONE}`);
  const r = context(w, 'old/R5');
  assert.ok(allLabelled(r, 'Replaced  ').includes(replacedLine(w, 1, 'signed in S1', HOLDS)), show(r));
});

test('#82 al check: two replaces: tokens in one marker: a hint for x/R9, and the link to old/R5 holds', (t) => {
  const { w } = mistake(t, 'R5 replaces:old/R5 replaces:x/R9', `replaces:x/R9 ${NONE}`);
  const r = context(w, 'old/R5');
  assert.ok(allLabelled(r, 'Replaced  ').includes(replacedLine(w, 1, 'signed in S1', HOLDS)), show(r));
});

test('#82 control: a valid replaces:old/R5: no hint replaces-link', (t) => {
  const w = world(t);
  const r = check(w);
  assert.deepEqual(hintLines(r, 'replaces-link'), [], show(r));
});

test('#82 al check: new/R5 and other/R2 both replace old/R5: a hint replaces-link on each marker, and both show as Replaced lines', (t) => {
  const w = world(t, { other: true });
  const { plain, strict } = exitCodesAsBefore(w);
  assert.equal(strict.code, 0, show(strict));
  oneHint(plain, 'replaces-link', markerPlace(w, NEW_MD, 'R5 replaces:old/R5'), 'new/R5',
    'new/R5 replaces old/R5, and so does other/R2: keep one replaces: link');
  oneHint(plain, 'replaces-link', markerPlace(w, OTHER_MD, 'R2 replaces:old/R5'), 'other/R2',
    'other/R2 replaces old/R5, and so does new/R5: keep one replaces: link');
  const r = context(w, 'old/R5');
  const replaced = allLabelled(r, 'Replaced  ');
  assert.equal(replaced.length, 2, show(r));
  assert.ok(replaced.some((l) => l.startsWith(`Replaced  by new/R5 (${newPlace(w)}), version 1: signed in S1; `)), show(r));
  assert.ok(replaced.some((l) => l.startsWith(`Replaced  by other/R2 (${place(w.dir, OTHER_MD, '### R2 Yearly CSV')}), version 1: signed in S1; `)), show(r));
});

// --- 5. a replaces: token on a question's marker

const ON_QUESTION = 'replaces:old/R5 is on a question: only a requirement R<n> replaces a requirement';
const Q_MARKER = 'Q1 replaces:old/R5';

test('#82 al check: replaces:old/R5 on the marker of the signed question spike/Q1: hint replaces-link on that marker, never not ok', (t) => {
  const w = world(t, { marker: 'R5', question: Q_MARKER });
  const { plain, strict } = exitCodesAsBefore(w);
  const where = markerPlace(w, SPIKE_MD, Q_MARKER);
  oneHint(plain, 'replaces-link', where, 'spike/Q1', ON_QUESTION);
  oneHint(strict, 'replaces-link', where, 'spike/Q1', ON_QUESTION);
  assert.deepEqual(notOkLines(plain), [], `no not ok in this fixture:\n${show(plain)}`);
  assert.equal(strict.code, 0, show(strict));
});

test('#82 a question that names replaces:old/R5 replaces nothing: al context old/R5 has no Replaced line and no status segment, and INV-39 gets no serves-replaced hint', (t) => {
  const w = world(t, { marker: 'R5', question: Q_MARKER });
  const q = context(w, 'spike/Q1');
  assert.ok(allLabelled(q, 'Requirement ').concat(allLabelled(q, 'Question ')).some((l) => l.includes(' · signed in S1 · ')),
    `the fixture: spike/Q1 is signed in S1:\n${show(q)}`);
  const r = context(w, 'old/R5');
  assert.equal(labelled(r, 'Requirement '), reqLine(w, 'old/R5', 'signed in S1', '', OLD_ARCH, OLD_HEAD, OLD_ONE_LINE), show(r));
  assert.deepEqual(allLabelled(r, 'Replaced  '), [], show(r));
  const c = check(w);
  assert.deepEqual(hintLines(c, 'serves-replaced'), [], show(c));
  const a = context(w, 'old', '--audit');
  assert.deepEqual(allLabelled(a, 'Replaced  '), [], show(a));
});

test('#82 a question that names replaces:old/R5: the list shows old/R5 as today, and no "replaced" line', (t) => {
  const w = world(t, { marker: 'R5', question: Q_MARKER, archived: false, touchOld: true });
  const r = check(w);
  assert.deepEqual(listLine(r, 'proposed old/R5 '),
    [`proposed old/R5 signed requirement · ${place(w.dir, OLD_OPEN, OLD_HEAD)} · signed in S1 (only al's record ${OLD_REC} holds this): ${OLD_ONE_LINE}`], show(r));
  assert.deepEqual(listLine(r, 'replaced '), [], show(r));
});

test('#82 al context spike/Q1 with replaces:old/R5 on its marker: "Replaces  old/R5: on a question, so no replacement"', (t) => {
  const w = world(t, { marker: 'R5', question: Q_MARKER });
  const r = context(w, 'spike/Q1');
  assert.equal(labelled(r, 'Replaces  '), 'Replaces  old/R5: on a question, so no replacement', show(r));
});

// --- 6. the full trace

test('#82 al context old --audit: the trace names R5 as replaced by new/R5, with its place, version and sign state', (t) => {
  const w = world(t);
  const r = context(w, 'old', '--audit');
  assert.equal(labelled(r, 'Replaced  '),
    `Replaced  R5 (${oldPlace(w)}) by new/R5 (${newPlace(w)}), version 1: signed in S1; ${HOLDS} ${NEW_NOTE}`, show(r));
});

test('#82 al context old --audit with new/R5 not signed: the trace names a proposed replacement', (t) => {
  const w = world(t, { sign: false });
  const r = context(w, 'old', '--audit');
  assert.equal(labelled(r, 'Replaced  '),
    `Replaced  R5 (${oldPlace(w)}) by new/R5 (${newPlace(w)}), version 1: not signed; ${PROPOSED} ${NEW_NOTE}`, show(r));
});

test('#82 control: al context old --audit with no replaces: link: no Replaced line', (t) => {
  const w = world(t, { marker: 'R5' });
  const r = context(w, 'old', '--audit');
  assert.deepEqual(allLabelled(r, 'Replaced  '), [], show(r));
});
