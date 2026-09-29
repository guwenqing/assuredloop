// al conclude <name> [--dropped Dn] [--yes] ([STA-7], [STA-6], [REC-9]): it
// refuses unless the sign-off is current and every held section is
// consolidated, carried, dropped while retaining nothing ([STA-3]), or kept;
// then it writes the Outcome, sets the Status and moves the folder to
// requests/archive/. It prints three lines or fewer, plus the frame.
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Fail, git, mainCommit } from './git.js';
import { openTree, findRequest, noSymlinkOn } from './tree.js';
import { rootOf, baseline } from './spec.js';
import { allBlocks, statesOf } from './states.js';
import { organized, parts, signoffState } from './signoff.js';
import { requestToWrite, decisionList, entriesOf } from './commands.js';
import { decisions } from './record-section.js';
import { liveCode } from './views.js';
import { byId, filesOf, paths, requestOf, requestsIn, sectionsChanged } from './links.js';
import { sameSection } from './sections.js';
import { adrsOf } from './adrs.js';

const HELD = ['consolidated', 'carried'];
const NOT_KNOWN = ['whether the code does what the spec says, and whether review agreed (conclude reads only the records)'];

// Each block's fate: held, kept or dropped, or why conclude refuses it.
function fateOf(e, b, { name, dropped, blocks, signedR, ownerDecisions }) {
  if (b.kept) {
    if (!HELD.includes(e.state)) return { bad: `${e.block} is Kept but reads ${e.state}; align it before it is kept` };
    // Its own signed R, or, when successors carry it, any one of theirs (design §5.4).
    const traced = signedR(b) || (e.state === 'carried' && e.carriers.some((k) => signedR(blocks.get(k)))) || ownerDecisions.has(b.kept[1]);
    return traced ? { fate: 'kept' } : { bad: `${e.block} is Kept, but traces to no signed requirement and no owner decision ([STA-6])` };
  }
  if (dropped || b.dropped) {
    return e.retainsNothing ? { fate: 'dropped' }
      : { bad: `${e.block} is dropped but possibly retained (${e.state}): al consolidate ${name} --revert ${e.id}, or keep it` };
  }
  return HELD.includes(e.state) ? { fate: 'held' }
    : { bad: `${e.block} ${e.state}${e.by ? ` ${e.state === 'waiting' ? 'on' : 'by'} ${e.by}` : ''}` };
}

// Each section's kind in the Outcome (by its blocks' net op, or Kept or
// Dropped), and each R's sections ([REC-9]).
export function outcomeFacts(org, fates) {
  const ids = new Map();
  for (const f of fates) ids.set(f.b.id, [...(ids.get(f.b.id) ?? []), f]);
  const kind = (fs) => {
    const byN = [...fs].sort((x, y) => x.b.n - y.b.n);
    if (fs.some((f) => f.fate === 'kept')) return 'Kept';
    if (fs.some((f) => f.fate === 'dropped')) return 'Dropped';
    return byN[0].b.op === 'add' ? 'Added' : byN.at(-1).b.op === 'remove' ? 'Removed' : 'Modified';
  };
  const kinds = new Map([...ids].map(([id, fs]) => [id, kind(fs)]));
  // A tier-1 record names the sections it amends with `Amends: [ID]`: under
  // R<n>, for R<n>; anywhere else in the organized section, for every R-line.
  const all = org ? parts(org.text) : [];
  const isR = (x) => /^R\d+$/.test(x.key);
  const level = (x) => x.text.match(/^\s*(#+)\s/)?.[1].length ?? 0;
  // A part under a deeper heading inside R<n> stays in R<n>'s scope.
  let r = null;
  const scope = all.map((x) => (r = isR(x) ? x : r && level(x) > level(r) ? r : null)?.key ?? null);
  const under = (key) => all.filter((x, i) => scope[i] === key).flatMap((x) => amends(x.text));
  const everyR = under(null);
  const rs = all.filter(isR).map((p) => ({
    key: p.key,
    title: p.text.split('\n')[0].replace(/^\s*#+\s+R\d+\s*/, '').trim(),
    ids: [...new Set([...[...ids].filter(([id, fs]) => kinds.get(id) !== 'Dropped' && fs.some((f) => f.b.forR.includes(p.key))).map(([id]) => `[${id}]`),
      ...under(p.key), ...everyR])],
  }));
  return { kinds, rs };
}

// The IDs an `Amends:` names: the bracketed ones after it, on its line.
const amends = (text) => [...text.matchAll(/\bAmends:([^\n]*)/g)]
  .flatMap((m) => [...m[1].matchAll(/\[([A-Z][A-Z0-9]*-\d+(?:\.\d+)*)\]/g)].map((x) => `[${x[1]}]`));

// A request with no change.md ([REC-9]): the sections its branch added,
// modified and removed, from `was` (the baseline at its fork) to `now`, both
// maps of ID to text; and, against the IDs its Amends: names, the changed ones
// it doesn't name and the named ones that didn't change.
export function baselineLists(was, now, org, own) {
  const named = org ? amends(org.text).map((x) => x.slice(1, -1)) : [];
  const changed = [...new Set([...was.keys(), ...now.keys()])].filter((id) => !(was.has(id) && now.has(id) && sameSection(was.get(id), now.get(id))));
  const ids = changed.filter((id) => own.has(id));
  return {
    Added: ids.filter((id) => !was.has(id)), Modified: ids.filter((id) => was.has(id) && now.has(id)), Removed: ids.filter((id) => !now.has(id)),
    unnamed: ids.filter((id) => !named.includes(id)),
    // "Did not change" is said of the section itself, whoever changed it.
    unchanged: [...new Set(named)].filter((id) => !changed.includes(id)),
  };
}

// The baseline IDs request `name`'s own work changed ([LNK-2]): in the commits
// fork..tip that map to it, merges left out, and, when `working`, in the
// working tree's changes not yet committed.
export function ownIds(top, name, fork, root, requests, working, tip = 'HEAD') {
  const ids = new Set();
  const seen = new Map();
  for (const sha of fork ? git(top, ['rev-list', '--no-merges', `${fork}..${tip}`]).split('\n').filter(Boolean) : []) {
    if (requestOf(top, sha, requests, seen).names.includes(name)) sectionsChanged(top, `${sha}^`, sha, root, filesOf(top, sha)).forEach((id) => ids.add(id));
  }
  if (working) {
    const files = [...paths(git(top, ['diff', '--name-only', '-z', 'HEAD'], { allowFail: true }) ?? ''), ...paths(git(top, ['ls-files', '--others', '--exclude-standard', '-z']))];
    sectionsChanged(top, 'HEAD', null, root, files, openTree(top)).forEach((id) => ids.add(id));
  }
  return ids;
}

// The baseline's sections by ID in `tree`.
const sectionsOf = (top, tree, at) => new Map(baseline(tree, rootOf(top, tree, at)).flatMap((f) => [...byId(f.text)]));

// The generated block of the Outcome ([REC-9]): content facts only.
function outcome(md, org, fates, droppedBy, live, adrs, lists) {
  const { kinds, rs } = outcomeFacts(org, fates);
  // With no change.md, the added, modified and removed come from the baseline itself.
  const list = (ks) => (lists && ks[0] in lists ? lists[ks[0]] : [...kinds].filter(([, k]) => ks.includes(k)).map(([id]) => id))
    .map((id) => `[${id}]`).join(', ') || 'none';
  const lines = droppedBy ? [`- Dropped as a whole by ${droppedBy}`] : [];
  for (const r of rs) lines.push(`- ${r.key}${r.title ? ` ${r.title}` : ''}: ${r.ids.length ? `in ${r.ids.join(', ')}` : 'in no section'}`);
  for (const k of ['Added', 'Modified', 'Removed', 'Dropped', 'Kept']) lines.push(`- ${k}: ${list([k])}`);
  const all = decisionList(md);
  lines.push(`- Decisions: ${all.filter((d) => !d.agent).map((d) => d.id).join(', ') || 'none'}`);
  lines.push(`- Agent rulings: ${all.filter((d) => d.agent).map((d) => d.id).join(', ') || 'none'}`);
  lines.push(`- ADRs added: ${adrs.added.map((a) => `${a.n}${a.status === 'proposed' ? ' (proposed)' : ''}`).join(', ') || 'none'}`);
  lines.push(`- ADRs superseded: ${adrs.superseded.map((a) => a.n).join(', ') || 'none'}`);
  // Any code still live for dropped work: all the request's for a dropped
  // request, else only under the markers of its Dropped sections.
  const droppedIds = [...kinds].filter(([, k]) => k === 'Dropped').map(([id]) => id);
  const code = droppedBy || droppedIds.length ? live(droppedBy ? null : droppedIds) : [];
  if (code.length) lines.push(`- Code still live for dropped work: ${code.join(', ')}`);
  return lines;
}

// request.md with the Outcome (re)generated at its place, or appended; the
// text from its `Notes:` line on is kept.
function withOutcome(md, generated) {
  const block = `## Outcome\n\n${generated.join('\n')}\n\n`;
  const m = md.match(/^## Outcome[ \t]*$/m);
  if (!m) return `${md.replace(/\s+$/, '')}\n\n${block}Notes:\n`;
  const after = m.index + m[0].length;
  const next = md.slice(after).search(/^#{1,2}\s/m);
  const end = next < 0 ? md.length : after + next;
  const notes = md.slice(m.index, end).search(/^Notes:/m);
  return md.slice(0, m.index) + block + (notes < 0 ? 'Notes:\n' : md.slice(m.index + notes, end)) + md.slice(end);
}

// The value of `Status:` on the request's status line set to `status`.
function withStatus(md, status) {
  const lines = md.split('\n');
  const i = lines.findIndex((l) => /\bStatus:/.test(l));
  if (i >= 0) lines[i] = lines[i].replace(/(\bStatus:\s*)[^·]*?(\s*(?:·|$))/, `$1${status}$2`);
  else lines.splice(lines.findIndex((l) => l.startsWith('# ')) + 1, 0, `Status: ${status}`);
  return lines.join('\n');
}

export function conclude({ top, args, opts }) {
  const [name] = args;
  const tree = openTree(top);
  const dir = requestToWrite(top, tree, name);
  const target = `requests/archive/${name}`;
  const moving = dir !== target;
  const md = tree.read(`${dir}/request.md`).toString('utf8');
  const dropped = opts.dropped !== undefined;
  if (dropped && !decisions(md).names.includes(opts.dropped)) {
    throw new Fail(`--dropped ${opts.dropped}: name an entry of ## Decisions in ${dir}/request.md (the decision to drop it, with its source)`,
      `write the decision, then al conclude ${name} --dropped Dn`);
  }
  if (!noSymlinkOn(top, `${dir}/request.md`) || !noSymlinkOn(top, target)) {
    throw new Fail(`${dir} or ${target} is reached through a symlink; records are written only through real folders, and nothing was written`, 'make requests/ a real folder in this repo');
  }
  if (moving && existsSync(join(top, target))) throw new Fail(`${target} already exists; a request name is never reused`, `al context ${name}`);

  const { sign, org, fates, refusals } = judge(top, tree, name, dir, dropped);
  const body = refusals.map((r) => `refused: ${r}`);
  if (body.length) {
    return {
      refused: true, body,
      next: sign.blocked && !dropped ? `show the owner the organized requirement; on their OK: al record ${name} signoff --source <where> --words <quote> --yes`
        : `al context ${name}; then consolidate, revert or keep what is named`,
      notKnown: NOT_KNOWN,
    };
  }

  const status = dropped ? 'dropped' : 'concluded';
  const live = (ids) => liveCode(top, name, rootOf(top, tree), ids);
  const adrs = adrsOf(top, tree, undefined, name, requestsIn(tree));
  const main = mainCommit(top);
  const fork = main && git(top, ['merge-base', main, 'HEAD'], { allowFail: true });
  const lists = tree.read(`${dir}/change.md`) !== null ? null : baselineLists(fork ? sectionsOf(top, openTree(top, fork), fork) : sectionsOf(top, tree), sectionsOf(top, tree), org,
    ownIds(top, name, fork, rootOf(top, tree), requestsIn(tree), true));
  const text = withOutcome(withStatus(md, status), outcome(md, org, fates, opts.dropped, live, adrs, lists));
  const children = [...entriesOf(md, 'Parts').join('\n').matchAll(/\brequest ([a-z0-9][a-z0-9-]*)/g)].map((m) => m[1])
    .filter((c) => c !== name && tree.read(`requests/${c}/request.md`) !== null);
  const note = [...(children.length ? [`note: child request ${children.join(', ')} is still open`] : []),
    ...adrs.added.filter((a) => a.status === 'proposed').map((a) => `note: ${a.path}, added by ${name}, is still proposed`)];
  const what = `the Outcome, Status: ${status}${moving ? `, and ${dir}/ moved to ${target}/` : ''}`;
  if (!opts.yes) return { body: [`Would conclude ${name}: ${what}`, ...note], next: 'run the same command with --yes to do it', notKnown: NOT_KNOWN };

  writeFileSync(join(top, dir, 'request.md'), text);
  if (moving) {
    mkdirSync(join(top, 'requests/archive'), { recursive: true });
    renameSync(join(top, dir), join(top, target));
  }
  return { body: [`Concluded ${name}: ${what}`, ...note], next: `review ${target}/request.md, then commit it`, notKnown: NOT_KNOWN };
}

// conclude's rules on request `name` in `tree` (at commit `at`, or the working
// tree): the refusals, none when it may conclude, and the facts they rest on.
export function judge(top, tree, name, dir, dropped, at) {
  const md = tree.read(`${dir}/request.md`).toString('utf8');
  const sign = signoffState(tree, dir, name);
  const org = organized(md);
  const blocks = allBlocks(tree);
  const signed = new Map();
  const signedRs = (request) => {
    if (!signed.has(request)) {
      const d = findRequest(tree, request);
      const o = d && organized(tree.read(`${d}/request.md`).toString('utf8'));
      signed.set(request, o && !signoffState(tree, d, request).blocked ? parts(o.text).map((p) => p.key) : []);
    }
    return signed.get(request);
  };
  const facts = {
    name, dropped,
    blocks,
    // Whether a block's `for R<n>` names an R its request signed off, the sign-off current ([REC-5]).
    signedR: (x) => x.forR.some((r) => signedRs(x.request).includes(r)),
    ownerDecisions: new Set(decisionList(md).filter((d) => /\bowner\b/.test(d.source) && !d.agent).map((d) => d.id)),
  };
  const fates = statesOf(baseline(tree, rootOf(top, tree, at)), blocks, (b) => b.request === name)
    .map((e) => ({ e, b: blocks.get(e.block), ...fateOf(e, blocks.get(e.block), facts) }));
  // [REC-6]: blocked, only a drop where every section retains nothing goes ahead.
  const refusals = [];
  if (sign.blocked && !(dropped && fates.every((f) => f.fate === 'dropped'))) refusals.push(`${name} is blocked: ${sign.reason} ([REC-6])`);
  const bad = fates.filter((f) => f.bad).map((f) => f.bad);
  if (bad.length) refusals.push(bad.join(' · '));
  return { md, sign, org, fates, refusals };
}
