// --audit ([VW-7]): the whole trace of a request, a section or a code line,
// nothing capped, every hash re-checked. History is main's first-parent line
// (the --at commit's under --at): what reached main.
import { isAbsolute } from 'node:path';
import { Fail, git, isShallow, mainCommit, resolveCommit } from './git.js';
import { openTree, findRequest, noSymlinkOn } from './tree.js';
import { rootOf, rootLine, baseline, configured } from './spec.js';
import { allBlocks, statesOf } from './states.js';
import { sameSection } from './sections.js';
import { isSignoff, snapshots } from './snapshot.js';
import { line, entriesOf, concludedOnMain, concluding } from './commands.js';
import { blame, byId, filesOf, requestCommits, requestOf, requestsIn } from './links.js';
import { testMatcher } from './tests.js';
import { adrsOf } from './adrs.js';

const HISTORY = 'history unavailable (shallow clone)';
const ID = /^[A-Z][A-Z0-9]*-\d+(?:\.\d+)*$/;
const indented = (text) => text.replace(/\n+$/, '').split('\n').map((l) => `            ${l}`);

export function audit(top, target, at) {
  const tree = openTree(top, at);
  const tip = at ? resolveCommit(top, at) : mainCommit(top);
  const a = { top, tree, at, tip, root: rootOf(top, tree, at), shallow: isShallow(top), requests: requestsIn(tree), seen: new Map() };
  a.gap = a.shallow ? HISTORY : !tip ? 'no main to read it along' : null;
  const pos = target.match(/^(.+):(\d+)$/);
  if (!pos && !ID.test(target) && !findRequest(tree, target)) throw new Fail(`no request named ${target} in the ${tree.label}`, 'al context <name | ID | path:line> --audit');
  return {
    tree,
    body: pos ? fromLine(a, pos[1], Number(pos[2])) : ID.test(target) ? fromSection(a, target) : trace(a, target),
    next: 'git show <sha> for any commit named here',
    notKnown: ['who spoke (the records name their source)', 'drafts inside a PR: only what reached main is kept'],
  };
}

const commitLine = (a, c) => `${c.sha.slice(0, 7)} ${c.when.toISOString().slice(0, 10)} ${git(a.top, ['show', '-s', '--format=%s', c.sha])} (${c.names.length ? `${c.names.join(', ')} by ${c.how}` : 'no request'})`;

// Main's first-parent commits that changed the baseline, oldest first, each
// with its sections by ID.
// Each tree is read with its own root: today's, or any `root:` line
// .assuredloop held, so a moved root keeps its earlier history.
function history(a) {
  if (a.walk || a.gap) return a.walk ?? [];
  const shas = (args) => git(a.top, args).split('\n').filter(Boolean);
  const roots = new Set([a.root, 'specs', ...shas(['log', '--format=%H', a.tip, '--', '.assuredloop']).map((sha) => rootLine(a.top, openTree(a.top, sha), sha))]);
  roots.delete(null);
  // .assuredloop too: a commit that only switches root: can change a section's text.
  a.walk = shas(['log', '--first-parent', '--reverse', '--format=%H', a.tip, '--', '.assuredloop', ...[...roots].map((r) => `${r}/`)]).map((sha) => {
    const tree = openTree(a.top, sha);
    const root = rootLine(a.top, tree, sha);
    return { sha, sections: new Map(root ? baseline(tree, root).flatMap((f) => [...byId(f.text)]) : []) };
  });
  return a.walk;
}

// The whole trace of request `name`.
function trace(a, name) {
  const { top, tree } = a;
  const dir = findRequest(tree, name);
  const md = tree.read(`${dir}/request.md`).toString('utf8');
  const body = [line('Audit', `${name}  ${(md.match(/^# (.*)$/m)?.[1] ?? name).trim()}  (${dir})`),
    ...entriesOf(md, "Owner's words and dialog").map((e) => line('Words', e))];
  for (const { file: f, s } of snapshots(tree, dir)) {
    const ok = !s ? 'not ok: not a valid snapshot' : s.intact ? 'SHA-256 matches' : 'not ok: no longer matches its SHA-256';
    if (isSignoff(s)) body.push(line('Sign-off', `origin/${f} (${s.fields.Fetched}) ${ok}; signed text:`), ...indented(s.text.toString('utf8')));
    else body.push(line('Snapshot', `origin/${f} ${s ? `(${s.fields.Source}, fetched ${s.fields.Fetched}) ` : ''}${ok}`));
  }
  body.push(...entriesOf(md, 'Decisions').map((e) => line('Decision', e)));
  const place = (f) => [`requests/${name}/${f}`, `requests/archive/${name}/${f}`];
  const records = [...place('request.md'), ...place('change.md')];
  const versions = a.gap ? [] : git(top, ['log', '--first-parent', '--format=%H', a.tip, '--', ...records]).split('\n').filter(Boolean);
  body.push(...(a.gap ? [line('Versions', a.gap)] : versions.map((sha) =>
    line('Version', `${commitLine(a, requestOf(top, sha, a.requests, a.seen))}: ${filesOf(top, sha).filter((p) => records.includes(p)).join(', ')}`))));
  // Each block, with its state and when it reached the baseline on main, read
  // only over the request's own life there: its first record to its conclusion.
  const blocks = allBlocks(tree);
  const order = new Map(a.gap ? [] : git(top, ['rev-list', '--first-parent', '--reverse', a.tip]).split('\n').map((sha, i) => [sha, i]));
  const end = concluding(top, name, a.at).sha;
  const [from, to] = [order.get(versions.at(-1)) ?? 0, end ? order.get(end) : Infinity];
  const walk = history(a).map((c, i, all) => ({ ...c, before: all[i - 1] })).filter((c) => order.get(c.sha) >= from && order.get(c.sha) <= to);
  for (const e of statesOf(baseline(tree, a.root), blocks, (b) => b.request === name)) {
    const b = blocks.get(e.block);
    // A removal lands where the section goes from present to absent.
    const landed = b.op === 'remove' ? walk.find((c) => !c.sections.has(b.id) && c.before?.sections.has(b.id))
      : walk.find((c) => c.sections.has(b.id) && sameSection(c.sections.get(b.id), b.now ?? ''));
    body.push(line('Section', `${e.block} ${e.state}${e.by ? ` ${e.by}` : ''}; ${a.gap ?? (landed ? `consolidated on main at ${landed.sha.slice(0, 7)}` : 'not consolidated on main')}`));
  }
  // The linked commits ([LNK-2]) and the test files they changed.
  if (a.shallow) body.push(line('Commits', HISTORY));
  else {
    const rev = a.at ?? 'HEAD';
    // Every route [LNK-2] maps by: a Request: line, the folder, an issue number in the owner's words.
    const issues = [...new Set(entriesOf(md, "Owner's words and dialog").join('\n').match(/#\d+/g) ?? [])];
    const mine = requestCommits(top, name, issues, rev, a.requests, a.seen);
    body.push(...mine.map((c) => line('Commit', commitLine(a, c))));
    const isTest = testMatcher(a.root, configured(top, tree, a.at, 'tests'));
    body.push(line('Tests', [...new Set(mine.flatMap((c) => filesOf(top, c.sha)).filter(isTest))].sort().join(' · ') || 'none changed by its commits'));
  }
  const adrs = adrsOf(top, tree, a.at, name, a.requests);
  body.push(line('ADRs', [...adrs.added.map((x) => `${x.path} (added)`), ...adrs.superseded.map((x) => `${x.path} (superseded)`)].join(' · ') || 'none'));
  if (dir.startsWith('requests/archive/')) body.push(line('Concluded', concludedOnMain(top, name, a.at)));
  const outcome = md.match(/^## Outcome[ \t]*\n([\s\S]*?)(?=^#{1,2} |(?![\s\S]))/m)?.[1].trim();
  body.push(...(outcome ? [line('Outcome', ''), ...indented(outcome)] : [line('Outcome', 'none yet')]));
  return body;
}

// A section: its text, each main commit that changed it with its request,
// then the trace of every request that shaped it or holds it.
function fromSection(a, id) {
  const s = baseline(a.tree, a.root).flatMap((f) => f.sections.map((x) => ({ ...x, path: f.path }))).find((x) => x.id === id);
  const names = new Set([...allBlocks(a.tree).values()].filter((b) => b.id === id).map((b) => b.request));
  if (!s && !names.size) return [`[${id}] not found: not in the baseline, and no request holds it`];
  const body = [line('Audit', s ? `[${id}] ${s.title}  in ${s.path}` : `[${id}] not in the baseline`), ...(s ? indented(s.text) : [])];
  if (a.gap) body.push(line('Changed', a.gap));
  let was;
  for (const c of history(a)) {
    const now = c.sections.get(id);
    if (now === was || (now !== undefined && was !== undefined && sameSection(now, was))) continue;
    was = now;
    const r = requestOf(a.top, c.sha, a.requests, a.seen);
    r.names.forEach((n) => names.add(n));
    body.push(line('Changed', `${now === undefined ? 'removed' : 'written'} at ${commitLine(a, r)}`));
  }
  for (const n of names) if (findRequest(a.tree, n)) body.push('', ...trace(a, n));
  return body;
}

// A code or baseline line: blame, the commit's request, then its trace.
function fromLine(a, path, n) {
  // Only a path inside the repo, never through a symlink, as the tool writes ([SPC-1]).
  if (isAbsolute(path) || path.split('/').includes('..') || (a.at ? a.tree.linkOn(path) : !noSymlinkOn(a.top, path))) {
    throw new Fail(`${path} is not a path inside this repo, or goes through a symlink`, 'al context <path>:<line> --audit, for a repo-relative path');
  }
  const lines = a.tree.read(path)?.toString('utf8').replace(/\n$/, '').split('\n');
  if (!lines || n < 1 || n > lines.length) throw new Fail(`${path}:${n}: no such line in the ${a.tree.label}`, 'al context <path>:<line> --audit, for a line that exists');
  const body = [line('Audit', `${path}:${n}  ${lines[n - 1].trim()}`)];
  if (a.shallow) return [...body, line('Blame', HISTORY)];
  const [b] = blame(a.top, a.at ? a.tip : null, path, [[n, n]], { code: !path.startsWith(`${a.root}/`) });
  if (!b || /^0+$/.test(b.sha)) return [...body, line('Blame', 'not committed yet: the trail stops here')];
  const c = requestOf(a.top, b.sha, a.requests, a.seen);
  body.push(line('Blame', commitLine(a, c)));
  if (!c.names.length) return [...body, line('Request', `${b.sha.slice(0, 7)} maps to no request: the trail stops here`)];
  for (const name of c.names) body.push('', ...(findRequest(a.tree, name) ? trace(a, name) : [line('Request', `${name}: no such request in the ${a.tree.label}`)]));
  return body;
}
