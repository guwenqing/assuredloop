// al context <ID> ([VW-3]), al context --diff <range> [--for review] ([VW-4]),
// an archived request's sections ([VW-6]), and the code still live for
// dropped work ([REC-9]), all from the rough links ([LNK-1], [LNK-2]).
import { Fail, git, historyGap, isShallow, mainCommit, ownCommits, resolveCommit } from './git.js';
import { openTree } from './tree.js';
import { rootOf, rootLine, baseline, configured } from './spec.js';
import { allBlocks, changeStates, statesOf } from './states.js';
import { sameSection } from './sections.js';
import { organized, parts, samePart, signoffState } from './signoff.js';
import { line, lines, grouped, decisionList, entriesOf, concluding, fitOrCount } from './commands.js';
import { hintLines, hintsOf, ranked, readBranch } from './hints.js';
import { WIDE, blame, byId, changedWith, cites, describe, filesOf, idNear, idsOn, ownFiles, paths, ranges, requestCommits, requestOf, requestsIn, sectionsChanged, wordsOf } from './links.js';
import { headNote, resultLines, testLines, testMatcher } from './tests.js';
import { adrFolders, governing } from './adrs.js';

const HISTORY = 'history unavailable (shallow clone)';
const isCode = (root) => (p) => !p.startsWith('requests/') && !p.startsWith(`${root}/`);
const stateOf = (e) => `${e.block} ${e.state}${e.by ? ` ${e.state === 'waiting' ? 'on' : 'by'} ${e.by}` : ''}`;
const day = (d) => d.toISOString().slice(0, 10);
const lineCount = (text) => text.replace(/\n+$/, '').split('\n').length;
const skippedLine = (n) => line('Skipped', `${n} commit${n === 1 ? '' : 's'} over ${WIDE} files, not read for co-change`);
const labelled = (label, items) => items.map((t, i) => line(i ? '' : label, t));
const titles = (files) => new Map(files.flatMap((f) => f.sections).filter((s) => s.id).map((s) => [s.id, s.title]));

// al context <ID>: the section, who holds it, who shaped it, the decisions
// and ADRs citing it, and the code and tests linked to it, each link with its
// reason.
// Under --at, everything is read at that commit, never the working tree.
export function sectionView(top, id, at) {
  const tree = openTree(top, at);
  const rev = at ? resolveCommit(top, at) : null;
  const root = rootOf(top, tree, at);
  const file = baseline(tree, root).find((f) => f.sections.some((s) => s.id === id));
  const s = file?.sections.find((x) => x.id === id);
  const requests = requestsIn(tree);
  const held = changeStates(top, { at }).filter((e) => e.id === id);
  const indent = (text) => text.replace(/\n+$/, '').split('\n').map((l) => `  ${l}`);
  const body = s ? [`[${id}] ${s.title}  in ${file.path}`, ...indent(s.text)] : [`[${id}] not in the baseline`];
  body.push(line('Held', held.length ? held.map(stateOf).join(' · ') : 'by no open change'));
  // Not in the baseline yet: the design it will have is each holder's "now".
  const blocks = allBlocks(tree);
  if (!s) for (const e of held) if (blocks.get(e.block).now) body.push(`${e.block} now:`, ...indent(blocks.get(e.block).now));
  const links = [];
  let skipped = 0;
  if (s && isShallow(top)) body.push(line('Shaped by', `${HISTORY}; co-change not read`));
  else if (s) {
    const seen = new Map();
    const commits = [...new Set(blame(top, rev, file.path, [[s.line, s.line + lineCount(s.text) - 1]], { code: false })
      .map((b) => b.sha).filter((sha) => !/^0+$/.test(sha)))].map((sha) => requestOf(top, sha, requests, seen));
    body.push(line('Shaped by', commits.map((c) => (c.names.length ? `${c.names.join(', ')} (${c.how}, ${day(c.when)})` : describe(c))).join(' · ')));
    for (const c of commits) {
      const files = filesOf(top, c.sha);
      if (files.length > WIDE) skipped++;
      else links.push(...files.filter(isCode(root)).map((p) => [p, `${p}  changed together with [${id}] (${day(c.when)}, ${describe(c)})`]));
    }
  }
  const named = git(top, ['grep', '-n', '-z', '-F', `[${id}]`, ...(rev ? [rev] : []), '--', '.', ':!requests', `:!${root}`], { allowFail: true }) ?? '';
  const byName = named.split('\n').filter(Boolean).map((l) => l.split('\0')).map(([p, n]) => [p.replace(`${rev}:`, ''), n])
    .map(([p, n]) => [p, `${p}:${n}  names [${id}]`]);
  const heading = s ? wordsOf(s.title) : new Set();
  const byWord = paths(git(top, rev ? ['ls-tree', '-r', '-z', '--name-only', rev] : ['ls-files', '-z'])).filter(isCode(root)).flatMap((p) => {
    const w = [...wordsOf(p)].find((x) => heading.has(x));
    return w ? [[p, `${p}  shares the word "${w}"`]] : [];
  });
  const decided = requests.flatMap((r) => entriesOf(r.md, 'Decisions').filter((e) => /^- D\d+/.test(e) && cites(e, id))
    .map((e) => `${r.name} ${e.match(/^- (D\d+)/)[1]}`));
  body.push(line('Decisions', decided.length ? decided.join(' · ') : 'none cite it'));
  const adrs = governing(top, tree, id, at);
  body.push(line('ADRs', adrs.length ? adrs.join(' · ') : 'none cite it'));
  // An ADR file shows on the ADRs line; a test file under Tests ([LNK-3]).
  const isTest = testMatcher(root, configured(top, tree, at, 'tests'));
  const adr = adrFolders(top, tree, at);
  const all = [...byName, ...links, ...byWord].filter(([p]) => !adr.some((d) => p.startsWith(`${d}/`)));
  const tests = all.filter(([p]) => isTest(p)).map(([, t]) => t);
  body.push(...labelled('Links', all.filter(([p]) => !isTest(p)).map(([, t]) => t)));
  body.push(...labelled('Tests', tests.length ? tests : ['none linked']));
  if (skipped) body.push(skippedLine(skipped));
  return {
    body,
    next: held.length ? `al context ${held[0].request}` : 'al spec --list',
    notKnown: ['whether the linked code does what the section says (tests and review judge that)'],
  };
}

// The hunks of `path` between two revs (the working tree when `head` is null): old and new start and count.
function hunks(top, base, head, path) {
  return git(top, ['diff', '-U0', '--no-renames', base, ...(head ? [head] : []), '--', path]).split('\n').map((l) => l.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/))
    .filter(Boolean).map((m) => ({ a: Number(m[1]), b: Number(m[2] ?? 1), c: Number(m[3]), d: Number(m[4] ?? 1) }));
}

// The links of one changed code file ([LNK-1]): lines of text, the section
// IDs they reach, and the requests blame names. A null `head` reads the working tree.
export function fileLinks(top, base, head, path, { root, requests, seen, shallow, headings }) {
  const text = (head ? git(top, ['show', `${head}:${path}`], { allowFail: true }) : openTree(top).read(path)?.toString('utf8')) ?? '';
  const fileLines = text.split('\n');
  const out = [];
  const ids = new Map();
  const reach = (id, reason) => ids.has(id) || ids.set(id, reason);
  const hs = hunks(top, base, head, path);
  for (const h of hs) {
    const at = h.d ? h.c : h.c + 1;
    for (const { id, reason } of idNear(fileLines, at, Array.from({ length: h.d }, (_, i) => h.c + i))) {
      out.push(`${path}:${at}  ${reason}`);
      reach(id, `${path}:${at}  ${reason}`);
    }
  }
  const blamed = new Set();
  let skipped = 0;
  if (shallow) out.push(`${path}  blame and co-change: ${HISTORY}`);
  else {
    const old = hs.filter((h) => h.b > 0).map((h) => [h.a, h.a + h.b - 1]);
    const found = new Map();
    for (const b of blame(top, base, path, old, { code: true, ignoreAt: head })) {
      const c = requestOf(top, b.sha, requests, seen);
      found.set(describe(c).replace(/ \(\w{7} .*\)$/, ''), c);
      c.names.forEach((n) => blamed.add(n));
    }
    if (!old.length) out.push(`${path}  no old side: only new lines, not blamed`);
    for (const c of found.values()) out.push(`${path}  last changed by ${c.names.length ? `${c.names.join(', ')} (${c.how})` : `a commit with ${describe(c)}`}`);
    const co = changedWith(top, base, path);
    skipped = co.skipped;
    for (const { sha, files } of co.commits) {
      const ids = sectionsChanged(top, `${sha}^`, sha, root, files);
      const c = requestOf(top, sha, requests, seen);
      const reason = `${path}  ${ids.map((id) => `[${id}]`).join(' ')} changed together (${day(c.when)}, ${describe(c)})`;
      if (ids.length) out.push(reason);
      ids.forEach((id) => reach(id, reason));
    }
  }
  const words = wordsOf(path);
  for (const [id, title] of headings) {
    const w = [...wordsOf(title)].find((x) => words.has(x));
    if (w) {
      out.push(`${path}  [${id}] shares the word "${w}"`);
      reach(id, `${path}  [${id}] shares the word "${w}"`);
    }
  }
  return { out, ids, blamed, skipped };
}

// al context --diff <range> [--for review]: A...B from merge-base(A, B),
// A..B from A, a single rev X as X...HEAD; commits only.
// Under --at X, HEAD and an omitted side read as X.
export function diffView(top, range, forReview, all, at) {
  const m = range.match(/^(.*?)(\.\.\.?)(.*)$/);
  // A bare `main` is the main the tool reads ([VW-9]).
  const side = (x) => (!x || x === 'HEAD' ? at ?? 'HEAD' : x === 'main' ? mainCommit(top) ?? x : x);
  const [a, dots, b] = m ? [side(m[1]), m[2], side(m[3])] : [side(range), '...', side()];
  const head = resolveCommit(top, b);
  const from = resolveCommit(top, a);
  const base = dots === '...' ? git(top, ['merge-base', from, head], { allowFail: true }) : from;
  const gap = historyGap(top);
  if (!base && gap) throw new Fail(`history unavailable: this clone is ${gap.kind}, and the merge-base of ${a} and ${b} is not in it`, gap.next);
  if (!base) throw new Fail(`${range}: ${a} and ${b} share no history`, 'al context --diff main...HEAD');
  const shallow = isShallow(top);
  const tree = openTree(top, head);
  const root = rootOf(top, tree, head);
  const requests = requestsIn(tree);
  const seen = new Map();
  const files = baseline(tree, root);
  const headings = titles(files);
  const commits = ownCommits(top, base, head).map((c) => requestOf(top, c, requests, seen, ownFiles));
  const served = new Map();
  for (const c of commits) for (const n of c.names) if (!served.has(n)) served.set(n, c.how);
  const none = commits.filter((c) => !c.names.length).length;
  const serves = [...[...served].map(([n, how]) => `${n} (${how})`), ...(none ? [`${none} commit${none === 1 ? '' : 's'} with no request`] : [])];
  const changed = paths(git(top, ['diff', '--name-only', '-z', '--no-renames', base, head]));
  const states = changeStates(top, { at: head });
  const changes = sectionsChanged(top, base, head, root, changed).map((id) => {
    const holders = states.filter((e) => e.id === id);
    return `[${id}] ${headings.get(id) ?? '(removed)'} · ${holders.length ? holders.map(stateOf).join(' · ') : 'held by no open change'}`;
  });
  const ctx = { root, requests, seen, shallow, headings };
  const code = changed.filter(isCode(root)).map((path) => ({ path, ...fileLinks(top, base, head, path, ctx) }));
  const nearby = [...new Set(code.flatMap((f) => [...f.ids.keys()]))];
  const skipped = code.reduce((n, f) => n + f.skipped, 0);
  const cited = [...new Set([...sectionsChanged(top, base, head, root, changed), ...nearby])];
  const related = requests.filter((r) => !served.has(r.name) && cited.some((id) => cites(r.md, id) || cites(r.change, id))).map((r) => {
    const status = r.md.split('\n').find((l) => /\bStatus:/.test(l)) ?? '';
    const rejects = entriesOf(r.md, 'Decisions').find((e) => cited.some((id) => cites(e, id)) && /rejected/i.test(e));
    const why = /\bStatus:\s*dropped\b/.test(status) ? 'dropped' : rejects ? `rejected: ${rejects.match(/^- (D\d+)/)?.[1] ?? 'a decision'}` : '';
    return { text: `${r.name}${why ? ` (${why})` : ''}`, rejected: Boolean(why) };
  }).sort((x, y) => y.rejected - x.rejected).map((r) => r.text);

  const body = [line('Serves', serves.join(' · ') || 'no commits in the range')];
  // The hints check makes, read at the head ([HNT-1]).
  const branch = readBranch(top, { base, commits: commits.map((c) => c.sha), tree, at: head, range: `${base.slice(0, 7)}..${head.slice(0, 7)}` });
  branch.readResults = at ? branch : { tree: openTree(top) };
  const list = ranked(hintsOf(top, branch, { main: at ? null : mainCommit(top) }), branch);
  const hints = hintLines(list, all ? list.length : 3);
  const tests = [...testLines(top, branch, true), ...resultLines(top, branch)];
  if (forReview) body.push(...review(tree, files, served, code, branch.tier, branch.changedIds), ...tests, ...hints);
  else {
    body.push(...labelled('Changes', changes.length ? changes : ['no baseline section']));
    body.push(...labelled('Links', code.flatMap((f) => f.out)));
    body.push(line('Nearby', nearby.length ? nearby.map((id) => `[${id}] ${headings.get(id) ?? ''}`.trim()).join(' · ') : 'none'), ...tests);
    body.push(line('Related', related.length ? related.join(' · ') : 'none'), ...hints);
  }
  if (skipped) body.push(skippedLine(skipped));
  return {
    tree: { label: `commits ${base.slice(0, 7)}..${head.slice(0, 7)}` },
    body,
    next: forReview ? 'al context <ID> for any section named here' : `al context --diff ${range} --for review`,
    notKnown: ['uncommitted changes (the range reads commits only)', ...headNote(top, branch), ...(shallow ? [`${HISTORY}: commits before the shallow boundary`] : []),
      ...(at ? ['the hints that compare with main (not read under --at)'] : [])],
  };
}

// --for review: the intent (each served request's signed text verbatim, its
// blocks and its decisions, agent rulings apart), then the evidence (each R's
// linked files, or none; then the files linked to no served request).
function review(tree, files, served, code, tier, changedIds) {
  const mine = requestsIn(tree).filter((r) => served.has(r.name));
  const all = allBlocks(tree);
  const blocks = [...all.values()];
  // A served request the branch archives still shows its blocks.
  const states = statesOf(files, all, (b) => served.has(b.request));
  const intent = ['Intent', ...(tier ? [line('Tier', tier)] : [])];
  const evidence = ['Evidence'];
  for (const r of mine) {
    // [REC-5]: signed by its own sign-off, or through its parent's for the parts it copies.
    const s = signoffState(tree, r.dir, r.name);
    const asked = organized(r.md);
    // [VW-4]: what the owner signed stays in view, verbatim with its file, while the draft is blocked.
    const status = s.blocked ? `blocked (${s.reason}), not signed off as it stands` : 'signed off';
    if (!asked) intent.push(`${r.name}  not signed off (${s.reason ?? 'no organized requirement'})`);
    else if (!s.parent) {
      intent.push(`${r.name}  ${status}${s.signoff ? `; signed text, origin/${s.signoff.file}:` : ''}`);
      if (s.signoff) intent.push(...s.signoff.text.replace(/\n+$/, '').split('\n').map((l) => `  ${l}`));
    } else {
      intent.push(`${r.name}  ${status}, part by part:`);
      for (const p of parts(asked.text, asked.oneLine)) {
        const own = s.signoff && parts(s.signoff.text, s.signoff.oneLine).some((q) => samePart(p, q));
        const inherited = s.parentSignoff && parts(s.parentSignoff.text, s.parentSignoff.oneLine).some((q) => samePart(p, q));
        intent.push(`  ${p.key}: ${own ? `origin/${s.signoff.file}` : inherited ? `through ${s.parent}, origin/${s.parentSignoff.file}` : 'not signed'}`,
          ...p.text.replace(/\n+$/, '').split('\n').map((l) => `    ${l}`));
      }
      // Blocked with its own sign-off: what it signed, changed or removed parts included.
      if (s.blocked && s.signoff) intent.push(`  signed text, origin/${s.signoff.file}:`, ...s.signoff.text.replace(/\n+$/, '').split('\n').map((l) => `    ${l}`));
    }
    // The spec changes: the blocks whose sections this branch changes ([VW-2]'s rule for the line).
    const changing = states.filter((e) => e.request === r.name && changedIds.includes(e.id));
    intent.push(changing.length ? fitOrCount('Blocks', changing, stateOf, (e) => e.block) : line('Blocks', 'none changed by this branch'));
    const decided = decisionList(r.md);
    intent.push(line('Decided', decided.filter((d) => !d.agent).map((d) => `${d.id} ${d.date}`).join(' · ') || 'none'));
    if (decided.some((d) => d.agent)) intent.push(line('Agent', `${decided.filter((d) => d.agent).map((d) => `${d.id} ${d.date}`).join(' · ')} (agent rulings)`));
    evidence.push(r.name);
    const org = organized(r.md);
    for (const p of org ? parts(org.text, org.oneLine).filter((x) => /^R\d+$/.test(x.key)) : []) {
      const ids = new Set(blocks.filter((b) => b.request === r.name && b.forR.includes(p.key)).map((b) => b.id));
      const found = code.flatMap((f) => [...f.ids].filter(([id]) => ids.has(id)).map(([, reason]) => reason));
      evidence.push(`${p.text.split('\n')[0].replace(/^\s*#+\s+/, '')}`, ...(found.length ? found.map((f) => `  ${f}`) : ['  none found']));
    }
  }
  const held = (id) => blocks.some((b) => b.id === id && served.has(b.request));
  const unlinked = code.filter((f) => ![...f.blamed].some((n) => served.has(n)) && ![...f.ids.keys()].some(held)).map((f) => f.path);
  evidence.push(line('Unlinked', unlinked.length ? `${unlinked.join(' · ')} (linked to no served request)` : 'none'));
  return [...intent, ...evidence];
}

// [VW-6]: each section an archived request held, "as at conclusion" or what
// changed it since, and the requests that follow it.
// Under --at, everything is read at that commit, and the conclusion counts
// only when that commit's history holds it.
// The generated lines of request.md's `## Outcome` ([REC-9]): up to its
// `Notes:` line or the next heading, so nothing people add counts.
function outcomeLines(md) {
  const lines = md.split('\n');
  const at = lines.findIndex((l) => /^##\s+Outcome\s*$/.test(l));
  if (at < 0) return [];
  const end = lines.findIndex((l, i) => i > at && (/^Notes:/.test(l) || /^#{1,6}\s/.test(l)));
  return lines.slice(at + 1, end < 0 ? lines.length : end);
}

export function archivedLines(top, name, at, all) {
  const tree = openTree(top, at);
  const rev = at ? resolveCommit(top, at) : null;
  const dir = `requests/archive/${name}`;
  // A request with no change.md (tier 1): the sections its Outcome lists as
  // added, modified or removed, which conclude derived from its own work ([REC-9]).
  const ids = tree.read(`${dir}/change.md`) !== null
    ? [...new Set([...allBlocks(tree).values()].filter((b) => b.request === name).map((b) => b.id))]
    : [...new Set(outcomeLines(tree.read(`${dir}/request.md`)?.toString('utf8') ?? '')
      .filter((l) => /^- (Added|Modified|Removed):/.test(l)).flatMap((l) => [...l.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1])))];
  const c = concluding(top, name, at);
  const root = rootOf(top, tree, at);
  const now = baseline(tree, root);
  const nowById = new Map(now.flatMap((f) => f.sections.filter((s) => s.id).map((s) => [s.id, { ...s, path: f.path }])));
  const then = c.sha ? byIdAt(top, c.sha, root) : null;
  const requests = requestsIn(tree);
  const seen = new Map();
  const say = (id) => {
    if (!c.sha) return c.gap ?? 'as at conclusion';
    const [was, is] = [then.get(id), nowById.get(id)];
    if (!was && !is) return 'as at conclusion';
    if (was && is && sameSection(was, is.text)) return 'as at conclusion';
    if (!is) return 'removed since conclusion';
    const later = [...new Set(blame(top, rev, is.path, [[is.line, is.line + lineCount(is.text) - 1]], { code: false }).map((b) => b.sha))]
      .filter((sha) => !/^0+$/.test(sha) && git(top, ['merge-base', '--is-ancestor', sha, c.sha], { allowFail: true }) === null)
      .map((sha) => requestOf(top, sha, requests, seen)).sort((x, y) => y.when - x.when);
    return later.length ? `since changed by ${later.map((x) => `${x.names.join(', ') || 'no request'} (${day(x.when)})`).join(', ')}` : 'since changed (not committed yet)';
  };
  // [VW-6]: grouped by what each says, none left out; one per line with --all.
  const said = ids.map((id) => ({ text: id, state: say(id) }));
  const out = !ids.length ? [] : all ? lines('Sections', said.map((x) => `${x.text} ${x.state}`)) : [grouped('Sections', said)];
  const followers = requests.filter((r) => (r.md.split('\n').find((l) => /\bStatus:/.test(l)) ?? '').match(/\bFollows:\s*([^·]+)/)?.[1]
    .split(/[\s,]+/).includes(name)).map((r) => r.name);
  if (followers.length) out.push(`Followed by ${followers.join(' · ')}`);
  return out;
}

// The baseline's sections by ID at a past commit: its root: line alone, or `root` ([VW-8]).
function byIdAt(top, sha, root) {
  const tree = openTree(top, sha);
  return new Map(baseline(tree, rootLine(top, tree, sha) ?? root).flatMap((f) => [...byId(f.text)]));
}

// [REC-9]: the code still live from the commits that map to `name` by a
// Request: line or its folder, as `path:a-b`; only under the markers of
// `onlyIds` when given. `at` is the commit read; without it, the working
// tree, its records and its files. null in a shallow clone, where blame
// gives the boundary commit every line it cannot trace ([VW-9]).
export function liveCode(top, name, root, onlyIds, at) {
  if (isShallow(top)) return null;
  const tree = openTree(top, at);
  const requests = requestsIn(tree);
  // Every route [LNK-2] maps by, the issue numbers in its owner's words included.
  const md = requests.find((r) => r.name === name)?.md ?? '';
  const issues = [...new Set(entriesOf(md, "Owner's words and dialog").join('\n').match(/#\d+/g) ?? [])];
  const mine = new Set(requestCommits(top, name, issues, at ?? 'HEAD', requests).map((c) => c.sha));
  const found = new Set([...mine].flatMap((sha) => filesOf(top, sha)).filter(isCode(root)));
  // Code moves: a later commit that changed one of these files may have taken
  // its lines into its other files, so those are read too.
  const history = git(top, ['rev-list', '--reverse', at ?? 'HEAD']).split('\n').filter(Boolean);
  for (const sha of mine.size ? history.slice(history.findIndex((s) => mine.has(s)) + 1) : []) {
    const files = filesOf(top, sha).filter(isCode(root));
    if (files.some((f) => found.has(f))) files.forEach((f) => found.add(f));
  }
  // The working tree's uncommitted changes count as one more such change: a git mv takes the lines to its new path.
  const working = at ? [] : paths(git(top, ['diff', '--name-only', '-z', '--no-renames', 'HEAD'], { allowFail: true })).filter(isCode(root));
  if (working.some((f) => found.has(f))) working.forEach((f) => found.add(f));
  const touched = [...found].sort();
  const out = [];
  for (const path of touched) {
    const text = tree.read(path)?.toString('utf8') ?? null;
    if (text === null) continue;
    const fileLines = text.split('\n');
    const under = (n) => {
      for (let i = n; i >= 1; i--) if (idsOn(fileLines[i - 1]).length) return idsOn(fileLines[i - 1]);
      return [];
    };
    const live = blame(top, at ?? null, path, [[1, lineCount(text)]], { code: true })
      .filter((b) => mine.has(b.sha) && (!onlyIds || under(b.line).some((id) => onlyIds.includes(id)))).map((b) => b.line);
    out.push(...ranges(live).map((r) => `${path}:${r}`));
  }
  return out;
}
