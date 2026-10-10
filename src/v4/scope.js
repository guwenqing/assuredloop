// The docs whose paragraphs carry markers, in two kinds of scope (architect,
// 2026-10-10): the spec scope, every *.md under the spec root except its adr/
// folder plus the files config's docs list names; and one scope per request,
// its requests/<name>/spec.md (or the archived one), with prefix SP and IDs of
// its own. Two scopes never share IDs.
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix, relative } from 'node:path';
import { git, filesAt, readObjects } from './git.js';
import { parseMarkdown } from './markers.js';

export const SPEC = 'spec';
const REQUEST = /^requests\/(?:archive\/)?([^/]+)\/spec\.md$/;

const clean = (p) => posix.normalize(String(p)).replace(/^\.\//, '').replace(/\/+$/, '');
const outside = (p) => posix.isAbsolute(String(p)) || /^\.\.(\/|$)/.test(clean(p));

// The root and the docs entries of config that are outside the repository,
// as written (the root with a trailing slash): never walked or read.
const outsideDocs = (config) => [
  ...(outside(config.root) ? [`${String(config.root).replace(/\/+$/, '')}/`] : []),
  ...config.docs.map((d) => String(d.file)).filter(outside),
];

// The first part of `path` (from the repo top) that is a symlink, or null.
export function symlinkOn(top, path) {
  let at = top;
  for (const part of path.split('/')) {
    at = join(at, part);
    let stat;
    try {
      stat = lstatSync(at);
    } catch {
      return null;
    }
    if (stat.isSymbolicLink()) return relative(top, at);
  }
  return null;
}

// The root and the docs entries that are inside the repository but reached
// through a symlink: never walked or read either.
const linked = (top, config) => [
  ...(!outside(config.root) && symlinkOn(top, clean(config.root)) ? [`${String(config.root).replace(/\/+$/, '')}/`] : []),
  ...insideDocs(config).map((d) => String(d.file)).filter((f) => symlinkOn(top, clean(f))),
];

// Why config's root cannot be used, or null: the repository top is no spec root.
export const rootProblem = (config) => (!outside(config.root) && ['.', ''].includes(clean(config.root))
  ? `.assuredloop/config.yaml: root: ${JSON.stringify(String(config.root))} is the repository top; give the spec folder, for example specs`
  : null);

// One line for each root or docs entry that is not read, and why.
export const notRead = (top, config) => [
  ...outsideDocs(config).map((f) => `not read: ${f}: outside the repository`),
  ...linked(top, config).map((f) => `not read: ${f}: through a symlink`),
];

const insideDocs = (config) => config.docs.filter((d) => !outside(d.file));

// The scope of a repo path, or null when it holds no markers.
export function scopeOf(path, config) {
  const root = clean(config.root);
  const r = REQUEST.exec(path);
  if (r) return `request:${r[1]}`;
  if (path.startsWith(`${root}/adr/`)) return null;
  if (insideDocs(config).some((d) => clean(d.file) === path)) return SPEC;
  if (path.startsWith(`${root}/`) && path.endsWith('.md')) return SPEC;
  return null;
}

// The prefix of a doc: SP in a request spec, else the one config lists, or null.
export function prefixOf(path, config) {
  if (REQUEST.test(path)) return 'SP';
  return insideDocs(config).find((d) => clean(d.file) === path)?.prefix ?? null;
}

// Every file of the working tree under `dir`, symlinks not followed.
function walk(top, dir, out = []) {
  if (!existsSync(join(top, dir)) || !lstatSync(join(top, dir)).isDirectory()) return out;
  for (const e of readdirSync(join(top, dir), { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const p = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) walk(top, p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

// The docs in scope: [{ path, scope, text }], from the working tree when
// `rev` is null, else from that commit.
export function docsInScope(top, config, rev = null) {
  const root = clean(config.root);
  let paths;
  if (rev === null) {
    const read = (p) => !symlinkOn(top, p);
    paths = [...(outside(config.root) || !read(root) ? [] : walk(top, root)), ...walk(top, 'requests'), ...insideDocs(config).map((d) => clean(d.file)).filter(read)];
  } else {
    paths = (git(top, ['ls-tree', '-r', '-z', '--name-only', rev], { allowFail: true }) ?? '').split('\0').filter(Boolean);
  }
  const inScope = [...new Set(paths)].sort().filter((path) => scopeOf(path, config));
  const atRev = rev === null ? null : filesAt(top, rev, inScope);
  const docs = [];
  for (const path of inScope) {
    const scope = scopeOf(path, config);
    let text;
    if (rev !== null) text = atRev.get(path);
    else if (existsSync(join(top, path)) && lstatSync(join(top, path)).isFile()) text = readFileSync(join(top, path), 'utf8');
    if (text == null) continue;
    docs.push({ path, scope, text });
  }
  return docs;
}

// Parses each doc; returns Map scope → paragraphs, and every lint.
export function parseScopes(docs, kinds) {
  const scopes = new Map();
  const lints = [];
  for (const d of docs) {
    const r = parseMarkdown(d.text, d.path, { kinds });
    if (!scopes.has(d.scope)) scopes.set(d.scope, []);
    scopes.get(d.scope).push(...r.paragraphs);
    lints.push(...r.lints);
  }
  return { scopes, lints };
}

// Every ID that a marker held in any commit up to `rev` (a commit, or --all
// for every ref), by scope: each version of each doc in history, from
// `git log --raw -z` (exact paths), read with `git cat-file --batch` and
// parsed, so a marker inside fenced code is no ID. Null when `rev` is null.
export function idsEverUsed(top, config, rev) {
  if (!rev) return null;
  const used = new Map();
  const specs = ['*.md', ...insideDocs(config).map((d) => clean(d.file))];
  const out = git(top, ['log', '--raw', '-z', '--no-abbrev', '--no-renames', '--format=', rev, '--', ...specs], { allowFail: true });
  if (!out) return used;
  // Each changed file is ":<mode> <mode> <old blob> <new blob> <status>" NUL "<path>" NUL.
  const scopes = new Map();
  const fields = out.split('\0');
  for (let i = 0; i < fields.length - 1; i++) {
    const meta = fields[i].replace(/^\n+/, '');
    if (!meta.startsWith(':')) continue;
    const scope = scopeOf(fields[++i], config);
    if (!scope) continue;
    for (const blob of meta.split(' ').slice(2, 4)) {
      if (/^0+$/.test(blob)) continue;
      if (!scopes.has(blob)) scopes.set(blob, new Set());
      scopes.get(blob).add(scope);
    }
  }
  for (const [blob, text] of readBlobs(top, [...scopes.keys()])) {
    for (const p of parseMarkdown(text, '').paragraphs) {
      for (const scope of scopes.get(blob)) {
        if (!used.has(scope)) used.set(scope, new Set());
        used.get(scope).add(p.id);
      }
    }
  }
  return used;
}

// The text of each blob that is there.
function readBlobs(top, blobs) {
  return new Map([...readObjects(top, blobs)].map(([b, bytes]) => [b, bytes.toString('utf8')]));
}

export const isShallow = (top) => git(top, ['rev-parse', '--is-shallow-repository'], { allowFail: true }) === 'true';
