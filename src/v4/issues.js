// Hints from the linked work items (issue-hints R1, design.md 8). `al` never
// contacts a tracker (D9): the caller saves the items in a folder, and
// `al check --issues <folder>` reads them. An item is the JSON that
// `gh issue view --json number,url,body,comments,parent` prints, or the same
// shape with `ref` and `repository` for another tracker (D10). Only the
// items that the `tasks:` of the open requests name are checked (D11). Each
// finding is a hint (R1, hints-and-blocks R2):
// - issue-missing: a task names an item that is not in the folder;
// - issue-superseded: the item's text names a superseded ADR without its
//   successor, by R5's own code (supersededIn, D7);
// - issue-bare-ref: a bare `#n` in an item of another repository;
// - issue-not-sub: not a child of the request's own item (D3);
// - phrase: a phrase of the config matches (R2, phrases.js);
// - issue-unread: a file of the folder that is not valid JSON, or an entry
//   that is not an item.
// An item's text is its body and its comments that are not minimized (D4).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { recordPath } from './base.js';
import { citedMessage, supersededIn } from './blocks.js';
import { git } from './git.js';
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
// `text` holds `word` as a whole word: no letter, digit, `_` or `-` beside it.
const holds = (text, word) => new RegExp(`(?<![\\w-])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(text);

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
  return { key, ref, url: typeof x.url === 'string' ? x.url : null, repository, number, body: x.body, comments: x.comments, parent: x.parent, file };
}

// The items of the folder that the caller saved (SP-12): { items, unread }.
// A folder that is not there is a refusal.
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
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const file = shown(name);
    let data;
    try {
      if (!statSync(join(dir, name)).isFile()) continue;
      data = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    } catch (e) {
      unread.push({ file, why: e instanceof SyntaxError ? 'it is not valid JSON' : `it cannot be read (${e.code ?? e.message})` });
      continue;
    }
    (Array.isArray(data) ? data : [data]).forEach((x, i) => {
      const it = itemOf(x, file);
      if (it) items.push(it);
      else unread.push({ file, why: `${Array.isArray(data) ? `its entry ${i + 1}` : 'it'} is not an item: an item needs a body, and a url, a number with a repository, or a ref` });
    });
  }
  return { folder, items, unread };
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

export function issueHints(top, state, matchers, add, { folder, items, unread }) {
  const notKnown = [];
  const names = namedRepos(top, state.config);
  const cited = supersededIn(state);
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

  for (const u of unread) add('hint', 'issue-unread', u.file, '-', `not read: ${u.why}`);
  if (unread.length) notKnown.push(`the files in ${folder} that were not read: ${unread.map((u) => u.file).join(', ')}`);

  // The items that each task of each open request names, in order (SP-8, SP-9).
  const named = []; // [{ r, task, it }]
  for (const r of state.requests.values()) {
    if (!r.open) continue;
    for (const t of Array.isArray(r.data?.tasks) ? r.data.tasks : []) {
      if (!isMap(t) || t.ref == null) continue;
      const task = String(t.id ?? '-');
      const id = `${r.name}/${task}`;
      const found = [];
      for (const w of written(t.ref, names, own, folders)) {
        const it = w.key && byKey.get(slug(w.key));
        if (it) found.push(it);
        else add('hint', 'issue-missing', w.written, id, w.key ? `${w.written}: no item in ${folder} is ${w.key}` : `${w.written}: ${w.unknown}, so it names no item`);
      }
      for (const it of withRef) if (!found.includes(it) && holds(String(t.ref), it.ref)) found.push(it);
      if (!found.length && !written(t.ref, names, own, folders).length) add('hint', 'issue-missing', recordPath(r.name), id, `its ref names no item in ${folder}: ${JSON.stringify(String(t.ref))}`);
      for (const it of found) named.push({ r, task, it });
    }
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
      for (const c of cited(text)) add('hint', 'issue-superseded', `${where}:${c.line}`, id, citedMessage(c));
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

  // Children (SP-10): once for each request and item.
  const ownOf = new Map();
  const ownItem = (r) => {
    if (ownOf.has(r.name)) return ownOf.get(r.name);
    let ids = null;
    for (const s of Array.isArray(r.data?.sources) ? r.data.sources : []) {
      const url = isMap(s) && typeof s.url === 'string' ? s.url : null;
      if (!url) continue;
      const k = keyOf(url);
      const it = items.find((x) => (x.url && x.url === url) || (x.ref && holds(url, x.ref)) || (k && slug(x.key) === slug(k)));
      if (it) ids = { keys: new Set([it.key, it.ref].filter(Boolean).map(slug)), urls: new Set([url, it.url].filter(Boolean)), ref: it.ref };
      else if (k) ids = { keys: new Set([slug(k)]), urls: new Set([url]), ref: null };
      if (ids) break;
    }
    ownOf.set(r.name, ids);
    return ids;
  };
  const seen = new Set();
  const noOwn = new Set();
  for (const n of named) {
    const pair = `${n.r.name} ${slug(n.it.key)}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    const mine = ownItem(n.r);
    if (!mine) {
      noOwn.add(n.r.name);
      continue;
    }
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
    if (p !== null && !parent.length) {
      notKnown.push(`whether ${it.key} is a child of the own item of ${n.r.name}: its parent names no item`);
      continue;
    }
    // A parent's url names the own item when it is the own item's url or its source's, or holds its ref.
    const url = isMap(p) && typeof p.url === 'string' ? p.url : null;
    if (url && (mine.urls.has(url) || (mine.ref && holds(url, mine.ref)))) continue;
    if (parent.some((x) => mine.keys.has(slug(x)))) continue;
    add('hint', 'issue-not-sub', it.key, `${n.r.name}/${n.task}`, `is not a child of the request's own item (${[...mine.keys][0]})${parent.length ? `; its parent is ${parent[0]}` : ''}`);
  }
  for (const name of noOwn) notKnown.push(`whether the items of ${name} are children of its own item: no origin source of ${name} names an item`);

  const others = items.filter((it) => !first.has(it)).length;
  if (others) notKnown.push(`${others} item${others === 1 ? '' : 's'} in ${folder} that no task names, not checked`);
  add('info', 'issues', '-', '-', `checked ${first.size} items for the tasks of the open requests, from ${folder}`);
  return notKnown;
}
