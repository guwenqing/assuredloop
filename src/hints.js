// The hints ([HNT-1], [HNT-2]) of a branch and of the requests it reads, each
// with its owners, so `check --strict` counts only what the branch serves or
// archives, or what no request owns ([HNT-3]). One list feeds check, context
// --diff and context <name>.
import { git } from './git.js';
import { openTree } from './tree.js';
import { rootOf, baseline, duplicateIds } from './spec.js';
import { allBlocks, statesOf } from './states.js';
import { sameSection } from './sections.js';
import { organized, parts, signoffState } from './signoff.js';
import { parseSnapshot } from './snapshot.js';
import { entriesOf, line } from './commands.js';
import { headingFault } from './consolidate.js';
import { judge, outcomeFacts } from './conclude.js';
import { appendOnly } from './check.js';
import { liveCode } from './views.js';
import { byId, filesOf, paths, requestOf, requestsIn, sectionsChanged } from './links.js';

const BAD = ['differs', 'base revised', 'base dropped', 'broken link'];
const ID_TOKEN = /\[([A-Z][A-Z0-9]*-\d+(?:\.\d+)*)\]/g;
const statusOf = (md) => md.split('\n').find((l) => /\bStatus:/.test(l)) ?? '';
const isDropped = (md) => /\bStatus:\s*dropped\b/.test(statusOf(md));
const folderOf = (p) => p.match(/^requests\/archive\/([^/]+)\//)?.[1] ?? p.match(/^requests\/(?!archive\/)([^/]+)\//)?.[1];
const childrenOf = (md) => [...entriesOf(md, 'Parts').join('\n').matchAll(/\brequest ([a-z0-9][a-z0-9-]*)/g)].map((m) => m[1]);
const sections = (files) => new Map(files.flatMap((f) => [...byId(f.text)]));

// What the hints read: the final state (`tree`, the working tree or the tree
// of `at`), the commits base..head, the requests they serve, and what the
// branch changes. `range` names the commits read, as the hints say it.
export function readBranch(top, { base, commits, tree, at, range }) {
  const root = rootOf(top, tree, at);
  const files = baseline(tree, root);
  const before = base ? baseline(openTree(top, base), rootOf(top, openTree(top, base), base)) : files;
  const [was, now] = [sections(before), sections(files)];
  const changedIds = [...new Set([...was.keys(), ...now.keys()])].filter((id) => !(was.has(id) && now.has(id) && sameSection(was.get(id), now.get(id))));
  // The working tree's final state includes its untracked files; a commit's is only its tree.
  const changed = base ? [...paths(git(top, ['diff', '--name-only', '-z', '--no-renames', base, ...(at ? [at] : [])])),
    ...(at ? [] : paths(git(top, ['ls-files', '--others', '--exclude-standard', '-z'])))] : [];
  const requests = requestsIn(tree);
  const seen = new Map();
  const mapped = commits.map((sha) => requestOf(top, sha, requests, seen));
  const served = new Set([...mapped.flatMap((c) => c.names), ...changed.map(folderOf).filter(Boolean)]);
  const archived = new Set(base ? requests.filter((r) => !r.open && git(top, ['cat-file', '-e', `${base}:${r.dir}/request.md`], { allowFail: true }) === null).map((r) => r.name) : []);
  // Work is anything a request's commits touch beyond its own request.md and origin/.
  const work = (name, sha) => filesOf(top, sha).some((f) => !new RegExp(`^requests/(?:archive/)?${name}/(?:request\\.md$|origin/)`).test(f));
  const delivered = new Set(mapped.flatMap((c) => c.names.filter((n) => work(n, c.sha))));
  for (const p of changed) if (/^requests\/(?:archive\/)?[^/]+\/change\.md$/.test(p)) delivered.add(folderOf(p));
  const tiers = commits.map((sha) => [...git(top, ['show', '-s', '--format=%B', sha]).matchAll(/^[ \t]*Tier:[ \t]*(.+?)[ \t]*$/gm)].at(-1)?.[1]);
  const tier = tiers.filter(Boolean).at(-1) ?? null;
  return { root, files, now, changedIds, changed, requests, blocks: allBlocks(tree), seen, mapped, served, archived, delivered, work, tier, base, commits, tree, at, range };
}

// Every hint for branch `b` ([HNT-2]), unranked: { kind, rank (HNT-2's list
// order), owners, text, command, counts? }.
export function hintsOf(top, b, { main }) {
  const out = [];
  const add = (kind, rank, owners, text, command, counts) => out.push({ kind, rank, owners, text, command, counts });
  const open = b.requests.filter((r) => r.open);
  const names = new Set(b.requests.map((r) => r.name));
  const known = (id) => b.now.has(id) || [...b.blocks.values()].some((x) => x.id === id);
  const signed = new Map(open.map((r) => [r.name, signoffState(b.tree, r.dir, r.name)]));

  // A held section in a state to fix; two open holders not linked.
  for (const e of statesOf(b.files, b.blocks)) {
    if (BAD.includes(e.state) || e.state === 'not found') {
      add('not ok', e.state === 'not found' ? 6 : 1, [e.request], `[${e.id}] held by ${e.request} reads ${e.state}${e.candidates.length ? `; candidates ${e.candidates.join(', ')}` : ''}`, `al context ${e.request}`);
    }
  }
  const reached = (x) => {
    const out = [];
    for (let cur = x, n = 0; cur?.base && n < 100; cur = b.blocks.get(cur.base), n++) out.push(cur.base.split('/')[0]);
    return out;
  };
  const holders = new Map();
  for (const x of b.blocks.values()) if (x.open && !x.dropped && !x.requestDropped) holders.set(x.id, [...(holders.get(x.id) ?? []), x]);
  for (const [id, xs] of holders) {
    const reqs = [...new Set(xs.map((x) => x.request))];
    const reaches = (p, q) => xs.some((x) => x.request === p && reached(x).includes(q));
    const loose = reqs.filter((p) => reqs.some((q) => q !== p && !reaches(p, q) && !reaches(q, p)));
    if (loose.length) add('not ok', 2, loose, `[${id}] held by ${loose.join(' and ')}, neither builds on the other`, `al record ${loose[1]} section ${id} --builds-on ${loose[0]}`);
  }
  if (main) out.push(...appendOnly(top, main, b.commits));

  // The baseline: conflict markers, a Was:/Now: block, duplicate IDs; no request owns these.
  for (const f of b.files) {
    const ls = f.text.split('\n');
    const marker = ls.findIndex((l) => /^(<{7}|={7}|>{7})( |$)/.test(l));
    if (marker >= 0) add('not ok', 4, [], `a conflict marker in ${f.path}:${marker + 1}`, 'resolve it, then al check');
    const block = ls.findIndex((l) => /^(Was|Now):\s*$/.test(l));
    if (block >= 0) add('not ok', 4, [], `a Was:/Now: block in ${f.path}:${block + 1}; the baseline holds promises, not changes`, 'move it into a change.md, then al check');
  }
  for (const [id, at] of duplicateIds(b.files)) add('not ok', 5, [], `duplicate ID [${id}] in ${at.join(' and ')}`, 'rename one copy by hand, then al spec --list');

  // An open request citing what does not exist, or a block that breaks [SPC-5].
  for (const r of open) {
    const org = organized(r.md);
    const rKeys = org ? parts(org.text).map((p) => p.key) : null;
    for (const x of [...b.blocks.values()].filter((y) => y.request === r.name)) {
      if (x.anchor && !known(x.anchor)) add('not ok', 5, [r.name], `${r.name} cites [${x.anchor}] as the anchor of ${x.key}, which is in no section or block`, `al context ${r.name}`);
      for (const k of rKeys ? x.forR.filter((y) => !rKeys.includes(y)) : []) add('not ok', 5, [r.name], `${r.name} cites ${k} in ${x.key}, which its organized requirement lacks`, `al context ${r.name}`);
      for (const [text, side] of [[x.now, 'Now'], [x.was, 'Was']]) {
        const fault = text !== null && headingFault(x, text, side);
        if (fault) add('not ok', 5, [r.name], fault, `al context ${r.name}`);
      }
    }
    for (const e of entriesOf(r.md, 'Decisions')) {
      for (const [, id] of e.matchAll(ID_TOKEN)) if (!known(id)) add('not ok', 5, [r.name], `${r.name} cites [${id}] in ${e.match(/^- (D\d+)/)?.[1] ?? 'a decision'}, which is in no section or block`, `al context ${r.name}`);
    }
    const follows = statusOf(r.md).match(/\bFollows:\s*([^·]+)/)?.[1].split(/[\s,]+/).filter(Boolean) ?? [];
    for (const [n, where] of [...follows.map((n) => [n, 'Follows']), ...childrenOf(r.md).map((n) => [n, 'Parts'])]) {
      if (!names.has(n)) add('not ok', 5, [r.name], `${r.name} cites request ${n} (${where}), which does not exist`, `al context ${r.name}`);
    }
  }

  // [STA-8]: conclude's rules re-run on each request the branch archives.
  const facts = new Map();
  for (const name of b.archived) {
    const r = b.requests.find((x) => x.name === name);
    const j = judge(top, b.tree, name, r.dir, isDropped(r.md), b.at);
    facts.set(name, { r, j });
    if (j.refusals.length) add('not ok', 7, [name], `${name} is archived on this branch but no longer meets conclude's rules: ${j.refusals.join('; ')}`, `al conclude ${name}`);
  }

  // [REC-6]: a blocked request's Now written into the baseline, or its work delivered; each counts.
  for (const id of b.changedIds) {
    for (const x of b.blocks.values()) {
      if (x.open && x.id === id && signed.get(x.request)?.blocked && x.now && b.now.has(id) && sameSection(b.now.get(id), x.now)) {
        add('not ok', 8, [x.request], `[${id}] changed on this branch equals the Now of ${x.key}, and ${x.request} is blocked (${signed.get(x.request).reason})`, `al record ${x.request} signoff --source <where> --yes`, true);
      }
    }
  }
  for (const name of b.delivered) {
    if (signed.get(name)?.blocked) add('not ok', 9, [name], `this branch delivers work for ${name}, which is blocked (${signed.get(name).reason})`, `al record ${name} signoff --source <where> --yes`, true);
  }
  if (b.tier && /^0\b/.test(b.tier) && b.changed.some((p) => p.startsWith(`${b.root}/`))) {
    add('not ok', 10, [], `the claim is tier 0, but ${b.range} edits the baseline${b.changedIds.length ? `: ${b.changedIds.map((i) => `[${i}]`).join(', ')}` : ''}`, `al context --diff ${b.range}`);
  }

  // Snapshots: a text that no longer matches its hash; a served request's web source not re-checked.
  for (const r of b.requests) {
    for (const f of (b.tree.list(`${r.dir}/origin`) ?? []).filter((x) => x.endsWith('.md'))) {
      const s = parseSnapshot(b.tree.read(`${r.dir}/origin/${f}`) ?? Buffer.alloc(0));
      if (!s) add('not ok', 11, [r.name], `origin/${f} of ${r.name} is not a valid snapshot: it needs Source, Fetched and SHA-256, then ---`, `al record ${r.name} origin --url <source> --from -`);
      else if (!s.intact) add('not ok', 11, [r.name], `origin/${f} of ${r.name} no longer matches its SHA-256`, `al record ${r.name} origin --verify ${f} --from -`);
      else if (b.served.has(r.name) && /^https?:\/\//.test(s.fields.Source)) {
        add('note', 19, [r.name], `origin/${f} of ${r.name}, fetched ${s.fields.Fetched}, not re-checked since`, `al record ${r.name} origin --verify ${f} --from -`);
      }
    }
  }

  // Notes about the branch's own changes.
  const ours = (n) => b.served.has(n) || b.archived.has(n);
  for (const id of b.changedIds) {
    const others = [...new Set([...b.blocks.values()].filter((x) => x.open && x.id === id && !ours(x.request)).map((x) => x.request))];
    if (others.length) add('note', 12, [], `${b.range} edits [${id}], which ${others.join(' and ')} ${others.length > 1 ? 'hold' : 'holds'}: a hotfix, which the holder re-bases onto or accepts`, `al context ${others[0]}`);
  }
  const mainSha = main && git(top, ['rev-parse', '--verify', '--quiet', main], { allowFail: true });
  if (mainSha && b.base) {
    const moved = sectionsChanged(top, b.base, mainSha, b.root, paths(git(top, ['diff', '--name-only', '-z', '--no-renames', b.base, mainSha])));
    for (const id of b.changedIds.filter((i) => moved.includes(i))) add('note', 13, [], `[${id}], edited on this branch, changed on main since the fork`, `git merge ${main.replace(/^refs\/(remotes|heads)\//, '')}`);
  }
  for (const c of b.mapped.filter((x) => !x.names.length)) {
    const fs = filesOf(top, c.sha).filter((p) => p.startsWith(`${b.root}/`));
    if (fs.length) add('note', 14, [], `${c.sha.slice(0, 7)} changes ${fs.join(', ')} with no request linked (fine for tier 0; say why)`, `git show ${c.sha.slice(0, 7)}`);
  }
  for (const name of new Set([...b.served, ...b.archived])) {
    const r = b.requests.find((x) => x.name === name);
    const ids = [...b.blocks.values()].filter((x) => x.request === name && x.dropped && !x.kept).map((x) => x.id);
    if (!r || !(isDropped(r.md) || ids.length)) continue;
    const live = liveCode(top, name, b.root, isDropped(r.md) ? null : ids, b.at ?? 'HEAD');
    if (!live.length) continue;
    const plans = [r, ...b.requests.filter((p) => childrenOf(p.md).includes(name))].flatMap((p) => entriesOf(p.md, 'Parts').map((e) => [p.name, e]))
      .find(([, e]) => live.some((l) => e.includes(l.split(':')[0])));
    add('note', 17, [name], `code still live for dropped work of ${name}: ${live.join(', ')}; ${plans ? `a part of ${plans[0]} plans its removal: ${plans[1]}` : 'no part plans its removal'}`, `al context ${name}`);
  }
  for (const name of b.served) {
    const s = signed.get(name);
    if (!s?.blocked) continue;
    add('note', 18, [name], s.signoff ? `${name} changed since its sign-off (${s.signoff.file})${s.changed?.length ? `: ${s.changed.join(', ')}` : ''}` : `${name} is not signed off yet: ${s.reason}`,
      `al record ${name} signoff --source <where> --yes`);
  }
  if (b.commits.length && !b.tier) add('note', 22, [], `no Tier line in ${b.range}`, 'add "Tier: <n> — <claim>" to the PR, e.g. with git commit --amend');
  if (mainSha) out.push(...earlyWork(top, b, mainSha));
  for (const [name, { r, j }] of facts) {
    for (const x of outcomeFacts(j.org, j.fates).rs.filter((y) => !y.ids.length)) add('note', 24, [name], `${name} ${x.key}${x.title ? ` ${x.title}` : ''} is in no section at conclusion`, `al context ${name}`);
    for (const c of childrenOf(r.md).filter((n) => open.some((o) => o.name === n))) add('note', 25, [name], `${name} concludes while its child ${c} is still open`, `al context ${c}`);
  }
  return out;
}

// Work for a served request that reached main before its first sign-off,
// judged by when each reached main: along main's first-parent line, where a
// merge brings its branch's commits all at once, after the first main-line
// commit that holds the sign-off.
function earlyWork(top, b, mainSha) {
  const out = [];
  let line = null;
  for (const name of b.served) {
    const r = b.requests.find((x) => x.name === name);
    if (!r) continue;
    const signoffs = (b.tree.list(`${r.dir}/origin`) ?? []).filter((f) => (b.tree.read(`${r.dir}/origin/${f}`) ?? Buffer.alloc(0)).includes('\n--- signed text ---\n'));
    const places = signoffs.flatMap((f) => [`requests/${name}/origin/${f}`, `requests/archive/${name}/origin/${f}`]);
    const first = places.length ? git(top, ['log', '--reverse', '--diff-filter=A', '--format=%H', mainSha, '--', ...places]).split('\n')[0] : '';
    line ??= git(top, ['rev-list', '--first-parent', mainSha]).split('\n').filter(Boolean).map((c) => ({
      c, brought: git(top, ['rev-parse', '--verify', '--quiet', `${c}^2`], { allowFail: true }) ? git(top, ['rev-list', `${c}^1..${c}^2`]).split('\n').filter(Boolean) : [c],
    }));
    for (const { c, brought } of line) {
      if (first && git(top, ['merge-base', '--is-ancestor', first, c], { allowFail: true }) !== null) continue;
      for (const sha of brought.filter((s) => requestOf(top, s, b.requests, b.seen).names.includes(name) && b.work(name, s))) {
        out.push({ kind: 'note', rank: 23, owners: [name], text: `${sha.slice(0, 7)}, work for ${name}, reached main before its first sign-off`, command: `git show ${sha.slice(0, 7)}` });
      }
    }
  }
  return out;
}

// Ranked ([HNT-1]): not ok before note; those that count before information;
// then [HNT-2]'s order. A not ok counts when the branch serves or archives an
// owner, or when no request owns it ([HNT-3]).
export function ranked(list, b) {
  for (const h of list) h.counts = h.kind === 'not ok' && Boolean(h.counts || !h.owners.length || h.owners.some((n) => b.served.has(n) || b.archived.has(n)));
  return list.map((h, i) => ({ h, i }))
    .sort((x, y) => (x.h.kind === y.h.kind ? 0 : x.h.kind === 'not ok' ? -1 : 1) || (y.h.counts - x.h.counts) || (x.h.rank - y.h.rank) || (x.i - y.i))
    .map((x) => x.h);
}

export const hintText = (h) => `${h.kind}: ${h.text}${h.kind === 'not ok' && !h.counts ? ` (information: owned by ${h.owners.join(', ')})` : ''}; ${h.command}`;

// Hint lines for a view: up to `cap` under a Hint label, the last one saying
// how many more are hidden ([HNT-1]).
export function hintLines(list, cap) {
  const shown = list.slice(0, cap).map(hintText);
  if (list.length > cap && shown.length) shown[shown.length - 1] += `; ${list.length - cap} more hidden, --all`;
  return shown.map((t, i) => line(i ? '' : 'Hint', t));
}
