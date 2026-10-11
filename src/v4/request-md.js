// The parts of request.md that v4 reads and writes: the organized
// requirement (or question), its requirements with their `from` markers, the
// Signed off line and the decisions.
import { sha256 } from './base.js';

const ORGANIZED = /^##\s+Organized (requirement|question)\s*$/;
const MARKER = /^\s*<!--.*-->\s*$/;
const SIGNED_OFF = /^Signed off:/;
const lf = (md) => md.replace(/\r\n?/g, '\n');

// The organized section: its line range in `md`, from its `##` heading to the
// next `#` or `##` heading. Null when there is none.
export function organized(md) {
  const lines = lf(md).split('\n');
  const start = lines.findIndex((l) => ORGANIZED.test(l));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^#{1,2}\s/.test(l));
  if (end < 0) end = lines.length;
  return { lines, start, end };
}

// What a sign-off binds: the organized section with no Signed off line and no
// marker framing, the marker line and the blank line after it (D22, as the
// paragraph hash drops it), so adding markers changes no signed byte.
export function signedText(md) {
  const o = organized(md);
  if (!o) return null;
  const lines = o.lines.slice(o.start, o.end);
  const kept = lines.filter((l, i) => !SIGNED_OFF.test(l) && !MARKER.test(l)
    && !(l === '' && i > 0 && MARKER.test(lines[i - 1])));
  while (kept.length && !kept.at(-1).trim()) kept.pop();
  return `${kept.join('\n')}\n`;
}

// Each `### R<n> <title>` (or `### Q<n>`): { id, title, text, sha256, from }.
// Its text runs from the heading to the next heading, or an Out:, Assumed:
// or Signed off: line, with no marker line and no blank line at either end.
// `from` lists the snapshot files of the `<!-- R<n> from:... -->` markers.
export function requirements(md) {
  const o = organized(md);
  if (!o) return [];
  const from = new Map();
  const out = [];
  let cur = null;
  const close = () => {
    if (!cur) return;
    const body = cur.lines.filter((l) => !MARKER.test(l));
    while (body.length && !body.at(-1).trim()) body.pop();
    const text = `${body.join('\n')}\n`;
    out.push({ id: cur.id, title: cur.title, text, sha256: sha256(text) });
    cur = null;
  };
  for (const l of o.lines.slice(o.start + 1, o.end)) {
    const m = l.match(/^\s*<!--\s*([RQ]\d+)\b(.*?)-->\s*$/);
    if (m) {
      const files = [...m[2].matchAll(/(?:^|\s)from:(\S+)/g)].flatMap((x) => x[1].split(',').filter(Boolean));
      from.set(m[1], [...(from.get(m[1]) ?? []), ...files]);
    }
    const h = l.match(/^###\s+([RQ]\d+)\b\s*(.*)$/);
    if (h) { close(); cur = { id: h[1], title: h[2].trim(), lines: [l] }; continue; }
    if (/^#{1,6}\s/.test(l) || /^(Out|Assumed|Signed off):/.test(l)) { close(); continue; }
    if (cur) cur.lines.push(l);
  }
  close();
  return out.map((r) => ({ ...r, from: from.get(r.id) ?? [] }));
}

// Sets `Signed off: …` as the last line of the organized section, in place of
// any earlier one there.
export function setSignedOff(md, line) {
  const o = organized(md);
  const lines = o.lines.filter((l, i) => !(i > o.start && i < o.end && SIGNED_OFF.test(l)));
  const end = o.end - (o.lines.length - lines.length);
  let last = end - 1;
  while (last > o.start && !lines[last].trim()) last--;
  lines.splice(last + 1, 0, line);
  return lines.join('\n');
}

// The D numbers in `## Decisions`.
export function decisionNumbers(md) {
  const lines = lf(md).split('\n');
  const at = lines.findIndex((l) => /^##\s+Decisions\s*$/.test(l));
  if (at < 0) return [];
  const out = [];
  for (const l of lines.slice(at + 1)) {
    if (/^#{1,2}\s/.test(l)) break;
    const m = l.match(/^- D(\d+)\b/);
    if (m) out.push(Number(m[1]));
  }
  return out;
}

// `entry` as the last entry of `## Decisions`, the section added at the end
// when missing.
export function addDecision(md, entry) {
  const lines = lf(md).split('\n');
  const at = lines.findIndex((l) => /^##\s+Decisions\s*$/.test(l));
  if (at < 0) return `${lf(md).replace(/\n*$/, '\n')}\n## Decisions\n\n${entry}\n`;
  let end = lines.findIndex((l, i) => i > at && /^#{1,2}\s/.test(l));
  if (end < 0) end = lines.length;
  let last = end;
  while (last > at + 1 && !lines[last - 1].trim()) last--;
  // A heading right after the entry gets a blank line before it.
  const after = last === end && end < lines.length ? [entry, ''] : [entry];
  if (last === at + 1) after.unshift('');
  return [...lines.slice(0, last), ...after, ...lines.slice(last)].join('\n');
}
