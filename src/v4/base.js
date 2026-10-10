// What every v4 command shares: the failure that refuses, the clock, hashes,
// request names and the record paths.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
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

// Writes `text` to `path` under `top`, making its folders; a file whose text
// is already that is left alone, so indexing twice changes no byte.
export function write(top, path, text) {
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
