// The change spec ([SPC-5]) and the state of each held section: the link
// first ([STA-1]), then the content ([STA-2]), and whether a block retains
// nothing, shown positively ([STA-3]).
import { openTree } from './tree.js';
import { parseSections, sameSection } from './sections.js';
import { rootOf, baseline } from './spec.js';

const HEAD = /^### \[([A-Z][A-Z0-9]*-\d+(?:\.\d+)*)\]@(\d+)\s*(.*)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

// The Was: or Now: text after a label: a fenced block, or the indented lines
// (blank lines inside kept), with the indent removed.
export function takeText(lines, i) {
  while (i < lines.length && !lines[i].trim()) i++;
  const f = lines[i]?.match(FENCE);
  if (f) {
    const out = [];
    for (i++; i < lines.length && !(lines[i].trim().startsWith(f[1]) && lines[i].trim() === lines[i].trim().match(/^[`~]+/)[0]); i++) out.push(lines[i]);
    return { text: out.join('\n') + '\n', next: i + 1 };
  }
  const out = [];
  for (; i < lines.length && (!lines[i].trim() || /^( {4}|\t)/.test(lines[i])); i++) out.push(lines[i].replace(/^( {4}|\t)/, ''));
  while (out.length && !out.at(-1).trim()) out.pop();
  return { text: out.length ? out.join('\n') + '\n' : null, next: i };
}

// The blocks of one change.md, each `<request>/<ID>@<n>`.
export function parseChange(text, request) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => /^##\s+Spec changes\s*$/.test(l));
  const blocks = [];
  let b = null;
  for (let i = start + 1; start >= 0 && i < lines.length;) {
    const line = lines[i];
    const h = line.match(HEAD);
    if (h) {
      const [, id, n, rest] = h;
      const on = rest.match(/builds on (\S+)/)?.[1];
      const marker = (name) => rest.match(new RegExp(`${name} (\\S+) \\((D\\d+)\\)`))?.slice(1, 3) ?? null;
      b = {
        request, id, n: Number(n), key: `${request}/${id}@${n}`,
        op: /^modify\b/.test(rest) ? 'modify' : /^add\b/.test(rest) ? 'add' : 'remove',
        path: rest.match(/^add in (\S+)/)?.[1] ?? null,
        anchor: rest.match(/^(?:add after|remove, was after) \[([^\]]+)\]/)?.[1] ?? null,
        base: on ? (on.startsWith('@') ? `${request}/${id}${on}` : on) : Number(n) > 1 ? `${request}/${id}@${Number(n) - 1}` : null,
        dropped: marker('Dropped'), kept: marker('Kept'), revised: marker('Revised'),
        forR: rest.match(/for (R\d+(?:,\s*R\d+)*)/)?.[1].split(/,\s*/) ?? [],
        was: null, now: null,
      };
      blocks.push(b);
      i++;
    } else if (b && /^(Was|Now):\s*$/.test(line.trim())) {
      const { text: t, next } = takeText(lines, i + 1);
      b[line.trim().startsWith('Was') ? 'was' : 'now'] = t;
      i = next;
    } else if (/^##?\s/.test(line)) {
      break;
    } else {
      i++;
    }
  }
  return blocks;
}

const same = (a, b) => a != null && b != null && sameSection(a, b);
// A section's body: the lines under its heading, trailing spaces and blank edge lines
// dropped ([SPC-4]); indentation is kept.
const body = (text) => text.replace(/\r\n/g, '\n').split('\n').slice(1).map((l) => l.replace(/[ \t]+$/, '')).join('\n').replace(/^\n+|\n+$/g, '');

// Every block of every request (archived ones too, for chains), with the
// request's status.
export function allBlocks(tree) {
  const blocks = new Map();
  const dirs = [
    ...(tree.list('requests') ?? []).filter((d) => d !== 'archive').map((d) => ({ dir: `requests/${d}`, name: d, open: true })),
    ...(tree.list('requests/archive') ?? []).map((d) => ({ dir: `requests/archive/${d}`, name: d, open: false })),
  ];
  for (const { dir, name, open } of dirs) {
    const text = tree.read(`${dir}/change.md`)?.toString('utf8');
    if (!text) continue;
    const md = tree.read(`${dir}/request.md`)?.toString('utf8') ?? '';
    const dropped = /\bStatus:\s*dropped\b/.test(md.split('\n').find((l) => /\bStatus:/.test(l)) ?? '');
    for (const b of parseChange(text, name)) blocks.set(b.key, { ...b, open, requestDropped: dropped });
  }
  return blocks;
}

// [STA-1]: the link of a block that builds on another, checked first.
function linkState(b, blocks) {
  if (!b.base) return null;
  const x = blocks.get(b.base);
  if (!x) return 'broken link';
  const seen = new Set([b.key]);
  for (let cur = b; cur?.base; cur = blocks.get(cur.base)) {
    if (seen.has(cur.base)) return 'broken link';
    seen.add(cur.base);
  }
  if (!(b.was === null && x.now === null) && !same(b.was, x.now)) return 'broken link';
  if ((x.dropped || x.requestDropped) && !x.kept) return 'base dropped';
  if (x.revised && x.request !== b.request) return 'base revised';
  return null;
}

// [STA-2]: the state of every open block, and [STA-3]: whether it retains nothing.
export function changeStates(top, { at } = {}) {
  const tree = openTree(top, at);
  return statesOf(baseline(tree, rootOf(top, tree, at)), allBlocks(tree));
}

// The states of the blocks `include` picks (the open ones by default), read
// against `files`: the baseline's files, each with its sections.
export function statesOf(files, blocks, include = (b) => b.open) {
  const sections = files.flatMap((f) => f.sections);
  const byId = new Map();
  const fileOf = new Map();
  for (const f of files) {
    for (const s of f.sections) if (s.id && !byId.has(s.id)) { byId.set(s.id, s.text); fileOf.set(s.id, f.path); }
  }
  const links = new Map([...blocks.values()].map((b) => [b.key, linkState(b, blocks)]));
  const valid = (b) => b.base && links.get(b.key) === null;
  // Blocks this one reaches upwards through valid links, nearest first.
  const upward = (b) => {
    const out = [];
    for (let cur = b; valid(cur) && !out.includes(cur.base); cur = blocks.get(cur.base)) out.push(cur.base);
    return out.map((k) => blocks.get(k));
  };

  const result = [];
  for (const b of blocks.values()) {
    if (!include(b)) continue;
    const base = byId.get(b.id);
    const atWas = b.op === 'add' ? base === undefined : same(base, b.was);
    const entry = (state, by = null, candidates = []) => ({
      request: b.request, id: b.id, n: b.n, block: b.key, op: b.op, state, by, candidates, forR: b.forR,
      file: fileOf.get(b.id) ?? b.path ?? fileOf.get(b.anchor) ?? null,
      retainsNothing: same(b.was, b.now) || atWas || state === 'waiting',
    });
    const link = links.get(b.key);
    if (link) { result.push(entry(link)); continue; }
    if (same(b.was, b.now)) { result.push(entry('no change yet')); continue; }
    if (b.op === 'remove' ? base === undefined : same(base, b.now)) { result.push(entry('consolidated')); continue; }
    const carriers = [...blocks.values()].filter((d) => d.key !== b.key && upward(d).includes(b) && same(base, d.now));
    if (carriers.length) { result.push({ ...entry('carried', carriers[0].key), carriers: carriers.map((d) => d.key) }); continue; }
    const waitOn = upward(b).find((u) => (u.op === 'add' ? base === undefined : same(base, u.was)));
    if (waitOn) { result.push(entry('waiting', waitOn.key)); continue; }
    if (atWas) { result.push(entry('pending')); continue; }
    if (base === undefined) {
      const bodies = [b.now, b.was].filter(Boolean).map(body);
      result.push(entry('not found', null, sections.filter((s) => s.id && bodies.includes(body(s.text))).map((s) => s.id)));
      continue;
    }
    result.push(entry('differs'));
  }
  return result;
}
