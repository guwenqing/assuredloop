// The commands built so far: new, record origin, context.
import { readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { Fail, git, hasCommits, isShallow, mainCommit, now, resolveCommit, stamp } from './git.js';
import { openTree, findRequest, isName, noSymlinkOn } from './tree.js';
import { formatSnapshot, parseSnapshot, sha256, slug } from './snapshot.js';
import { sameSection } from './sections.js';
import { changedParts, latestSignoff, organized, parts, signoffState } from './signoff.js';
import { changeStates } from './states.js';
import { recordSection } from './record-section.js';
import { archivedLines, diffView, sectionView } from './views.js';
import { hintLines, hintsOf, ranked, readBranch } from './hints.js';
import { decisions as decisionIds } from './record-section.js';
import { rootOf, baseline } from './spec.js';
import { requestsIn } from './links.js';
import { audit } from './audit.js';

const BAD = ['differs', 'broken link', 'base revised', 'base dropped', 'not found'];

// The entries of a `## <title>` section: its bullet or numbered items, each with its continuation lines.
export function entriesOf(text, title) {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => new RegExp(`^##\\s+${title}\\s*$`).test(l));
  if (at < 0) return [];
  const out = [];
  for (const l of lines.slice(at + 1)) {
    if (/^#{1,2}\s/.test(l)) break;
    if (/^(-|\d+\.)\s/.test(l)) out.push(l.trim());
    else if (l.trim() && out.length) out[out.length - 1] += ` ${l.trim()}`;
  }
  return out;
}

// The entries of `## Decisions`: each one's ID, date and Source clause (up to
// its first ". "). A clause that names the agent makes it an agent ruling.
export function decisionList(md) {
  return entriesOf(md, 'Decisions').filter((e) => /^- D\d+/.test(e)).map((e) => {
    const source = e.match(/Source:\s*([\s\S]*?)(?:\.\s|\.$|$)/)?.[1] ?? '';
    return { id: e.match(/^- (D\d+)/)[1], date: e.match(/\d{4}-\d\d-\d\d/)?.[0] ?? '', source, agent: /\bagent\b/.test(source) };
  });
}

// [STA-8]: whether a request is concluded on main, derived from main's history:
// the commit on main's first-parent line (the --at commit's, under --at)
// where its archived request.md arrived (for a merge, the merge commit), as
// { sha, when }; else { none } saying why. Nothing records it.
export function concluding(top, name, at) {
  const path = `requests/archive/${name}/request.md`;
  const main = at ? resolveCommit(top, at) : mainCommit(top);
  if (!main || git(top, ['cat-file', '-e', `${main}:${path}`], { allowFail: true }) === null) return { none: 'not on main yet' };
  const unknown = `on main; which commit added ${path} is not known`;
  if (isShallow(top)) return { none: `${unknown}: history unavailable (shallow clone)`, shallow: true };
  const found = git(top, ['log', '--first-parent', '--no-renames', '--diff-filter=A', '--format=%H %ct', main, '--', path]);
  if (!found) return { none: unknown };
  const [sha, when] = found.split('\n')[0].split(' ');
  return { sha, when: new Date(Number(when) * 1000) };
}

export function concludedOnMain(top, name, at) {
  const c = concluding(top, name, at);
  return c.sha ? `${at ? `in the history of ${at}` : 'on main'} at ${c.sha.slice(0, 7)} (${stamp(c.when)}), where requests/archive/${name}/request.md arrived` : c.none;
}

const ID_ARG = /^\[?([A-Z][A-Z0-9]*-\d+(?:\.\d+)*)\]?$/;

const BAD_NAME = (name) => `${JSON.stringify(name ?? '')} is not a request name: a name is lowercase letters, digits and hyphens, never a path ([REC-1])`;
const TIERS = ['0', '1', '2', '3', 'S'];
const TIER0 = 'tier 0 has no record ([REC-10]): if this is a fix, say why in the commit and drop the record; otherwise its tier is 1 or higher';
const FETCHED = /^\d{4}-\d\d-\d\dT\d\d:\d\dZ$/;

// A labelled line, as in `Next      al context x`.
export const line = (label, text) => `${label.padEnd(10)}${text}`;

// [VW-2]: held sections, each as `text(e)`, while the line fits in 100
// characters; else the count in each state, naming each by `id(e)` except the
// consolidated, carried and pending ones.
export function fitOrCount(label, held, text, id) {
  const full = line(label, held.map(text).join(' · '));
  if (full.length <= 100) return full;
  return line(label, [...new Set(held.map((e) => e.state))].map((s) => [s, held.filter((e) => e.state === s)])
    .map(([s, es]) => `${es.length} ${s}${['consolidated', 'carried', 'pending'].includes(s) ? '' : ` (${es.map(id).join(', ')})`}`).join(' · '));
}

// [VW-2], [VW-6]: items grouped by state, `<count> <state>: <ids>`, none left
// out. IDs the same up to a last number that runs on read as a range, REC-1–3,
// so it expands back to the exact IDs: the text before it the same, and no
// leading zero. An item marked `alone` (an ID@n, a waiting block) never is.
const ID_RUN = /^([A-Z][A-Z0-9]*-(?:\d+\.)*)(0|[1-9]\d*)$/;
export function grouped(label, items) {
  const groups = [...new Set(items.map((x) => x.state))].map((s) => {
    const xs = items.filter((x) => x.state === s);
    const names = [];
    let run = null;
    const flush = () => { if (run) names.push(run.first === run.last ? run.first : `${run.first}–${run.last.slice(run.last.indexOf('-') + 1)}`); run = null; };
    for (const x of xs) {
      const m = !x.alone && x.text.match(ID_RUN);
      if (run && m && run.stem === m[1] && Number(m[2]) === run.n + 1) { run.last = x.text; run.n += 1; continue; }
      flush();
      if (m) run = { stem: m[1], first: x.text, last: x.text, n: Number(m[2]) };
      else names.push(x.text);
    }
    flush();
    return `${xs.length} ${s}: ${names.join(', ')}`;
  });
  return line(label, groups.join(' · '));
}

// A labelled block of lines: the label on the first, the rest under it.
export const lines = (label, texts) => texts.map((t, i) => line(i ? '' : label, t));

function readInput(from, cwd) {
  if (from === undefined) throw new Fail('--from <file|-> is missing', 'pass the text with --from <file>, or --from - on standard input');
  try {
    return from === '-' ? readFileSync(0) : readFileSync(resolve(cwd, from));
  } catch (e) {
    throw new Fail(`cannot read ${from}: ${e.code || e.message}`);
  }
}

function historyNote(top) {
  return !hasCommits(top) ? 'no commits yet, so no history' : isShallow(top) ? 'history unavailable (shallow clone)' : null;
}

// al new <name> --from <file|-> [--title <t>] [--tier <t>]
export function newRequest({ top, cwd, args, opts }) {
  const [name] = args;
  if (!isName(name)) {
    throw new Fail(`bad request name ${JSON.stringify(name ?? '')}: use lowercase letters, digits and hyphens`, 'al new <name> --from <file|->');
  }
  if (opts.tier !== undefined && !TIERS.includes(opts.tier)) throw new Fail(`bad tier ${opts.tier}: one of ${TIERS.join(', ')}`);
  if (opts.tier === '0') throw new Fail(TIER0, 'al new <name> --tier 1 (or higher) when the work changes a promise');
  const words = readInput(opts.from, cwd);
  if (words.length === 0) throw new Fail('no owner\'s words given', 'pass the words with --from <file> or on standard input');

  // [REC-1]: a name is never reused, whether in the tree or ever in history.
  const paths = [`requests/${name}`, `requests/archive/${name}`];
  const used = paths.find((p) => existsSync(join(top, p))) ||
    (git(top, ['log', '--all', '-1', '--format=%h', '--', ...paths], { allowFail: true }) ? 'git history' : null);
  if (used) throw new Fail(`the name ${name} is already used (${used}); a request name is never reused`, 'al new <another name> --from <file|->');

  // [REC-1]: records are written only inside requests/ in this repo, never through a symlink.
  if (!noSymlinkOn(top, `requests/${name}/origin`)) {
    throw new Fail('requests/ is a symlink; records are written only through real folders, and nothing was written', 'make requests/ a real folder in this repo');
  }

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
export function recordOrigin(ctx) {
  const { top, cwd, args, opts } = ctx;
  const [name, kind] = args;
  if (kind === 'signoff') return recordSignoff(ctx);
  if (kind === 'section') return recordSection(ctx);
  if (kind === 'decision' || kind === 'part') return recordEntry(ctx, kind);
  if (kind !== 'origin') throw new Fail(`record ${kind ?? ''}: al record <name> origin|signoff|section|decision|part`, 'al record <name> origin --url <source> --from -');
  const tree = openTree(top);
  const dir = requestToWrite(top, tree, name);
  const origin = `${dir}/origin`;
  if (!noSymlinkOn(top, origin)) {
    throw new Fail(`${origin} is reached through a symlink; records are written only through real folders, and nothing was written`, `make ${origin} a real folder in this repo`);
  }
  if ((opts.url === undefined) === (opts.verify === undefined)) throw new Fail('give one of --url <source> or --verify <snapshot>');
  if (opts.fetched !== undefined && !FETCHED.test(opts.fetched)) throw new Fail(`--fetched ${opts.fetched}: write it as YYYY-MM-DDTHH:MMZ`);
  const text = readInput(opts.from, cwd);
  if (text.length === 0) throw new Fail('the text is empty', 'pass the fetched text with --from <file> or on standard input');
  const fetched = opts.fetched ?? stamp(now());
  const body = [];
  let source = opts.url;

  if (opts.verify !== undefined) {
    // An absolute path names exactly one file; a bare name is looked up in origin/ first.
    const inOrigin = `${dir}/origin/${opts.verify}`;
    const path = !isAbsolute(opts.verify) && tree.read(inOrigin) !== null ? inOrigin : opts.verify;
    const bytes = (isAbsolute(path) ? null : tree.read(path)) ?? (existsSync(resolve(cwd, path)) ? readFileSync(resolve(cwd, path)) : null);
    if (bytes === null) throw new Fail(`no snapshot ${opts.verify}`, `ls ${dir}/origin`);
    const old = parseSnapshot(bytes);
    if (!old) throw new Fail(`${opts.verify} is not a valid snapshot: it needs Source, Fetched and SHA-256, then a --- line`);
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
  // A name is taken by anything there, a symlink included, so no write goes through a link.
  for (let n = 2; taken(join(top, dir, 'origin', file)); n++) file = `${base}-${n}.md`;
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

// The folder of a request the tool may write: it exists, and is not archived on
// main ([REC-1]; one archived on this branch still may be, [REC-12]).
export function requestToWrite(top, tree, name) {
  if (!isName(name)) throw new Fail(BAD_NAME(name), 'al context for the requests there are');
  const dir = findRequest(tree, name);
  if (!dir) throw new Fail(`no request named ${name ?? ''}`, 'al new <name> --from <file|->');
  const main = mainCommit(top);
  if (dir.startsWith('requests/archive/') && main && git(top, ['cat-file', '-e', `${main}:${dir}/request.md`], { allowFail: true }) !== null) {
    throw new Fail(`${name} is archived on ${main.replace('refs/remotes/', '').replace('refs/heads/', '')}, and an archived request is not edited`,
      'start a new request that follows it: al new <name> --from <file|->');
  }
  return dir;
}

// al record <name> signoff --source <where> [--words <quote>] [--yes] ([REC-5]):
// shows only what changed since the last sign-off, and writes on --yes.
function recordSignoff({ top, args, opts }) {
  const [name] = args;
  if (!opts.source) throw new Fail('--source <where the owner signed> is missing', `al record ${name} signoff --source <where> --words <quote>`);
  const tree = openTree(top);
  const dir = requestToWrite(top, tree, name);
  if (!noSymlinkOn(top, `${dir}/request.md`) || !noSymlinkOn(top, `${dir}/origin`)) {
    throw new Fail(`${dir} is reached through a symlink; records are written only through real folders, and nothing was written`, `make ${dir} a real folder in this repo`);
  }
  const md = tree.read(`${dir}/request.md`).toString('utf8');
  const org = organized(md);
  if (!org) throw new Fail(`${dir}/request.md has no "## Organized requirement" (or question) to sign`, `write the organized requirement in ${dir}/request.md`);
  const { signoff: last } = latestSignoff(tree, dir, md);
  const notKnown = ['whether the owner read what was signed (the file records only what they said)'];
  if (last && sameSection(org.text, last.text)) {
    return { body: [`unchanged since ${last.file}; nothing to sign`], next: `al context ${name}`, notKnown };
  }
  const shown = last
    ? parts(org.text).filter((p) => changedParts(org.text, last.text).includes(p.key)).map((p) => p.text.replace(/\n+$/, ''))
    : [org.text.replace(/\n+$/, '')];
  const removed = last ? changedParts(org.text, last.text).filter((k) => !parts(org.text).some((p) => p.key === k)) : [];
  const fetched = stamp(now());
  let file = `${fetched.slice(0, 10)}-signoff.md`;
  for (let n = 2; taken(join(top, dir, 'origin', file)); n++) file = `${fetched.slice(0, 10)}-signoff-${n}.md`;
  const body = [last ? `Changed since ${last.file}:` : 'To be signed (first sign-off):', ...shown];
  if (removed.length) body.push(`Removed: ${removed.join(', ')}`);
  if (!opts.yes) {
    body.push(`Would write ${dir}/origin/${file} and set the Signed off line`);
    return { body, next: 'show this to the owner; on their OK, run the same command with --yes', notKnown };
  }
  const header = [`Source: ${opts.source}`, ...(opts.words !== undefined ? [`Owner's words: ${opts.words}`] : []),
    `Fetched: ${fetched}`, `SHA-256: ${sha256(org.text)}   (of the signed text below)`, '--- signed text ---', ''].join('\n');
  mkdirSync(join(top, dir, 'origin'), { recursive: true });
  writeFileSync(join(top, dir, 'origin', file), header + org.text);
  const signedOff = `Signed off: ${fetched.slice(0, 10)} owner, origin/${file}\n`;
  const lines = org.raw.split(/(?<=\n)/);
  const at = lines.findIndex((l) => /^Signed off:/.test(l));
  if (at >= 0) lines.splice(at, 1, signedOff);
  else lines.splice(lines.findLastIndex((l) => l.trim()) + 1, 0, signedOff);
  writeFileSync(join(top, dir, 'request.md'), md.slice(0, org.start) + lines.join('') + md.slice(org.end));
  body.push(`Wrote ${dir}/origin/${file} and the Signed off line in ${dir}/request.md`);
  return { body, next: `al context ${name}`, notKnown };
}

// al record <name> decision --source <who> --text <decision> [--yes] ([REC-7]),
// and al record <name> part --text <part> [--yes] ([REC-8]): one new entry at
// the end of ## Decisions (the next literal Dn, dated) or ## Parts (the next
// number), the section created at the end when missing. Nothing else changes.
function recordEntry({ top, args, opts }, kind) {
  const [name] = args;
  const usage = kind === 'decision' ? `al record ${name} decision --source <who> --text <decision> --yes` : `al record ${name} part --text <part> --yes`;
  if (opts.text === undefined || (kind === 'decision' && opts.source === undefined)) throw new Fail(`record ${kind} needs ${kind === 'decision' ? '--source and ' : ''}--text`, usage);
  const tree = openTree(top);
  const dir = requestToWrite(top, tree, name);
  if (!noSymlinkOn(top, `${dir}/request.md`)) throw new Fail(`${dir} is reached through a symlink; records are written only through real folders, and nothing was written`, `make ${dir} a real folder in this repo`);
  const md = tree.read(`${dir}/request.md`).toString('utf8');
  const title = kind === 'decision' ? 'Decisions' : 'Parts';
  const lines = md.split('\n');
  const at = lines.findIndex((l) => new RegExp(`^##\\s+${title}\\s*$`).test(l));
  let end = at < 0 ? lines.length : lines.findIndex((l, i) => i > at && /^#{1,2}\s/.test(l));
  if (end < 0) end = lines.length;
  let last = end;
  while (at >= 0 && last > at + 1 && !lines[last - 1].trim()) last--;
  const n = kind === 'decision' ? Math.max(0, ...decisionIds(md).ids) + 1
    : at < 0 ? 1 : Math.max(0, ...lines.slice(at + 1, end).map((l) => Number(l.match(/^(\d+)\.\s/)?.[1] ?? 0))) + 1;
  const entry = kind === 'decision' ? `- D${n}, ${stamp(now()).slice(0, 10)}. Source: ${opts.source}. ${opts.text}` : `${n}. ${opts.text}`;
  const next = at < 0 ? `${md.replace(/\n*$/, '\n')}\n## ${title}\n\n${entry}\n` : [...lines.slice(0, last), entry, ...lines.slice(last)].join('\n');
  if (!opts.yes) return { body: [`Would add to ${dir}/request.md, ## ${title}:`, entry], next: 'run the same command with --yes to write it', notKnown: [] };
  writeFileSync(join(top, dir, 'request.md'), next);
  return { body: [`Added to ${dir}/request.md, ## ${title}:`, entry], next: `al context ${name}`, notKnown: [] };
}

const taken = (path) => {
  try { lstatSync(path); return true; } catch { return false; }
};

// al context [<name> | <ID> | --diff <range>] [--audit] [--at <commit>]: where
// the project, a request or a section stands ([VW-1] to [VW-4], [VW-7]).
export function context({ top, args, opts }) {
  const [name] = args;
  if (opts.for !== undefined && (opts.for !== 'review' || opts.diff === undefined)) throw new Fail('--for review goes with --diff <range>', 'al context --diff main...HEAD --for review');
  if (opts.audit) {
    if (name === undefined || opts.diff !== undefined) throw new Fail('--audit takes a request, a section ID or path:line', 'al context <name | ID | path:line> --audit');
    return audit(top, ID_ARG.test(name) ? name.match(ID_ARG)[1] : name, opts.at);
  }
  if (/:\d+$/.test(name ?? '')) throw new Fail(`${name}: path:line goes with --audit`, `al context ${name} --audit`);
  if (name !== undefined && !ID_ARG.test(name) && !isName(name)) throw new Fail(BAD_NAME(name), 'al context for the requests there are');
  if (opts.diff !== undefined) return diffView(top, opts.diff, opts.for === 'review', opts.all, opts.at);
  if (ID_ARG.test(name ?? '')) return sectionView(top, name.match(ID_ARG)[1], opts.at);
  if (name === undefined) return projectView(top, opts.at);
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
    if (!s) bad.push([f, 'is not a valid snapshot (it needs Source, Fetched, SHA-256, then ---)']);
    else if (!s.intact) bad.push([f, 'no longer matches its SHA-256']);
  }
  const state = signoffState(tree, dir, name);
  const changed = state.changed?.length ? `: ${state.changed.join(', ')}` : '';
  const signedBy = state.signoff ? `origin/${state.signoff.file} (${state.signoff.fetched})` : '';
  const through = state.parent ? `${signedBy ? ' and ' : ''}through ${state.parent}` : '';
  const body = [
    ...(state.blocked ? [`BLOCKED: ${state.reason}${changed}`] : []),
    `${name}  ${title}  ${head.join(' · ')}`,
    ...(dir.startsWith('requests/archive/') ? [line('Concluded', concludedOnMain(top, name, opts.at)), ...archivedLines(top, name, opts.at, opts.all)] : []),
    line('Require', state.blocked ? `${state.reason}${changed}${changed && state.signoff ? `; al record ${name} signoff --source <where> shows what changed` : ''}` : `signed off ${signedBy}${through}; unchanged since`),
    line('Words', files.length ? `${files.join(' · ')} (SHA-256 checked: ${files.length - bad.length} of ${files.length} match)` : 'no snapshots in origin/'),
  ];
  // [VW-2]: the decisions, the held sections, the parts, and who else holds sections in the same files.
  const text = md.join('\n');
  const decisions = decisionList(text).reverse().map((d) => `${d.id} ${d.date}${d.agent ? ' (agent ruling)' : ''}`.trim());
  // --all, the verbose mode ([VW-2]): each decision in full, newest first.
  if (opts.all) body.push(...lines('Decided', entriesOf(text, 'Decisions').filter((e) => /^- D\d+/.test(e)).reverse().map((e) => e.slice(2))));
  else if (decisions.length) body.push(line('Decided', decisions.join(' · ')));
  const all = changeStates(top, { at: opts.at });
  const held = all.filter((e) => e.request === name);
  const count = (id) => held.filter((e) => e.id === id).length;
  const label = (e) => (count(e.id) > 1 ? `${e.id}@${e.n}` : e.id);
  // [VW-2]: a block marked Dropped or Kept shows by its marker, not its content state.
  const shown = held.map((e) => (e.mark ? { ...e, state: e.mark, by: null } : e));
  const own = (key) => (key.startsWith(`${name}/`) ? key.slice(name.length + 1) : key);
  const full = (e) => `${label(e)} ${e.state}${e.by ? ` ${e.state === 'waiting' ? 'on' : 'by'} ${own(e.by)}` : ''}${e.forR.length ? ` (${e.forR.join(', ')})` : ''}`;
  // [VW-2]: one section per line with --all; else the list while it fits in
  // 100 characters; else every section grouped by state, none left out.
  const list = line('Spec', shown.map(full).join(' · '));
  if (held.length) {
    body.push(...(opts.all ? lines('Spec', shown.map(full)) : list.length <= 100 ? [list]
      : [grouped('Spec', shown.map((e) => (e.state === 'waiting' ? { state: e.state, text: `${e.id}@${e.n} on ${own(e.by)}`, alone: true }
        : { state: e.state, text: label(e), alone: count(e.id) > 1 })))]));
  }
  const parts = entriesOf(text, 'Parts');
  if (parts.length) body.push(line('Parts', parts.map((p) => p.replace(/\s+/g, ' ')).join(' · ')));
  const mine = new Set(held.map((e) => e.file).filter(Boolean));
  const others = all.filter((e) => e.request !== name && mine.has(e.file));
  if (others.length) body.push(line('Same file', others.map((e) => `${e.request} holds ${e.id} in ${e.file} (${e.state})`).join(' · ')));

  // [HNT-1]: the hints this request owns, from the list check makes; then each
  // named child's state ([REC-8]). Three at most, in twelve lines, or --all.
  const main = opts.at ? null : mainCommit(top);
  const base = main && git(top, ['merge-base', main, 'HEAD'], { allowFail: true });
  const commits = base ? git(top, ['rev-list', '--reverse', `${main}..HEAD`]).split('\n').filter(Boolean) : [];
  const b = readBranch(top, { base, commits, tree, at: opts.at, range: 'main..HEAD' });
  // conclude's rules re-run on an archived request are check's ([STA-8]); a view never re-checks one.
  const hints = ranked(hintsOf(top, b, { main }), b).filter((h) => h.owners.includes(name) && h.rank !== 7);
  if (field('Tier') === '0') hints.push({ kind: 'note', text: TIER0, command: `al new ${name} --tier 1 for a change of promise` });
  entriesOf(text, 'Parts').forEach((p, k) => {
    for (const [, c] of p.matchAll(/\brequest ([a-z0-9][a-z0-9-]*)/g)) {
      const d = findRequest(tree, c);
      const status = d && tree.read(`${d}/request.md`).toString('utf8').match(/\bStatus:\s*(\w+)/)?.[1];
      const now = !d ? null : d.startsWith('requests/archive/') ? status : signoffState(tree, d, c).blocked ? 'blocked' : 'open';
      if (now) hints.push({ kind: 'note', text: `part ${k + 1} names request ${c}: ${now}`, command: `al context ${c}` });
    }
  });
  const cap = opts.all ? hints.length : Math.max(0, Math.min(3, 12 - body.length - 3));
  body.push(...hintLines(hints, cap));
  const hidden = cap === 0 && hints.length ? `; hints: ${hints.length} more hidden, --all` : '';
  return {
    tree,
    body,
    // [REC-1]: an archived request is not edited; its Next is a read command.
    next: (dir.startsWith('requests/archive/') ? `al context ${name} --audit for the whole trace`
      : state.blocked ? `show the owner the organized requirement; on their OK: al record ${name} signoff --source <where> --words <quote> --yes`
      : bad.length
      ? `re-fetch the source of origin/${bad[0][0]}, then al record ${name} origin ${bad[0][1].startsWith('no longer') ? `--verify ${bad[0][0]}` : '--url <source>'} --from -`
      : `al record ${name} origin --url <source> --from - to snapshot a new original`) + hidden,
    notKnown: [historyNote(top), 'whether the sources changed since they were fetched', opts.at && 'the hints that compare with main (not read under --at)'].filter(Boolean),
  };
}

// al context: the open requests, one line each, the blocked ones first ([VW-1]).
function projectView(top, at) {
  const tree = openTree(top, at);
  const rows = requestsIn(tree).filter((r) => r.open).map((r) => {
    const s = signoffState(tree, r.dir, r.name);
    const title = (r.md.match(/^# (.*)$/m)?.[1] ?? r.name).trim();
    return { blocked: s.blocked, text: `${r.name}  ${title}  ${s.blocked ? `BLOCKED: ${s.reason}` : r.md.match(/\bStatus:\s*(\w+)/)?.[1] ?? 'status unknown'}` };
  }).sort((x, y) => y.blocked - x.blocked);
  const body = rows.length ? rows.map((r) => r.text) : ['no open requests'];
  if (!baseline(tree, rootOf(top, tree, at)).length) body.push('no baseline yet; requests add sections as they go');
  return {
    tree,
    body,
    next: rows[0] ? `al context ${rows[0].text.split('  ')[0]}` : 'al new <name> --from <file|->',
    notKnown: [historyNote(top), 'whether the sources changed since they were fetched'].filter(Boolean),
  };
}
