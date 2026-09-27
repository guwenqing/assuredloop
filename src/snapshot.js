// Snapshots of originals ([REC-3]): a header, a line starting with `---`, then
// the text exactly as fetched. SHA-256 is of the bytes after that line.
import { createHash } from 'node:crypto';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function formatSnapshot({ source, fetched, updated, text }) {
  const header = [`Source: ${source}`, `Fetched: ${fetched}`];
  if (updated) header.push(`Target updated: ${updated}`);
  header.push(`SHA-256: ${sha256(text)}`, '---', '');
  return Buffer.concat([Buffer.from(header.join('\n')), text]);
}

// The header fields, the text, and whether the text still matches its hash.
// Null when the header lacks Source, Fetched or SHA-256, or the separator.
export function parseSnapshot(bytes) {
  const fields = {};
  let pos = 0;
  while (pos < bytes.length) {
    let end = bytes.indexOf(0x0a, pos);
    if (end === -1) end = bytes.length;
    const line = bytes.subarray(pos, end).toString('utf8').replace(/\r$/, '');
    pos = end + 1;
    if (line.startsWith('---')) {
      const text = bytes.subarray(Math.min(pos, bytes.length));
      const recorded = (fields['SHA-256'] || '').split(/\s/)[0].toLowerCase();
      if (!recorded || !fields.Source || !fields.Fetched) return null;
      return { fields, text, recorded, intact: sha256(text) === recorded };
    }
    const m = line.match(/^([^:]+):\s?(.*)$/);
    if (m) fields[m[1]] = m[2];
  }
  return null;
}

// A file-name part from a source: `https://github.com/o/r/issues/31` gives
// `github-com-o-r-issues-31`.
export function slug(source) {
  const s = source.toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[^a-z0-9]+/g, '-')
    .slice(0, 50).replace(/^-+|-+$/g, '');
  return s || 'source';
}
