// al spec: the design as it stands ([VW-5]), and numbering headings ([SPC-2], [SPC-3]).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { Fail, git, historyGap, isShallow } from './git.js';
import { openTree, noSymlinkOn } from './tree.js';
import { parseSections, numberHeadings } from './sections.js';
import { line } from './commands.js';

const PREFIX = /^[A-Z][A-Z0-9]*$/;

// The baseline root: `specs`, or `root: <path>` in `.assuredloop` ([SPC-1]).
// The baseline is on main, so the root must lie inside this repo: never
// absolute, through `..`, or through a symlink.
export function rootOf(top, tree, at) {
  const config = tree.read('.assuredloop')?.toString('utf8') ?? '';
  const m = config.match(/^root:[ \t]*(.+?)[ \t]*$/m);
  const raw = m ? m[1] : 'specs';
  const root = raw.replace(/\/+$/, '');
  const parts = root.split('/');
  let inside = !isAbsolute(raw) && !parts.includes('..') && !parts.includes('.');
  // No part of the root may be a symlink, in the commit or the working tree.
  if (inside) inside = at ? !tree.linkOn(root) : noSymlinkOn(top, root);
  if (!inside) throw new Fail(`root must be inside this repo: ${raw} (from .assuredloop)`, 'set `root:` in .assuredloop to a folder in this repo');
  return root;
}

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

// `not ok` for every ID found more than once in the root ([SPC-3]).
function duplicates(files) {
  const dups = duplicateIds(files);
  const hints = dups.slice(0, 3).map(([id, at]) => line('Hint', `not ok: duplicate ID ${id} in ${at.join(' and ')}`));
  if (dups.length > 3) hints.push(line('Hint', `${dups.length - 3} more duplicate IDs hidden`));
  return hints;
}

export function spec(ctx) {
  const { top, opts } = ctx;
  if (opts['add-ids'] !== undefined) return addIds(ctx);
  const tree = openTree(top, opts.at);
  const root = rootOf(top, tree, opts.at);
  const files = baseline(tree, root);
  const notKnown = [isShallow(top) && 'history unavailable (shallow clone)', 'whether the code does what the spec says (tests and review judge that)'].filter(Boolean);
  if (!files.length) {
    return { tree, body: [`no baseline yet; requests add sections as they go (root: ${root}/)`], next: 'al new <name> --from <file|->', notKnown };
  }
  const body = [];
  for (const f of files) {
    body.push(line(body.length ? '' : 'Map', f.path));
    for (const s of f.sections) body.push(`${' '.repeat(12)}${s.id ? `[${s.id}] ` : ''}${s.title}`);
  }
  body.push(line('Covers', files.map((f) => `${f.path} (${f.sections.length} sections)`).join(' · ')));
  const hints = duplicates(files);
  body.push(...hints);
  if (!opts.list) {
    for (const f of files) body.push('', `==> ${f.path}`, f.text.replace(/\n$/, ''));
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

// The highest n in any `[PREFIX-n` ever used: the root now and in history, and
// every request's change.md now and in history ([SPC-3]).
function highest(top, tree, root, prefix) {
  const texts = [
    ...tree.walk(root).filter((p) => p.endsWith('.md')),
    ...tree.walk('requests').filter((p) => p.endsWith('/change.md')),
  ].map((p) => tree.read(p).toString('utf8'));
  texts.push(git(top, ['log', '--all', '-p', '--format=', '--', root, 'requests'], { allowFail: true }) ?? '');
  let max = 0;
  const re = new RegExp(`\\[${prefix}-(\\d+)`, 'g');
  for (const t of texts) for (const m of t.matchAll(re)) max = Math.max(max, Number(m[1]));
  return max;
}

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
  if (gap) throw new Fail(`history unavailable: this clone is ${gap.kind}, and IDs can't be allocated safely without the full history`, gap.next);

  const before = readFileSync(join(top, path), 'utf8');
  const first = highest(top, tree, root, opts.prefix) + 1;
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
