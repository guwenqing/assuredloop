// C8 (light-design R2; LD-27, LD-28, LD-44): the evidence check of the
// review's judgements. The review writes them in requests/<name>/review.md
// of the change's own request, one top-level list item each. `al index`
// keeps, by itself, the identity of each judgement in the request's record
// (`reviewed:`): in each repo of the change, the base and a hash of the
// change from it, with the review notes and .assuredloop/ left out; and the
// item's version. No person and no AI writes or reads it. `al
// check` shows each judgement, whether its quotes are found, the item's
// state, and whether the judgement is current. Hints only: a judgement never
// clears or hides a `not ok` or a refusal of `al conclude`, and it never
// blocks (LD-12, LD-29). No model, and nothing is written by al check.
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { inside, now, read, sha256, stamp } from './base.js';
import { baseOf, fileAt, git, readObjects } from './git.js';
import { FENCE, groupOf, lf } from './markers.js';
import { append } from './records.js';
import { centralRepo, outputRepos } from './repos.js';
import { isShallow } from './scope.js';
import { adrParagraph, loadState, settingsAt, signedBy } from './state.js';
import { REVIEW_NOTES, designPaths, ownRequests, readDesign } from './inforce.js';

const VERDICTS = ['complies', 'violates', 'unclear', 'not applicable'];
// The first line names one item, or several joined by ", " or " and " (LD-59).
const FIRST = new RegExp(`^([^\\s,]+(?:(?:, and |, | and )[^\\s,]+)*) (${VERDICTS.join('|')}): (.+)$`);
const SEPARATOR = /, and |, | and /;
const ITEM_ID = /^(?:([a-z0-9][a-z0-9-]*)\/)?((?:[A-Z][A-Z0-9]*-\d+(?:-\d+)?)|[RQ]\d+)$/;
// The paths that are no part of the change (LD-28).
const LEFT_OUT = [':(exclude).assuredloop', `:(exclude,glob)${REVIEW_NOTES}`];
const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();
const list = (x) => (Array.isArray(x) ? x : []);
const isMap = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const short = (sha) => String(sha).slice(0, 7);
export const notePath = (r) => `${r.dir}/review.md`;

// A quote is in `text` word for word, with each run of white space taken as one space.
const quoted = (text, quote) => !!oneLine(quote) && text != null && oneLine(text).includes(oneLine(quote));

// A list item's marker line: its indent, its marker (`-`, `*`, `+`, `1.`
// or `1)`) and the spaces after it; a tab counts as four spaces.
const MARKER = /^([ ]*)([-*+]|\d{1,9}[.)])([ \t]+)\S/;
const indentOf = (l) => /^[ \t]*/.exec(l)[0].replace(/\t/g, '    ').length;

// The top-level list items of a note, outside fenced code: { line, lines }.
// As Markdown reads them: an item starts at a marker indented up to three
// spaces, and a marker indented at least to its content column is a sub-item.
function listItems(text) {
  const items = [];
  let fence = null;
  let cur = null;
  lf(text).split('\n').forEach((l, i) => {
    const f = FENCE.exec(l);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && l.trim() === f[1]) fence = null;
      if (cur) cur.lines.push(l);
      return;
    }
    const m = MARKER.exec(l.replace(/^\t+/, (t) => '    '.repeat(t.length)));
    const indent = indentOf(l);
    if (m && indent <= 3 && !(cur && indent >= cur.col)) {
      cur = { line: i + 1, lines: [l], col: indent + m[2].length + Math.min(m[3].replace(/\t/g, '    ').length, 4) };
      items.push(cur);
    } else if (cur && (!l.trim() || indent > 0)) {
      cur.lines.push(l);
      if (f) fence = f[1];
    } else {
      cur = null;
      if (f) fence = f[1];
    }
  });
  return items;
}

// One evidence line: { kind: item|code|test, quote, path, repo, base }, or
// { kind: 'item', id, quote } for an item quote that names its item, or
// { kind: 'spec', id, base, quote } for a spec paragraph of a consolidation
// judgement (LD-59), or { kind: 'test', said } for "no test found" and "tests
// not examined", or { unread } for a line that starts like evidence but is
// not in its form.
function evidence(s) {
  let m = /^Item:\s*"(.*)"$/.exec(s);
  if (m) return { kind: 'item', quote: m[1] };
  m = /^Item\s*\(\s*(\S+?)\s*\):\s*"(.*)"$/.exec(s);
  if (m && ITEM_ID.test(m[1])) return { kind: 'item', id: m[1], quote: m[2] };
  m = /^Spec\s*\(\s*(\S+?)(,\s*base)?\s*\):\s*"(.*)"$/.exec(s);
  if (m && ITEM_ID.test(m[1])) return { kind: 'spec', id: m[1], base: !!m[2], where: `${m[1]}${m[2] ? ', base' : ''}`, quote: m[3] };
  m = /^(Code|Test)\s*\((.+?)\):\s*"(.*)"$/.exec(s);
  if (m) {
    const [, path, base] = /^(.*?)(,\s*base)?$/.exec(m[2].trim());
    const r = /^([A-Za-z0-9][\w.-]*):(.+)$/.exec(path);
    return { kind: m[1].toLowerCase(), quote: m[3], where: m[2].trim(), repo: r ? r[1] : null, path: r ? r[2] : path, base: !!base };
  }
  m = /^Test:\s*(no test found|tests not examined)\.?$/.exec(s);
  if (m) return { kind: 'test', said: m[1] };
  if (/^(Item|Code|Test|Spec)\b/.test(s)) return { unread: s };
  return null;
}

// The judgements of a note's text, in note order: { line, hash, id, ids,
// verdict, evidence } for each one in the judgement form, { line, unread }
// for each other top-level list item (LD-27). `ids` are the items that the
// first line names, `id` them as one name. The hash is the item's text with
// each run of white space made one space: the judgement's own key.
export function parseNote(text) {
  return listItems(text).map(({ line, lines }) => {
    const hash = sha256(oneLine(lines.join('\n')));
    // The first line and its continuation, then each sub-item with its own.
    const parts = [''];
    for (const [k, l] of lines.entries()) {
      const sub = k > 0 && /^[ \t]+(?:[-*+]|\d{1,9}[.)])[ \t]+(.*)$/.exec(l);
      if (sub) parts.push(sub[1]);
      else parts[parts.length - 1] += ` ${l.replace(/^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+/, '')}`;
    }
    const first = oneLine(parts[0]);
    const m = FIRST.exec(first);
    const ids = m ? m[1].split(SEPARATOR) : [];
    if (!m || !ids.every((x) => ITEM_ID.test(x))) return { line, unread: first.split(' ').slice(0, 8).join(' ') };
    return { line, hash, id: ids.join(', '), ids, verdict: m[2], evidence: parts.slice(1).map((p) => evidence(oneLine(p))).filter(Boolean) };
  });
}

// The item that a judgement names, as the note's request `r` reads it in
// `state`: { state, key, version, text }, or null when al cannot find it.
// `key` is what the identity keeps: the hash of the item's text, and for a
// requirement its recorded version too; `version` is what the line shows:
// v<n> for a requirement version that al recorded, else the hash's start.
// `ctx` gives the record data of a request (al index reads the records it is
// writing) and the paragraphs of the request's design documents (LD-48).
function findItem(state, r, id, ctx) {
  const [, req, bare] = ITEM_ID.exec(id) ?? [];
  if (!bare) return null;
  if (req) {
    const q = state.requests.get(req);
    return q ? requestItem(state, q, bare, q.name === r?.name, ctx) : null;
  }
  const own = r && requestItem(state, r, bare, true, ctx);
  if (own || /^[RQ]\d+$/.test(bare)) return own ?? null;
  const d = r && ctx.designs(state, r).get(bare);
  if (d) return paragraph(d, design(state, d) ? 'proposed by this change' : 'not in force');
  const p = state.spec.get(bare);
  if (p) return paragraph(p, design(state, p) ? 'in force' : 'not in force');
  const adr = state.adrs.get(/^(ADR-\d+)(?:-\d+)?$/.exec(bare)?.[1]);
  if (adr) {
    const st = adrState(state, adr);
    if (bare === adr.id) {
      const text = adr.paragraphs.map((x) => x.text).join('\n');
      return { state: st, key: sha256(adr.body), version: sha256(adr.body).slice(0, 12), text };
    }
    const ap = adrParagraph(state, bare);
    return ap ? paragraph(ap, st) : null;
  }
  // Another open request's paragraph, when only one holds that ID.
  const others = [...state.requests.values()].filter((q) => q.open && q.paras.has(bare));
  return others.length === 1 ? requestItem(state, others[0], bare, false, ctx) : null;
}

// A promise or design paragraph; approach is never in force (LD-24, LD-42).
const design = (state, p) => p.kind !== 'approach' && ['promise', 'design'].includes(groupOf(p.kind, state.kinds));
const paragraph = (p, st) => ({ state: st, key: p.sha256, version: p.sha256.slice(0, 12), text: p.text });

function requestItem(state, q, id, own, ctx) {
  if (/^[RQ]\d+$/.test(id)) {
    const req = q.reqs.find((x) => x.id === id);
    if (!req) return null;
    // The line shows v<n> only while the latest recorded version is the
    // current text. The identity keeps the recorded version of this text: at
    // a past commit, only from the record as committed there, or none.
    const versions = list(ctx.data(q)?.requirements).filter((e) => e?.id === id);
    const newest = (xs) => xs.reduce((a, e) => (Number(e.version) > Number(a?.version ?? 0) ? e : a), null);
    const latest = newest(versions);
    const recorded = newest(versions.filter((e) => e.sha256 === req.sha256));
    const match = !!latest && latest.sha256 === req.sha256;
    const st = !q.open ? 'not in force' : own && signedBy(state, q.name, id) ? 'proposed by this change' : 'draft';
    return {
      state: st, key: `${recorded ? `v${recorded.version}` : 'none'} ${req.sha256}`, version: match ? `v${latest.version}` : req.sha256.slice(0, 12), text: req.text,
      req: { sha: req.sha256, latest: match ? Number(latest.version) : null },
    };
  }
  const p = q.paras.get(id);
  if (!p) return null;
  return paragraph(p, !q.open ? 'not in force' : !own ? 'draft' : design(state, p) ? 'proposed by this change' : 'not in force');
}

// What findItem reads beyond the state: the record data of a request, and
// the paragraphs of the own request's design documents (LD-48), read as the
// list reads them, in this repo at `rev` or in the working tree.
function context(top, config, issues, { data = (q) => q.data, rev = null } = {}) {
  let outputs = null;
  const repos = () => (outputs ??= outputRepos(top, config));
  const designs = new Map();
  return {
    data,
    designs(state, r) {
      if (!designs.has(r.name)) {
        const found = new Map();
        for (const d of designPaths(top, state, [r], issues).filter((x) => !x.bad)) {
          for (const p of readDesign(top, state, d.path, repos, rev).paras ?? []) if (p.id && !found.has(p.id)) found.set(p.id, p);
        }
        designs.set(r.name, found);
      }
      return designs.get(r.name);
    },
  };
}

// An ADR's state: in force when accepted and no accepted ADR replaces it;
// replaced when superseded or replaced; draft when proposed.
function adrState(state, adr) {
  const accepted = [...state.adrs.values()].filter((a) => a.status === 'accepted');
  const replaced = accepted.some((a) => list(a.head?.links.supersedes).some((x) => /^(?:central:)?(ADR-\d+)/.exec(x)?.[1] === adr.id));
  if (adr.status === 'superseded' || replaced) return 'replaced';
  if (adr.status === 'accepted') return 'in force';
  return adr.status === 'proposed' ? 'draft' : 'not in force';
}

// The hash of the change in the repo at `dir` from `base`: each changed path
// with its git mode and the hash of its bytes (a symlink's bytes are its
// target, as git keeps it), at `rev`, or in the working tree with the
// untracked files that git does not ignore. The form is the same at a commit
// and in the working tree, and it does not depend on git's diff settings.
function changeHash(dir, base, rev = null) {
  const run = (args) => (git(dir, args, { allowFail: true }) ?? '').split('\0').filter(Boolean);
  const paths = new Set(run(['diff', '--name-only', '-z', '--no-renames', '--no-relative', base, ...(rev ? [rev] : []), '--', '.', ...LEFT_OUT]));
  if (!rev) for (const f of run(['ls-files', '-z', '--others', '--exclude-standard', '--', '.', ...LEFT_OUT])) paths.add(f);
  const sorted = [...paths].sort();
  return sha256(JSON.stringify(rev ? entriesAt(dir, rev, sorted) : entriesNow(dir, sorted)));
}

// [path, mode, hash] for each path at commit `rev`, or [path, 'deleted'].
function entriesAt(dir, rev, paths) {
  const modes = new Map();
  for (const e of (git(dir, ['ls-tree', '-r', '-z', '--full-tree', rev], { allowFail: true }) ?? '').split('\0')) {
    const m = /^(\d+) (\w+) ([0-9a-f]+)\t(.*)$/s.exec(e);
    if (m) modes.set(m[4], { mode: m[1], oid: m[3] });
  }
  const blobs = readObjects(dir, paths.filter((p) => modes.get(p)?.mode !== '160000').map((p) => `${rev}:${p}`));
  return paths.map((p) => {
    const e = modes.get(p);
    if (!e) return [p, 'deleted'];
    if (e.mode === '160000') return [p, e.mode, e.oid];
    const b = blobs.get(`${rev}:${p}`);
    return b === undefined ? [p, 'deleted'] : [p, e.mode, sha256(b)];
  });
}

// [path, mode, hash] for each path in the working tree, or [path, 'deleted'].
// With core.fileMode off, git does not read the executable bit, so the mode
// of a regular file is the index's.
function entriesNow(dir, paths) {
  const fileMode = git(dir, ['config', '--bool', 'core.fileMode'], { allowFail: true }) !== 'false';
  let staged = null;
  const indexMode = (p) => {
    if (!staged) {
      staged = new Map();
      for (const e of (git(dir, ['ls-files', '-s', '-z'], { allowFail: true }) ?? '').split('\0')) {
        const m = /^(\d+) [0-9a-f]+ \d\t(.*)$/s.exec(e);
        if (m) staged.set(m[2], m[1]);
      }
    }
    return staged.get(p) ?? '100644';
  };
  return paths.map((p) => {
    const at = join(dir, p);
    try {
      const st = lstatSync(at);
      if (st.isSymbolicLink()) return [p, '120000', sha256(Buffer.from(readlinkSync(at)))];
      if (st.isDirectory()) return [p, '160000', git(at, ['rev-parse', 'HEAD'], { allowFail: true }) ?? 'unknown'];
      const mode = fileMode ? ((st.mode & 0o100) ? '100755' : '100644') : indexMode(p);
      return [p, mode, sha256(readFileSync(at))];
    } catch {
      return [p, 'deleted'];
    }
  });
}

// The identity of the change in each repo: this repo from `base` (at `rev`,
// or the working tree), then each output repo of `config` from the
// merge-base of its selected commit with main to that commit. At a past
// commit, an output repo that was not pinned to a commit is not known.
function changeIdentity(top, base, config, rev = null) {
  const repos = [{ repo: '.', base, diff: changeHash(top, base, rev) }];
  for (const o of outputRepos(top, config).filter((x) => x.name)) {
    if (rev && !/^[0-9a-f]{40}$/.test(o.commit)) repos.push({ repo: o.name, unknown: `not pinned to a commit at ${short(rev)}`, past: true });
    else if (o.unknown) repos.push({ repo: o.name, unknown: o.unknown });
    else {
      const ob = baseOf(o.dir, o.sha)?.commit;
      repos.push(ob ? { repo: o.name, base: ob, diff: changeHash(o.dir, ob, o.sha) } : { repo: o.name, unknown: 'no base (no main branch)' });
    }
  }
  return repos;
}

// al index: keeps the identity of each judgement of each own request's note
// that has none (LD-28). A judgement that is not in the note at HEAD is
// judged now. One that is already committed takes the identity of the
// earliest commit of the branch whose note holds it; when the history cannot
// tell, al keeps that it does not know. An identity is never written again.
// Returns the lines for the output.
export function keepJudgements(top, recs, config, issues = null) {
  const base = baseOf(top)?.commit;
  if (!base || centralRepo(top, config)) return [];
  const state = loadState(top);
  const head = git(top, ['rev-parse', '--verify', '--quiet', 'HEAD'], { allowFail: true });
  const body = [];
  let current = null;
  const kept = stamp(now());
  const ctx = context(top, config, issues, { data: (q) => recs.get(q.name)?.data ?? q.data });
  for (const r of ownRequests(top, state, base)) {
    const rec = recs.get(r.name);
    const text = read(top, notePath(r));
    if (!rec || text == null) continue;
    const have = new Set(list(rec.data.reviewed).filter(isMap).map((e) => e.judgement));
    const atHead = new Set(parseNote(head ? fileAt(top, head, notePath(r)) ?? '' : '').map((j) => j.hash));
    let past = null;
    for (const j of parseNote(text).filter((x) => !x.unread && !have.has(x.hash))) {
      have.add(j.hash);
      let entry;
      if (!atHead.has(j.hash)) {
        current ??= { head, repos: changeIdentity(top, base, config) };
        entry = { judgement: j.hash, item: j.id, ...versionsOf(state, r, j, ctx), head: current.head, repos: current.repos };
      } else {
        past ??= notesOnBranch(top, base, r);
        const at = past.find((c) => c.hashes.has(j.hash));
        if (at) {
          const then = loadState(top, at.commit);
          const thenConfig = settingsAt(top, at.commit).config;
          entry = {
            judgement: j.hash, item: j.id, ...versionsOf(then, then.requests.get(r.name), j, context(top, thenConfig, issues, { rev: at.commit })), head: at.commit,
            repos: changeIdentity(top, baseOf(top, at.commit)?.commit ?? base, thenConfig, at.commit),
          };
        } else {
          entry = { judgement: j.hash, item: j.id, unknown: isShallow(top) ? 'a shallow clone' : 'the judgement was committed before this branch' };
        }
      }
      append(rec, 'reviewed', { ...entry, kept }, true);
      rec.changed = true;
      body.push(`kept: the identity of judgement ${j.id} at ${notePath(r)}:${j.line}${entry.unknown ? `, not known when judged (${entry.unknown})` : ''}`);
    }
  }
  return body;
}

// The versions that an identity keeps for judgement `j` in `state`: the
// item's, or a list for several items; and for a consolidation judgement
// (one with a Spec line, LD-59), `paragraphs`: the version of each change
// paragraph and each spec paragraph that it names, null for one that is not
// there, with its scope: `item` or `spec`, as one ID can name a paragraph of
// each. The map judges a consolidation judgement by these alone.
function versionsOf(state, r, j, ctx) {
  const keys = j.ids.map((id) => findItem(state, r, id, ctx)?.key ?? null);
  const out = { version: keys.length === 1 ? keys[0] : keys };
  const specs = [...new Set(j.evidence.filter((e) => e.kind === 'spec').map((e) => e.id))];
  if (specs.length) {
    out.paragraphs = [...j.ids.map((id, i) => ({ id, scope: 'item', version: keys[i] })),
      ...specs.map((id) => ({ id, scope: 'spec', version: state.spec.get(id)?.sha256 ?? null }))];
  }
  return out;
}

// The commits of base..HEAD that change the note of `r`, oldest first, each
// with the hashes of the judgements in its note.
function notesOnBranch(top, base, r) {
  const commits = (git(top, ['rev-list', '--reverse', `${base}..HEAD`, '--', notePath(r)], { allowFail: true }) ?? '').split('\n').filter(Boolean);
  return commits.map((commit) => ({ commit, hashes: new Set(parseNote(fileAt(top, commit, notePath(r)) ?? '').map((j) => j.hash)) }));
}

// Whether a kept identity is the selected change's: current, stale or not
// known. A repo that cannot be read, now or when judged, never counts as
// unchanged, also when its reason is the same. A judgement of a requirement
// is current only when the requirement's text is its latest recorded
// version, and that version is the one that the identity holds; with no
// recorded version in the identity, it is never current.
// `items` are the judgement's items, in the order of its first line; the
// identity keeps one version, or a list of them for several items.
function identityOf(entry, items, now) {
  if (!entry) return 'identity not kept: run al index';
  if (entry.unknown) return 'not known when judged';
  const was = new Map(list(entry.repos).filter(isMap).map((x) => [x.repo, x]));
  let past = false;
  let unread = null;
  const versions = items.length === 1 ? [entry.version] : list(entry.version);
  let same = was.size === now.length && versions.length === items.length;
  items.forEach((item, i) => {
    const kept = item?.req && /^(?:v(\d+)|none) ([0-9a-f]{64})$/.exec(String(versions[i] ?? ''));
    if (kept && !kept[1] && kept[2] === item.req.sha) past = true;
    same &&= !item?.req ? (item?.key ?? null) === (versions[i] ?? null)
      : !!kept && kept[2] === item.req.sha && (!kept[1] || Number(kept[1]) === item.req.latest);
  });
  for (const x of now) {
    const w = was.get(x.repo);
    if (!w) same = false;
    else if (w.past) past = true;
    else if (x.unknown || w.unknown) unread ??= `${x.repo} cannot be read (${x.unknown ?? w.unknown})`;
    else if (w.base !== x.base || w.diff !== x.diff) same = false;
  }
  if (!same) return `stale: judged at ${short(entry.head)}`;
  if (unread) return `not known: ${unread}`;
  return past ? 'not known when judged' : 'current';
}

// The text of a quoted file: this repo's working tree or base, or an output
// repo at its selected commit or its base. { text } or { why } when it cannot be read.
function fileOf(top, base, ev, outputs) {
  if (!inside(ev.path)) return { text: null };
  if (!ev.repo) {
    if (ev.base) return { text: fileAt(top, base, ev.path) };
    try {
      return { text: read(top, ev.path) };
    } catch {
      return { text: null };
    }
  }
  const o = outputs().find((x) => x.name === ev.repo);
  if (!o) return { why: `${ev.repo} is not an output repo in the config` };
  if (o.unknown) return { why: o.unknown };
  if (!ev.base) return { text: fileAt(o.dir, o.sha, ev.path) };
  const ob = baseOf(o.dir, o.sha)?.commit;
  return ob ? { text: fileAt(o.dir, ob, ev.path) } : { why: 'no base (no main branch)' };
}

// al check: the review section, after the list. One header for each own
// request's note, then one line for each judgement, in note order; lines
// that are the same apart from the note line are shown once, with each line.
export function reviewSection(top, { now: state, was = null, base, own, config, issues = null }) {
  const body = [];
  let identity = null;
  let outputs = null;
  const repos = () => (outputs ??= outputRepos(top, config));
  const ctx = context(top, config, issues);
  for (const r of own) {
    const path = notePath(r);
    const text = read(top, path);
    if (text == null) {
      body.push(`review note ${path}: none`);
      continue;
    }
    const entries = list(r.data?.reviewed).filter(isMap);
    const count = { n: 0, current: 0, stale: 0, unknown: 0, unkept: 0, unread: 0 };
    const lines = [];
    for (const j of parseNote(text)) {
      if (j.unread) {
        count.unread++;
        lines.push({ text: `judgement not read · ${path}:${j.line}: ${j.unread}` });
        continue;
      }
      count.n++;
      const items = j.ids.map((x) => findItem(state, r, x, ctx));
      const results = [];
      const bare = (x) => (x.startsWith(`${r.name}/`) ? x.slice(r.name.length + 1) : x);
      // One item: its first item quote. Several: each item's own quote,
      // `Item (<ID>)` (LD-59).
      const used = new Set();
      if (items.length === 1) {
        const [item] = items;
        const itemQuote = j.evidence.find((e) => e.kind === 'item' && (!e.id || bare(e.id) === bare(j.ids[0])));
        used.add(itemQuote);
        if (!item) results.push('item not found');
        else if (!itemQuote) results.push(`no item quote; item ${item.state}`);
        else results.push(`item quote ${quoted(item.text, itemQuote.quote) ? 'found' : 'not found'}; item ${item.state}`);
      } else {
        j.ids.forEach((x, i) => {
          const q = j.evidence.find((e) => e.kind === 'item' && e.id && bare(e.id) === bare(x));
          used.add(q);
          if (!items[i]) results.push(`${x}: item not found`);
          else if (!q) results.push(`${x}: no item quote; item ${items[i].state}`);
          else results.push(`${x}: item quote ${quoted(items[i].text, q.quote) ? 'found' : 'not found'}; item ${items[i].state}`);
        });
      }
      for (const e of j.evidence.filter((x) => !used.has(x))) {
        if (e.unread) results.push(`evidence line not read: ${e.unread}`);
        else if (e.kind === 'item' && e.id && !j.ids.some((x) => bare(x) === bare(e.id))) results.push(`item quote not checked (${e.id}): not an item of this judgement`);
        else if (e.kind === 'item') {
          const of = e.id ? items.filter((it, i) => bare(j.ids[i]) === bare(e.id)) : items;
          results.push(`item quote ${of.some((it) => it && quoted(it.text, e.quote)) ? 'found' : 'not found'}`);
        } else if (e.kind === 'spec') {
          results.push(`spec quote ${quoted((e.base ? was : state)?.spec.get(e.id)?.text, e.quote) ? 'found' : 'not found'} (${e.where})`);
        } else if (e.said) results.push(e.said);
        else {
          const f = fileOf(top, base, e, repos);
          results.push(f.why ? `${e.kind} quote not checked (${e.where}): ${f.why}` : `${e.kind} quote ${quoted(f.text, e.quote) ? 'found' : 'not found'} (${e.where})`);
        }
      }
      identity ??= changeIdentity(top, base, config);
      const id = identityOf(entries.find((e) => e.judgement === j.hash), items, identity);
      count[id === 'current' ? 'current' : id.startsWith('stale') ? 'stale' : id.startsWith('identity') ? 'unkept' : 'unknown']++;
      const versions = j.ids.map((x, i) => `${x} version ${items[i] ? items[i].version : 'none'}`).join(', ');
      lines.push({ head: `judgement ${versions} ${j.verdict} · ${path}:`, line: j.line, tail: ` · ${results.join(' · ')} · ${id}` });
    }
    body.push(`review note ${path}: ${count.n} judgements, ${count.current} current, ${count.stale} stale, ${count.unknown} not known when judged, `
      + `${count.unkept} identity not kept, ${count.unread} not read`);
    const shown = new Map();
    for (const l of lines) {
      if (l.text) { body.push(l.text); continue; }
      const key = `${l.head}\0${l.tail}`;
      if (shown.has(key)) { shown.get(key).at.push(l.line); continue; }
      const entry = { at: [l.line], l };
      shown.set(key, entry);
      body.push(entry);
    }
    for (let i = 0; i < body.length; i++) if (typeof body[i] !== 'string') body[i] = `${body[i].l.head}${body[i].at.join(', ')}${body[i].l.tail}`;
  }
  return body;
}

// The consolidation judgements of the note of own request `r` (LD-59): each
// judgement with a Spec line, in note order, as { line, covers, specs, fact,
// current }. `covers` holds the IDs of r's change paragraphs that it names,
// `specs` the spec paragraphs. The fact is judged by the versions of the
// named paragraphs alone, which al index keeps: current while each one has
// its kept version, else stale, naming each one that changed.
export function consolidations(top, state, r, { config, issues = null }) {
  const text = read(top, notePath(r));
  if (text == null) return [];
  const ctx = context(top, config, issues);
  const entries = list(r.data?.reviewed).filter(isMap);
  const bare = (x) => (x.startsWith(`${r.name}/`) ? x.slice(r.name.length + 1) : x);
  return parseNote(text).filter((j) => !j.unread && j.evidence.some((e) => e.kind === 'spec')).map((j) => {
    const entry = entries.find((e) => e.judgement === j.hash);
    const ref = `judgement ${notePath(r)}:${j.line}, ${j.verdict}`;
    const now = (p) => (p.scope === 'item' ? findItem(state, r, String(p.id), ctx)?.key ?? null : state.spec.get(String(p.id))?.sha256 ?? null);
    let fact;
    let current = false;
    if (!entry) fact = `not known: identity not kept: run al index (${ref})`;
    else if (entry.unknown || !Array.isArray(entry.paragraphs)) fact = `not known when judged (${ref})`;
    else {
      const changed = entry.paragraphs.filter(isMap).filter((p) => now(p) !== (p.version ?? null)).map((p) => p.id);
      current = !changed.length;
      fact = current ? `current: its named paragraphs are unchanged (${ref})` : `stale: ${changed.join(', ')} changed since it was judged (${ref})`;
    }
    return {
      line: j.line, fact, current, at: `judgement ${notePath(r)}:${j.line}`,
      covers: new Set(j.ids.filter((x) => !/^[a-z0-9][a-z0-9-]*\//.test(x) || x.startsWith(`${r.name}/`)).map(bare)),
      specs: new Set(j.evidence.filter((e) => e.kind === 'spec').map((e) => e.id)),
    };
  });
}
