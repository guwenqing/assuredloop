// What every v4 command shares: the failure that refuses, the clock, hashes,
// request names and the record paths.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync } from 'node:fs';
import { dirname, join } from 'node:path';

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

export const read = (top, path) => {
  try { return readFileSync(join(top, path), 'utf8'); } catch { return null; }
};
export const exists = (top, path) => existsSync(join(top, path));

// Refuses, before anything is written, when a part of any of `paths` (paths
// under `top`) that exists is a symlink: records are written only through
// real folders, so nothing lands outside the repo.
export function guard(top, paths) {
  for (const path of paths) {
    let at = top;
    for (const part of path.split('/')) {
      at = join(at, part);
      let st;
      try { st = lstatSync(at); } catch { break; }
      if (st.isSymbolicLink()) throw new Fail(`${path} is reached through the symlink ${at.slice(top.length + 1)}; records are written only through real folders, and nothing was written`, `make ${at.slice(top.length + 1)} a real folder in this repo`);
    }
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
