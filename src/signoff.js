// The organized section ([REC-4]), its sign-offs ([REC-5]) and the blocked
// state ([REC-6]). Everything is judged from the text in the files, never from
// commits, so a squash changes nothing.
import { parseSections, sameSection } from './sections.js';
import { isSignoff, parseSnapshot } from './snapshot.js';

const ORGANIZED = /^Organized (requirement|question)$/;
const SIGNED_OFF = /^Signed off:/;

// The organized section of request.md: from its heading to the next heading of
// level 1 or 2, without any `Signed off:` line. `start` and `end` are offsets
// in `md`; `text` is what a sign-off binds.
export function organized(md) {
  const sections = parseSections(md);
  let offset = md.length - sections.reduce((n, s) => n + s.text.length, 0);
  let found = null;
  for (const s of sections) {
    if (found && s.level <= 2) break;
    if (!found && s.level <= 2 && ORGANIZED.test(s.title)) found = { start: offset, raw: '' };
    if (found) found.raw += s.text;
    offset += s.text.length;
  }
  if (!found) return null;
  const text = found.raw.split(/(?<=\n)/).filter((l) => !SIGNED_OFF.test(l)).join('');
  return { start: found.start, end: found.start + found.raw.length, raw: found.raw, text };
}

// The parts of an organized section: the intro, each `### R<n>` sub-section,
// and the `Out:` and `Assumed:` paragraphs. Parts with no text are left out.
export function parts(text) {
  const out = [];
  let current = { key: 'intro', text: '' };
  const lines = text.split(/(?<=\n)/).slice(1);
  const subheads = new Set(parseSections(text).filter((s) => s.level >= 3).map((s) => s.line - 2));
  lines.forEach((line, i) => {
    let key = null;
    if (subheads.has(i)) key = line.match(/^\s*#+\s+(R\d+)\b/)?.[1] ?? line.replace(/^\s*#+\s+/, '').trim();
    else if (/^(Out|Assumed):/.test(line)) key = line.match(/^(Out|Assumed)/)[1];
    // [REC-4]: a tier-1 requirement MAY be one line, `R1: …`, read as an `### R1` sub-section.
    else if (/^R\d+:\s/.test(line)) key = line.match(/^(R\d+)/)[1];
    if (key) {
      out.push(current);
      current = { key, text: '' };
    }
    current.text += line;
  });
  out.push(current);
  return out.filter((p) => p.text.trim());
}

// The same part, ignoring the number in `### R<n>` (a child renumbers what it copies).
const unnumbered = (text) => text.replace(/^(\s*#+\s+)R\d+\b/, '$1R').replace(/^R\d+:/, 'R:');
export const samePart = (a, b) => sameSection(unnumbered(a.text), unnumbered(b.text));

// The sign-off that counts: the one with the latest Fetched among those whose
// signed text still matches its SHA-256. On a tie, the one the `Signed off:`
// line names; if it names none of them, `tie` gives the time.
export function latestSignoff(tree, dir, md) {
  const signoffs = [];
  for (const file of tree.list(`${dir}/origin`) ?? []) {
    const bytes = tree.read(`${dir}/origin/${file}`);
    const s = bytes && parseSnapshot(bytes);
    if (isSignoff(s) && s.intact) signoffs.push({ file, fetched: s.fields.Fetched, text: s.text.toString('utf8') });
  }
  if (!signoffs.length) return { signoff: null };
  const last = signoffs.reduce((m, s) => (s.fetched > m ? s.fetched : m), '');
  const latest = signoffs.filter((s) => s.fetched === last);
  if (latest.length === 1) return { signoff: latest[0] };
  const line = md.split('\n').find((l) => SIGNED_OFF.test(l)) ?? '';
  // Only the line's first pointer counts; later ones cite earlier sign-offs.
  const named = line.match(/origin\/([^\s,;()]+)/)?.[1];
  const chosen = latest.find((s) => s.file === named);
  return chosen ? { signoff: chosen } : { signoff: null, tie: last };
}

// The request whose `## Parts` section names `name` as `request <name>`: an
// open one first, else an archived one, since [REC-5] sets no condition that
// the parent stays open.
export function parentOf(tree, name) {
  const dirs = [...(tree.list('requests') ?? []).filter((d) => d !== 'archive').map((d) => ['requests', d]),
    ...(tree.list('requests/archive') ?? []).map((d) => ['requests/archive', d])];
  for (const [at, other] of dirs) {
    if (other === name) continue;
    const md = tree.read(`${at}/${other}/request.md`)?.toString('utf8');
    if (!md) continue;
    const sections = parseSections(md);
    const i = sections.findIndex((s) => s.level <= 2 && s.title === 'Parts');
    if (i < 0) continue;
    let text = '';
    for (const s of sections.slice(i)) {
      if (text && s.level <= 2) break;
      text += s.text;
    }
    if (new RegExp(`\\brequest ${name}(?![\\w-])`).test(text)) return { name: other, dir: `${at}/${other}`, md };
  }
  return null;
}

// Whether a request is blocked, and why ([REC-6]). One function for every
// command that must know: context now; consolidate, conclude and check later.
export function signoffState(tree, dir, name) {
  const md = tree.read(`${dir}/request.md`).toString('utf8');
  const org = organized(md);
  if (!org) return { blocked: true, reason: 'no organized requirement in request.md' };
  const { signoff: own, tie } = latestSignoff(tree, dir, md);
  const parent = parentOf(tree, name);
  const parentSignoff = parent ? latestSignoff(tree, parent.dir, parent.md).signoff : null;

  if (!parentSignoff) {
    if (!own) {
      const why = tie ? `: two sign-offs at ${tie}; which counts is not known` : '';
      return { blocked: true, reason: `awaiting owner sign-off${why}` };
    }
    if (sameSection(org.text, own.text)) return { blocked: false, signoff: own };
    return { blocked: true, reason: `changed since ${own.file}`, signoff: own, changed: changedParts(org.text, own.text) };
  }

  // A child: every part is in the parent's or its own signed text, and every
  // part it signed itself is still there.
  const now = parts(org.text);
  const covers = [...parts(parentSignoff.text), ...(own ? parts(own.text) : [])];
  const uncovered = now.filter((p) => !covers.some((c) => samePart(p, c))).map((p) => p.key);
  const dropped = own ? parts(own.text).filter((p) => !now.some((c) => samePart(p, c))).map((p) => p.key) : [];
  if (!uncovered.length && !dropped.length) return { blocked: false, signoff: own, parent: parent.name, parentSignoff };
  const changed = [...uncovered, ...dropped];
  if (own) return { blocked: true, reason: `changed since ${own.file}`, signoff: own, parent: parent.name, parentSignoff, changed };
  return { blocked: true, reason: `awaiting owner sign-off (not in ${parent.name}'s signed text)`, parent: parent.name, parentSignoff, changed };
}

// The parts added, changed or removed between the signed text and now.
export function changedParts(now, signed) {
  const a = parts(now);
  const b = parts(signed);
  const changed = a.filter((p) => !b.some((q) => q.key === p.key && sameSection(q.text, p.text))).map((p) => p.key);
  const removed = b.filter((q) => !a.some((p) => p.key === q.key)).map((q) => q.key);
  return [...changed, ...removed];
}
