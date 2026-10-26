// C8 (light-design R2; LD-27, LD-28, LD-44): the evidence check of the
// review's judgements. The review writes them in requests/<name>/review.md
// of the change's own request, one top-level list item each. `al index`
// keeps, by itself, the identity of each judgement in the request's record
// (`reviewed:`): in each repo of the change, the base and a hash of the
// change from it, with the review notes and .assuredloop/ left out; and the
// hash of the item's text. No person and no AI writes or reads it. `al
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
import { adrParagraph, latestVersion, loadState, settingsAt, signedBy } from './state.js';
import { REVIEW_NOTES, ownRequests } from './inforce.js';

const VERDICTS = ['complies', 'violates', 'unclear', 'not applicable'];
const FIRST = new RegExp(`^(\\S+) (${VERDICTS.join('|')}): (.+)$`);
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

// The top-level list items of a note, outside fenced code: { line, lines }.
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
    if (/^[-*+][ \t]+\S/.test(l)) {
      cur = { line: i + 1, lines: [l] };
      items.push(cur);
    } else if (cur && (!l.trim() || /^[ \t]/.test(l))) {
      cur.lines.push(l);
      if (f && /^[ \t]/.test(l)) fence = f[1];
    } else {
      cur = null;
      if (f) fence = f[1];
    }
  });
  return items;
}

// One evidence line: { kind: item|code|test, quote, path, repo, base }, or
// { kind: 'test', said } for "no test found" and "tests not examined", or
// { unread } for a line that starts like evidence but is not in its form.
function evidence(s) {
  let m = /^Item:\s*"(.*)"$/.exec(s);
  if (m) return { kind: 'item', quote: m[1] };
  m = /^(Code|Test)\s*\((.+?)\):\s*"(.*)"$/.exec(s);
  if (m) {
    const [, path, base] = /^(.*?)(,\s*base)?$/.exec(m[2].trim());
    const r = /^([A-Za-z0-9][\w.-]*):(.+)$/.exec(path);
    return { kind: m[1].toLowerCase(), quote: m[3], where: m[2].trim(), repo: r ? r[1] : null, path: r ? r[2] : path, base: !!base };
  }
  m = /^Test:\s*(no test found|tests not examined)\.?$/.exec(s);
  if (m) return { kind: 'test', said: m[1] };
  if (/^(Item|Code|Test)\b/.test(s)) return { unread: s };
  return null;
}

// The judgements of a note's text, in note order: { line, hash, id, verdict,
// evidence } for each one in the judgement form, { line, unread } for each
// other top-level list item (LD-27). The hash is the item's text with each
// run of white space made one space: the judgement's own key.
export function parseNote(text) {
  return listItems(text).map(({ line, lines }) => {
    const hash = sha256(oneLine(lines.join('\n')));
    // The first line and its continuation, then each sub-item with its own.
    const parts = [''];
    for (const l of lines) {
      const sub = /^[ \t]+[-*+][ \t]+(.*)$/.exec(l);
      if (sub) parts.push(sub[1]);
      else parts[parts.length - 1] += ` ${l.replace(/^[-*+][ \t]+/, '')}`;
    }
    const first = oneLine(parts[0]);
    const m = FIRST.exec(first);
    if (!m || !ITEM_ID.test(m[1])) return { line, unread: first.split(' ').slice(0, 8).join(' ') };
    return { line, hash, id: m[1], verdict: m[2], evidence: parts.slice(1).map((p) => evidence(oneLine(p))).filter(Boolean) };
  });
}

// The item that a judgement names, as the note's request `r` reads it in
// `state`: { state, sha, version, text }, or null when al cannot find it.
// `sha` is the hash of its text, which the identity keeps; `version` is
// what the line shows: v<n> for a requirement version that al recorded.
function findItem(state, r, id) {
  const [, req, bare] = ITEM_ID.exec(id) ?? [];
  if (!bare) return null;
  if (req) {
    const q = state.requests.get(req);
    return q ? requestItem(state, q, bare, q.name === r.name) : null;
  }
  const own = r && requestItem(state, r, bare, true);
  if (own || /^[RQ]\d+$/.test(bare)) return own ?? null;
  const p = state.spec.get(bare);
  if (p) return paragraph(p, p.kind !== 'approach' && ['promise', 'design'].includes(groupOf(p.kind, state.kinds)) ? 'in force' : 'not in force');
  const adr = state.adrs.get(/^(ADR-\d+)(?:-\d+)?$/.exec(bare)?.[1]);
  if (adr) {
    const st = adrState(state, adr);
    if (bare === adr.id) {
      const text = adr.paragraphs.map((x) => x.text).join('\n');
      return { state: st, sha: sha256(adr.body), version: sha256(adr.body).slice(0, 12), text };
    }
    const ap = adrParagraph(state, bare);
    return ap ? paragraph(ap, st) : null;
  }
  // Another open request's paragraph, when only one holds that ID.
  const others = [...state.requests.values()].filter((q) => q.open && q.paras.has(bare));
  return others.length === 1 ? requestItem(state, others[0], bare, false) : null;
}

const paragraph = (p, st) => ({ state: st, sha: p.sha256, version: p.sha256.slice(0, 12), text: p.text });

function requestItem(state, q, id, own) {
  if (/^[RQ]\d+$/.test(id)) {
    const req = q.reqs.find((x) => x.id === id);
    if (!req) return null;
    const v = list(q.data?.requirements).filter((e) => e?.id === id && e.sha256 === req.sha256).at(-1);
    const st = !q.open ? 'not in force' : own && signedBy(state, q.name, id) ? 'proposed by this change' : 'draft';
    return { state: st, sha: req.sha256, version: v ? `v${v.version}` : req.sha256.slice(0, 12), text: req.text };
  }
  const p = q.paras.get(id);
  if (!p) return null;
  const design = p.kind !== 'approach' && ['promise', 'design'].includes(groupOf(p.kind, state.kinds));
  return paragraph(p, !q.open ? 'not in force' : !own ? 'draft' : design ? 'proposed by this change' : 'not in force');
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
// and the hash of its bytes, at `rev`, or in the working tree with the
// untracked files that git does not ignore. It does not depend on git's diff
// settings.
function changeHash(dir, base, rev = null) {
  const run = (args) => (git(dir, args, { allowFail: true }) ?? '').split('\0').filter(Boolean);
  const paths = new Set(run(['diff', '--name-only', '-z', '--no-renames', '--no-relative', base, ...(rev ? [rev] : []), '--', '.', ...LEFT_OUT]));
  if (!rev) for (const f of run(['ls-files', '-z', '--others', '--exclude-standard', '--', '.', ...LEFT_OUT])) paths.add(f);
  const sorted = [...paths].sort();
  const blobs = rev ? readObjects(dir, sorted.map((p) => `${rev}:${p}`)) : null;
  const bytesOf = (p) => {
    if (rev) {
      const b = blobs.get(`${rev}:${p}`);
      return b === undefined ? 'deleted' : sha256(b);
    }
    try {
      const st = lstatSync(join(dir, p));
      return st.isSymbolicLink() ? `link ${readlinkSync(join(dir, p))}` : sha256(readFileSync(join(dir, p)));
    } catch {
      return 'deleted';
    }
  };
  return sha256(JSON.stringify(sorted.map((p) => [p, bytesOf(p)])));
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
export function keepJudgements(top, recs, config) {
  const base = baseOf(top)?.commit;
  if (!base || centralRepo(top, config)) return [];
  const state = loadState(top);
  const head = git(top, ['rev-parse', '--verify', '--quiet', 'HEAD'], { allowFail: true });
  const body = [];
  let current = null;
  const kept = stamp(now());
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
        entry = { judgement: j.hash, item: j.id, version: findItem(state, r, j.id)?.sha ?? null, head: current.head, repos: current.repos };
      } else {
        past ??= notesOnBranch(top, base, r);
        const at = past.find((c) => c.hashes.has(j.hash));
        if (at) {
          const then = loadState(top, at.commit);
          entry = {
            judgement: j.hash, item: j.id, version: findItem(then, then.requests.get(r.name), j.id)?.sha ?? null, head: at.commit,
            repos: changeIdentity(top, baseOf(top, at.commit)?.commit ?? base, settingsAt(top, at.commit).config, at.commit),
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

// The commits of base..HEAD that change the note of `r`, oldest first, each
// with the hashes of the judgements in its note.
function notesOnBranch(top, base, r) {
  const commits = (git(top, ['rev-list', '--reverse', `${base}..HEAD`, '--', notePath(r)], { allowFail: true }) ?? '').split('\n').filter(Boolean);
  return commits.map((commit) => ({ commit, hashes: new Set(parseNote(fileAt(top, commit, notePath(r)) ?? '').map((j) => j.hash)) }));
}

// Whether a kept identity is the selected change's: current, stale or not known.
function identityOf(entry, item, now) {
  if (!entry) return 'identity not kept: run al index';
  if (entry.unknown) return 'not known when judged';
  const was = new Map(list(entry.repos).filter(isMap).map((x) => [x.repo, x]));
  let past = false;
  let same = (item?.sha ?? null) === (entry.version ?? null) && was.size === now.length;
  for (const x of now) {
    const w = was.get(x.repo);
    if (w?.past) past = true;
    else if (!w || w.base !== x.base || w.diff !== x.diff || w.unknown !== x.unknown) same = false;
  }
  if (!same) return `stale: judged at ${short(entry.head)}`;
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
export function reviewSection(top, { now: state, base, own, config }) {
  const body = [];
  let identity = null;
  let outputs = null;
  const repos = () => (outputs ??= outputRepos(top, config));
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
      const item = findItem(state, r, j.id);
      const results = [];
      const itemQuote = j.evidence.find((e) => e.kind === 'item');
      if (!item) results.push('item not found');
      else if (!itemQuote) results.push(`no item quote; item ${item.state}`);
      else results.push(`item quote ${quoted(item.text, itemQuote.quote) ? 'found' : 'not found'}; item ${item.state}`);
      for (const e of j.evidence.filter((x) => x !== itemQuote)) {
        if (e.unread) results.push(`evidence line not read: ${e.unread}`);
        else if (e.kind === 'item') results.push(`item quote ${item && quoted(item.text, e.quote) ? 'found' : 'not found'}`);
        else if (e.said) results.push(e.said);
        else {
          const f = fileOf(top, base, e, repos);
          results.push(f.why ? `${e.kind} quote not checked (${e.where}): ${f.why}` : `${e.kind} quote ${quoted(f.text, e.quote) ? 'found' : 'not found'} (${e.where})`);
        }
      }
      identity ??= changeIdentity(top, base, config);
      const id = identityOf(entries.find((e) => e.judgement === j.hash), item, identity);
      count[id === 'current' ? 'current' : id.startsWith('stale') ? 'stale' : id.startsWith('identity') ? 'unkept' : 'unknown']++;
      lines.push({ head: `judgement ${j.id} version ${item ? item.version : 'none'} ${j.verdict} · ${path}:`, line: j.line, tail: ` · ${results.join(' · ')} · ${id}` });
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
