// al spec: the design as it stands ([VW-5]), and numbering headings ([SPC-2], [SPC-3]).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { isAbsolute, join, posix, relative, resolve } from 'node:path';
import { Fail, HISTORY, gapFail, git, historyGap, isShallow } from './git.js';
import { openTree, noSymlinkOn } from './tree.js';
import { ID_TEXT, PREFIX_TEXT, parseSections, numberHeadings } from './sections.js';
import { line } from './commands.js';
import { hintLines } from './hints.js';
import { allBlocks, parseChange, stateText, statesOf } from './states.js';
import { sameSection } from './sections.js';

// The baseline root when .assuredloop names none ([SPC-1]).
export const ROOT = 'specs';

const PREFIX = new RegExp(`^${PREFIX_TEXT}$`);
const ID_OPEN = new RegExp(`\\[(${ID_TEXT})`, 'g');

// A path `.assuredloop` names must lie inside this repo: never absolute,
// through `..`, or through a symlink.
function inside(top, tree, at, key, raw) {
  const path = raw.replace(/\/+$/, '');
  const parts = path.split('/');
  let ok = !isAbsolute(raw) && !parts.includes('..') && !parts.includes('.');
  // No part of it may be a symlink, in the commit or the working tree.
  if (ok) ok = at ? !tree.linkOn(path) : noSymlinkOn(top, path);
  if (!ok) throw new Fail(`${key} must be inside this repo: ${raw} (from .assuredloop)`, `set \`${key}:\` in .assuredloop to a ${key === 'root' ? 'folder' : 'path'} in this repo`);
  return path;
}

// `text` without the spaces and tabs at its ends, and nothing else. A loop:
// a regex that trims a long line's spaces takes quadratic time.
export function trimBlanks(text) {
  let [a, b] = [0, text.length];
  while (a < b && (text[a] === ' ' || text[a] === '\t')) a++;
  while (b > a && (text[b - 1] === ' ' || text[b - 1] === '\t')) b--;
  return text.slice(a, b);
}

// The values of the `<key>: <path>` lines of `.assuredloop`, as written.
const values = (tree, key) => [...(tree.read('.assuredloop')?.toString('utf8') ?? '').matchAll(new RegExp(`^${key}:(.*)$`, 'gm'))].map((m) => trimBlanks(m[1])).filter(Boolean);

// The checked paths of the `tests:`, `results:` or `adrs:` lines ([LNK-3], [LNK-4]).
export const configured = (top, tree, at, key) => values(tree, key).map((raw) => inside(top, tree, at, key, raw));

// The baseline root: `specs`, or `root: <path>` in `.assuredloop` ([SPC-1]).
// The baseline is on main, so the root must lie inside this repo. Every
// other path the file names is checked here too, so a bad one stops any command.
export function rootOf(top, tree, at) {
  for (const key of ['tests', 'results', 'adrs']) configured(top, tree, at, key);
  return inside(top, tree, at, 'root', values(tree, 'root')[0] ?? ROOT);
}

// A past tree's root, from its `root:` line only, or null when that line is
// not a folder inside this repo; the other lines are not checked, so one old
// bad line does not stop a read of history ([VW-7], [VW-8]).
export function rootLine(top, tree, at) {
  try { return inside(top, tree, at, 'root', values(tree, 'root')[0] ?? ROOT); } catch { return null; }
}

// A past tree's paths for `key`: only its lines that lie inside this repo, for
// the same reason ([VW-8]).
export const pastLines = (top, tree, at, key) => values(tree, key).flatMap((raw) => {
  try { return [inside(top, tree, at, key, raw)]; } catch { return []; }
});

// Whether `path` names a baseline file: a .md file under the root, in plain form ([SPC-1]).
export const inBaseline = (path, root) => posix.normalize(path) === path && path.startsWith(`${root}/`) && path.endsWith('.md');

// The baseline's Markdown files, each with its sections.
export function baseline(tree, root) {
  return tree.walk(root).filter((p) => p.endsWith('.md'))
    .map((path) => ({ path, text: tree.read(path).toString('utf8') }))
    .map((f) => ({ ...f, sections: parseSections(f.text) }));
}

// Every ID found more than once in the root, with where: [[id, ['path:line', ...]]] ([SPC-3]).
export function duplicateIds(files) {
  const where = new Map();
  for (const f of files) {
    for (const s of f.sections) if (s.id) where.set(s.id, [...(where.get(s.id) ?? []), `${f.path}:${s.line}`]);
  }
  return [...where].filter(([, at]) => at.length > 1);
}

// The `not ok` for an ID found more than once in the root ([SPC-3]); no request owns it.
export const duplicateHint = ([id, at]) => ({ kind: 'not ok', rank: 5, owners: [], counts: true, text: `duplicate ID [${id}] in ${at.join(' and ')}`, command: 'rename one copy by hand, then al spec --list' });

// Those hints as check words them, three at most; check --all shows the rest ([HNT-1]).
const duplicates = (files) => hintLines(duplicateIds(files).map(duplicateHint), 3, { more: 'al check --all' });

export function spec(ctx) {
  const { top, opts } = ctx;
  if (opts['add-ids'] !== undefined) return addIds(ctx);
  const tree = openTree(top, opts.at);
  const root = rootOf(top, tree, opts.at);
  const files = baseline(tree, root);
  const notKnown = [isShallow(top) && HISTORY, 'whether the code does what the spec says (tests and review judge that)'].filter(Boolean);
  // [VW-5]: each open change under the section it holds; an add not in the
  // baseline yet under the baseline section its chain of anchors starts
  // from; the rest (a new file) after the text. With no baseline yet, the
  // open changes still show.
  const blocks = allBlocks(tree);
  const held = statesOf(files, blocks);
  const empty = `no baseline yet; requests add sections as they go (root: ${root}/)`;
  if (!files.length && !held.length) return { tree, body: [empty], next: 'al new <name> --from <file|->', notKnown };
  const ids = new Set(files.flatMap((f) => f.sections.map((s) => s.id)));
  const placed = (e, n = 0) => {
    const anchor = blocks.get(e.block).anchor;
    const up = held.find((x) => x.request === e.request && x.id === anchor && !ids.has(anchor));
    return ids.has(anchor) ? anchor : up && n < 50 ? placed(up, n + 1) : null;
  };
  const under = (id) => held.filter((e) => e.id === id || (!ids.has(e.id) && placed(e) === id));
  // A remove of a file's first section, gone from it, shows first under that file.
  const paths = new Set(files.map((f) => f.path));
  const first = (path) => held.filter((e) => !ids.has(e.id) && !placed(e) && e.op === 'remove' && e.file === path);
  const loose = held.filter((e) => !ids.has(e.id) && !placed(e) && !(e.op === 'remove' && paths.has(e.file)));
  const overlay = (s, text, list = under(s.id)) => list.flatMap((e) => {
    const now = blocks.get(e.block).now;
    const same = now && e.id === s.id && sameSection(now, s.text);
    return [`>> ${e.block} ${stateText(e)}${!text ? '' : !now ? ', removes it' : same ? ', now as above' : ', now:'}`,
      ...(text && now && !same ? now.replace(/\n+$/, '').split('\n').map((l) => `    ${l}`) : [])];
  });
  const body = files.length ? [] : [empty];
  for (const f of files) {
    body.push(line(body.length ? '' : 'Map', f.path), ...overlay({}, false, first(f.path)).map((l) => `${' '.repeat(14)}${l}`));
    for (const s of f.sections) body.push(`${' '.repeat(12)}${s.id ? `[${s.id}] ` : ''}${s.title}`, ...overlay(s).map((l) => `${' '.repeat(14)}${l}`));
  }
  const into = [...new Set(loose.map((e) => e.file ?? 'no file named'))].map((p) => [p, loose.filter((e) => (e.file ?? 'no file named') === p)]);
  for (const [p, list] of into) body.push(line('New', `${p} (not in the baseline yet)`), ...overlay({}, false, list).map((l) => `${' '.repeat(14)}${l}`));
  if (files.length) body.push(line('Covers', files.map((f) => `${f.path} (${f.sections.length} sections)`).join(' · ')));
  const hints = duplicates(files);
  body.push(...hints);
  if (!opts.list) {
    for (const f of files) {
      const preamble = f.text.slice(0, f.text.length - f.sections.reduce((n, s) => n + s.text.length, 0));
      body.push('', `==> ${f.path}`, ...(preamble ? preamble.replace(/\n$/, '').split('\n') : []), ...overlay({}, true, first(f.path)));
      for (const s of f.sections) body.push(...s.text.replace(/\n$/, '').split('\n'), ...overlay(s, true));
    }
    for (const [p, list] of into) body.push('', `==> ${p} (not in the baseline yet)`, ...overlay({}, true, list));
    body.push('');
  }
  return {
    tree,
    body,
    next: hints.length ? 'rename one copy of each duplicate ID by hand, to a new ID; an ID is never reused'
      : opts.list ? 'al spec, for the text' : 'al spec --list, for the map only',
    notKnown,
  };
}

// Every `[ID` ever used ([SPC-3]): in the root and every request's change.md
// now, and under the root and requests/ anywhere in the history of `rev`
// (every ref by default), each ID with the paths where it headed a section:
// a heading of a root .md file, out of code ([SPC-2]), or a block of a
// change.md as the states read it ([SPC-5]).
export function idsUsed(top, tree, root, rev = '--all') {
  const used = new Map();
  const note = (path, text) => {
    for (const [, id] of text.matchAll(ID_OPEN)) if (!used.has(id)) used.set(id, new Set());
    const headed = path.startsWith(`${root}/`) && path.endsWith('.md') ? parseSections(text).map((s) => s.id).filter(Boolean)
      : /^requests\/(?:archive\/)?[^/]+\/change\.md$/.test(path) ? parseChange(text, '').map((b) => b.id) : [];
    for (const id of headed) used.get(id).add(path);
  };
  for (const p of [...tree.walk(root).filter((x) => x.endsWith('.md')), ...tree.walk('requests').filter((x) => x.endsWith('/change.md'))]) note(p, tree.read(p).toString('utf8'));
  // Each changed file whole, both sides, so headings are read with their
  // fences; a merge against its first parent, so what only it brought counts.
  const log = git(top, ['log', rev, '-p', '--diff-merges=first-parent', '--no-renames', '-U1000000', '--format=', '--', root, 'requests'], { allowFail: true }) ?? '';
  let file = null;
  const flush = () => { if (file?.path) { note(file.path, file.old.join('\n')); note(file.path, file.now.join('\n')); } };
  for (const l of log.split('\n')) {
    if (l.startsWith('diff --git ')) { flush(); file = { path: diffPath(l), old: [], now: [], hunk: false }; continue; }
    if (!file) continue;
    if (l.startsWith('@@')) file.hunk = true;
    else if (file.hunk && (l[0] === ' ' || l[0] === '-')) file.old.push(l.slice(1));
    if (file.hunk && (l[0] === ' ' || l[0] === '+')) file.now.push(l.slice(1));
  }
  flush();
  return used;
}

// The path of a `diff --git` header under --no-renames, whose two sides name
// one path: `a/P b/P`, or each side C-quoted by git when P has bytes it quotes.
function diffPath(header) {
  const rest = header.slice('diff --git '.length);
  if (rest[0] !== '"') return rest.length % 2 ? rest.slice(2, 2 + (rest.length - 5) / 2) : null;
  const bytes = [];
  const ESC = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 };
  for (let i = 1; i < rest.length && rest[i] !== '"'; i++) {
    // A character git leaves as it is, whole: one outside the BMP is two code units.
    if (rest[i] !== '\\') { const c = String.fromCodePoint(rest.codePointAt(i)); bytes.push(...Buffer.from(c)); i += c.length - 1; }
    else if (/[0-7]/.test(rest[i + 1])) { bytes.push(parseInt(rest.slice(i + 1, i + 4), 8)); i += 3; }
    else bytes.push(ESC[rest[++i]] ?? rest.charCodeAt(i));
  }
  const path = Buffer.from(bytes).toString('utf8');
  return path.startsWith('a/') ? path.slice(2) : null;
}

// The next ID for `prefix`: one more than the highest n of any `[PREFIX-n` in `used` ([SPC-3]).
export const nextId = (used, prefix) => `${prefix}-${Math.max(0, ...[...used.keys()].filter((id) => id.split('-')[0] === prefix).map((id) => Number(id.split('-')[1].split('.')[0]))) + 1}`;

function addIds({ top, cwd, opts }) {
  if (opts.at !== undefined) throw new Fail('--add-ids writes the working tree; it does not take --at', 'al spec --add-ids <file> --prefix <PREFIX>');
  if (opts.prefix === undefined || !PREFIX.test(opts.prefix)) {
    throw new Fail(`--prefix ${JSON.stringify(opts.prefix ?? '')}: give capital letters and digits, starting with a letter, e.g. INV`,
      'al spec --add-ids <file> --prefix <PREFIX>');
  }
  const tree = openTree(top);
  const root = rootOf(top, tree, opts.at);
  const path = relative(top, resolve(cwd, opts['add-ids']));
  if (!path.endsWith('.md') || !path.startsWith(`${root}/`) || !existsSync(join(top, path)) || !noSymlinkOn(top, path)) {
    throw new Fail(`${opts['add-ids']}: give a .md file under the baseline root ${root}/, not through a symlink`, `al spec --list shows the files under ${root}/`);
  }
  const gap = historyGap(top);
  if (gap) throw gapFail(gap, ", and IDs can't be allocated safely without the full history");

  const before = readFileSync(join(top, path), 'utf8');
  const first = Number(nextId(idsUsed(top, tree, root), opts.prefix).split('-')[1]);
  const { text, numbered } = numberHeadings(before, opts.prefix, first);
  const body = duplicates(baseline(tree, root));
  const notKnown = ['IDs used on branches that were never fetched here'];
  if (!numbered.length) {
    body.unshift(`${path}: every heading already has an ID; nothing to number`);
    return { body, next: `al spec --list`, notKnown };
  }
  if (opts.yes) writeFileSync(join(top, path), text);
  body.unshift(`${opts.yes ? 'Numbered' : 'Would number'} ${numbered.length} heading(s) in ${path}:`, ...numbered.map((h) => `  ${h}`));
  return { body, next: opts.yes ? `review the diff of ${path} and commit it` : 'run the same command with --yes to write it', notKnown };
}
