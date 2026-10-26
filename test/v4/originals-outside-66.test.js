// Original files outside the repo (#66, the signed requirement
// origin-elsewhere/R1). A project's committed config may say
// `originals: {outside: <name>}`; each worker maps the name to a folder in
// $XDG_CONFIG_HOME/assuredloop/places.yaml (else $HOME/.config/...). The
// files are then kept at <folder>/<request>/<file>, and the repo keeps only
// their names and SHA-256 in the records. Written from the requirement, the
// design (sections 1-5 and 8) and the public command only.
//
// Every al run here gets its own XDG_CONFIG_HOME and HOME in temp folders, so
// no test reads or changes the worker's real places file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync,
  symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  DAY, INVOICES, STAMP, WORDS_FILE, al, appendSection, assertSnapshot, commitAll, editRecord, editRequest, exists, git,
  organized, parseSnapshot, project, read, record, refused, req, sha, show, signedText, tree, write, writeConfig,
} from './helpers/project.js';
import { settled } from './helpers/as-78.js';

const NAME = 'assuredloop';
const REQ = 'inv';
const R1 = req('R1', 'Monthly CSV download', 'A user MUST be able to download one month as one CSV file.', [WORDS_FILE]);
const SECTION = organized([R1]);
const WORDS = 'I want to download my invoices as CSV.\nOne file per month.\n';
const SOURCE = 'email from the owner, 2026-05-04';
const SIGN_WORDS = 'Yes, sign it';
const URL1 = 'https://example.com/notes/7';
const MORE = 'Also, the link should not work forever.\n';
const SIGNOFF_FILE = `${DAY}-signoff.md`;

// --- temp folders, workers and places

// Gives back every mode a test may have changed, so the folder can be removed.
function restoreModes(p) {
  let st;
  try { st = lstatSync(p); } catch { return; }
  if (st.isSymbolicLink()) return;
  try { chmodSync(p, st.isDirectory() ? 0o700 : 0o600); } catch { /* removed below anyway */ }
  if (st.isDirectory()) for (const e of readdirSync(p)) restoreModes(join(p, e));
}

function tmp(t, prefix) {
  const d = mkdtempSync(join(realpathSync(tmpdir()), prefix));
  t.after(() => { restoreModes(d); rmSync(d, { recursive: true, force: true }); });
  return d;
}

// Runs fn with the mode of path set; the mode is given back after it.
function withMode(path, mode, fn) {
  const was = lstatSync(path).mode & 0o777;
  chmodSync(path, mode);
  try { return fn(); } finally { chmodSync(path, was); }
}

// A worker: its own config folder; with a folder, a places line for NAME.
function worker(t, folder, { name = NAME } = {}) {
  const xdg = tmp(t, 'al-xdg-');
  const placesFile = join(xdg, 'assuredloop', 'places.yaml');
  if (folder !== undefined) setPlaces(placesFile, `${name}: ${JSON.stringify(folder)}\n`);
  return { xdg, placesFile, env: { XDG_CONFIG_HOME: xdg, HOME: xdg } };
}

function setPlaces(placesFile, text) {
  mkdirSync(join(placesFile, '..'), { recursive: true });
  writeFileSync(placesFile, text);
}

// The files of the place's folder for a request, or of the repo's origin/.
const placeFiles = (place, name = REQ) => (existsSync(join(place, name)) ? readdirSync(join(place, name)).sort() : []);
const repoOrigin = (dir, name = REQ) => (exists(dir, `requests/${name}/origin`) ? readdirSync(join(dir, `requests/${name}/origin`)).sort() : []);
const inPlace = (place, file, name = REQ) => join(place, name, file);
const readPlace = (place, file, name = REQ) => readFileSync(inPlace(place, file, name), 'utf8');

// A project on branch `feature`, its config and spec committed on main.
function outsideProject(t, { originals = true } = {}) {
  const dir = project(t);
  writeConfig(dir, [{ file: 'specs/invoices.md', prefix: 'INV' }], originals ? { originals: { outside: NAME } } : {});
  write(dir, 'specs/invoices.md', INVOICES);
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  return dir;
}

const run = (dir, w, args, input = '') => al(dir, args, { env: w.env, input });
function runOk(dir, w, args, input = '') {
  const r = run(dir, w, args, input);
  assert.equal(r.code, 0, show(r));
  return r;
}

const SIGN = ['--source', SOURCE, '--words', SIGN_WORDS];

// One request `inv` made through the commands by worker A: the owner's words
// (al new), the organized R1, and by default its sign-off and one more source
// (al record origin). Committed. With originals, every original must be in
// A's place and none in the repo.
function world(t, { originals = true, sign = true, origin = true } = {}) {
  const place = tmp(t, 'al-place-');
  const A = worker(t, place);
  const none = worker(t);
  const dir = outsideProject(t, { originals });
  const out = [runOk(dir, A, ['new', REQ, '--from', '-'], WORDS)];
  appendSection(dir, REQ, SECTION);
  if (sign) out.push(runOk(dir, A, ['record', REQ, 'signoff', ...SIGN, '--yes']));
  // #72: the close rule asks a declared link for each signed requirement; a
  // close line says where R1 is met, so conclude tests only the originals.
  if (sign) out.push(runOk(dir, A, ['record', REQ, 'close', '--on', 'R1', '--reason', 'A one-time setup meets it; no lasting paragraph.', '--yes']));
  if (origin) out.push(runOk(dir, A, ['record', REQ, 'origin', '--url', URL1, '--from', '-', '--yes'], MORE));
  commitAll(dir, 'request inv');
  const rec = record(dir, REQ);
  const files = [...rec.sources.map((s) => s.file), ...rec.signoff.map((s) => s.file)];
  if (originals) {
    const all = out.map(show).join('\n');
    for (const f of files) assert.ok(existsSync(inPlace(place, f)), `${f} is written to the place:\n${all}`);
    assert.deepEqual(repoOrigin(dir), [], `no original file in the repo:\n${all}`);
  }
  return { dir, place, A, none, files, rec, wordsFile: rec.sources[0].file, originFile: rec.sources[1]?.file };
}

// --- reading the output

const lines = (r) => r.stdout.split('\n');
const notOk = (r) => lines(r).filter((l) => l.startsWith('not ok '));
const evidence = (r) => lines(r).filter((l) => l.startsWith('not ok record-evidence'));
const notKnown = (r) => lines(r).find((l) => l.startsWith('Not known')) ?? '';
const strict = (dir, w) => run(dir, w, ['check', '--strict']);
const INFO = (name) => new RegExp(`^info originals-not-checked \\S+ ${name} no place is set on this machine for "${NAME}": (.+)$`, 'gm');
const infoFiles = (r, name = REQ) => [...r.stdout.matchAll(INFO(name))].map((m) => m[1].split(', ').sort());

// Changes one byte of the text after the separator line.
function changeByte(path) {
  const c = readFileSync(path, 'utf8');
  const m = c.match(/\n(---|--- signed text ---)\n/);
  assert.ok(m, `a separator in ${path}`);
  const i = m.index + m[0].length;
  writeFileSync(path, c.slice(0, i) + (c[i] === 'X' ? 'Y' : 'X') + c.slice(i + 1));
}

// Changes the header only: the Fetched line.
function changeHeader(path) {
  const c = readFileSync(path, 'utf8');
  const changed = c.replace(/^Fetched: .*$/m, 'Fetched: 2026-01-01T00:00Z');
  assert.notEqual(changed, c, `a Fetched line in ${path}`);
  writeFileSync(path, changed);
}

// The text after the separator agrees with the recorded SHA-256.
function agrees(content, sha256) {
  assert.equal(sha(parseSnapshot(content).text), sha256, content);
}

// A not ok record-evidence line names the file outside as originals:<req>/<file>
// and never by the folder.
function failsOutside(r, file, place) {
  const named = evidence(r).filter((l) => l.includes(`originals:${REQ}/${file}`));
  assert.ok(named.length >= 1, `not ok record-evidence names originals:${REQ}/${file}:\n${show(r)}`);
  assert.ok(!r.stdout.includes(place), `the output never names the folder:\n${show(r)}`);
  assert.equal(r.code, 1, `--strict exits 1:\n${show(r)}`);
}

function passes(r) {
  assert.deepEqual(notOk(r), [], show(r));
  assert.equal(r.code, 0, show(r));
}

// =========================================================================
// Control: the same request kept in the repo (no originals key).

test('origin-elsewhere/R1 control: the request of these tests, kept in the repo, checks with no not ok and concludes', (t) => {
  const { dir, none, files } = world(t, { originals: false });
  assert.deepEqual(repoOrigin(dir), [...files].sort(), 'the originals are in the repo');
  passes(strict(dir, none));
  const p = runOk(dir, none, ['conclude', REQ]);
  assert.match(p.stdout, new RegExp(`^Would conclude ${REQ}: `, 'm'), show(p));
});

// =========================================================================
// Writing

test('origin-elsewhere/R1 writing: al new writes the owner\'s words to <folder>/<request>/, none to the repo; bytes, name and SHA-256 agree', (t) => {
  const place = tmp(t, 'al-place-');
  const A = worker(t, place);
  const dir = outsideProject(t);
  const r = runOk(dir, A, ['new', REQ, '--from', '-'], WORDS);

  assert.deepEqual(placeFiles(place), [WORDS_FILE], show(r));
  assert.deepEqual(repoOrigin(dir), [], `no snapshot in the repo:\n${show(r)}`);
  const content = readPlace(place, WORDS_FILE);
  assertSnapshot(content, { source: 'standard input', text: WORDS, fetched: STAMP });
  const s = record(dir, REQ).sources;
  assert.deepEqual(s, [{ file: WORDS_FILE, kind: 'owner-words', sha256: sha(WORDS), taken: STAMP }]);
  agrees(content, s[0].sha256);
  assert.ok(read(dir, `requests/${REQ}/request.md`).includes(`origin/${WORDS_FILE}`), 'request.md names it by its name');
  assert.ok(r.stdout.includes(`originals:${REQ}/${WORDS_FILE}`), `stdout names originals:${REQ}/${WORDS_FILE}:\n${show(r)}`);
  assert.ok(!r.stdout.includes(place), `stdout never names the folder:\n${show(r)}`);
});

test('origin-elsewhere/R1 writing: al record origin writes the snapshot to the place, none to the repo; bytes, name and SHA-256 agree', (t) => {
  const place = tmp(t, 'al-place-');
  const A = worker(t, place);
  const dir = outsideProject(t);
  runOk(dir, A, ['new', REQ, '--from', '-'], WORDS);
  assert.deepEqual(placeFiles(place), [WORDS_FILE], 'al new writes the owner\'s words to the place');
  const preview = runOk(dir, A, ['record', REQ, 'origin', '--url', URL1, '--from', '-'], MORE);
  assert.deepEqual(placeFiles(place), [WORDS_FILE], `the preview writes nothing to the place:\n${show(preview)}`);

  const r = runOk(dir, A, ['record', REQ, 'origin', '--url', URL1, '--from', '-', '--yes'], MORE);
  const src = record(dir, REQ).sources[1];
  assert.equal(src.url, URL1);
  assert.equal(src.sha256, sha(MORE));
  assert.deepEqual(placeFiles(place), [src.file, WORDS_FILE].sort(), show(r));
  assert.deepEqual(repoOrigin(dir), [], `no snapshot in the repo:\n${show(r)}`);
  const content = readPlace(place, src.file);
  assertSnapshot(content, { source: URL1, text: MORE, fetched: STAMP });
  agrees(content, src.sha256);
  assert.ok(r.stdout.includes(`originals:${REQ}/${src.file}`), show(r));
  assert.ok(!r.stdout.includes(place), show(r));
});

test('origin-elsewhere/R1 writing: al record signoff writes the snapshot to the place; the record and the Signed off line name it; al check verifies it', (t) => {
  const place = tmp(t, 'al-place-');
  const A = worker(t, place);
  const dir = outsideProject(t);
  runOk(dir, A, ['new', REQ, '--from', '-'], WORDS);
  appendSection(dir, REQ, SECTION);
  assert.deepEqual(placeFiles(place), [WORDS_FILE], 'al new writes the owner\'s words to the place');
  const preview = runOk(dir, A, ['record', REQ, 'signoff', ...SIGN]);
  assert.deepEqual(placeFiles(place), [WORDS_FILE], `the preview writes nothing to the place:\n${show(preview)}`);

  const r = runOk(dir, A, ['record', REQ, 'signoff', ...SIGN, '--yes']);
  const signed = signedText(SECTION);
  const s1 = record(dir, REQ).signoff[0];
  assert.equal(s1.file, SIGNOFF_FILE);
  assert.equal(s1.sha256, sha(signed));
  assert.deepEqual(placeFiles(place), [SIGNOFF_FILE, WORDS_FILE].sort(), show(r));
  assert.deepEqual(repoOrigin(dir), [], `no snapshot in the repo:\n${show(r)}`);
  const content = readPlace(place, SIGNOFF_FILE);
  assertSnapshot(content, { source: SOURCE, text: signed, fetched: STAMP, signoff: true, words: SIGN_WORDS });
  agrees(content, s1.sha256);
  assert.ok(read(dir, `requests/${REQ}/request.md`).includes(`Signed off: ${DAY} owner, origin/${SIGNOFF_FILE}`));
  assert.ok(r.stdout.includes(`originals:${REQ}/${SIGNOFF_FILE}`), show(r));
  assert.ok(!r.stdout.includes(place), show(r));

  const c = strict(dir, A);
  passes(c);
  assert.deepEqual(infoFiles(c), [], `with the place set, nothing is "not checked":\n${show(c)}`);
  const ctx = runOk(dir, A, ['context', REQ]);
  assert.match(ctx.stdout, /signed in S1/, show(ctx));
});

test('origin-elsewhere/R1 writing: with no place set, al new, record origin and record signoff refuse, previews too, and the repo stays the same', (t) => {
  const { dir, A, none } = world(t, { sign: false, origin: false });
  const why = (r) => {
    const line = lines(r).find((l) => l.startsWith('al: ')) ?? '';
    assert.ok(line.includes(`no place is set for the original files of "${NAME}": add a line to `), show(r));
    assert.ok(r.stdout.includes(none.placesFile), `the refusal names the places file:\n${show(r)}`);
  };
  const env = { env: none.env };
  why(refused(dir, ['new', 'pay', '--from', '-'], { ...env, input: WORDS }));
  why(refused(dir, ['record', REQ, 'origin', '--url', URL1, '--from', '-', '--yes'], { ...env, input: MORE }));
  why(refused(dir, ['record', REQ, 'origin', '--url', URL1, '--from', '-'], { ...env, input: MORE }));
  why(refused(dir, ['record', REQ, 'signoff', ...SIGN, '--yes'], env));
  why(refused(dir, ['record', REQ, 'signoff', ...SIGN], env));
  assert.ok(!existsSync(join(none.xdg, 'assuredloop')), 'nothing is written to the config folder');
  // The control: worker A, with its place, records the same.
  runOk(dir, A, ['record', REQ, 'signoff', ...SIGN, '--yes']);
});

test('origin-elsewhere/R1 writing: a name with no line in the places file is "no place set", and the commands refuse', (t) => {
  const place = tmp(t, 'al-place-');
  const other = worker(t, place, { name: 'another-project' });
  const dir = outsideProject(t);
  const r = refused(dir, ['new', REQ, '--from', '-'], { env: other.env, input: WORDS });
  assert.ok(r.stdout.includes(`no place is set for the original files of "${NAME}": add a line to `), show(r));
  assert.ok(r.stdout.includes(other.placesFile), show(r));
  assert.deepEqual(placeFiles(place), []);
});

test('origin-elsewhere/R1 writing: a write that fails (read-only place) makes each of the three commands refuse, and the repo stays the same', (t) => {
  const { dir, place, A } = world(t, { sign: false, origin: false });
  const env = { env: A.env };
  withMode(place, 0o555, () => {
    refused(dir, ['new', 'pay', '--from', '-'], { ...env, input: WORDS });
  });
  assert.deepEqual(placeFiles(place, 'pay'), []);
  const before = placeFiles(place);
  withMode(join(place, REQ), 0o555, () => {
    refused(dir, ['record', REQ, 'origin', '--url', URL1, '--from', '-', '--yes'], { ...env, input: MORE });
    refused(dir, ['record', REQ, 'signoff', ...SIGN, '--yes'], env);
  });
  assert.deepEqual(placeFiles(place), before, 'no file is left in the place');
  const rec = record(dir, REQ);
  assert.equal(rec.sources.length, 1, 'no new source');
  assert.deepEqual(rec.signoff, [], 'no sign-off');
  assert.doesNotMatch(read(dir, `requests/${REQ}/request.md`), /^Signed off:/m, 'no Signed off line');
});

test('origin-elsewhere/R1 writing: $HOME/.config/assuredloop/places.yaml is used when XDG_CONFIG_HOME is not set, and not when it is', (t) => {
  const place = tmp(t, 'al-place-');
  const home = tmp(t, 'al-home-');
  setPlaces(join(home, '.config', 'assuredloop', 'places.yaml'), `${NAME}: ${JSON.stringify(place)}\n`);
  const dir = outsideProject(t);
  const xdgEmpty = tmp(t, 'al-xdg-');
  refused(dir, ['new', REQ, '--from', '-'], { env: { XDG_CONFIG_HOME: xdgEmpty, HOME: home }, input: WORDS });
  const r = al(dir, ['new', REQ, '--from', '-'], { env: { XDG_CONFIG_HOME: undefined, HOME: home }, input: WORDS });
  assert.equal(r.code, 0, show(r));
  assert.deepEqual(placeFiles(place), [WORDS_FILE], show(r));
  assert.deepEqual(repoOrigin(dir), [], show(r));
});

// =========================================================================
// Free names

test('origin-elsewhere/R1 names: a sign-off of today already in the repo and none outside: the new one outside is <day>-signoff-2.md; the old one stays', (t) => {
  const place = tmp(t, 'al-place-');
  const A = worker(t, place);
  const dir = outsideProject(t, { originals: false });
  runOk(dir, A, ['new', REQ, '--from', '-'], WORDS);
  appendSection(dir, REQ, SECTION);
  runOk(dir, A, ['record', REQ, 'signoff', ...SIGN, '--yes']);
  const old = read(dir, `requests/${REQ}/origin/${SIGNOFF_FILE}`);
  writeConfig(dir, [{ file: 'specs/invoices.md', prefix: 'INV' }], { originals: { outside: NAME } });
  commitAll(dir, 'keep originals outside from now on');

  const R1b = req('R1', R1.title, 'A user MUST be able to download one year as one CSV file.', [WORDS_FILE]);
  editRequest(dir, REQ, R1.text, R1b.text);
  const r = runOk(dir, A, ['record', REQ, 'signoff', ...SIGN, '--yes']);
  const s2 = record(dir, REQ).signoff[1];
  assert.equal(s2.file, `${DAY}-signoff-2.md`, show(r));
  assert.deepEqual(placeFiles(place), [`${DAY}-signoff-2.md`], show(r));
  agrees(readPlace(place, s2.file), s2.sha256);
  assert.equal(read(dir, `requests/${REQ}/origin/${SIGNOFF_FILE}`), old, 'the old sign-off is unchanged');
  assert.deepEqual(repoOrigin(dir), [WORDS_FILE, SIGNOFF_FILE].sort(), 'nothing new in the repo');
  passes(strict(dir, A));
});

test('origin-elsewhere/R1 names: a file name that the record names is not free, though no file has it', (t) => {
  const { dir, place, A } = world(t, { sign: false, origin: false });
  editRecord(dir, REQ, (rec) => {
    rec.signoff.push({ id: 'S3', file: SIGNOFF_FILE, sha256: '0'.repeat(64), signed: '2026-01-01T00:00Z', source: 'import', covers: [] });
  });
  const r = runOk(dir, A, ['record', REQ, 'signoff', ...SIGN, '--yes']);
  const s4 = record(dir, REQ).signoff[1];
  assert.equal(s4.id, 'S4');
  assert.notEqual(s4.file, SIGNOFF_FILE, show(r));
  assert.ok(existsSync(inPlace(place, s4.file)), show(r));
  assert.ok(!existsSync(inPlace(place, SIGNOFF_FILE)), show(r));
});

test('origin-elsewhere/R1 names: two clones sharing one place get two names for each of the three commands; no file is overwritten', (t) => {
  const { dir, place, A } = world(t, { sign: false, origin: false });
  const dir2 = join(tmp(t, 'al-clone-'), 'repo');
  git(dir, 'clone', '-q', '-b', 'feature', dir, dir2);
  const keep = (file, name = REQ) => readPlace(place, file, name);

  // The sign-off.
  runOk(dir, A, ['record', REQ, 'signoff', '--source', 'clone one', '--words', SIGN_WORDS, '--yes']);
  const a = record(dir, REQ).signoff[0];
  const aBytes = keep(a.file);
  runOk(dir2, A, ['record', REQ, 'signoff', '--source', 'clone two', '--words', SIGN_WORDS, '--yes']);
  const b = record(dir2, REQ).signoff[0];
  assert.notEqual(b.file, a.file, 'two names');
  assert.equal(keep(a.file), aBytes, 'the first sign-off is not overwritten');
  agrees(keep(b.file), b.sha256);
  assert.match(keep(b.file), /^Source: clone two$/m);

  // The source of record origin, with the same URL.
  runOk(dir, A, ['record', REQ, 'origin', '--url', URL1, '--from', '-', '--yes'], 'First clone.\n');
  const oa = record(dir, REQ).sources[1];
  const oaBytes = keep(oa.file);
  runOk(dir2, A, ['record', REQ, 'origin', '--url', URL1, '--from', '-', '--yes'], 'Second clone.\n');
  const ob = record(dir2, REQ).sources[1];
  assert.notEqual(ob.file, oa.file, 'two names');
  assert.equal(keep(oa.file), oaBytes, 'the first source is not overwritten');
  agrees(keep(ob.file), ob.sha256);

  // al new of the same request name.
  runOk(dir, A, ['new', 'pay', '--from', '-'], 'Pay by card.\n');
  const na = record(dir, 'pay').sources[0];
  const naBytes = keep(na.file, 'pay');
  runOk(dir2, A, ['new', 'pay', '--from', '-'], 'Pay by bank.\n');
  const nb = record(dir2, 'pay').sources[0];
  assert.notEqual(nb.file, na.file, 'two names');
  assert.equal(keep(na.file, 'pay'), naBytes, 'the first owner\'s words are not overwritten');
  agrees(keep(nb.file, 'pay'), nb.sha256);
  assert.deepEqual(repoOrigin(dir2), []);
});

// =========================================================================
// Structured sources and privacy

test('origin-elsewhere/R1 sources: a --url, --source or --presented inside the place is recorded as originals:<path>; --words is kept as given', (t) => {
  const place = tmp(t, 'al-place-');
  const A = worker(t, place);
  const dir = outsideProject(t);
  runOk(dir, A, ['new', REQ, '--from', '-'], WORDS);
  appendSection(dir, REQ, SECTION);

  runOk(dir, A, ['record', REQ, 'origin', '--url', join(place, REQ, 'notes.txt'), '--from', '-', '--yes'], 'One.\n');
  runOk(dir, A, ['record', REQ, 'origin', '--url', relative(dir, join(place, REQ, 'call.txt')), '--from', '-', '--yes'], 'Two.\n');
  const words = 'Yes, sign it: the folder may stay where it is';
  runOk(dir, A, ['record', REQ, 'signoff', '--source', `the chat log at ${join(place, REQ, 'chat.txt')}`,
    '--presented', join(place, REQ, 'review.html'), '--words', words, '--yes']);

  const rec = record(dir, REQ);
  assert.equal(rec.sources[1].url, `originals:${REQ}/notes.txt`, 'an absolute path inside the place');
  assert.equal(rec.sources[2].url, `originals:${REQ}/call.txt`, 'a path relative to the current directory');
  const s1 = rec.signoff[0];
  assert.equal(s1.presented, `originals:${REQ}/review.html`);
  assert.ok(s1.source.startsWith('the chat log at originals:'), s1.source);
  assert.ok(s1.source.endsWith(`${REQ}/chat.txt`), s1.source);
  assert.ok(!s1.source.includes(place), s1.source);
  assert.equal(s1.words, words, '--words is kept as given');

  // The file name is made from the stored value: the same name as for that value in a repo project.
  const ref = outsideProject(t, { originals: false });
  runOk(ref, A, ['new', REQ, '--from', '-'], WORDS);
  runOk(ref, A, ['record', REQ, 'origin', '--url', `originals:${REQ}/notes.txt`, '--from', '-', '--yes'], 'One.\n');
  assert.equal(rec.sources[1].file, record(ref, REQ).sources[1].file);
});

test('origin-elsewhere/R1 privacy: after the three commands with local paths, no file of the repo and no git object names the place', (t) => {
  const place = tmp(t, 'al-place-');
  // The places file names the folder through a link: the path as given and its realpath differ.
  const given = join(tmp(t, 'al-link-'), 'al-given-place');
  symlinkSync(place, given);
  const A = worker(t, given);
  const forbidden = [given, place, basename(given), basename(place)];
  const dir = outsideProject(t);
  write(join(place), 'words.txt', WORDS);

  const outs = [];
  outs.push(runOk(dir, A, ['new', REQ, '--from', join(given, 'words.txt')]));
  appendSection(dir, REQ, SECTION);
  outs.push(runOk(dir, A, ['record', REQ, 'origin', '--url', join(given, REQ, 'notes.txt'), '--from', '-', '--yes'], 'One.\n'));
  outs.push(runOk(dir, A, ['record', REQ, 'origin', '--url', relative(dir, join(given, REQ, 'call.txt')), '--from', '-', '--yes'], 'Two.\n'));
  outs.push(runOk(dir, A, ['record', REQ, 'origin', '--url', `file://${join(given, REQ, 'mail.eml')}`, '--from', '-', '--yes'], 'Three.\n'));
  outs.push(runOk(dir, A, ['record', REQ, 'signoff', '--source', `the chat log at ${join(given, REQ, 'chat.txt')}`,
    '--presented', join(given, REQ, 'review.html'), '--words', SIGN_WORDS, '--yes']));
  const rec = record(dir, REQ);
  assert.equal(rec.sources.length, 4);
  assert.equal(placeFiles(place).length, 5, 'the five originals are in the place');
  assert.deepEqual(repoOrigin(dir), []);

  for (const r of outs) for (const f of forbidden) assert.ok(!r.stdout.includes(f) && !r.stderr.includes(f), `the output names ${f}:\n${show(r)}`);
  for (const [path, b64] of Object.entries(tree(dir))) {
    const text = Buffer.from(b64, 'base64').toString('utf8');
    for (const f of forbidden) assert.ok(!text.includes(f), `${path} names ${f}:\n${text}`);
  }
  commitAll(dir, 'the request');
  const objects = git(dir, 'cat-file', '--batch-all-objects', '--batch');
  for (const f of forbidden) assert.ok(!objects.includes(f), `a git object names ${f}`);
});

// =========================================================================
// Reading: verified, failed

test('origin-elsewhere/R1 reading: one changed byte after the separator, in each kind of snapshot, is not ok record-evidence; a header change is the control', async (t) => {
  for (const kind of ['words', 'origin', 'signoff']) {
    await t.test(kind, (tt) => {
      const { dir, place, A, wordsFile, originFile } = world(tt);
      const file = { words: wordsFile, origin: originFile, signoff: SIGNOFF_FILE }[kind];
      const path = inPlace(place, file);
      const good = readFileSync(path);
      passes(strict(dir, A));

      changeHeader(path);
      passes(strict(dir, A));
      writeFileSync(path, good);

      changeByte(path);
      failsOutside(strict(dir, A), file, place);
    });
  }
});

test('origin-elsewhere/R1 reading: a file of the place that is missing, unreadable or a folder is not ok record-evidence', async (t) => {
  await t.test('missing', (tt) => {
    const { dir, place, A } = world(tt);
    rmSync(inPlace(place, SIGNOFF_FILE));
    failsOutside(strict(dir, A), SIGNOFF_FILE, place);
  });
  await t.test('unreadable', (tt) => {
    const { dir, place, A, wordsFile } = world(tt);
    withMode(inPlace(place, wordsFile), 0o000, () => failsOutside(strict(dir, A), wordsFile, place));
  });
  await t.test('a folder', (tt) => {
    const { dir, place, A, originFile } = world(tt);
    rmSync(inPlace(place, originFile));
    mkdirSync(inPlace(place, originFile));
    failsOutside(strict(dir, A), originFile, place);
  });
});

test('origin-elsewhere/R1 reading: two workers, two places: only the worker whose copy is corrupt fails', (t) => {
  const { dir, place, A } = world(t);
  const placeB = tmp(t, 'al-place-');
  cpSync(join(place, REQ), join(placeB, REQ), { recursive: true });
  const B = worker(t, placeB);
  passes(strict(dir, A));
  passes(strict(dir, B));

  const pathB = inPlace(placeB, SIGNOFF_FILE);
  const good = readFileSync(pathB);
  changeByte(pathB);
  passes(strict(dir, A));
  failsOutside(strict(dir, B), SIGNOFF_FILE, placeB);
  writeFileSync(pathB, good);

  changeByte(inPlace(place, SIGNOFF_FILE));
  failsOutside(strict(dir, A), SIGNOFF_FILE, place);
  passes(strict(dir, B));
});

test('origin-elsewhere/R1 reading: a repo copy that cannot be read fails, even when the place holds a good copy', async (t) => {
  await t.test('the repo copy is unreadable', (tt) => {
    const { dir, place, A } = world(tt);
    write(dir, `requests/${REQ}/origin/${SIGNOFF_FILE}`, readPlace(place, SIGNOFF_FILE));
    passes(strict(dir, A));
    withMode(join(dir, `requests/${REQ}/origin/${SIGNOFF_FILE}`), 0o000, () => {
      const r = strict(dir, A);
      assert.ok(evidence(r).some((l) => l.includes(SIGNOFF_FILE)), show(r));
      assert.equal(r.code, 1, show(r));
    });
  });
  await t.test('a folder at the repo path', (tt) => {
    const { dir, A, wordsFile } = world(tt);
    mkdirSync(join(dir, `requests/${REQ}/origin/${wordsFile}`), { recursive: true });
    write(dir, `requests/${REQ}/origin/${wordsFile}/x.md`, 'not a snapshot\n');
    const r = strict(dir, A);
    assert.ok(evidence(r).some((l) => l.includes(wordsFile)), show(r));
    assert.equal(r.code, 1, show(r));
  });
});

test('origin-elsewhere/R1 reading: a file in both places with different text: the repo copy is read', (t) => {
  const { dir, place, A } = world(t);
  const repoPath = join(dir, `requests/${REQ}/origin/${SIGNOFF_FILE}`);
  const good = readPlace(place, SIGNOFF_FILE);
  write(dir, `requests/${REQ}/origin/${SIGNOFF_FILE}`, good);

  changeByte(inPlace(place, SIGNOFF_FILE));
  passes(strict(dir, A));

  writeFileSync(inPlace(place, SIGNOFF_FILE), good);
  changeByte(repoPath);
  const r = strict(dir, A);
  assert.ok(evidence(r).some((l) => l.includes(SIGNOFF_FILE)), show(r));
  assert.equal(r.code, 1, show(r));
});

// =========================================================================
// Reading: not checked

test('origin-elsewhere/R1 no place set: one info line per request names each unchecked file; Not known names them and inv/R1; --strict exits 0', (t) => {
  const { dir, A, none, files } = world(t);
  runOk(dir, A, ['new', 'pay', '--from', '-'], 'Pay by card.\n');
  const payFile = record(dir, 'pay').sources[0].file;
  commitAll(dir, 'request pay');

  const r = strict(dir, none);
  passes(r);
  assert.deepEqual(infoFiles(r), [[...files].sort()], `one info line for ${REQ}, naming each file:\n${show(r)}`);
  assert.deepEqual(infoFiles(r, 'pay'), [[payFile]], `one info line for pay:\n${show(r)}`);
  const nk = notKnown(r);
  for (const f of [...files, payFile]) assert.ok(nk.includes(f), `Not known names ${f}:\n${show(r)}`);
  assert.ok(nk.includes(`${REQ}/R1`), `Not known names ${REQ}/R1:\n${show(r)}`);
  assert.equal(evidence(r).length, 0, show(r));

  const plain = run(dir, none, ['check']);
  assert.equal(plain.code, 0, show(plain));
  assert.deepEqual(infoFiles(plain), [[...files].sort()], show(plain));
});

test('origin-elsewhere/R1 no place set: al context does not say the requirement is signed', (t) => {
  const { dir, A, none } = world(t);
  assert.match(runOk(dir, A, ['context', REQ]).stdout, /signed in S1/, 'the control: with the place set, it is signed');
  const r = runOk(dir, none, ['context', REQ]);
  assert.doesNotMatch(r.stdout, /signed in S\d/, show(r));
  assert.ok(r.stdout.includes('R1'), show(r));
});

test('origin-elsewhere/R1 no place set: the other conditions of the sign-off are still checked; each break is not ok unsigned-requirement', async (t) => {
  const breaks = {
    'the covers sha256': (dir) => editRecord(dir, REQ, (rec) => { rec.signoff[0].covers[0].sha256 = 'f'.repeat(64); }),
    'the covers version': (dir) => editRecord(dir, REQ, (rec) => { rec.signoff[0].covers[0].version = 2; }),
    'the requirement text': (dir) => editRequest(dir, REQ, R1.text, R1.text.replace('one month', 'one year')),
    'the sign-off entry': (dir) => editRecord(dir, REQ, (rec) => { rec.signoff = []; }),
    'signed': (dir) => editRecord(dir, REQ, (rec) => { delete rec.signoff[0].signed; }),
    'words': (dir) => editRecord(dir, REQ, (rec) => { delete rec.signoff[0].words; }),
  };
  for (const [what, breakIt] of Object.entries(breaks)) {
    await t.test(what, (tt) => {
      const { dir, none } = world(tt);
      passes(strict(dir, none));
      breakIt(dir);
      const r = strict(dir, none);
      assert.ok(notOk(r).some((l) => l.startsWith('not ok unsigned-requirement') && l.includes(`${REQ}/R1`)), show(r));
      assert.equal(r.code, 1, show(r));
    });
  }
});

// =========================================================================
// Settings

const BAD_PLACES = {
  'not valid YAML': () => `${NAME}: [unclosed\n`,
  'not a mapping': (place) => `- ${JSON.stringify(place)}\n`,
  'a relative path': () => `${NAME}: relative/folder\n`,
  'a folder that does not exist': (place) => `${NAME}: ${JSON.stringify(join(place, 'no-such-folder'))}\n`,
  'a file, not a folder': (place) => `${NAME}: ${JSON.stringify(join(place, 'a-file.txt'))}\n`,
  'not a path': () => `${NAME}: 42\n`,
};

// The five commands that read the places file each refuse with exit 2, an
// al: line that names the places file, and nothing written.
function allRefuse(dir, w, place) {
  const before = JSON.stringify(tree(place));
  const opts = { env: w.env };
  const rs = [
    refused(dir, ['check'], opts),
    refused(dir, ['conclude', REQ], opts),
    refused(dir, ['conclude', REQ, '--yes'], opts),
    refused(dir, ['new', 'other', '--from', '-'], { ...opts, input: WORDS }),
    refused(dir, ['record', 'pay', 'origin', '--url', URL1, '--from', '-', '--yes'], { ...opts, input: MORE }),
    refused(dir, ['record', 'pay', 'signoff', ...SIGN, '--yes'], opts),
  ];
  for (const r of rs) assert.match(r.stdout, /places\.yaml/, `the refusal names the places file:\n${show(r)}`);
  assert.equal(JSON.stringify(tree(place)), before, 'nothing is written to the place');
}

// A world where each of those commands would do its work: inv concludes, and
// pay has a requirement to sign.
function settingsWorld(t) {
  const w = world(t);
  runOk(w.dir, w.A, ['new', 'pay', '--from', '-'], 'Pay by card.\n');
  appendSection(w.dir, 'pay', organized([req('R1', 'Card', 'A user MUST be able to pay by card.')]));
  commitAll(w.dir, 'request pay');
  write(w.place, 'a-file.txt', 'not a folder\n');
  return w;
}

test('origin-elsewhere/R1 settings: a broken places file refuses check, conclude, new, record origin and record signoff', async (t) => {
  for (const [what, text] of Object.entries(BAD_PLACES)) {
    await t.test(what, (tt) => {
      const w = settingsWorld(tt);
      const bad = worker(tt);
      setPlaces(bad.placesFile, text(w.place));
      allRefuse(w.dir, bad, w.place);
    });
  }
  await t.test('a places file that cannot be read', (tt) => {
    const w = settingsWorld(tt);
    const bad = worker(tt, w.place);
    withMode(bad.placesFile, 0o000, () => allRefuse(w.dir, bad, w.place));
  });
  await t.test('a folder at the path of the places file', (tt) => {
    const w = settingsWorld(tt);
    const bad = worker(tt);
    mkdirSync(bad.placesFile, { recursive: true });
    allRefuse(w.dir, bad, w.place);
  });
});

test('origin-elsewhere/R1 settings: control: the same world with a good places file runs each of those commands', (t) => {
  const w = settingsWorld(t);
  runOk(w.dir, w.A, ['check']);
  runOk(w.dir, w.A, ['conclude', REQ]);
  runOk(w.dir, w.A, ['record', 'pay', 'signoff', ...SIGN, '--yes']);
  runOk(w.dir, w.A, ['record', 'pay', 'origin', '--url', URL1, '--from', '-', '--yes'], MORE);
  runOk(w.dir, w.A, ['new', 'other', '--from', '-'], WORDS);
});

test('origin-elsewhere/R1 settings: al export never reads the places file', (t) => {
  const { dir, A, none } = world(t);
  const good = runOk(dir, A, ['export']);
  for (const text of [`${NAME}: [unclosed\n`, '- a\n']) {
    const bad = worker(t);
    setPlaces(bad.placesFile, text);
    const r = runOk(dir, bad, ['export']);
    assert.equal(r.stdout, good.stdout, show(r));
  }
  const unreadable = worker(t, '/');
  withMode(unreadable.placesFile, 0o000, () => assert.equal(runOk(dir, unreadable, ['export']).stdout, good.stdout));
  assert.equal(runOk(dir, none, ['export']).stdout, good.stdout);
});

test('origin-elsewhere/R1 no originals key (control, green today): a broken places file changes nothing', (t) => {
  const broken = worker(t);
  setPlaces(broken.placesFile, `${NAME}: [unclosed\n`);
  const empty = worker(t);
  const dir = outsideProject(t, { originals: false });
  runOk(dir, broken, ['new', REQ, '--from', '-'], WORDS);
  appendSection(dir, REQ, SECTION);
  runOk(dir, broken, ['record', REQ, 'signoff', ...SIGN, '--yes']);
  // #72: a close line on R1, as in world().
  runOk(dir, broken, ['record', REQ, 'close', '--on', 'R1', '--reason', 'A one-time setup meets it; no lasting paragraph.', '--yes']);
  runOk(dir, broken, ['record', REQ, 'origin', '--url', URL1, '--from', '-', '--yes'], MORE);
  assert.equal(repoOrigin(dir).length, 3, 'the originals are in the repo');
  commitAll(dir, 'request inv');
  for (const args of [['check', '--strict'], ['context', REQ], ['conclude', REQ], ['export']]) {
    const a = runOk(dir, broken, args);
    const b = runOk(dir, empty, args);
    // #78: the first al check writes the records, so those lines are left out.
    assert.equal(settled(a.stdout), settled(b.stdout), `${args.join(' ')}: the same output:\n${show(a)}\n${show(b)}`);
    assert.doesNotMatch(a.stdout, /^not ok /m, show(a));
  }
  withMode(broken.placesFile, 0o000, () => runOk(dir, broken, ['check', '--strict']));
  const r = runOk(dir, broken, ['conclude', REQ, '--yes']);
  assert.match(r.stdout, new RegExp(`^Concluded ${REQ}: `, 'm'), show(r));
});

// =========================================================================
// Concluding

// The preview and --yes both refuse (exit 1); the refused lines name each
// file (and the reason); the request, the record and the tree stay the same.
function concludeRefuses(dir, w, files, reason) {
  const before = tree(dir);
  const status = git(dir, 'status', '--porcelain');
  for (const args of [['conclude', REQ], ['conclude', REQ, '--yes']]) {
    const r = run(dir, w, args);
    assert.equal(r.code, 1, show(r));
    const refusedLines = lines(r).filter((l) => l.startsWith('refused: '));
    for (const f of files) assert.ok(refusedLines.some((l) => l.includes(f)), `a refused line names ${f}:\n${show(r)}`);
    if (reason) assert.ok(refusedLines.some((l) => l.includes(reason)), `a refused line says why:\n${show(r)}`);
    assert.doesNotMatch(r.stdout, /^(Would conclude|Concluded) /m, show(r));
    assert.deepEqual(tree(dir), before, `nothing is written:\n${show(r)}`);
    assert.equal(git(dir, 'status', '--porcelain'), status, show(r));
    assert.ok(!exists(dir, `requests/archive/${REQ}`), show(r));
  }
}

function concludes(dir, w) {
  const p = runOk(dir, w, ['conclude', REQ]);
  assert.match(p.stdout, new RegExp(`^Would conclude ${REQ}: `, 'm'), show(p));
  const y = runOk(dir, w, ['conclude', REQ, '--yes']);
  assert.match(y.stdout, new RegExp(`^Concluded ${REQ}: `, 'm'), show(y));
  assert.ok(exists(dir, `requests/archive/${REQ}/request.md`));
}

test('origin-elsewhere/R1 conclude, no place set: the preview and --yes refuse and name each unchecked file and why; with the place set it concludes', (t) => {
  const { dir, A, none, files } = world(t);
  concludeRefuses(dir, none, files, `no place is set on this machine for "${NAME}"`);
  concludes(dir, A);
});

test('origin-elsewhere/R1 conclude, place set: after a good check, a changed, removed or unreadable original makes the preview and --yes refuse', async (t) => {
  await t.test('changed', (tt) => {
    const { dir, place, A } = world(tt);
    passes(strict(dir, A));
    const path = inPlace(place, SIGNOFF_FILE);
    const good = readFileSync(path);
    changeByte(path);
    concludeRefuses(dir, A, [SIGNOFF_FILE]);
    writeFileSync(path, good);
    concludes(dir, A);
  });
  await t.test('removed', (tt) => {
    const { dir, place, A, wordsFile } = world(tt);
    passes(strict(dir, A));
    rmSync(inPlace(place, wordsFile));
    concludeRefuses(dir, A, [wordsFile]);
  });
  await t.test('unreadable', (tt) => {
    const { dir, place, A, originFile } = world(tt);
    passes(strict(dir, A));
    withMode(inPlace(place, originFile), 0o000, () => concludeRefuses(dir, A, [originFile]));
  });
});

test('origin-elsewhere/R1 conclude, today\'s defect (red on main today): a request kept in the repo whose original file is missing does not conclude', async (t) => {
  await t.test('the sign-off snapshot', (tt) => {
    const { dir, none } = world(tt, { originals: false });
    rmSync(join(dir, `requests/${REQ}/origin/${SIGNOFF_FILE}`));
    commitAll(dir, 'the sign-off snapshot is gone');
    concludeRefuses(dir, none, [SIGNOFF_FILE]);
  });
  await t.test('the owner\'s words', (tt) => {
    const { dir, none, wordsFile } = world(tt, { originals: false });
    rmSync(join(dir, `requests/${REQ}/origin/${wordsFile}`));
    commitAll(dir, 'the owner\'s words are gone');
    concludeRefuses(dir, none, [wordsFile]);
  });
});

// =========================================================================
// Export

const rowsOf = (stdout) => stdout.split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));

test('origin-elsewhere/R1 export: an original outside gets no row; stdout stays JSONL; stderr names each with its SHA-256', (t) => {
  const { dir, A, files, rec } = world(t);
  const r = runOk(dir, A, ['export']);
  const rows = rowsOf(r.stdout);
  assert.ok(rows.some((x) => x.id === `${REQ}/R1`), 'the requirement still has its row');
  for (const f of files) assert.ok(!rows.some((x) => String(x.file).endsWith(`/${f}`)), `no row for ${f}`);
  assert.ok(!rows.some((x) => x.id === `${REQ}/S1`), 'no row for the sign-off');
  const shaOf = Object.fromEntries([...rec.sources, ...rec.signoff].map((s) => [s.file, s.sha256]));
  const err = r.stderr.split('\n');
  for (const f of files) {
    assert.ok(err.some((l) => l.includes(`originals:${REQ}/${f}`) && l.includes(shaOf[f])),
      `stderr names originals:${REQ}/${f} and its SHA-256:\n${show(r)}`);
  }
});

test('origin-elsewhere/R1 export --out --yes: the summary names each original outside with its SHA-256', (t) => {
  const { dir, A, files, rec } = world(t);
  const r = runOk(dir, A, ['export', '--out', 'export.jsonl', '--yes']);
  const shaOf = Object.fromEntries([...rec.sources, ...rec.signoff].map((s) => [s.file, s.sha256]));
  for (const f of files) {
    assert.ok(lines(r).some((l) => l.includes(`originals:${REQ}/${f}`) && l.includes(shaOf[f])),
      `the summary names originals:${REQ}/${f} and its SHA-256:\n${show(r)}`);
  }
  const rows = rowsOf(read(dir, 'export.jsonl'));
  for (const f of files) assert.ok(!rows.some((x) => String(x.file).endsWith(`/${f}`)), `no row for ${f}`);
});

test('origin-elsewhere/R1 export: the rows of a commit are the same with and without the place, and before and after the file outside changes', (t) => {
  const { dir, place, A, none } = world(t);
  const withPlace = runOk(dir, A, ['export']).stdout;
  assert.equal(runOk(dir, none, ['export']).stdout, withPlace);
  changeByte(inPlace(place, SIGNOFF_FILE));
  rmSync(inPlace(place, WORDS_FILE));
  assert.equal(runOk(dir, A, ['export']).stdout, withPlace);
  assert.ok(!rowsOf(withPlace).some((x) => x.id === `${REQ}/S1`), 'no row for the sign-off');
});

// =========================================================================
// Regression tests from the review of PR #67

// The output of a run never names the place's folder.
function namesNoFolder(r, place) {
  for (const f of [place, basename(place)]) {
    assert.ok(!r.stdout.includes(f) && !r.stderr.includes(f), `the output never names the folder (${f}):\n${show(r)}`);
  }
}

test('origin-elsewhere/R1 conclude (review of #67): a record entry with no sha256 or no file, and its snapshot missing, is not ok record-evidence, and conclude refuses', async (t) => {
  const cases = {
    'a source with no sha256': { edit: (rec) => { delete rec.sources[0].sha256; }, gone: (w) => w.wordsFile },
    'a source with no file': { edit: (rec) => { delete rec.sources[0].file; }, gone: () => null },
    'a sign-off with no sha256': { edit: (rec) => { delete rec.signoff[0].sha256; }, gone: () => SIGNOFF_FILE },
  };
  for (const originals of [false, true]) {
    for (const [what, { edit, gone }] of Object.entries(cases)) {
      await t.test(`${originals ? 'kept outside, the place set' : 'no originals key'}: ${what}`, (tt) => {
        const w = world(tt, { originals });
        const file = gone(w);
        if (file) rmSync(originals ? inPlace(w.place, file) : join(w.dir, `requests/${REQ}/origin/${file}`));
        editRecord(w.dir, REQ, edit);
        commitAll(w.dir, `the record: ${what}`);
        const r = strict(w.dir, w.A);
        assert.ok(evidence(r).length >= 1, `not ok record-evidence:\n${show(r)}`);
        assert.equal(r.code, 1, show(r));
        concludeRefuses(w.dir, w.A, file ? [file] : []);
        for (const args of [['conclude', REQ], ['conclude', REQ, '--yes']]) {
          const c = run(w.dir, w.A, args);
          assert.ok(lines(c).some((l) => l.startsWith('refused: ')), `a refused: line:\n${show(c)}`);
          if (originals) namesNoFolder(c, w.place);
        }
      });
    }
  }
});

test('origin-elsewhere/R1 reading (review of #67): a folder of the place that cannot be searched gives not ok record-evidence for each file, exit 1, and never names the folder', async (t) => {
  const cases = {
    '<folder>/<request>/ at 0600': (w) => [join(w.place, REQ), 0o600],
    '<folder>/<request>/ at 0000': (w) => [join(w.place, REQ), 0o000],
    'the place folder at 0600': (w) => [w.place, 0o600],
    'the place folder at 0000': (w) => [w.place, 0o000],
  };
  for (const [what, target] of Object.entries(cases)) {
    await t.test(what, (tt) => {
      const w = world(tt);
      passes(strict(w.dir, w.A));
      const [path, mode] = target(w);
      withMode(path, mode, () => {
        const r = strict(w.dir, w.A);
        for (const f of w.files) failsOutside(r, f, w.place);
        namesNoFolder(r, w.place);
      });
    });
  }
});

test('origin-elsewhere/R1 writing (review of #67): a folder of the place that cannot be searched makes al new, record origin and record signoff refuse, previews too', (t) => {
  const { dir, place, A } = world(t, { sign: false, origin: false });
  const env = { env: A.env };
  const check = (r) => { namesNoFolder(r, place); return r; };

  mkdirSync(join(place, 'pay'));
  withMode(join(place, 'pay'), 0o600, () => {
    check(refused(dir, ['new', 'pay', '--from', '-'], { ...env, input: WORDS }));
  });
  assert.deepEqual(placeFiles(place, 'pay'), [], 'nothing is written for pay');
  assert.ok(!exists(dir, 'requests/pay'), 'no request pay');

  const before = placeFiles(place);
  withMode(join(place, REQ), 0o600, () => {
    check(refused(dir, ['record', REQ, 'origin', '--url', URL1, '--from', '-', '--yes'], { ...env, input: MORE }));
    check(refused(dir, ['record', REQ, 'origin', '--url', URL1, '--from', '-'], { ...env, input: MORE }));
    check(refused(dir, ['record', REQ, 'signoff', ...SIGN, '--yes'], env));
    check(refused(dir, ['record', REQ, 'signoff', ...SIGN], env));
  });
  assert.deepEqual(placeFiles(place), before, 'no file is left in the place');
  const rec = record(dir, REQ);
  assert.equal(rec.sources.length, 1, 'no new source');
  assert.deepEqual(rec.signoff, [], 'no sign-off');
  assert.doesNotMatch(read(dir, `requests/${REQ}/request.md`), /^Signed off:/m, 'no Signed off line');
  // The control: with the folder searchable again, both record.
  runOk(dir, A, ['record', REQ, 'origin', '--url', URL1, '--from', '-', '--yes'], MORE);
  runOk(dir, A, ['record', REQ, 'signoff', ...SIGN, '--yes']);
});

test('origin-elsewhere/R1 conclude (review of #67): sources: or signoff: that is a mapping, not a list, is not ok, and conclude refuses', async (t) => {
  const cases = {
    'sources: as a mapping': { key: 'sources', gone: (w) => w.wordsFile },
    'signoff: as a mapping': { key: 'signoff', gone: () => SIGNOFF_FILE },
  };
  for (const originals of [false, true]) {
    for (const [what, { key, gone }] of Object.entries(cases)) {
      await t.test(`${originals ? 'kept outside, the place set' : 'no originals key'}: ${what}`, (tt) => {
        const w = world(tt, { originals, origin: false });
        passes(strict(w.dir, w.A));
        const file = gone(w);
        rmSync(originals ? inPlace(w.place, file) : join(w.dir, `requests/${REQ}/origin/${file}`));
        editRecord(w.dir, REQ, (rec) => {
          assert.equal(rec[key].length, 1, `one ${key} entry`);
          rec[key] = rec[key][0];
        });
        commitAll(w.dir, `the record: ${what}`);
        const r = strict(w.dir, w.A);
        assert.ok(notOk(r).length >= 1, `a not ok:\n${show(r)}`);
        assert.equal(r.code, 1, show(r));
        concludeRefuses(w.dir, w.A, []);
        for (const args of [['conclude', REQ], ['conclude', REQ, '--yes']]) {
          const c = run(w.dir, w.A, args);
          assert.ok(lines(c).some((l) => l.startsWith('refused: ')), `a refused: line:\n${show(c)}`);
          if (originals) namesNoFolder(c, w.place);
        }
      });
    }
  }
});

// A module for NODE_OPTIONS=--import. On the first fs.writeFileSync call whose
// path is inside the place and whose options have flag 'wx', it writes the
// competing bytes to that path first, as another clone would, notes the path
// in the report file, and then makes the call. With downgrade, it makes that
// call with flag 'w' (a scratch check of the test, never used here).
const COMPETING = 'Source: another clone\nFetched: 2026-05-04T09:30Z\nSHA-256: 0\n---\nthe other clone wrote this first\n';
function raceHook(t, place, { downgrade = false } = {}) {
  const folder = tmp(t, 'al-hook-');
  const hook = join(folder, 'race.mjs');
  const report = join(folder, 'report.txt');
  writeFileSync(hook, `import fs from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
const PLACE = ${JSON.stringify(place)};
const REPORT = ${JSON.stringify(report)};
const COMPETING = ${JSON.stringify(COMPETING)};
const DOWNGRADE = ${JSON.stringify(downgrade)};
const original = fs.writeFileSync;
let done = false;
fs.writeFileSync = function writeFileSync(file, data, options, ...rest) {
  const p = typeof file === 'string' ? resolve(file) : file instanceof URL ? fileURLToPath(file) : null;
  const flag = options && typeof options === 'object' ? options.flag : undefined;
  if (!done && p && p.startsWith(PLACE + '/') && flag === 'wx') {
    done = true;
    original.call(fs, p, COMPETING);
    original.call(fs, REPORT, p + '\\n');
    if (DOWNGRADE) options = { ...options, flag: 'w' };
  }
  return original.call(this, file, data, options, ...rest);
};
syncBuiltinESMExports();
`);
  return { env: { NODE_OPTIONS: `--import=${pathToFileURL(hook).href}` }, report };
}

// The run met the competing file: the path that the hook took, inside <place>/<name>/.
function raced(hook, place, name) {
  assert.ok(existsSync(hook.report), 'no fs.writeFileSync with flag \'wx\' inside the place: the race could not be made');
  const p = readFileSync(hook.report, 'utf8').trim();
  assert.equal(dirname(p), join(place, name), `the competing file is in <place>/${name}/: ${p}`);
  return p;
}

test('origin-elsewhere/R1 names (review of #67): a name taken by another clone at the moment of the write is not overwritten; al new, record origin and record signoff take another free name', (t) => {
  const { dir, place, A } = world(t, { sign: false, origin: false });
  const raceRun = (args, input, name, file) => {
    const hook = raceHook(t, place);
    const r = al(dir, args, { env: { ...A.env, ...hook.env }, input });
    assert.equal(r.code, 0, show(r));
    const p = raced(hook, place, name);
    assert.equal(readFileSync(p, 'utf8'), COMPETING, `the competing file keeps its bytes:\n${show(r)}`);
    const mine = file();
    assert.notEqual(mine.file, basename(p), `the record names another name:\n${show(r)}`);
    assert.ok(existsSync(inPlace(place, mine.file, name)), `the snapshot is in the place:\n${show(r)}`);
    agrees(readPlace(place, mine.file, name), mine.sha256);
    return r;
  };

  raceRun(['new', 'pay', '--from', '-'], 'Pay by card.\n', 'pay', () => record(dir, 'pay').sources[0]);
  raceRun(['record', REQ, 'origin', '--url', URL1, '--from', '-', '--yes'], MORE, REQ, () => record(dir, REQ).sources[1]);
  const r = raceRun(['record', REQ, 'signoff', ...SIGN, '--yes'], '', REQ, () => record(dir, REQ).signoff[0]);
  const s1 = record(dir, REQ).signoff[0];
  assert.ok(read(dir, `requests/${REQ}/request.md`).includes(`Signed off: ${DAY} owner, origin/${s1.file}`), show(r));
  assert.deepEqual(repoOrigin(dir), [], 'nothing in the repo');
  passes(strict(dir, A));
});
