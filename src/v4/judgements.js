// A hint clears by a fix, or by a recorded one-line judgement with its
// reason (LD-12, adr-rewrite/R1, #88). `al record <name> judgement` keeps,
// in the record of an open request, the versions of both sides of the hint;
// al check clears the hint while they are the versions of now, and names the
// judgement as stale when one side changed. issue-changed keeps its own
// form (kept-items.js), and a judgement on a binding hint moves the binding
// (indexer.js), so the versions are kept once. A judgement never clears a
// `not ok`: it is shown on its line.
import { read, sha256 } from './base.js';
import { blocksOf, lf } from './markers.js';
import { namedIds } from './repos.js';
import { qualify, resolve } from './state.js';
import { CHANGED } from './kept-items.js';

// The hints whose judgement moves a binding.
export const BINDING_HINTS = ['stale-base', 'holder-changed', 'binding-unknown'];
const OWN_FORM = new Set([CHANGED, ...BINDING_HINTS]);
const list = (x) => (Array.isArray(x) ? x : []);
const isMap = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

// The path of a finding: its file, with no line and no "at the base".
const pathOf = (f) => String(f.file ?? f.where ?? '').replace(/ at the base .*$/, '').replace(/:\d+$/, '');
// The ID that a finding's line shows: a lint with no ID shows "-".
const idOf = (f) => f.id ?? '-';
// Whether `on` names finding `f`: its ID, or its path when its ID is "-".
export const names = (f, on) => String(on) === idOf(f) || (idOf(f) === '-' && String(on) === pathOf(f));

// The text hash of an ID in `state`, or null when it does not resolve. A bare
// ID of a request's own paragraph, or a bare R<n>, is read in `request`.
function shaOf(state, id, request) {
  const r = request ? state.requests.get(request) : null;
  const got = resolve(state, qualify(id, request, new Set(r?.paras.keys() ?? [])));
  return got?.sha ?? null;
}

// The text of the block that starts at `line` of `file`, as the marker
// parser reads it: up to the next block or marker, a list after a blank line
// included.
function blockAt(state, file, line) {
  const lines = lf(String(read(state.top, file) ?? '')).split('\n');
  const { blocks, markers } = blocksOf(lines);
  const next = [...blocks.map((b) => b.first), ...markers].filter((i) => i > line - 1);
  return lines.slice(line - 1, next.length ? Math.min(...next) : lines.length).join('\n').trimEnd();
}

// The versions that a judgement on finding `f` keeps. For adr-changed, the
// text of the ADR file that the hint is on (its status line left out, its
// marker line in) and its status line. For a hint with no ID on a line of a
// file, such as no-id, the text of the paragraph at that line: its message
// names its place, which a move changes. For another hint, the hint's
// message, and the text of the paragraph it is on and of each that its
// message names.
export function keptOf(state, f) {
  if (f.code === 'adr-changed') {
    const file = pathOf(f);
    const a = state.adrList.find((x) => x.file === file);
    return { files: [{ file, text_sha256: a ? sha256(a.body) : null, status_sha256: a ? sha256(a.line ?? '') : null }] };
  }
  const at = /^(.+):(\d+)$/.exec(String(f.file && f.line ? `${f.file}:${f.line}` : f.where ?? ''));
  if (idOf(f) === '-' && at) return { blocks: [sha256(blockAt(state, at[1], Number(at[2])))] };
  const request = /^([a-z0-9][a-z0-9-]*)\//.exec(idOf(f))?.[1] ?? null;
  const ids = [...new Set([...(idOf(f) === '-' ? [] : [f.id]), ...namedIds(f.message, { qualified: false })])];
  return { message_sha256: [sha256(f.message)], keeps: ids.map((id) => ({ id, sha256: shaOf(state, id, request) })) };
}

// What changed since judgement `j` on finding `f`, or null when it holds.
function changedSince(state, j, f) {
  const now = keptOf(state, f);
  if (f.code === 'adr-changed') {
    // The file that the judgement kept; after a rename, the one file of that number (DES-113).
    const [cur] = now.files;
    const files = list(j.files).filter(isMap);
    const k = files.find((x) => x.file === cur.file)
      ?? (files.length === 1 && state.adrList.filter((x) => x.id === f.id).length === 1 ? files[0] : null);
    if (!k || k.text_sha256 !== cur.text_sha256) return `${f.id}'s text (${cur.file})`;
    if (k.status_sha256 !== cur.status_sha256) return `${f.id}'s status line (${cur.file})`;
    return null;
  }
  if (now.blocks) return list(j.blocks).includes(now.blocks[0]) ? null : `the text at ${f.where ?? `${f.file}:${f.line}`}`;
  if (!list(j.message_sha256).includes(now.message_sha256[0])) return 'the hint\'s text';
  const request = /^([a-z0-9][a-z0-9-]*)\//.exec(idOf(f))?.[1] ?? null;
  const moved = list(j.keeps).find((k) => isMap(k) && shaOf(state, String(k.id), request) !== (k.sha256 ?? null));
  return moved ? String(moved.id) : null;
}

const day = (j) => String(j.recorded ?? '').slice(0, 10);

// The judgement pass of al check over the findings of state `state`:
// apply(findings) returns them with each hint that a judgement clears left
// out, a stale judgement named on its hint, and a judgement on a `not ok`
// shown on its line; judged(bindings) is the message of the one line of the
// current judgements, those of the binding hints included, or null; `codes`
// are the codes of the hints that a judgement cleared.
export function judgementPass(state) {
  const entries = [...state.requests.values()].filter((r) => r.open)
    .flatMap((r) => list(r.data?.judgements).filter((j) => isMap(j) && j.id != null && typeof j.hint === 'string' && !OWN_FORM.has(j.hint) && j.on != null)
      .map((j) => ({ r, j })));
  const cleared = new Map();
  const stale = new Set();
  const codes = new Set();
  const apply = (findings) => findings.flatMap((f) => {
    const mine = entries.filter(({ j }) => j.hint === f.code && names(f, j.on));
    if (!mine.length || f.severity === 'info') return [f];
    const last = mine.at(-1);
    if (f.severity === 'not ok') return [{ ...f, message: `${f.message} · judgement ${last.r.name}/${last.j.id} is shown; it does not clear a not ok` }];
    const holds = mine.findLast(({ j }) => changedSince(state, j, f) === null);
    if (holds) {
      cleared.set(`${holds.r.name}/${holds.j.id}`, holds);
      codes.add(f.code);
      return [];
    }
    stale.add(`${last.r.name}/${last.j.id}`);
    return [{ ...f, message: `${f.message}; the judgement ${last.r.name}/${last.j.id} (${day(last.j)}) is stale: ${changedSince(state, last.j, f)} changed since it` }];
  });
  const judged = (bindings = new Map()) => {
    // A judgement that is stale on any of its hints is not current.
    const all = new Map([...cleared].filter(([k]) => !stale.has(k)));
    for (const [k, v] of bindings) {
      if (v.hinted) continue;
      all.set(k, v);
      codes.add(v.j.hint);
    }
    if (!all.size) return null;
    const n = (j) => Number(String(j.id).replace(/^\D+/, '')) || 0;
    return [...all.values()].sort((a, b) => a.r.name.localeCompare(b.r.name) || n(a.j) - n(b.j))
      .map(({ r, j }) => `${r.name}/${j.id} ${j.hint} ${j.on}: ${j.reason}`).join('; ');
  };
  return { apply, judged, codes };
}
