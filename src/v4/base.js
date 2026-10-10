// What every v4 command shares: the failure that refuses, the clock, hashes,
// request names and the record paths.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

// A refusal: exit 2, `al: <message>`, and nothing written.
export class Fail extends Error {
  constructor(message, next) { super(message); this.next = next; }
}

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// The clock, read only to stamp what the tool writes. SOURCE_DATE_EPOCH
// (seconds) stands in for it when set.
export const now = () => (process.env.SOURCE_DATE_EPOCH ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000) : new Date());
export const STAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\dZ$/;
export const stamp = (d) => d.toISOString().slice(0, 16) + 'Z';
export const day = (d) => d.toISOString().slice(0, 10);

// A request name: lowercase letters, digits and hyphens; never a path.
export const isName = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(s);

export const SCHEMA = 'assuredloop/1';
export const recordPath = (name) => `.assuredloop/records/requests/${name}.yaml`;
export const docRecordPath = (file) => `.assuredloop/records/${file}.yaml`;

// A path that stays inside the repo: relative, with no `..` part.
export const inside = (path) => !isAbsolute(path) && !path.split(/[\\/]/).includes('..');

// The first part of `path` (a path under `top`) that is a symlink, or null.
function linkOn(top, path) {
  let at = top;
  for (const part of path.split('/')) {
    at = join(at, part);
    let st;
    try { st = lstatSync(at); } catch { return null; }
    if (st.isSymbolicLink()) return at.slice(top.length + 1);
  }
  return null;
}

// The text of `path` under `top` (its bytes with `encoding` null), or null
// when it is absent. Nothing is read outside the repo or through a symlink,
// which can lead out of it: either is a refusal.
export function read(top, path, encoding = 'utf8') {
  if (!inside(path)) throw new Fail(`${path} is outside the repository; nothing was read or written`);
  const link = linkOn(top, path);
  if (link) throw new Fail(`${path} is reached through the symlink ${link}; nothing was read or written`, `make ${link} a real file or folder in this repo`);
  try { return readFileSync(join(top, path), encoding); } catch { return null; }
}
export const exists = (top, path) => existsSync(join(top, path));

// Refuses, before anything is written, when any of `paths` (paths under
// `top`) leaves the repo, or a part of one that exists is a symlink: records
// are written only through real folders, so nothing lands outside the repo.
export function guard(top, paths) {
  for (const path of paths) {
    if (!inside(path)) throw new Fail(`${path} is outside the repository; nothing was written`);
    const link = linkOn(top, path);
    if (link) throw new Fail(`${path} is reached through the symlink ${link}; records are written only through real folders, and nothing was written`, `make ${link} a real folder in this repo`);
  }
}

// Writes `text` to `path` under `top`, making its folders; a file whose text
// is already that is left alone, so indexing twice changes no byte.
export function write(top, path, text) {
  guard(top, [path]);
  if (read(top, path) === text) return false;
  mkdirSync(dirname(join(top, path)), { recursive: true });
  writeFileSync(join(top, path), text);
  return true;
}

// The first file name free in `dir`: `<base>.md`, else `<base>-2.md`...
export function freeName(top, dir, base) {
  let file = `${base}.md`;
  for (let n = 2; existsSync(join(top, dir, file)); n++) file = `${base}-${n}.md`;
  return file;
}
