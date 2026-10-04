// The hints ([HNT-1], [HNT-2]) of a branch and of the requests it reads, each
// with its owners, so `check --strict` counts only what the branch serves or
// archives, or what no request owns ([HNT-3]). One list feeds check, context
// --diff and context <name>.
import { posix } from 'node:path';
import { git } from './git.js';
import { folderOf, isName, openTree } from './tree.js';
import { rootOf, rootLine, baseline, duplicateHint, duplicateIds, idsUsed, inBaseline, nextId, trimBlanks } from './spec.js';
import { allBlocks, anchorFault, blockFault, statesOf } from './states.js';
import { TITLES, sameSection, sectionsById, unheld } from './sections.js';
import { follows, isDropped, organized, parentOf, parts, samePart, signoffState, signoffStep, tierIs, tierOne, unlabelled } from './signoff.js';
import { isSignoff, notSnapshot, snapshots } from './snapshot.js';
import { childrenOf, entriesOf, line, partsOf } from './commands.js';
import { headingFault } from './consolidate.js';
import { amends, baselineLists, judge, noChangeMd, outcomeFacts, ownIds, spikeNotes } from './conclude.js';
import { appendOnly } from './check.js';
import { liveCode } from './views.js';
import { filesOf, idsOn, ownFiles, paths, requestOf, requestsIn, sectionsChanged } from './links.js';
import { testHints } from './tests.js';
import { adrHints, adrsOf } from './adrs.js';

const BAD = ['differs', 'base revised', 'base dropped', 'broken link'];
// [SPC-4]: two texts the same outside their sections with an ID, piece by piece.
const sameUnheld = (a, b) => { const [x, y] = [unheld(a), unheld(b)]; return x.length === y.length && x.every((t, i) => sameSection(t, y[i])); };

// What the hints read: the final state (`tree`, the working tree or the tree
// of `at`), the commits base..head, the requests they serve, and what the
// branch changes. `range` names the commits read, as the hints say it.
export function readBranch(top, { base, commits, tree, at, range }) {
  const root = rootOf(top, tree, at);
  const files = baseline(tree, root);
  // The fork's tree is a past tree: its root: line alone, or today's root ([VW-8]).
  const before = base ? baseline(openTree(top, base), rootLine(top, openTree(top, base), base) ?? root) : files;
  const [was, now] = [sectionsById(before), sectionsById(files)];
  const changedIds = [...new Set([...was.keys(), ...now.keys()])].filter((id) => !(was.has(id) && now.has(id) && sameSection(was.get(id), now.get(id))));
  // The working tree's final state includes its untracked files; a commit's is only its tree.
  const changed = base ? [...paths(git(top, ['diff', '--name-only', '-z', '--no-renames', base, ...(at ? [at] : [])], { worktree: !at })),
    ...(at ? [] : paths(git(top, ['ls-files', '--others', '--exclude-standard', '-z'], { worktree: true })))] : [];
  const requests = requestsIn(tree);
  const seen = new Map();
  const mapped = commits.map((sha) => requestOf(top, sha, requests, seen, ownFiles));
  const served = new Set([...mapped.flatMap((c) => c.names), ...changed.map(folderOf).filter(Boolean)]);
  const archived = new Set(base ? requests.filter((r) => !r.open && git(top, ['cat-file', '-e', `${base}:${r.dir}/request.md`], { allowFail: true }) === null).map((r) => r.name) : []);
  // Work is anything a request's commits touch beyond its own request.md and origin/.
  // A merge on main (earlyWork) counts by all it brings: `files` is filesOf there.
  // A commit whose files are unknown (past the shallow boundary) may hold work ([VW-9]).
  const work = (name, sha, skip = () => false, files = ownFiles) => files(top, sha)?.some((f) => !new RegExp(`^requests/(?:archive/)?${name}/(?:request\\.md$|origin/)`).test(f) && !skip(f)) ?? true;
  const delivered = new Set(mapped.flatMap((c) => c.names.filter((n) => work(n, c.sha))));
  for (const p of changed) if (/^requests\/(?:archive\/)?[^/]+\/change\.md$/.test(p) && folderOf(p)) delivered.add(folderOf(p));
  // Captured whole and trimmed in JS: a regex that trims a long line's spaces takes quadratic time.
  const tiers = commits.map((sha) => [...git(top, ['show', '-s', '--format=%B', sha]).matchAll(/^[ \t]*Tier:(.*)$/gm)].map((m) => trimBlanks(m[1])).filter(Boolean).at(-1));
  const tier = tiers.filter(Boolean).at(-1) ?? null;
  return { root, files, before, was, now, changedIds, changed, requests, blocks: allBlocks(tree), seen, mapped, served, archived, delivered, work, tier, base, commits, tree, at, range };
}

// [REC-10]: whether baseline files `after` differ from `before` only by IDs
// added to headings that had none and by sections moved with their text
// unchanged ([SPC-4]): each section after matches one before, its ID kept or
// newly given, and each file's text before its first heading is the same as
// that file's before ([SPC-4]); a file added or removed has none. `causes`
// names, beyond sections with an ID, what does more ([HNT-1]).
function idsOrMoves(before, after) {
  const intros = (fs) => new Map(fs.map((f) => [f.path, f.text.slice(0, f.text.length - f.sections.reduce((n, s) => n + s.text.length, 0))]));
  const [was, now] = [intros(before), intros(after)];
  const causes = [...new Set([...was.keys(), ...now.keys()])].filter((p) => !sameSection(was.get(p) ?? '', now.get(p) ?? '')).map((p) => `${p}, its intro text changed`);
  const plain = (s) => s.text.replace(/^[^\n]*/, () => `${'#'.repeat(s.level)} ${s.title}`);
  const heading = (s) => s.text.replace(/\r?\n[\s\S]*$/, '').trim();
  const left = before.flatMap((f) => f.sections.map((s) => ({ ...s, path: f.path })));
  const right = after.flatMap((f) => f.sections.map((s) => ({ ...s, path: f.path })));
  const extra = right.filter((s) => {
    const same = (x) => sameSection(plain(x), plain(s));
    const i = [left.findIndex((x) => x.id === s.id && same(x)), left.findIndex((x) => x.id === null && same(x))].find((k) => k >= 0) ?? -1;
    if (i >= 0) left.splice(i, 1);
    return i < 0;
  });
  const ok = !causes.length && !extra.length && !left.length;
  for (const s of extra.filter((x) => x.id === null)) {
    const i = left.findIndex((x) => x.id === null && x.path === s.path && x.title === s.title);
    if (i >= 0) left.splice(i, 1);
    causes.push(`${s.path}, ${i >= 0 ? `the text under ${heading(s)} changed` : `a new heading without an ID: ${heading(s)}`}`);
  }
  for (const x of left.filter((y) => y.id === null)) causes.push(`${x.path}, a heading without an ID removed: ${heading(x)}`);
  return { ok, causes };
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
  const step = (name) => signoffStep(name, open.find((r) => r.name === name).dir, signed.get(name));

  // A held section in a state to fix; two open holders not linked.
  const states = statesOf(b.files, b.blocks);
  for (const e of states) {
    if (BAD.includes(e.state) || e.state === 'not found') {
      add('not ok', e.state === 'not found' ? 6 : 1, [e.request], `[${e.id}] held by ${e.request} reads ${e.state}${e.candidates.length ? `; candidates ${e.candidates.join(', ')}` : ''}`, e.state === 'differs' ? `al record ${e.request} section ${e.id} --accept` : `al context ${e.request}`);
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
    if (!loose.length) continue;
    // The fix: a tip (no holder builds on it) and a holder unlinked from it whose
    // own base the tip already reaches; that one's first block builds on the
    // tip's latest. The tip does not reach it, so no cycle, and what it reached
    // the tip reaches, so no holder is left loose by it.
    const unlinked = (p, q) => p !== q && !reaches(p, q) && !reaches(q, p);
    const of = (q) => xs.filter((x) => x.request === q).sort((x, y) => x.n - y.n);
    const below = (q) => reached(of(q)[0]).find((r) => r !== q);
    // A broken chain can leave no tip; then any unlinked pair.
    const tip = loose.find((p) => !reqs.some((q) => q !== p && reaches(q, p))) ?? loose[0];
    const onto = reqs.find((q) => unlinked(tip, q) && (!below(q) || reaches(tip, below(q)))) ?? reqs.find((q) => unlinked(tip, q));
    const [first, last] = [of(onto)[0], of(tip).at(-1)];
    const dir = b.requests.find((r) => r.name === onto).dir;
    add('not ok', 2, loose, `[${id}] held by ${loose.join(' and ')}, neither builds on the other`,
      `in ${dir}/change.md, set "builds on ${last.key}" in the heading of ${first.key} (in place of any builds on there) and set its Was to the Now of ${last.key}, then al check`);
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
  out.push(...duplicateIds(b.files).map(duplicateHint));
  // [REC-1]: a request folder whose name is not a request name, or a name both open and archived; no request owns these.
  const held = (at) => (b.tree.list(at) ?? []).filter((n) => n !== 'archive' && b.tree.read(`${at}/${n}/request.md`) !== null);
  const [openDirs, archivedDirs] = [held('requests'), held('requests/archive')];
  for (const [at, n] of [...openDirs.map((n) => ['requests', n]), ...archivedDirs.map((n) => ['requests/archive', n])].filter(([, n]) => !isName(n))) {
    add('not ok', 5, [], `${at}/${n} is not a request name (lowercase letters, digits and hyphens), so no command reads it`, `git mv ${at}/${n} ${at}/<name>, then al check`);
  }
  for (const n of openDirs.filter((x) => isName(x) && archivedDirs.includes(x))) {
    add('not ok', 5, [], `${n} is in both requests/${n} and requests/archive/${n}; only the open one is read`, `git mv requests/${n} requests/<new name>, then al check`);
  }

  // An open request citing what does not exist, or a block that breaks [SPC-5].
  for (const r of open) {
    const org = organized(r.md);
    const rKeys = org ? parts(org.text, org.oneLine).map((p) => p.key) : null;
    for (const x of [...b.blocks.values()].filter((y) => y.request === r.name)) {
      const unreadable = blockFault(x);
      if (unreadable) add('not ok', 5, [r.name], unreadable, `fix the block in ${r.dir}/change.md, then al check`);
      if (x.op === 'add' && x.path && !inBaseline(x.path, b.root)) add('not ok', 5, [r.name], `${x.key}: add in ${x.path} is not a .md file under the baseline root ${b.root}/ ([SPC-5])`, `fix the block in ${r.dir}/change.md, then al check`);
      // [STA-4]: a remove's anchor is where its revert puts it back.
      const file = x.op === 'remove' && x.anchor && !x.dropped && b.files.find((f) => f.sections.some((s) => s.id === x.id));
      const misplaced = file && anchorFault(x, file);
      if (misplaced) add('not ok', 5, [r.name], `${x.key}: ${misplaced}`, `fix the block in ${r.dir}/change.md, then al check`);
      if (x.anchor && !known(x.anchor)) add('not ok', 5, [r.name], `${r.name} cites [${x.anchor}] as the anchor of ${x.key}, which is in no section or block`, `al context ${r.name}`);
      // D6: a block marked Dropped (and not Kept) records the drop; its R-lines are not checked.
      for (const k of rKeys && !(x.dropped && !x.kept) ? x.forR.filter((y) => !rKeys.includes(y)) : []) add('not ok', 5, [r.name], `${r.name} cites ${k} in ${x.key}, which its organized requirement lacks`, `al context ${r.name}`);
      for (const [text, side] of [[x.now, 'Now'], [x.was, 'Was']]) {
        const fault = text !== null && headingFault(x, text, side);
        if (fault) add('not ok', 5, [r.name], fault, `al context ${r.name}`);
      }
    }
    for (const l of org ? unlabelled(org) : []) {
      add('note', 24, [r.name], `${r.name}'s organized requirement says "${l.length > 60 ? `${l.slice(0, 59)}…` : l}" before any requirement, so it is not read as a requirement ([REC-4])`,
        `make it ${org.oneLine ? 'an R<n>: line or ' : ''}an ### R<n> sub-section in ${r.dir}/request.md, then al context ${r.name}`);
    }
    // An Amends: names a section in the baseline, at the fork or now, or in a block.
    for (const id of new Set(org ? amends(org.text).map((x) => x.slice(1, -1)) : [])) {
      if (!known(id) && !b.was.has(id)) add('not ok', 5, [r.name], `${r.name} cites [${id}] in its Amends:, which is in no section or block`, `al context ${r.name}`);
    }
    for (const e of entriesOf(r.md, TITLES.decisions)) {
      for (const id of idsOn(e)) if (!known(id)) add('not ok', 5, [r.name], `${r.name} cites [${id}] in ${e.match(/^- (D\d+)/)?.[1] ?? 'a decision'}, which is in no section or block`, `al context ${r.name}`);
    }
    for (const [n, where] of [...follows(r.md).map((n) => [n, 'Follows']), ...childrenOf(r.md).map((n) => [n, TITLES.parts])]) {
      if (!names.has(n)) add('not ok', 5, [r.name], `${r.name} cites request ${n} (${where}), which does not exist`, `al context ${r.name}`);
    }
  }

  // [SPC-3]: a pending add whose ID was used before: in the baseline at some
  // commit, or in the change.md of a request that is not open.
  const adds = states.filter((e) => e.op === 'add' && e.state === 'pending');
  const used = adds.length ? idsUsed(top, b.tree, b.root, b.at ?? '--all') : null;
  for (const e of adds) {
    const other = (path) => path.match(/^requests\/(?:archive\/)?([^/]+)\/change\.md$/)?.[1];
    const where = [...(used.get(e.id) ?? [])].find((path) => inBaseline(path, b.root) || (other(path) && other(path) !== e.request && !open.some((r) => r.name === other(path))));
    const prefix = e.id.split('-')[0];
    if (where) add('not ok', 5, [e.request], `${e.block} adds [${e.id}], which was used before, in ${where}; an ID is never reused ([SPC-3])`,
      `give it the next free ${prefix} ID, [${nextId(used, prefix)}], in ${open.find((r) => r.name === e.request).dir}/change.md, then al check`);
  }

  // [STA-8]: conclude's rules re-run on each request the branch archives.
  const facts = new Map();
  for (const name of b.archived) {
    const r = b.requests.find((x) => x.name === name);
    const j = judge(top, b.tree, name, r.dir, isDropped(r.md), b.at, b.base);
    facts.set(name, { r, j });
    if (j.refusals.length) add('not ok', 7, [name], `${name} is archived on this branch but no longer meets conclude's rules: ${j.refusals.join('; ')}`, `al conclude ${name}`);
  }

  // [REC-6]: a blocked request's Now written into the baseline, or its work delivered; each counts.
  for (const id of b.changedIds) {
    for (const x of b.blocks.values()) {
      if (x.open && x.id === id && signed.get(x.request)?.blocked && x.now && b.now.has(id) && sameSection(b.now.get(id), x.now)) {
        add('not ok', 8, [x.request], `[${id}] changed on this branch equals the Now of ${x.key}, and ${x.request} is blocked (${signed.get(x.request).reason})`, step(x.request), true);
      }
    }
  }
  // [REC-6]: work for a blocked request counts only when the branch's final state leaves something
  // applied, each part touched by its own work and still changed by the branch: a file outside its
  // records and the baseline's .md files; a baseline section, unless every block of it retains nothing
  // ([STA-3]), as after a revert; baseline text outside any section with an ID; its change.md, unless
  // every block is Dropped, not Kept, and retains nothing.
  const uncommitted = b.at ? [] : [...paths(git(top, ['diff', '--name-only', '-z', 'HEAD'], { allowFail: true, worktree: true }) ?? ''), ...paths(git(top, ['ls-files', '--others', '--exclude-standard', '-z'], { worktree: true }))];
  const textAt = (rev, p) => (rev ? git(top, ['show', `${rev}:${p}`], { allowFail: true }) : b.tree.read(p)?.toString('utf8')) ?? '';
  const applied = (name) => {
    const touched = (p) => b.mapped.some((c) => c.names.includes(name) && (ownFiles(top, c.sha)?.includes(p) ?? true)) || (b.served.has(name) && uncommitted.includes(p));
    const es = statesOf(b.files, b.blocks, (x) => x.request === name);
    const change = new RegExp(`^requests/(?:archive/)?${name}/change\\.md$`);
    const left = (id) => !es.some((e) => e.id === id) || es.some((e) => e.id === id && !e.retainsNothing);
    const withdrawn = es.length > 0 && es.every((e) => b.blocks.get(e.block).dropped && !b.blocks.get(e.block).kept && e.retainsNothing);
    return b.mapped.some((c) => c.names.includes(name) && b.work(name, c.sha, (f) => !b.changed.includes(f) || (f.startsWith(`${b.root}/`) && f.endsWith('.md')) || change.test(f)))
      || [...ownIds(top, name, b.base, b.root, b.requests, !b.at && b.served.has(name), b.at ?? 'HEAD')].some((id) => b.changedIds.includes(id) && left(id))
      || b.changed.some((p) => p.startsWith(`${b.root}/`) && p.endsWith('.md') && touched(p) && !sameUnheld(textAt(b.base, p), textAt(null, p)))
      || (!withdrawn && b.changed.some((p) => change.test(p)));
  };
  for (const name of b.delivered) {
    if (signed.get(name)?.blocked && applied(name)) add('not ok', 9, [name], `this branch delivers work for ${name}, which is blocked (${signed.get(name).reason})`, step(name), true);
  }
  // [REC-10]: tier 0 and S change no promise; a file under the root that is not .md is outside the baseline ([SPC-1]).
  const edits = b.changed.filter((p) => p.startsWith(`${b.root}/`) && p.endsWith('.md'));
  const promiseless = ['0', 'S'].find((t) => tierIs(b.tier, t));
  const moves = promiseless && edits.length ? idsOrMoves(b.before, b.files) : { ok: true };
  if (!moves.ok) {
    const causes = [...(b.changedIds.length ? [b.changedIds.map((i) => `[${i}]`).join(', ')] : []), ...moves.causes];
    add('not ok', 10, [], `the claim is tier ${promiseless}, but ${b.range} edits the baseline${causes.length ? `: ${causes.join('; ')}` : ''}`, `al context --diff ${b.range}`);
  }

  // Snapshots: a text that no longer matches its hash; a served request's web source not re-checked.
  for (const r of b.requests) {
    for (const { file: f, s } of snapshots(b.tree, r.dir)) {
      if (!s) add('not ok', 11, [r.name], notSnapshot(`origin/${f} of ${r.name}`), `al record ${r.name} origin --url <source> --from -`);
      else if (!s.intact) add('not ok', 11, [r.name], `origin/${f} of ${r.name} no longer matches its SHA-256`, `al record ${r.name} origin --verify ${f} --from -`);
      else if (b.served.has(r.name) && /^https?:\/\//.test(s.fields.Source)) {
        add('note', 19, [r.name], `origin/${f} of ${r.name}, fetched ${s.fields.Fetched}; no re-check recorded (an unchanged --verify writes nothing)`, `al record ${r.name} origin --verify ${f} --from -`);
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
    const fs = (ownFiles(top, c.sha) ?? []).filter((p) => p.startsWith(`${b.root}/`));
    if (fs.length) add('note', 14, [], `${c.sha.slice(0, 7)} changes ${fs.join(', ')} with no request linked (fine for tier 0; say why)`, `git show ${c.sha.slice(0, 7)}`);
  }
  for (const name of new Set([...b.served, ...b.archived])) {
    const r = b.requests.find((x) => x.name === name);
    const ids = [...b.blocks.values()].filter((x) => x.request === name && x.dropped && !x.kept).map((x) => x.id);
    if (!r || !(isDropped(r.md) || ids.length)) continue;
    const live = liveCode(top, name, b.root, isDropped(r.md) ? null : ids, b.at);
    if (!live?.length) continue;
    const plans = [r, ...b.requests.filter((p) => childrenOf(p.md).includes(name))].flatMap((p) => partsOf(p.md).map((e) => [p.name, e]))
      .find(([, e]) => live.some((l) => e.includes(l.split(':')[0])));
    // Ranked first among the notes: live code for dropped work is a hazard on main.
    const files = [...new Set(live.map((l) => l.split(':')[0]))];
    const shown = files.map((f) => [live.filter((l) => l.startsWith(`${f}:`)).join(', '), ...importers(top, b.at ?? 'HEAD', f)].join(', '));
    add('note', 11, [name], `code still live for dropped work of ${name}: ${shown.join(', ')}; ${plans ? `a part of ${plans[0]} plans its removal: ${plans[1]}` : 'no part plans its removal'}`, `al context ${name}`);
  }
  for (const name of b.served) {
    const s = signed.get(name);
    // A blocked not ok already says it ([HNT-1]: one hint, not two).
    if (!s?.blocked || out.some((h) => h.kind === 'not ok' && [8, 9].includes(h.rank) && h.owners.includes(name))) continue;
    add('note', 18, [name], s.signoff ? `${name} changed since its sign-off (${s.signoff.file})${s.changed?.length ? `: ${s.changed.join(', ')}` : ''}` : `${name} is not signed off yet: ${s.reason}`,
      step(name));
  }
  // [REC-10]: a spike open, or archived on this branch, with no findings.md, its Answer not first, or a baseline edit:
  // by its own commits, and, in the working tree, by uncommitted edits when the branch serves it.
  for (const r of [...open, ...[...facts.values()].map((f) => f.r)]) {
    const edited = () => {
      const own = ownIds(top, r.name, b.base, b.root, b.requests, !b.at && b.served.has(r.name), b.at ?? 'HEAD');
      return b.changedIds.filter((id) => own.has(id));
    };
    for (const n of spikeNotes(b.tree, r.name, r.dir, r.md, edited)) add('note', 24, [r.name], n, n.includes('findings.md') ? `write ${r.dir}/findings.md, starting with its Answer, then al context ${r.name}` : `al context --diff ${b.range}`);
  }
  if (b.commits.length && !b.tier) add('note', 22, [], `no Tier line in ${b.range}`, 'add "Tier: <n> — <claim>" to a commit message, e.g. with git commit --amend');
  out.push(...testHints(top, b), ...adrHints(top, b));
  if (mainSha) out.push(...earlyWork(top, b, mainSha));
  for (const [name, { r, j }] of facts) {
    // A record with no change.md should name what it changes with Amends: ([REC-9]).
    if (noChangeMd(b.tree, r.dir)) {
      const l = baselineLists(b.was, b.now, j.org, ownIds(top, name, b.base, b.root, b.requests, false, b.at ?? 'HEAD'));
      for (const id of l.unnamed) add('note', 24, [name], `${name} changes [${id}], which its Amends: does not name`, `al context ${name}`);
      for (const id of l.unchanged) add('note', 24, [name], `${name}'s Amends: names [${id}], which did not change`, `al context ${name}`);
    }
    for (const x of outcomeFacts(j.org, j.fates).rs.filter((y) => !y.ids.length)) add('note', 24, [name], `${name} ${x.key}${x.title ? ` ${x.title}` : ''} is in no section at conclusion`, `al context ${name}`);
    for (const c of childrenOf(r.md).filter((n) => open.some((o) => o.name === n))) add('note', 25, [name], `${name} concludes while its child ${c} is still open`, `al context ${c}`);
    for (const a of adrsOf(top, b.tree, b.at, name, b.requests).added.filter((x) => x.status === 'proposed')) add('note', 24, [name], `${name} concludes with ${a.path} still proposed`, 'set its Status line, then al check');
  }
  return out;
}

// Work for a served request that reached main before its first sign-off,
// judged by when each reached main: along main's first-parent line, where a
// merge brings itself and its branch's commits all at once, after the first main-line
// commit that holds the sign-off.
function earlyWork(top, b, mainSha) {
  const out = [];
  let line = null;
  for (const name of b.served) {
    const r = b.requests.find((x) => x.name === name);
    if (!r) continue;
    // Its own sign-offs, and a parent's where it inherits from them: those
    // holding one of its parts word for word ([REC-5]).
    const org = organized(r.md);
    const mine = parts(org?.text ?? '', org?.oneLine);
    const signoffsOf = (n, dir, keep = () => true) => snapshots(b.tree, dir)
      .filter(({ s }) => isSignoff(s) && keep(s))
      .flatMap(({ file: f }) => [`requests/${n}/origin/${f}`, `requests/archive/${n}/origin/${f}`]);
    const parent = parentOf(b.tree, name);
    const copied = (s) => parts(s.text.toString('utf8'), tierOne(parent.md)).some((q) => mine.some((p) => samePart(p, q)));
    const places = [...signoffsOf(name, r.dir), ...(parent ? signoffsOf(parent.name, parent.dir, copied) : [])];
    const first = places.length ? git(top, ['log', '--reverse', '--diff-filter=A', '--format=%H', mainSha, '--', ...places]).split('\n')[0] : '';
    line ??= git(top, ['rev-list', '--first-parent', mainSha]).split('\n').filter(Boolean).map((c) => ({
      c, brought: git(top, ['rev-parse', '--verify', '--quiet', `${c}^2`], { allowFail: true }) ? [c, ...git(top, ['rev-list', `${c}^1..${c}^2`]).split('\n').filter(Boolean)] : [c],
    }));
    for (const { c, brought } of line) {
      if (first && git(top, ['merge-base', '--is-ancestor', first, c], { allowFail: true }) !== null) continue;
      for (const sha of brought.filter((s) => requestOf(top, s, b.requests, b.seen).names.includes(name) && b.work(name, s, undefined, filesOf))) {
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

// A hint as one line; a not ok that does not count is labelled information,
// except in the view of request `self`, which owns it ([HNT-3]).
export const hintText = (h, self) => `${h.kind}: ${h.text}${h.kind === 'not ok' && !h.counts && !h.owners.includes(self) ? ` (information: owned by ${h.owners.join(', ')})` : ''}; ${h.command}`;

// Hint lines for a view: up to `cap` under a Hint label, the last one saying
// how many more are hidden and `more`, the command that shows them ([HNT-1]).
export function hintLines(list, cap, { more = '--all', self } = {}) {
  const shown = list.slice(0, cap).map((h) => hintText(h, self));
  if (list.length > cap && shown.length) shown[shown.length - 1] += `; ${list.length - cap} more hidden, ${more}`;
  return shown.map((t, i) => line(i ? '' : 'Hint', t));
}

// The files at `at` that import or require `path` by a relative specifier, as
// rough links with their reason ([LNK-1]).
function importers(top, at, path) {
  const base = posix.basename(path).replace(/\.[^.]*$/, '');
  // An index file is named by itself, or by its folder in a directory specifier.
  const stems = base === 'index' && posix.dirname(path) !== '.' ? [base, posix.basename(posix.dirname(path))] : [base];
  const found = git(top, ['grep', '-l', '-F', ...stems.flatMap((s) => ['-e', s]), at, '--', '*.js', '*.mjs', '*.cjs', '*.ts'], { allowFail: true }) ?? '';
  const out = [];
  for (const f of found.split('\n').filter(Boolean).map((l) => l.slice(at.length + 1)).filter((f) => f !== path)) {
    for (const [how, spec] of specifiers(git(top, ['show', `${at}:${f}`], { allowFail: true }) ?? '')) {
      const p = posix.join(posix.dirname(f), spec);
      if (![p, `${p}.js`, `${p}.mjs`, `${p}.cjs`, `${p}.ts`, `${p}/index.js`].includes(path)) continue;
      out.push(`${how === 'require' ? 'required' : 'imported'} by ${f}`);
      break;
    }
  }
  return out;
}

// The relative specifiers `text` imports or requires, as [how, spec], read left
// to right: comments and the text of strings and templates are skipped whole,
// and a template's ${…} expressions are read as code. `from` counts only as an
// ESM clause, never a call, and nothing whose last code before it is a `.` (a
// method, whatever spaces or comments come between).
const SPEC = /(?<![\w$])(?:(from)\s*|(import)\s*\(?\s*|(require)\s*\(\s*)(['"])(\.{1,2}\/[^'"\n]*)\4/y;
function specifiers(text) {
  const out = [];
  const braces = []; // for each ${ we are inside, the { depth within it
  let inTemplate = false;
  let last = ''; // the last character of code read, spaces and comments aside
  for (let i = 0; i < text.length;) {
    const c = text[i];
    const two = text.slice(i, i + 2);
    if (inTemplate) {
      if (c === '\\') i += 2;
      else if (c === '`') { inTemplate = false; last = c; i++; }
      else if (two === '${') { braces.push(0); inTemplate = false; last = '{'; i += 2; }
      else i++;
      continue;
    }
    SPEC.lastIndex = i;
    const m = last !== '.' && 'fir'.includes(c) && SPEC.exec(text);
    if (m) { out.push([m[1] ?? m[2] ?? m[3], m[5]]); last = text[SPEC.lastIndex - 1]; i = SPEC.lastIndex; continue; }
    if (two === '//') { const n = text.indexOf('\n', i); i = n < 0 ? text.length : n; continue; }
    if (two === '/*') { const n = text.indexOf('*/', i + 2); i = n < 0 ? text.length : n + 2; continue; }
    if (!/\s/.test(c)) last = c;
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      i = j + 1;
    } else if (c === '`') { inTemplate = true; i++; }
    else if (c === '{') { if (braces.length) braces[braces.length - 1]++; i++; }
    else if (c === '}') {
      if (braces.length && braces[braces.length - 1] === 0) { braces.pop(); inTemplate = true; }
      else if (braces.length) braces[braces.length - 1]--;
      i++;
    } else i++;
  }
  return out;
}
