// Hints from the linked work items (issue-hints R1, design.md 8). `al` never
// contacts a tracker (D9): the caller saves the items in a folder, and
// `al check --issues <folder>` reads them. An item is the JSON that
// `gh issue view --json number,url,body,comments,parent,state` prints, or the same
// shape with `ref` and `repository` for another tracker (D10). Only the
// items that the `tasks:` of the open requests name are checked (D11). Each
// finding is a hint (R1, hints-and-blocks R2):
// - issue-missing: a task names an item that is not in the folder;
// - issue-superseded: the item's text names a superseded ADR without its
//   successor, by R5's own code (supersededIn, D7); `info` for a closed
//   item, which records what held when it closed (closed-items R1);
// - issue-bare-ref: a bare `#n` in an item of another repository;
// - issue-not-sub: not a child of the request's own item, which the file
//   assuredloop-requests.json of the folder names (own-item R1);
// - phrase: a phrase of the config matches (R2, phrases.js);
// - issue-unread: a file of the folder that is not valid JSON or YAML, a
//   Markdown file that is not an item, or an entry that is not an item, or
//   an assuredloop-requests.json that is not valid;
// - issue-changed: the item's text changed since the change relied on it,
//   or al cannot tell (light-design R3, kept-items.js).
// An item's text is its body and its comments that are not minimized (D4).
// A file of the folder is JSON, YAML with the same fields, or one item in
// Markdown (DES-114). The items that items-out-of-reach in the config names,
// and that are not in the folder, get one info line in place of a hint each
// (DES-117).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { recordPath } from './base.js';
import { parse as parseYaml } from 'yaml';
import { citedMessage, supersededIn } from './blocks.js';
import { git } from './git.js';
import { changedHints } from './kept-items.js';
import { FENCE, lf } from './markers.js';
import { phraseHits, phraseMessage } from './phrases.js';
import { outputRepos } from './repos.js';
import { Fail } from './spec.js';

const ISSUE_URL = /\bhttps?:\/\/[^\s/]+\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)\b/g;
const QUALIFIED = /(?<![\w./-])([\w.-]+)\/([\w.-]+)#(\d+)\b/g;
const NAMED = /(?<![\w./#-])([a-z0-9][a-z0-9._-]*)#(\d+)\b/g;
const BARE = /(?<![\w/#&-])#(\d+)\b/g;
const slug = (s) => String(s).toLowerCase();
const isMap = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const once = (re) => new RegExp(re.source);
// The file of the folder that names each request's own item (own-item SP-8).
const OWN_ITEMS = 'assuredloop-requests.json';
const FORMAT = 'assuredloop-items/1';
const REACH = 'items-out-of-reach';
// `text` holds `word` as a whole word: no letter, digit, `_` or `-` beside it.
const wordRe = (word, flags = '') => new RegExp(`(?<![\\w-])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, flags);
const holds = (text, word) => wordRe(word).test(text);

// The `owner/repo` of a URL or an `owner/repo#n` (null when it names no item).
const keyOf = (s) => {
  const t = String(s ?? '');
  const m = once(ISSUE_URL).exec(t) ?? once(QUALIFIED).exec(t);
  return m ? `${m[1]}/${m[2]}#${m[3]}` : null;
};

// The `owner/repo` that `git remote get-url origin` names in `dir`, any host
// (D12): { repo } or { unknown }.
function remoteRepo(dir) {
  const url = git(dir, ['remote', 'get-url', 'origin'], { allowFail: true });
  if (!url) return { unknown: 'no remote origin' };
  const m = /^(?:[\w.+-]+:\/\/(?:[^@/]+@)?[^/]+\/|[^@\s/]+@[^:\s/]+:)(.+?)(?:\.git)?\/?$/.exec(url);
  // The URL is not shown: it may hold a user name and a password (SP-22).
  return m && /^[^/]+\/[^/]+$/.test(m[1]) ? { repo: m[1] } : { unknown: 'the remote origin names no owner/repo' };
}

// An entry of an item file: the item, or null when it is not one (SP-24).
function itemOf(x, file) {
  if (!isMap(x) || typeof x.body !== 'string') return null;
  const at = once(ISSUE_URL).exec(String(x.url ?? ''));
  const repository = typeof x.repository === 'string' && x.repository ? x.repository
    : isMap(x.repository) && typeof x.repository.nameWithOwner === 'string' ? x.repository.nameWithOwner
      : at ? `${at[1]}/${at[2]}` : null;
  const number = Number.isInteger(x.number) ? x.number : at ? Number(at[3]) : null;
  const ref = typeof x.ref === 'string' && x.ref ? x.ref : null;
  const key = repository && number !== null ? `${repository}#${number}` : ref;
  if (!key) return null;
  // `state` is OPEN or CLOSED, as gh prints it; any other value is ignored, so the item counts as open (closed-items D1).
  return { key, ref, url: typeof x.url === 'string' ? x.url : null, repository, number, closed: x.state === 'CLOSED', body: x.body, comments: x.comments, parent: x.parent, design: x.design, file };
}

// The keys of an item in Markdown, each with the field it gives (DES-114).
const MD_KEYS = { url: 'url', number: 'number', repository: 'repository', ref: 'ref', state: 'state', parent: 'parent' };
const COMMENT = /^## Comment (\d+)( \(minimized\))?$/;
const blank = (l) => !l.trim();
const trimmed = (lines) => {
  const out = [...lines];
  while (out.length && blank(out[0])) out.shift();
  while (out.length && blank(out.at(-1))) out.pop();
  return out.join('\n');
};

// An item in Markdown, in the fields of a JSON item: { x } or { why }. The
// header is the first lines up to the first blank line; the body goes on to
// the first `## Comment <k>` outside fenced code.
function markdownItem(text) {
  const lines = lf(text).split('\n');
  const x = {};
  let i = 0;
  for (; i < lines.length && !blank(lines[i]); i++) {
    const m = /^([A-Za-z_][\w-]*):[ \t]*(.*?)[ \t]*$/.exec(lines[i]);
    if (!m) return { why: `its ${i ? `line ${i + 1}` : 'first line'} is not a header line <Key>: <value>, such as URL: or Ref:` };
    // Only the table's own keys: never an inherited name such as constructor.
    const key = Object.hasOwn(MD_KEYS, m[1].toLowerCase()) ? MD_KEYS[m[1].toLowerCase()] : null;
    if (!key) return { why: `its header line ${i + 1} has the key ${m[1]}; the keys are URL, Number, Repository, Ref, State and Parent` };
    if (key in x) return { why: `its header has the key ${m[1]} twice` };
    const v = m[2];
    if (key === 'number') {
      if (!/^\d+$/.test(v)) return { why: `its Number ${JSON.stringify(v)} is not digits` };
      x.number = Number(v);
    } else if (key === 'state') x.state = /^(open|closed)$/i.test(v) ? v.toUpperCase() : v;
    else if (key === 'parent') x.parent = /^https?:\/\//.test(v) ? { url: v } : /^#\d+$/.test(v) ? { number: Number(v.slice(1)) } : /^none$/i.test(v) ? null : { ref: v };
    else x[key] = v;
  }
  if (!i) return { why: 'its first line is not a header line <Key>: <value>, such as URL: or Ref:' };
  const parts = [{ lines: [] }];
  let fence = null;
  for (const [k, l] of lines.slice(i).entries()) {
    const f = FENCE.exec(l);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && l.trim() === f[1]) fence = null;
    } else if (f) fence = f[1];
    else {
      const c = COMMENT.exec(l);
      if (c) {
        if (Number(c[1]) !== parts.length) return { why: `its comment heading on line ${i + k + 1} says ${c[1]}, not ${parts.length}: the comments count from 1, in order` };
        parts.push({ lines: [], minimized: !!c[2] });
        continue;
      }
    }
    parts.at(-1).lines.push(l);
  }
  return { x: { ...x, body: trimmed(parts[0].lines), comments: parts.slice(1).map((p) => ({ body: trimmed(p.lines), isMinimized: p.minimized })) } };
}

// What an item file holds: { data } (its JSON or YAML value, or the fields of
// its Markdown item), or { why } it is not read.
function entriesOf(path, name) {
  const text = readFileSync(path, 'utf8');
  if (name.endsWith('.md')) {
    const md = markdownItem(text);
    return md.why ? { why: `it is not an item: ${md.why}` } : { data: md.x };
  }
  if (name.endsWith('.json')) {
    try {
      return { data: JSON.parse(text) };
    } catch (e) {
      if (e instanceof SyntaxError) return { why: 'it is not valid JSON' };
      throw e;
    }
  }
  try {
    return { data: parseYaml(text) };
  } catch (e) {
    if (e.name === 'YAMLParseError') return { why: `it is not valid YAML: ${e.message.split('\n')[0]}` };
    throw e;
  }
}

// The own items that assuredloop-requests.json names (own-item SP-8, SP-9):
// { requests } (a Map of name to value), { absent: true }, or { why } when
// the file is not valid and so is ignored as a whole.
function ownItems(path) {
  if (!existsSync(path)) return { absent: true };
  let data;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { why: e instanceof SyntaxError ? 'it is not valid JSON' : `it cannot be read (${e.code ?? e.message})` };
  }
  if (!isMap(data)) return { why: 'it is not a JSON object' };
  const other = Object.keys(data).filter((k) => k !== 'format' && k !== 'requests');
  if (other.length) return { why: `it has a field other than format and requests: ${other.join(', ')}` };
  if (data.format !== FORMAT) return { why: `its format is not ${FORMAT}` };
  if (!isMap(data.requests)) return { why: 'its requests is not an object' };
  const bad = Object.entries(data.requests).filter(([, v]) => typeof v !== 'string' || !v).map(([k]) => k);
  if (bad.length) return { why: `the value of ${bad.join(', ')} is not a text that is not empty` };
  return { requests: new Map(Object.entries(data.requests)) };
}

// The items of the folder that the caller saved (SP-12): { items, unread,
// owns }. A folder that is not there is a refusal.
export function loadItems(cwd, folder) {
  const dir = resolve(cwd, folder);
  let isDir = false;
  try {
    isDir = statSync(dir).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) throw new Fail(`--issues ${folder}: no such folder`, 'save the work items in a folder (see the README), then al check --issues <folder>');
  const items = [];
  const unread = [];
  const shown = (name) => `${folder.replace(/\/+$/, '')}/${name}`;
  const owns = ownItems(join(dir, OWN_ITEMS));
  if (owns.why) unread.push({ file: shown(OWN_ITEMS), why: owns.why });
  // One name order across the formats (DES-94).
  for (const name of readdirSync(dir).filter((n) => /\.(json|ya?ml|md)$/.test(n) && n !== OWN_ITEMS).sort()) {
    const file = shown(name);
    let read;
    try {
      if (!statSync(join(dir, name)).isFile()) continue;
      read = entriesOf(join(dir, name), name);
    } catch (e) {
      read = { why: `it cannot be read (${e.code ?? e.message})` };
    }
    if (read.why) {
      unread.push({ file, why: read.why });
      continue;
    }
    const { data } = read;
    (Array.isArray(data) ? data : [data]).forEach((x, i) => {
      const it = itemOf(x, file);
      if (it) items.push(it);
      else unread.push({ file, why: `${Array.isArray(data) ? `its entry ${i + 1}` : 'it'} is not an item: an item needs a body, and a url, a number with a repository, or a ref` });
    });
  }
  return { folder, items, unread, owns };
}

// The names of the repos that the config names, each with its folder or why it has none.
function namedRepos(top, config) {
  const out = new Map();
  for (const o of outputRepos(top, config)) if (o.name) out.set(o.name, o.dir ? { dir: o.dir } : { unknown: o.unknown });
  const c = config.central;
  if (isMap(c) && typeof c.path === 'string' && c.path) {
    const dir = isAbsolute(c.path) ? c.path : resolve(top, c.path);
    out.set('central', existsSync(dir) ? { dir } : { unknown: `no clone at ${c.path}` });
  }
  return out;
}

// The references that a task's `ref` writes in the forms of SP-8:
// [{ written, key } | { written, unknown }].
function written(ref, names, own, folders) {
  let rest = String(ref);
  const out = [];
  const take = (re, f) => {
    rest = rest.replace(re, (...m) => {
      const r = f(m);
      if (!r) return m[0];
      out.push({ written: m[0], ...r });
      return ' '.repeat(m[0].length);
    });
  };
  take(ISSUE_URL, (m) => ({ key: `${m[1]}/${m[2]}#${m[3]}` }));
  take(QUALIFIED, (m) => ({ key: `${m[1]}/${m[2]}#${m[3]}` }));
  take(NAMED, (m) => {
    if (!names.has(m[1])) return null;
    const r = folders(m[1]);
    return r.repo ? { key: `${r.repo}#${m[2]}` } : { unknown: `${m[1]}: ${r.unknown}` };
  });
  take(BARE, (m) => (own.repo ? { key: `${own.repo}#${m[1]}` } : { unknown: `the request's own repository is not known (${own.unknown})` }));
  return out;
}

// What reads the forms of SP-8 for the project at `top`, with the items of
// the folder: `own` (the request's own repository), and `find(ref)`, the
// items that a task's `ref` names and the references that name none:
// { found: [it], missing: [{ written, key } | { written, unknown }], none }.
export function itemFinder(top, config, items) {
  const names = namedRepos(top, config);
  const own = remoteRepo(top);
  const remotes = new Map();
  const folders = (name) => {
    if (!remotes.has(name)) {
      const n = names.get(name);
      remotes.set(name, n.dir ? remoteRepo(n.dir) : { unknown: n.unknown });
    }
    return remotes.get(name);
  };
  const byKey = new Map();
  for (const it of items) if (!byKey.has(slug(it.key))) byKey.set(slug(it.key), it);
  const withRef = items.filter((it) => it.ref);
  const find = (ref) => {
    const found = [];
    const missing = [];
    const refs = written(ref, names, own, folders);
    for (const w of refs) {
      const it = w.key && byKey.get(slug(w.key));
      if (it) found.push(it);
      else missing.push(w);
    }
    for (const it of withRef) if (!found.includes(it) && holds(String(ref), it.ref)) found.push(it);
    return { found, missing, none: !found.length && !refs.length };
  };
  return { own, names, folders, find };
}

// The saved items that each task of each open request names, in order
// (SP-8, SP-9): { named: [{ r, task, it }], missing: [{ r, task, written,
// key | unknown | none }], tasked, finder } (tasked: the open requests with
// a task that has a ref; finder: itemFinder's, for other refs).
export function taskItems(top, state, items) {
  const finder = itemFinder(top, state.config, items);
  const named = [];
  const missing = [];
  const tasked = [];
  for (const r of state.requests.values()) {
    if (!r.open) continue;
    for (const t of Array.isArray(r.data?.tasks) ? r.data.tasks : []) {
      if (!isMap(t) || t.ref == null) continue;
      if (!tasked.includes(r)) tasked.push(r);
      const task = String(t.id ?? '-');
      const { found, missing: lost, none } = finder.find(t.ref);
      for (const w of lost) missing.push({ r, task, ...w });
      if (none) missing.push({ r, task, written: String(t.ref), none: true });
      for (const it of found) named.push({ r, task, it });
    }
  }
  return { named, missing, tasked, finder };
}

// The list items-out-of-reach of the config (DES-117): [] when there is none.
// A value that is not a list of texts that are not empty is a refusal.
export function outOfReach(config) {
  // A key with no value, or null, is a value that is not a list.
  if (!Object.hasOwn(config, REACH)) return [];
  const list = config[REACH];
  const next = `fix ${REACH}: in .assuredloop/config.yaml`;
  if (!Array.isArray(list)) throw new Fail(`.assuredloop/config.yaml: ${REACH}: is not a list`, next);
  list.forEach((e, i) => {
    if (typeof e !== 'string' || !e.trim()) throw new Fail(`.assuredloop/config.yaml: ${REACH}: entry ${i + 1} is not a text that is not empty`, next);
  });
  return list.map((e) => e.trim());
}

// The items out of the CI token's reach that no file of the folder holds
// (DES-117): { hits: [{ shown, id }] in the order of the tasks, away(m) for
// a reference of `missing` that gets no hint }. The list names an item by
// its repository `owner/repo`, by a form of SP-8, or, for another tracker,
// by a key that a task's ref holds as a whole word while no item of the
// folder has it as its ref. A ref that names no saved item gets no hint only
// when it holds one or more such keys and nothing else.
function outOfReachItems(state, entries, finder, items, missing) {
  const repos = new Set();
  const keys = new Set();
  const texts = new Set();
  const others = [];
  for (const e of entries) {
    texts.add(slug(e));
    if (/^[\w.-]+\/[\w.-]+$/.test(e)) {
      repos.add(slug(e));
      continue;
    }
    const w = written(e, finder.names, finder.own, finder.folders);
    for (const x of w) if (x.key) keys.add(slug(x.key));
    if (!w.length) others.push(e);
  }
  const saved = new Set(items.map((it) => it.ref).filter(Boolean).map(slug));
  // The ref holds one or more other trackers' keys of the list, each of which
  // the line names, and nothing else but white space and punctuation.
  const only = (ref) => others.some((k) => holds(String(ref), k))
    && !/[\p{L}\p{N}]/u.test(others.reduce((t, k) => t.replace(wordRe(k, 'g'), ' '), String(ref)));
  const away = (m) => (m.none ? only(m.written)
    : texts.has(slug(m.written)) || (m.key && (keys.has(slug(m.key)) || repos.has(slug(m.key).replace(/#\d+$/, '')))));
  const hits = [];
  for (const r of state.requests.values()) {
    if (!r.open) continue;
    for (const t of Array.isArray(r.data?.tasks) ? r.data.tasks : []) {
      if (!isMap(t) || t.ref == null) continue;
      const id = `${r.name}/${String(t.id ?? '-')}`;
      for (const m of missing) if (m.r === r && m.task === String(t.id ?? '-') && !m.none && away(m)) hits.push({ shown: m.key ?? m.written, id });
      for (const k of others) if (holds(String(t.ref), k) && !saved.has(slug(k))) hits.push({ shown: k, id });
    }
  }
  return { hits, away };
}

export function issueHints(top, state, matchers, add, { folder, items, unread, owns }) {
  const notKnown = [];
  const cited = supersededIn(state);
  const { named, missing: lost, tasked, finder } = taskItems(top, state, items);
  const { own, names, folders } = finder;
  // The items out of the CI token's reach that are not in the folder: one
  // line names them all, in place of issue-missing and issue-changed (DES-117).
  const { hits, away } = outOfReachItems(state, outOfReach(state.config), finder, items, lost);
  const missing = lost.filter((m) => !away(m));
  // Each item once, ignoring case, in the form of the first task that names it.
  const reach = new Map();
  for (const { shown, id } of hits) {
    if (!reach.has(slug(shown))) reach.set(slug(shown), { shown, ids: [] });
    const { ids } = reach.get(slug(shown));
    if (!ids.includes(id)) ids.push(id);
  }
  if (reach.size) {
    const one = reach.size === 1;
    add('info', 'issues-out-of-reach', '-', '-', `${reach.size} item${one ? '' : 's'} out of the CI token's reach (${REACH} in .assuredloop/config.yaml) ${one ? 'is' : 'are'} not in ${folder}, so ${one ? 'it is' : 'they are'} not checked, and al cannot tell whether ${one ? 'it' : 'they'} changed since the change relied on ${one ? 'it' : 'them'}: ${[...reach.values()].map((x) => `${x.shown} (${x.ids.join(', ')})`).join(', ')}`);
  }
  // al cannot tell when the caller saved the items (light-design LD-22).
  notKnown.push(`when the items in ${folder} were saved: save them again before a check`);

  for (const u of unread) add('hint', 'issue-unread', u.file, '-', `not read: ${u.why}`);
  if (unread.length) notKnown.push(`the files in ${folder} that were not read: ${unread.map((u) => u.file).join(', ')}`);

  for (const m of missing) {
    const id = `${m.r.name}/${m.task}`;
    if (m.none) add('hint', 'issue-missing', recordPath(m.r.name), id, `its ref names no item in ${folder}: ${JSON.stringify(m.written)}`);
    else add('hint', 'issue-missing', m.written, id, m.key ? `${m.written}: no item in ${folder} is ${m.key}` : `${m.written}: ${m.unknown}, so it names no item`);
  }

  // Each item once, with the ID of the first task that names it.
  const first = new Map();
  for (const n of named) if (!first.has(n.it)) first.set(n.it, n);
  for (const [it, n] of first) {
    const id = `${n.r.name}/${n.task}`;
    const texts = [{ where: it.key, text: it.body }];
    (Array.isArray(it.comments) ? it.comments : []).forEach((c, i) => {
      if (isMap(c) && c.isMinimized !== true) texts.push({ where: `${it.key}/comment-${i + 1}`, text: c.body });
    });
    const other = own.repo && it.repository && slug(it.repository) !== slug(own.repo);
    for (const { where, text } of texts) {
      if (typeof text !== 'string' || !text) continue;
      for (const c of cited(text)) add(it.closed ? 'info' : 'hint', 'issue-superseded', `${where}:${c.line}`, id, citedMessage(c));
      if (other) {
        text.replace(/\r\n?/g, '\n').split('\n').forEach((l, i) => {
          const refs = [...l.matchAll(BARE)].map((m) => `#${m[1]}`);
          if (refs.length) add('hint', 'issue-bare-ref', `${where}:${i + 1}`, id, `${refs.join(', ')} in an item of ${it.repository} points to ${it.repository}, not to ${own.repo}: write ${refs.map((x) => `${own.repo}${x}`).join(', ')} if that is meant`);
        });
      }
      for (const h of phraseHits(text, matchers)) add('hint', 'phrase', `${where}:${h.line}`, id, phraseMessage(h));
    }
    if (!own.repo) continue;
    if (!it.repository) notKnown.push(`the issue-bare-ref check of ${it.key}: its repository is not known`);
  }
  if (!own.repo) notKnown.push(`the request's own repository, for #n and the issue-bare-ref check: ${own.unknown}`);

  // Children (SP-10): once for each request and item. The own item is the one
  // that assuredloop-requests.json names (own-item SP-7); nothing else names it.
  const ownOf = new Map();
  const ownItem = (r) => {
    if (ownOf.has(r.name)) return ownOf.get(r.name);
    let ids;
    const value = owns.requests?.get(r.name);
    if (owns.absent) ids = { unknown: `${folder} has no ${OWN_ITEMS}` };
    else if (!owns.requests) ids = { unknown: `${folder.replace(/\/+$/, '')}/${OWN_ITEMS} was not read` };
    else if (value === undefined) ids = { unknown: `${OWN_ITEMS} names no own item for ${r.name}` };
    else {
      const w = written(value, names, own, folders);
      const lost = w.find((x) => x.unknown);
      if (lost) ids = { unknown: `its own item ${value}: ${lost.unknown}` };
      else if (w.length) {
        const keys = new Set(w.map((x) => slug(x.key)));
        const its = items.filter((x) => keys.has(slug(x.key)));
        ids = { keys: new Set([...keys, ...its.map((x) => x.ref).filter(Boolean).map(slug)]), urls: new Set([value, ...its.map((x) => x.url).filter(Boolean)]), ref: its.find((x) => x.ref)?.ref ?? null };
      } else {
        // Another tracker's key: the item that holds it as its ref, or else the value itself.
        const it = items.find((x) => x.ref && holds(value, x.ref));
        ids = it ? { keys: new Set([it.key, it.ref].map(slug)), urls: new Set([value, it.url].filter(Boolean)), ref: it.ref }
          : { keys: new Set([slug(value)]), urls: new Set([value]), ref: value };
      }
    }
    ownOf.set(r.name, ids);
    return ids;
  };
  const seen = new Set();
  for (const n of named) {
    const pair = `${n.r.name} ${slug(n.it.key)}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    const mine = ownItem(n.r);
    if (mine.unknown) continue;
    const it = n.it;
    if (mine.keys.has(slug(it.key)) || (it.ref && mine.keys.has(slug(it.ref)))) continue;
    if (it.parent === undefined) {
      notKnown.push(`whether ${it.key} is a child of the own item of ${n.r.name}: the item has no parent field`);
      continue;
    }
    const p = it.parent;
    // A parent's number is in the item's repository only when no url names its own.
    const parent = isMap(p) ? [keyOf(p.url), typeof p.ref === 'string' ? p.ref : null,
      !keyOf(p.url) && Number.isInteger(p.number) && it.repository ? `${it.repository}#${p.number}` : null].filter(Boolean) : [];
    // A parent's url names the own item when it is the own item's url or the value, or holds its ref.
    const url = isMap(p) && typeof p.url === 'string' && p.url ? p.url : null;
    if (p !== null && !parent.length && !url) {
      notKnown.push(`whether ${it.key} is a child of the own item of ${n.r.name}: its parent names no item`);
      continue;
    }
    if (url && (mine.urls.has(url) || (mine.ref && holds(url, mine.ref)))) continue;
    if (parent.some((x) => mine.keys.has(slug(x)))) continue;
    const named = parent[0] ?? url;
    add('hint', 'issue-not-sub', it.key, `${n.r.name}/${n.task}`, `is not a child of the request's own item (${[...mine.keys][0]})${named ? `; its parent is ${named}` : ''}`);
  }
  // Once for each request with a task that has a ref, whether or not its items are in the folder.
  for (const r of tasked) {
    const why = ownItem(r).unknown;
    if (why) notKnown.push(`whether the items of ${r.name} are children of its own item: ${why}`);
  }

  // C7: an item whose text changed since the change relied on it (light-design R3).
  changedHints(named, missing, folder, add);

  const others = items.filter((it) => !first.has(it)).length;
  if (others) notKnown.push(`${others} item${others === 1 ? '' : 's'} in ${folder} that no task names, not checked`);
  add('info', 'issues', '-', '-', `checked ${first.size} items for the tasks of the open requests, from ${folder}`);
  return notKnown;
}
