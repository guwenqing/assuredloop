// The commands built so far: new, record origin, context.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Fail, git, isShallow, now, stamp } from './git.js';
import { openTree, findRequest } from './tree.js';
import { formatSnapshot, parseSnapshot, sha256, slug } from './snapshot.js';

const NAME = /^[a-z0-9][a-z0-9-]*$/;
const TIERS = ['0', '1', '2', '3', 'S'];
const FETCHED = /^\d{4}-\d\d-\d\dT\d\d:\d\dZ$/;

// A labelled line, as in `Next      al context x`.
export const line = (label, text) => `${label.padEnd(10)}${text}`;

function readInput(from, cwd) {
  if (from === undefined) throw new Fail('--from <file|-> is missing', 'pass the text with --from <file>, or --from - on standard input');
  try {
    return from === '-' ? readFileSync(0) : readFileSync(join(cwd, from));
  } catch (e) {
    throw new Fail(`cannot read ${from}: ${e.code || e.message}`);
  }
}

function historyNote(top) {
  return isShallow(top) ? 'history unavailable (shallow clone)' : null;
}

// al new <name> --from <file|-> [--title <t>] [--tier <t>]
export function newRequest({ top, cwd, args, opts }) {
  const [name] = args;
  if (name === undefined || !NAME.test(name) || name === 'archive') {
    throw new Fail(`bad request name ${JSON.stringify(name ?? '')}: use lowercase letters, digits and hyphens`, 'al new <name> --from <file|->');
  }
  if (opts.tier !== undefined && !TIERS.includes(opts.tier)) throw new Fail(`bad tier ${opts.tier}: one of ${TIERS.join(', ')}`);
  const words = readInput(opts.from, cwd);
  if (words.length === 0) throw new Fail('no owner\'s words given', 'pass the words with --from <file> or on standard input');

  // [REC-1]: a name is never reused, whether in the tree or ever in history.
  const paths = [`requests/${name}`, `requests/archive/${name}`];
  const used = paths.find((p) => existsSync(join(top, p))) ||
    (git(top, ['log', '--all', '-1', '--format=%h', '--', ...paths], { allowFail: true }) ? 'git history' : null);
  if (used) throw new Fail(`the name ${name} is already used (${used}); a request name is never reused`, 'al new <another name> --from <file|->');

  const date = stamp(now());
  const snapName = `${date.slice(0, 10)}-owner-words.md`;
  const dir = join(top, 'requests', name);
  mkdirSync(join(dir, 'origin'), { recursive: true });
  writeFileSync(join(dir, 'origin', snapName), formatSnapshot({
    source: opts.from === '-' ? 'standard input' : opts.from, fetched: date, text: words,
  }));
  writeFileSync(join(dir, 'request.md'), [
    `# ${opts.title ?? name}`,
    opts.tier === undefined ? 'Status: open' : `Tier: ${opts.tier} · Status: open`,
    '',
    "## Owner's words and dialog",
    '',
    `- ${date.slice(0, 10)} the owner's words, snapshot origin/${snapName}`,
    '',
  ].join('\n'));
  return {
    body: [`Wrote requests/${name}/request.md and requests/${name}/origin/${snapName}`],
    next: `write the organized requirement in requests/${name}/request.md, then al context ${name}`,
    notKnown: [historyNote(top) ?? 'whether the name is used on a branch not fetched here'],
  };
}

// al record <name> origin --url <src> | --verify <snapshot>, --from <file|-> [--yes]
export function recordOrigin({ top, cwd, args, opts }) {
  const [name, kind] = args;
  if (kind !== 'origin') throw new Fail(`record ${kind ?? ''}: only "record <name> origin" is built so far`, 'al record <name> origin --url <source> --from -');
  const tree = openTree(top);
  const dir = findRequest(tree, name ?? '');
  if (!dir) throw new Fail(`no request named ${name ?? ''}`, 'al new <name> --from <file|->');
  if ((opts.url === undefined) === (opts.verify === undefined)) throw new Fail('give one of --url <source> or --verify <snapshot>');
  if (opts.fetched !== undefined && !FETCHED.test(opts.fetched)) throw new Fail(`--fetched ${opts.fetched}: write it as YYYY-MM-DDTHH:MMZ`);
  const text = readInput(opts.from, cwd);
  if (text.length === 0) throw new Fail('the text is empty', 'pass the fetched text with --from <file> or on standard input');
  const fetched = opts.fetched ?? stamp(now());
  const body = [];
  let source = opts.url;

  if (opts.verify !== undefined) {
    const inOrigin = `${dir}/origin/${opts.verify}`;
    const path = tree.read(inOrigin) !== null ? inOrigin : opts.verify;
    const bytes = tree.read(path) ?? (existsSync(join(cwd, path)) ? readFileSync(join(cwd, path)) : null);
    if (bytes === null) throw new Fail(`no snapshot ${opts.verify}`, `ls ${dir}/origin`);
    const old = parseSnapshot(bytes);
    if (!old) throw new Fail(`${opts.verify} is not a snapshot: no SHA-256 line and --- separator`);
    if (!old.intact) body.push(`not ok: ${opts.verify} text no longer matches its SHA-256`);
    if (sha256(text) === old.recorded) {
      body.push(`unchanged since ${old.fields.Fetched}`);
      return { body, next: `al context ${name}`, notKnown: ['whether the source changes after this fetch'] };
    }
    body.push(`changed since ${old.fields.Fetched}`);
    source = old.fields.Source;
  }

  const snapshot = formatSnapshot({ source, fetched, updated: opts.updated, text });
  const base = `${fetched.slice(0, 10)}-${slug(source)}`;
  let file = `${base}.md`;
  for (let n = 2; existsSync(join(top, dir, 'origin', file)); n++) file = `${base}-${n}.md`;
  const target = `${dir}/origin/${file}`;
  const shown = snapshot.toString('utf8').replace(/\n$/, '');
  if (opts.yes) {
    mkdirSync(join(top, dir, 'origin'), { recursive: true });
    writeFileSync(join(top, target), snapshot);
    body.push(`Wrote ${target}:`, shown);
    return { body, next: `cite origin/${file} in an entry of ${dir}/request.md`, notKnown: ['whether the source changes after this fetch'] };
  }
  body.push(`Would write ${target}:`, shown);
  return { body, next: 'run the same command with --yes to write it', notKnown: ['whether the source changes after this fetch'] };
}

// al context <name> [--at <commit>]: where a request stands (minimal, [VW-2] comes later).
export function context({ top, args, opts }) {
  const [name] = args;
  if (name === undefined) throw new Fail('al context <name>: the list of all requests is not built yet', 'al context <name>');
  const tree = openTree(top, opts.at);
  const dir = findRequest(tree, name);
  if (!dir) throw new Fail(`no request named ${name} in the ${tree.label}`, 'al context <name> for a request under requests/');

  const md = tree.read(`${dir}/request.md`).toString('utf8').split('\n');
  const title = (md.find((l) => l.startsWith('# ')) ?? `# ${name}`).slice(2).trim();
  const facts = md.find((l) => /\bStatus:/.test(l)) ?? '';
  const field = (key) => facts.match(new RegExp(`${key}:\\s*([^·]+)`))?.[1].trim();
  const head = [field('Type'), field('Tier') && `tier ${field('Tier')}`, field('Status') ?? 'status unknown'].filter(Boolean);

  const files = (tree.list(`${dir}/origin`) ?? []).filter((f) => f.endsWith('.md')).reverse();
  const bad = [];
  for (const f of files) {
    const s = parseSnapshot(tree.read(`${dir}/origin/${f}`) ?? Buffer.alloc(0));
    if (!s || !s.intact) bad.push(f);
  }
  const body = [
    `${name}  ${title}  ${head.join(' · ')}`,
    line('Words', files.length ? `${files.join(' · ')} (SHA-256 checked: ${files.length - bad.length} of ${files.length} match)` : 'no snapshots in origin/'),
  ];
  for (const f of bad.slice(0, 3)) body.push(line('Hint', `not ok: origin/${f} no longer matches its SHA-256`));
  if (bad.length > 3) body.push(line('Hint', `${bad.length - 3} more hidden`));
  return {
    tree,
    body,
    next: bad.length
      ? `re-fetch the source of origin/${bad[0]}, then al record ${name} origin --verify ${bad[0]} --from -`
      : `al record ${name} origin --url <source> --from - to snapshot a new original`,
    notKnown: [historyNote(top), 'whether the sources changed since they were fetched'].filter(Boolean),
  };
}
