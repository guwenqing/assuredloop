// The original files of the requests (origin-elsewhere/R1): the owner's
// words, the sign-off snapshots and the other source snapshots. A project
// keeps them in the repo, in requests/<name>/origin/, or outside it, when its
// config says `originals: {outside: <name>}`. Each worker then maps the name
// to a folder in assuredloop/places.yaml in the user's config folder, and the
// files are <folder>/<request>/<file>. The shared files never name that place.
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { parse } from 'yaml';
import { Fail, inside, read, sha256 } from './base.js';
import { SIGNED } from './snapshot.js';

// The name the config keeps the files outside by, or null when they are in
// the repo. A bad `originals:` is a refusal.
export function outsideName(config) {
  const o = config?.originals;
  if (o === undefined || o === null) return null;
  if (typeof o !== 'object' || Array.isArray(o) || typeof o.outside !== 'string' || !o.outside) {
    throw new Fail('.assuredloop/config.yaml: originals: give {outside: <name>}, or leave it out to keep the original files in the repo', 'fix the file and run it again');
  }
  return o.outside;
}

export const placesFile = () => join(process.env.XDG_CONFIG_HOME || join(process.env.HOME || homedir(), '.config'), 'assuredloop', 'places.yaml');

// Where the original files are: null when the project keeps them in the repo;
// else { name, file, folder }, with folder null when no place is set on this
// machine. A places file that cannot be read, is not a YAML mapping, or whose
// line is not the path of a folder is a refusal, never "no place set".
export function placeOf(config) {
  const name = outsideName(config);
  if (name === null) return null;
  const file = placesFile();
  const bad = (why) => new Fail(`${file}: ${why}`, `fix ${file}: one line per name, ${name}: /path/to/folder`);
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { name, file, folder: null };
    throw bad(`cannot be read (${e.code ?? e.message})`);
  }
  let places;
  try {
    places = parse(text) ?? {};
  } catch (e) {
    throw bad(`not valid YAML: ${e.message.split('\n')[0]}`);
  }
  if (typeof places !== 'object' || Array.isArray(places)) throw bad('give a mapping of names to folders');
  if (!Object.hasOwn(places, name)) return { name, file, folder: null };
  const folder = places[name];
  if (typeof folder !== 'string' || !isAbsolute(folder)) throw bad(`the line for "${name}" is not the absolute path of a folder`);
  let st;
  try {
    st = statSync(folder);
  } catch {
    st = null;
  }
  if (!st?.isDirectory()) throw bad(`the line for "${name}" names ${folder}, which is not a folder`);
  return { name, file, folder };
}

export const logical = (request, file) => `originals:${request}/${file}`;
export const noPlace = (place) => `no place is set on this machine for "${place.name}"`;

// The bytes of a snapshot after its separator line, as al new and al record
// hashed them: the first line that is `---` (or `--- signed text ---`), or
// only `--- signed text ---` for a sign-off. Null when there is none.
export function snapshotText(bytes, signedOnly) {
  const seps = signedOnly ? [`\n${SIGNED}\n`] : ['\n---\n', `\n${SIGNED}\n`];
  const at = seps.map((s) => [bytes.indexOf(s), s]).filter(([i]) => i >= 0).sort((a, b) => a[0] - b[0])[0];
  return at ? bytes.subarray(at[0] + at[1].length) : null;
}

// The bytes of `path` under `top`: { bytes }, { absent } when nothing is
// there, or { problem }. Only an absent file may be looked for elsewhere.
function readRepo(top, rev, get, path) {
  if (rev) {
    const t = get(path);
    return typeof t === 'string' ? { bytes: Buffer.from(t) } : { absent: true };
  }
  let bytes;
  try {
    bytes = read(top, path, null);
  } catch (e) {
    return { problem: `${path} cannot be read: ${e.message}` };
  }
  if (bytes !== null) return { bytes };
  let st;
  try {
    st = lstatSync(join(top, path));
  } catch (e) {
    return e.code === 'ENOENT' ? { absent: true } : { problem: `${path} cannot be read (${e.code ?? e.message})` };
  }
  return { problem: `${path} is there, but it ${st.isDirectory() ? 'is a folder' : 'cannot be read as a file'}` };
}

// The bytes of <folder>/<request>/<file>, or { problem } that names it by its
// logical name only.
function readPlace(folder, request, file) {
  const name = logical(request, file);
  for (const p of [join(folder, request), join(folder, request, file)]) {
    let st;
    try {
      st = lstatSync(p);
    } catch (e) {
      return { problem: e.code === 'ENOENT' ? `${name} is missing` : `${name} cannot be read (${e.code ?? e.message})` };
    }
    if (st.isSymbolicLink()) return { problem: `${name} is reached through a symlink, and al does not read through a symlink` };
  }
  try {
    return { bytes: readFileSync(join(folder, request, file)) };
  } catch (e) {
    return { problem: `${name} cannot be read (${e.code === 'EISDIR' ? 'it is a folder' : e.code ?? e.message})` };
  }
}

// The one reader of original files (design section 2). Gives (r, file,
// signedOnly) => { text } (the bytes after the separator), { unchecked } (kept
// outside, not in the repo, no place set), or { problem }; and with an
// expected sha256, check() gives { status: verified | not checked | failed,
// name, problem }. Each file is read once per state, and every reader uses
// the same result.
export function originals(top, rev, get, config) {
  const place = placeOf(config);
  const seen = new Map();
  const result = (r, file, signedOnly) => {
    const base = String(file).replace(/^origin\//, '');
    const key = `${r.dir}\0${base}\0${signedOnly}`;
    if (seen.has(key)) return seen.get(key);
    let out;
    if (!/^[^/\\]+$/.test(base) || base === '.' || base === '..') out = { problem: `${file} is not a file in ${r.dir}/origin/`, name: `${r.dir}/origin/${file}` };
    else {
      const path = `${r.dir}/origin/${base}`;
      let got = readRepo(top, rev, get, path);
      let name = path;
      if (got.absent && place) {
        name = logical(r.name, base);
        got = place.folder ? readPlace(place.folder, r.name, base) : { unchecked: noPlace(place) };
      } else if (got.absent) got = { problem: `${path} is missing` };
      if (got.bytes) {
        const t = snapshotText(got.bytes, signedOnly);
        out = t === null ? { name, problem: `${name} has no ${signedOnly ? `"${SIGNED}"` : '"---"'} line, so its text cannot be read` } : { name, text: t };
      } else out = { name, ...got };
    }
    seen.set(key, out);
    return out;
  };
  const check = (r, file, sha, signedOnly) => {
    const got = result(r, file, signedOnly);
    if (got.unchecked) return { status: 'not checked', name: got.name, file: String(file).replace(/^origin\//, ''), problem: got.unchecked };
    if (got.problem) return { status: 'failed', name: got.name, problem: got.problem };
    if (sha256(got.text) !== sha) return { status: 'failed', name: got.name, problem: `${got.name} changed: its ${signedOnly ? 'signed ' : ''}text does not have the sha256 that the record lists`, changed: true };
    return { status: 'verified', name: got.name, text: got.text };
  };
  return { place, result, check };
}

// The result of every original file that request r's record names, for al
// conclude: [{ file, status, problem }]. An entry with no file or no sha256
// is failed, as in record-evidence.
export function requestOriginals(state, r) {
  const data = r.data ?? {};
  const list = (x) => (Array.isArray(x) ? x : []);
  const ok = (x) => x && typeof x.file === 'string' && x.file && typeof x.sha256 === 'string' && x.sha256;
  const one = (x, signedOnly, what) => (ok(x) ? { file: x.file, ...state.originals.check(r, x.file, x.sha256, signedOnly) }
    : { file: typeof x?.file === 'string' && x.file ? x.file : '-', status: 'failed', problem: `a ${what} entry with no file or no sha256` });
  return [...list(data.sources).map((s) => one(s, false, 'sources')), ...list(data.signoff).map((s) => one(s, true, 'sign-off'))];
}

// --- writing

// A source given to al record (--url, --source, --presented) with the place
// in it: a value that is a path inside the folder becomes
// originals:<path in the folder>, and the folder's path anywhere else in it
// becomes originals:, so no shared file names the place.
export function sourceOf(value, place, cwd) {
  if (typeof value !== 'string' || !place?.folder) return value;
  const folders = [...new Set([place.folder, realpathSync(place.folder)].map((f) => f.replace(/\/+$/, '')))].sort((a, b) => b.length - a.length);
  const home = process.env.HOME || homedir();
  const path = value.startsWith('~/') ? join(home, value.slice(2)) : resolve(cwd, value);
  for (const f of folders) {
    const rel = relative(f, path);
    if (rel && inside(rel)) return `originals:${rel}`;
  }
  let out = value;
  for (const f of folders) out = out.split(`${f}/`).join('originals:').split(f).join('originals:');
  return out;
}
