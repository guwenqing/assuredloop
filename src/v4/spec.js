// al spec (design.md 13): lists each doc's IDs, display numbers and kinds;
// `--add-ids <file>` marks every paragraph that has no marker.
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { loadConfig, loadSchema, writeSetup } from './config.js';
import { HEADING, blocksOf, lf, parseMarkdown } from './markers.js';
import { docsInScope, idsEverUsed, isShallow, outsideDocs, prefixOf, scopeOf } from './scope.js';

export class Fail extends Error {
  constructor(message, next) {
    super(message);
    this.next = next;
  }
}

const PREFIX = /^[A-Z][A-Z0-9]*$/;
const USAGE = 'al-v4 spec --add-ids <file> [--prefix <PREFIX>] [--yes]';

export function spec({ top, cwd, args, opts }) {
  if (opts['add-ids'] !== undefined) return addIds({ top, cwd, opts });
  const config = loadConfig(top);
  const { kinds } = loadSchema(top);
  let docs = docsInScope(top, config);
  if (args.length) {
    const wanted = args.map((a) => relative(top, resolve(cwd, a)));
    const missing = wanted.filter((p) => !docs.some((d) => d.path === p));
    if (missing.length) throw new Fail(`not a doc in scope: ${missing.join(', ')}`, 'al-v4 spec, with no file, lists every doc in scope');
    docs = docs.filter((d) => wanted.includes(d.path));
  }
  const body = outsideDocs(config).map((f) => `not read: ${f}: outside the repository`);
  for (const d of docs) {
    body.push(d.path);
    for (const p of parseMarkdown(d.text, d.path, { kinds }).paragraphs) body.push(`  ${p.displayNumber}  ${p.kind ?? '-'}`);
  }
  if (!docs.length) body.push(`no doc in scope: no *.md under ${config.root}/, no doc in .assuredloop/config.yaml, no requests/<name>/spec.md`);
  return { body, next: 'al-v4 check', notKnown: ['whether each kind is right (the review judges that)'] };
}

function addIds({ top, cwd, opts }) {
  const path = relative(top, resolve(cwd, opts['add-ids']));
  const config = loadConfig(top);
  if (!path.endsWith('.md') || path.startsWith('..')) throw new Fail(`${opts['add-ids']}: give a .md file in this repo`, USAGE);
  // --add-ids writes the doc and the two settings files: never through a symlink.
  for (const p of [path, '.assuredloop/config.yaml', '.assuredloop/schema.yaml']) {
    const link = symlinkOn(top, p);
    if (link) throw new Fail(`${link} is a symlink; --add-ids writes no file through a symlink`, USAGE);
  }
  if (!existsSync(join(top, path)) || !lstatSync(join(top, path)).isFile()) throw new Fail(`${path}: no such file`, USAGE);
  if (path.startsWith(`${config.root.replace(/\/+$/, '')}/adr/`)) throw new Fail(`${path}: ADRs are not marked by --add-ids`, USAGE);
  const listed = prefixOf(path, config);
  if (opts.prefix !== undefined && !PREFIX.test(opts.prefix)) {
    throw new Fail(`--prefix ${JSON.stringify(opts.prefix)}: give capital letters and digits, starting with a letter, e.g. INV`, USAGE);
  }
  if (listed && opts.prefix !== undefined && opts.prefix !== listed) {
    throw new Fail(`${path} has the prefix ${listed}${listed === 'SP' ? ' (a request spec)' : ' in .assuredloop/config.yaml'}, not ${opts.prefix}`, USAGE);
  }
  const prefix = listed ?? opts.prefix;
  if (!prefix) throw new Fail(`${path} is not in .assuredloop/config.yaml: give --prefix <PREFIX>`, USAGE);
  const scope = scopeOf(path, config) ?? 'spec';

  // The highest number ever used for the prefix: in the history of the scope,
  // and in the docs of the scope now (this file included).
  const used = new Set(idsEverUsed(top, config, '--all')?.get(scope) ?? []);
  const text = lf(readFileSync(join(top, path), 'utf8'));
  const docs = [...docsInScope(top, config).filter((d) => d.scope === scope), { path, text }];
  for (const d of docs) for (const p of parseMarkdown(d.text, d.path).paragraphs) used.add(p.id);
  let next = Math.max(0, ...[...used].filter((id) => id.slice(0, id.lastIndexOf('-')) === prefix).map((id) => Number(id.slice(id.lastIndexOf('-') + 1)))) + 1;

  const lines = text.split('\n');
  const { blocks: all, markers } = blocksOf(lines);
  const todo = all.filter((b) => !b.marked);
  const out = [];
  let k = 0;
  const marks = [];
  lines.forEach((l, i) => {
    if (k < todo.length && todo[k].first === i) {
      const id = `${prefix}-${next++}`;
      marks.push(id);
      if (out.length && out.at(-1).trim() !== '') out.push('');
      out.push(HEADING.test(l) ? `<!-- ${id} note -->` : `<!-- ${id} -->`, '');
      k++;
    } else if (markers.has(i) && out.length && out.at(-1).trim() !== '') {
      out.push('');
    }
    out.push(l);
    if (markers.has(i) && lines[i + 1] !== undefined && lines[i + 1].trim() !== '') out.push('');
  });
  const notKnown = ['IDs used on branches that were never fetched here'];
  if (isShallow(top)) notKnown.push('IDs used before the shallow history begins');
  const verb = opts.yes ? 'Marked' : 'Would mark';
  const body = [`${verb} ${marks.length} paragraph(s) in ${path}`];
  if (marks.length) body.push(`  ${marks[0]}${marks.length > 1 ? ` to ${marks.at(-1)}` : ''}`);
  if (opts.yes) {
    writeFileSync(join(top, path), out.join('\n'));
    for (const w of writeSetup(top, path, scope === 'spec' ? prefix : null)) body.push(`wrote ${w}`);
  }
  return {
    body,
    next: opts.yes ? `set the kind of each new marker, review the diff of ${path} and commit it` : 'run the same command with --yes to write it',
    notKnown,
  };
}

// The first part of `path` (from the repo top) that is a symlink, or null.
function symlinkOn(top, path) {
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
