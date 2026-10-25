// C7 (light-design R3, LD-22): a work item that changed after the change
// relied on it. `al index --issues <folder>` keeps, by itself, the hash of
// each task item's text at the moment of reliance, in the request's record
// (`items:`); no person and no AI writes or reads it. `al check --issues
// <folder>` gives `issue-changed` when the text now differs, and "not known"
// when no text was kept at that moment or the item cannot be read; never
// "unchanged" when it cannot tell. A one-line judgement (`judgements:`,
// LD-12), written by `al record <name> judgement`, says the change was read,
// and holds until the item's text changes again. A closed item gives the
// same hint (DES-91): C7 compares the item with its own text when the change
// relied on it, so it judges it by what held then (LD-11). An archived
// request is not checked. Hints only: no `not ok`.
import { parse as parseYaml } from 'yaml';
import { recordPath, sha256, stamp, now } from './base.js';
import { fileAt, git } from './git.js';
import { append } from './records.js';

export const CHANGED = 'issue-changed';
const SIGNOFF = /^S\d+$/;
const isMap = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const slug = (s) => String(s).toLowerCase();
const list = (x) => (Array.isArray(x) ? x : []);
const lf = (s) => String(s).replace(/\r\n?/g, '\n');

// The hash of what the item says: a JSON list of its body and the body of
// each comment that is not minimized, in order, with line ends made LF. The
// state is not text.
export const textSha = (it) => sha256(JSON.stringify([lf(it.body),
  ...list(it.comments).filter((c) => isMap(c) && c.isMinimized !== true).map((c) => lf(c.body ?? ''))]));

// The entries that al kept for item `key` in a record's data, if well formed.
const keptFor = (data, key) => list(data?.items).filter((e) => isMap(e) && slug(e.item) === slug(key) && typeof e.sha256 === 'string' && typeof e.kept === 'string');
const judgedFor = (data, key) => list(data?.judgements).filter((j) => isMap(j) && j.hint === CHANGED && slug(j.on) === slug(key) && typeof j.sha256 === 'string');

// Each item once, with the first task that names it.
function firstNamed(named) {
  const first = new Map();
  for (const n of named) {
    const k = `${n.r.name} ${slug(n.it.key)}`;
    if (!first.has(k)) first.set(k, n);
  }
  return [...first.values()];
}

// al index --issues: keeps the text of each task item at a moment that is
// now. "named": the record at HEAD has no task that names the item. "S<n>":
// sign-off S<n> is in the record but not at HEAD, and it is the first
// sign-off after the naming. A moment that is past is never kept.
// Returns the lines for the output.
export function keepItems(top, recs, named, finder) {
  const head = git(top, ['rev-parse', '--verify', '--quiet', 'HEAD'], { allowFail: true });
  const body = [];
  const atHead = new Map();
  const headOf = (name) => {
    if (!atHead.has(name)) {
      let data = null;
      try { data = head ? parseYaml(fileAt(top, head, recordPath(name)) ?? 'null') : null; } catch { data = null; }
      const keys = new Set(list(data?.tasks).filter((t) => isMap(t) && t.ref != null).flatMap((t) => finder.find(t.ref).found.map((it) => slug(it.key))));
      atHead.set(name, { keys, signoffs: list(data?.signoff).filter(isMap) });
    }
    return atHead.get(name);
  };
  const when = stamp(now());
  for (const { r, task, it } of firstNamed(named)) {
    const rec = recs.get(r.name);
    if (!rec) continue;
    const was = headOf(r.name);
    const kept = keptFor(rec.data, it.key);
    const keep = (at) => {
      append(rec, 'items', { item: it.key, task, at, sha256: textSha(it), kept: when }, true);
      rec.changed = true;
      body.push(`kept: the text of ${it.key} for ${r.name}/${task}, at ${at === 'named' ? 'the naming' : `the sign-off ${at}`}`);
    };
    const namedNow = !was.keys.has(slug(it.key));
    let naming = kept.find((e) => e.at === 'named');
    if (namedNow && !naming) {
      keep('named');
      naming = { kept: when };
    }
    if (kept.some((e) => SIGNOFF.test(String(e.at)))) continue;
    const headIds = new Set(was.signoffs.map((s) => s.id));
    const fresh = list(rec.data.signoff).find((s) => isMap(s) && SIGNOFF.test(String(s.id)) && !headIds.has(s.id));
    if (!fresh) continue;
    // The first sign-off after the naming: no sign-off at HEAD came after it.
    const first = namedNow || (naming ? !was.signoffs.some((s) => String(s.signed) >= naming.kept) : !was.signoffs.length);
    if (first) keep(fresh.id);
  }
  return body;
}

// al check --issues: issue-changed for each item that a task of an open
// request names, and "not known" for each that it cannot read.
export function changedHints(named, missing, folder, add) {
  for (const { r, task, it } of firstNamed(named)) {
    const id = `${r.name}/${task}`;
    const kept = keptFor(r.data, it.key);
    let base = kept.find((e) => SIGNOFF.test(String(e.at)));
    let label = base && `the sign-off ${base.at}`;
    let why = null;
    if (!base) {
      const naming = kept.find((e) => e.at === 'named');
      const after = naming && list(r.data?.signoff).find((s) => isMap(s) && String(s.signed) >= naming.kept);
      if (naming && after) why = `al kept no text at the sign-off ${after.id}, the first after the request named it`;
      else if (naming) [base, label] = [naming, 'the request named it'];
      else why = 'al kept no text when the request named it or at its sign-off';
    }
    // A judgement that the change was read holds until the text changes again (LD-12).
    const judged = judgedFor(r.data, it.key).at(-1);
    if (judged && (!base || String(judged.recorded ?? '') >= base.kept)) [base, label, why] = [judged, `the judgement ${judged.id}`, null];
    const next = `read the item, then al record ${r.name} judgement --hint ${CHANGED} --on ${it.key} --reason <why> --issues ${folder} --yes`;
    if (why) add('hint', CHANGED, it.key, id, `not known whether it changed since the change relied on it: ${why}; ${next}`);
    else if (base.sha256 !== textSha(it)) add('hint', CHANGED, it.key, id, `changed since ${label} (${base.kept ?? base.recorded}); ${next}`);
  }
  const shown = new Set(named.map((n) => `${n.r.name} ${slug(n.it.key)}`));
  for (const m of missing) {
    const k = `${m.r.name} ${slug(m.key ?? m.written)}`;
    if (shown.has(k)) continue;
    shown.add(k);
    add('hint', CHANGED, m.none ? recordPath(m.r.name) : m.written, `${m.r.name}/${m.task}`, `not known whether ${m.key ?? 'its item'} changed since the change relied on it: ${m.key ? `it is not in ${folder}, or its file was not read` : 'its ref names no item that al can read'}`);
  }
}

