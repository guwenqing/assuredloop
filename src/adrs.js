// Decision records ([LNK-4]): `NNNN-<decision>.md` in docs/adr and each
// `adrs:` folder of .assuredloop, in the kit's format. The tool shows the
// ADRs governing a section, lists those a request added or superseded, and
// flags what breaks the format's rules; it never writes one.
import { git } from './git.js';
import { openTree } from './tree.js';
import { configured, pastLines } from './spec.js';
import { cites, idsOn, paths, requestOf } from './links.js';

// A file name is bounded (255 bytes), so the name is too: unbounded, a long token takes quadratic time.
const numbers = (s) => [...new Set([...s.matchAll(/\bADR[ \t]+(\d{4})\b|(?<![\w-])(\d{4})-[\w.-]{0,250}\.md\b/g)].map((m) => m[1] ?? m[2]))];
const numberOf = (p) => p.match(/(?:^|\/)(\d{4})-[^/]*\.md$/)?.[1];
// `Status:` anywhere in the header, the lines before the first `##` heading,
// so `Date: … Status: superseded by …` on one line is read. The status ends
// with its sentence, so a field after it on the line is not part of it.
const STATUS = /(?<![\w-])Status:[ \t]*(.*?)(?:\.(?=[ \t]|$)|$)/m;
const statusIn = (text) => { const end = text.search(/^##[ \t]/m); return (end < 0 ? text : text.slice(0, end)).match(STATUS); };

// A `past` tree's `adrs:` lines are read leniently ([VW-8]).
export const adrFolders = (top, tree, at, past = false) => [...new Set(['docs/adr', ...(past ? pastLines : configured)(top, tree, at, 'adrs')])];

// Every ADR in `tree`: its path, number, text, status word, and its links.
export function adrsIn(top, tree, at, past = false) {
  return adrFolders(top, tree, at, past).flatMap((d) => (tree.list(d) ?? []).filter((f) => numberOf(f)).map((f) => {
    const text = tree.read(`${d}/${f}`)?.toString('utf8') ?? '';
    const field = (k) => text.match(new RegExp(`^${k}:[ \\t]*(.*)$`, 'm'))?.[1] ?? '';
    const m = statusIn(text);
    const status = m?.[1] ?? '';
    return { path: `${d}/${f}`, n: numberOf(f), text, status: status.match(/^[a-z]+/i)?.[0].toLowerCase() ?? '', hasStatus: Boolean(m),
      by: /^superseded/i.test(status) ? numbers(status) : [], supersedes: numbers(field('Supersedes')), hasSupersedes: /^Supersedes:/m.test(text),
      request: field('Request').trim(), governs: idsOn(field('Governs')) };
  }));
}

const shown = (a) => `${a.n} ${a.status === 'superseded' ? `superseded by ${a.by.join(', ')}` : a.status || 'no status'}`;

// The ADRs that govern section `id` (a Governs: line) or name it, current first.
export function governing(top, tree, id, at) {
  return adrsIn(top, tree, at).filter((a) => a.governs.includes(id) || cites(a.text, id))
    .sort((x, y) => (y.status === 'accepted') - (x.status === 'accepted') || x.n.localeCompare(y.n))
    .map((a) => `${shown(a)} (${a.governs.includes(id) ? 'governs' : 'names'} [${id}])`);
}

// The ADRs request `name` added (its Request: line, or the commit that added
// the file maps to it, [LNK-2]), and the ADRs those supersede.
export function adrsOf(top, tree, at, name, requests) {
  const all = adrsIn(top, tree, at);
  const addedIn = new Map();
  let sha = null;
  // -z keeps each path literal: `>sha`, then its paths, each ended by NUL.
  for (const l of paths(git(top, ['log', '--diff-filter=A', '--name-only', '-z', '--format=>%H', at ?? 'HEAD', '--', ...adrFolders(top, tree, at)], { allowFail: true }))) {
    const p = l.replace(/^\n/, '');
    if (p.startsWith('>')) sha = p.slice(1);
    else if (!addedIn.has(p)) addedIn.set(p, sha);
  }
  // A commit that touched several request folders maps to none of them here.
  const seen = new Map();
  const mapped = (sha) => requestOf(top, sha, requests, seen);
  const added = all.filter((a) => a.request === name || (addedIn.has(a.path) && mapped(addedIn.get(a.path)).how !== 'folder, ambiguous' && mapped(addedIn.get(a.path)).names.includes(name)));
  return { added, superseded: all.filter((o) => added.some((a) => a.supersedes.includes(o.n) || o.by.includes(a.n))) };
}

// The ADR hints of branch `b`: not ok for an accepted ADR edited beyond its
// status (base against the final state), a broken or one-way supersede link,
// a reused number; a note for a superseded ADR cited as current.
export function adrHints(top, b) {
  const out = [];
  const add = (kind, owners, text, command) => out.push({ kind, rank: kind === 'note' ? 14 : 5, owners, text, command });
  const all = adrsIn(top, b.tree, b.at);
  const byN = new Map();
  for (const a of all) byN.set(a.n, [...(byN.get(a.n) ?? []), a]);
  // A number's file names over history. A rename that keeps the number
  // replaces its name; a renumbering leaves the old number used.
  const names = new Map();
  const log = paths(git(top, ['log', '--reverse', '-M', '--diff-filter=AR', '--name-status', '-z', '--format=', b.at ?? 'HEAD', '--', ...adrFolders(top, b.tree, b.at)], { allowFail: true }));
  for (let i = 0; i < log.length; i += log[i][0] === 'R' ? 3 : 2) {
    const [was, p] = log[i][0] === 'R' ? [log[i + 1], log[i + 2]] : [null, log[i + 1]];
    if (was && numberOf(was) === numberOf(p)) names.get(numberOf(was))?.delete(was);
    if (numberOf(p)) names.set(numberOf(p), (names.get(numberOf(p)) ?? new Set()).add(p));
  }
  for (const a of all) names.set(a.n, (names.get(a.n) ?? new Set()).add(a.path));
  for (const [n, ps] of names) if (ps.size > 1) add('not ok', [], `ADR number ${n} is reused: ${[...ps].join(' and ')}; a number is never reused`, 'git mv the newer one to the next free number, then al check');
  for (const a of all) {
    // A field the record already has is changed, never added again.
    const links = [...a.supersedes.map((n) => [n, 'supersedes', (t) => t.by.includes(a.n),
      (t) => (t.hasStatus ? `set its Status: to "superseded by ADR ${a.n}" in` : `add "Status: superseded by ADR ${a.n}" to`)]),
    ...a.by.map((n) => [n, 'is superseded by', (t) => t.supersedes.includes(a.n),
      (t) => (t.hasSupersedes ? `add ADR ${a.n} to the Supersedes: line of` : `add "Supersedes: ADR ${a.n}" to`)])];
    for (const [n, says, back, fix] of links) {
      const t = byN.get(n);
      if (!t) add('not ok', [], `a broken supersede link: ${a.path} ${says} ADR ${n}, which does not exist`, `correct the link in ${a.path}, then al check`);
      else if (!t.some(back)) add('not ok', [], `a one-way supersede link: ${a.path} ${says} ADR ${n}, but ${t[0].path} does not say so back`, `${fix(t[0])} ${t[0].path}, then al check`);
    }
  }
  if (b.base) {
    const strip = (t) => { const m = statusIn(t); return m ? t.slice(0, m.index) + t.slice(m.index + m[0].length) : t; };
    for (const a of adrsIn(top, openTree(top, b.base), b.base, true).filter((x) => x.status === 'accepted')) {
      const now = b.tree.read(a.path)?.toString('utf8');
      if (now === undefined || strip(now) !== strip(a.text)) {
        add('not ok', [], `${a.path} was accepted at ${b.base.slice(0, 7)} and is ${now === undefined ? 'deleted' : 'edited beyond its Status line'} on this branch; a change is a new ADR that supersedes it`, `git diff ${b.base.slice(0, 7)} -- ${a.path}`);
      }
    }
  }
  const old = (text) => numbers(text).filter((n) => byN.get(n)?.some((a) => a.status === 'superseded'));
  for (const f of b.files) {
    for (const s of f.sections) for (const n of old(s.text)) add('note', [], `${s.id ? `[${s.id}]` : `${f.path}:${s.line}`} cites ADR ${n}, which is superseded`, `al context ${s.id ?? f.path}`);
  }
  for (const x of b.blocks.values()) if (x.open && x.now) for (const n of old(x.now)) add('note', [x.request], `${x.key} of ${x.request} cites ADR ${n}, which is superseded`, `al context ${x.request}`);
  return out;
}
