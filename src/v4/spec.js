// al spec (design.md 13): lists each doc's IDs, display numbers and kinds;
// `--add-ids <file>` marks every paragraph that has no marker.
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseDocument } from 'yaml';
import { Fail, exists, guard, read, recordPath, write } from './base.js';
import { loadConfig, loadSchema, writeSetup } from './config.js';
import { fileAt, git } from './git.js';
import { lf, markBlocks, parseMarkdown, sameBlocks } from './markers.js';
import { append, openRecord, recordText } from './records.js';
import { docsInScope, idsEverUsed, isShallow, notRead, prefixOf, rootProblem, scopeOf, symlinkOn } from './scope.js';

// The refusal every v4 command shares (exit 2, nothing written).
export { Fail };

const PREFIX = /^[A-Z][A-Z0-9]*$/;
// The adoption record (design.md 5 and 14, D16, D19): an archived request
// named adoption, whose dispositions say where each adopted paragraph's text
// came from. It is not an owner approval.
const ADOPTION = recordPath('adoption');
const ADOPTION_MD = 'requests/archive/adoption/request.md';
const ADOPTION_TEXT = `# Adoption

The paragraphs that \`al spec --add-ids\` marked, as they were at the commit
that each entry of \`${ADOPTION}\` names. \`source: adoption\`
says where the text came from. It is not an owner approval, and it does not
excuse a later change.
`;
const USAGE = 'al-v4 spec --add-ids <file> [--prefix <PREFIX>] [--yes]';

export function spec({ top, cwd, args, opts }) {
  const root = rootProblem(loadConfig(top));
  if (root) throw new Fail(root, 'fix root: in .assuredloop/config.yaml');
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
  const body = notRead(top, config);
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
  for (const p of [path, '.assuredloop/config.yaml', '.assuredloop/schema.yaml', ADOPTION, ADOPTION_MD]) {
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

  const { text: marked, marks } = markBlocks(text, () => `${prefix}-${next++}`);
  const notKnown = ['IDs used on branches that were never fetched here'];
  if (isShallow(top)) notKnown.push('IDs used before the shallow history begins');
  const verb = opts.yes ? 'Marked' : 'Would mark';
  const body = [`${verb} ${marks.length} paragraph(s) in ${path}`];
  if (marks.length) body.push(`  ${marks[0]}${marks.length > 1 ? ` to ${marks.at(-1)}` : ''}`);
  // Only spec paragraphs are adopted; a change spec's paragraphs are its own.
  // The IDs of the scope now, in every doc of it, this one as marked.
  const living = new Set([...docs.filter((d) => d.path !== path).flatMap((d) => parseMarkdown(d.text, d.path).paragraphs), ...parseMarkdown(marked, path).paragraphs].map((p) => p.id));
  const adoption = scope === 'spec' ? adoptionOf(top, path, marked, marks, living) : { body: [], write: () => [] };
  body.push(...adoption.body);
  if (opts.yes) {
    writeFileSync(join(top, path), marked);
    for (const w of writeSetup(top, path, scope === 'spec' ? prefix : null)) body.push(`wrote ${w}`);
    for (const w of adoption.write()) body.push(`wrote ${w}`);
  }
  return {
    body,
    next: opts.yes ? `set the kind of each new marker, review the diff of ${path} and commit it` : 'run the same command with --yes to write it',
    notKnown,
  };
}

// What --add-ids records of the paragraphs it marked: one adoption entry for
// each whose text is a block of the file at HEAD, with that commit; the others
// are named as not adopted. `write()` writes the record and, when absent, the
// adoption request.md, and returns the paths written.
function adoptionOf(top, path, marked, marks, living) {
  if (exists(top, 'requests/adoption/request.md')) {
    throw new Fail('requests/adoption is an open request, and the name adoption holds the adoption record', 'give that request another name, then run it again');
  }
  const none = { body: [], write: () => [] };
  if (!marks.length) return none;
  const head = git(top, ['rev-parse', '--verify', '-q', 'HEAD^{commit}'], { allowFail: true });
  if (!head) return { ...none, body: ['no adoption record written: the repo has no commit, so no commit holds the adopted text'] };
  const atHead = fileAt(top, head, path);
  const all = parseMarkdown(marked, path).paragraphs;
  const same = atHead == null ? new Set() : sameBlocks(atHead, all, { file: path, living });
  const ids = new Set(marks);
  const paras = all.filter((p) => ids.has(p.id));
  const adopted = paras.filter((p) => same.has(p.id));
  const body = paras.filter((p) => !same.has(p.id))
    .map((p) => `not adopted: ${p.id}: its text is not a block of ${path} at HEAD ${head.slice(0, 7)} in this place`);
  if (!adopted.length) return { body: [...body, 'no adoption record written: no marked paragraph is in the file at HEAD'], write: () => [] };
  body.unshift(`adoption: ${adopted.length} paragraph(s) from commit ${head.slice(0, 7)}, in ${ADOPTION}`);
  // Read before anything is written: a record that does not parse refuses here.
  guard(top, [ADOPTION, ADOPTION_MD]);
  const rec = openRecord(top, 'adoption') ?? newRecord();
  return {
    body,
    write() {
      for (const p of adopted) {
        append(rec, 'dispositions', { source: 'adoption', disposition: 'incorporated', spec: p.id, commit: head, spec_sha256: p.sha256 }, true);
      }
      const written = [];
      if (write(top, ADOPTION, recordText(rec))) written.push(ADOPTION);
      if (read(top, ADOPTION_MD) === null && write(top, ADOPTION_MD, ADOPTION_TEXT)) written.push(ADOPTION_MD);
      return written;
    },
  };
}

function newRecord() {
  const doc = parseDocument('schema: assuredloop/1\nrequest: adoption\nstatus: concluded\ndispositions: []\n');
  return { doc, get data() { return doc.toJS() ?? {}; } };
}
