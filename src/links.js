// Rough links, derived when read and never kept ([LNK-1]): a bracketed ID,
// blame, files changed together, and shared words; and a commit's request
// ([LNK-2]): a Request: line, else the request folder it touched, else an
// issue number in a request's owner's words.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { git } from './git.js';
import { parseSections, sameSection } from './sections.js';
import { entriesOf } from './commands.js';

export const WIDE = 30;
const REQUEST_LINE = /^[ \t]*(?:[-*][ \t]+)?Request:[ \t]*([a-z0-9][a-z0-9-]*)[ \t]*$/gm;
const ID_MARK = /\[([A-Z][A-Z0-9]*-\d+(?:\.\d+)*)\]/g;
const STOP = new Set(['must', 'with', 'from', 'that', 'this', 'each', 'when', 'have', 'into', 'than', 'then', 'only', 'also', 'more', 'none', 'what', 'which', 'their', 'there', 'they', 'will', 'shall', 'should']);

export const paths = (out) => (out ?? '').split('\0').filter(Boolean);
export const idsOn = (line) => [...line.matchAll(ID_MARK)].map((m) => m[1]);
export const cites = (text, id) => text.includes(`[${id}]`);
const folderOf = (path) => path.match(/^requests\/archive\/([^/]+)\//)?.[1] ?? path.match(/^requests\/(?!archive\/)([^/]+)\//)?.[1];

// The words of a heading or a path, for link 4: split on non-letters and at
// camelCase, lowercased, four letters or more, without a few common words.
export const wordsOf = (text) => new Set(text.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/)
  .filter((w) => w.length >= 4 && !STOP.has(w)));

// Every request in `tree`, open or archived, with its records.
export function requestsIn(tree) {
  const dirs = [
    ...(tree.list('requests') ?? []).filter((d) => d !== 'archive').map((name) => ({ name, dir: `requests/${name}`, open: true })),
    ...(tree.list('requests/archive') ?? []).map((name) => ({ name, dir: `requests/archive/${name}`, open: false })),
  ];
  return dirs.map((r) => ({ ...r, md: tree.read(`${r.dir}/request.md`)?.toString('utf8') ?? '', change: tree.read(`${r.dir}/change.md`)?.toString('utf8') ?? '' }))
    .filter((r) => r.md);
}

// The files a commit changed, against its first parent (all of them for a root commit).
export function filesOf(top, sha) {
  const parent = git(top, ['rev-parse', '--verify', '--quiet', `${sha}^1`], { allowFail: true });
  return paths(parent ? git(top, ['diff', '--name-only', '-z', '--no-renames', parent, sha])
    : git(top, ['diff-tree', '-r', '-z', '--no-commit-id', '--name-only', '--root', sha]));
}

// The request a commit maps to ([LNK-2]): { names, how, when }, cached in `seen`.
export function requestOf(top, sha, requests, seen = new Map()) {
  if (seen.has(sha)) return seen.get(sha);
  const [when, ...body] = git(top, ['show', '-s', '--format=%ct%n%B', sha]).split('\n');
  const message = body.join('\n');
  let names = [...new Set([...message.matchAll(REQUEST_LINE)].map((m) => m[1]))];
  let how = 'Request: line';
  if (!names.length) {
    names = [...new Set(filesOf(top, sha).map(folderOf).filter(Boolean))];
    how = names.length > 1 ? 'folder, ambiguous' : 'folder';
  }
  for (const [, n] of names.length ? [] : message.matchAll(/#(\d+)(?!\d)/g)) {
    names = requests.filter((r) => new RegExp(`#${n}(?!\\d)`).test(entriesOf(r.md, "Owner's words and dialog").join('\n'))).map((r) => r.name);
    how = `issue #${n}`;
    if (names.length) break;
  }
  const found = { sha, names, how: names.length ? how : 'no request', when: new Date(Number(when) * 1000) };
  seen.set(sha, found);
  return found;
}

// `a, b by <how>`, or `no request (<sha> <date>)`.
export const describe = (c) => (c.names.length ? `${c.names.join(', ')} by ${c.how}` : `no request (${c.sha.slice(0, 7)} ${c.when.toISOString().slice(0, 10)})`);

// The commits .git-blame-ignore-revs lists, as it is at `at` (the working
// tree when null), each one that git knows as `--ignore-rev <sha>`.
function ignored(top, at) {
  const file = join(top, '.git-blame-ignore-revs');
  const text = at ? git(top, ['show', `${at}:.git-blame-ignore-revs`], { allowFail: true }) : existsSync(file) ? readFileSync(file, 'utf8') : null;
  return (text ?? '').split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean)
    .filter((r) => git(top, ['rev-parse', '--verify', '--quiet', `${r}^{commit}`], { allowFail: true }))
    .flatMap((r) => ['--ignore-rev', r]);
}

// Blame of `ranges` ([from, to] pairs) of `path` at `rev` (the working tree when
// null): each line's commit and time. -w -M always, -C for code, and the
// project's .git-blame-ignore-revs as it is at `ignoreAt` (by default `rev`,
// so a view of commits reads only committed records) ([LNK-1] #2).
export function blame(top, rev, path, ranges, { code, ignoreAt = rev }) {
  if (!ranges.length) return [];
  // --ignore-revs-file '' first clears any file git's own config names (blame.ignoreRevsFile).
  const out = git(top, ['blame', '--porcelain', '-w', '-M', ...(code ? ['-C'] : []), '--ignore-revs-file', '', ...ignored(top, ignoreAt),
    ...ranges.flatMap(([a, b]) => ['-L', `${a},${b}`]), ...(rev ? [rev] : []), '--', path], { allowFail: true }) ?? '';
  const result = [];
  const times = new Map();
  for (const l of out.split('\n')) {
    const h = l.match(/^([0-9a-f]{40}) \d+ (\d+)/);
    if (h) result.push({ sha: h[1], line: Number(h[2]) });
    const t = l.match(/^committer-time (\d+)/);
    if (t) times.set(result.at(-1).sha, Number(t[1]));
  }
  return result.map((r) => ({ ...r, when: new Date((times.get(r.sha) ?? 0) * 1000) }));
}

// The sections by ID in a Markdown text.
export const byId = (text) => new Map(parseSections(text).filter((s) => s.id).map((s) => [s.id, s.text]));

// The IDs of the baseline sections that differ between two revs (or that one
// of them lacks), over the root's Markdown files among `files`.
export function sectionsChanged(top, from, to, root, files, tree) {
  const ids = [];
  for (const f of files.filter((p) => p.startsWith(`${root}/`) && p.endsWith('.md'))) {
    // `to` null with a `tree`: the working tree's text.
    const show = (rev) => byId(rev ? git(top, ['show', `${rev}:${f}`], { allowFail: true }) ?? '' : tree?.read(f)?.toString('utf8') ?? '');
    const [a, b] = [show(from), show(to)];
    for (const id of new Set([...a.keys(), ...b.keys()])) if (!(a.has(id) && b.has(id) && sameSection(a.get(id), b.get(id)))) ids.push(id);
  }
  return ids;
}

// Link 3: the commits (up to `rev`) that changed `path`, with their files;
// commits over 30 files are skipped and counted.
export function changedWith(top, rev, path) {
  const commits = [];
  let skipped = 0;
  for (const sha of git(top, ['log', '--format=%H', rev, '--', path]).split('\n').filter(Boolean)) {
    const files = filesOf(top, sha);
    if (files.length > WIDE) skipped++;
    else commits.push({ sha, files });
  }
  return { commits, skipped };
}

// Link 1 for a change at new-side line `at` (the first changed line) of a file:
// the IDs on the changed lines, else the nearest [ID] line above, with its distance.
export function idNear(fileLines, at, changed) {
  const on = [...new Set(changed.flatMap((n) => idsOn(fileLines[n - 1] ?? '')))];
  if (on.length) return on.map((id) => ({ id, reason: `names [${id}] on the changed line` }));
  for (let n = at - 1; n >= 1; n--) {
    const ids = idsOn(fileLines[n - 1] ?? '');
    if (ids.length) return ids.map((id) => ({ id, reason: `names [${id}], ${at - n} line${at - n === 1 ? '' : 's'} above` }));
  }
  return [];
}

// Ranges of line numbers, as `a-b` or `a`.
export const ranges = (numbers) => [...numbers].sort((x, y) => x - y)
  .reduce((out, n) => (out.length && out.at(-1)[1] === n - 1 ? (out.at(-1)[1] = n, out) : [...out, [n, n]]), [])
  .map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`));
