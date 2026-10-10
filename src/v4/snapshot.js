// Snapshots in a request's origin/ (the v1 format, kept): a header, a line
// starting with `---`, then the text exactly as given. The SHA-256 is of the
// bytes after that line.
import { sha256 } from './base.js';

export const SIGNED = '--- signed text ---';

export function formatSnapshot({ source, words, fetched, text, signed = false }) {
  const header = [`Source: ${source}`];
  if (words !== undefined) header.push(`Owner's words: ${words}`);
  header.push(`Fetched: ${fetched}`, `SHA-256: ${sha256(text)}${signed ? '   (of the signed text below)' : ''}`, signed ? SIGNED : '---', '');
  return Buffer.concat([Buffer.from(header.join('\n')), Buffer.from(text)]);
}

// A file-name part from a source: `https://github.com/o/r/issues/31` gives
// `github-com-o-r-issues-31`.
export function slug(source) {
  const s = source.toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[^a-z0-9]+/g, '-').slice(0, 50).replace(/^-+|-+$/g, '');
  return s || 'source';
}
