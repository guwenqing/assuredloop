// al check [--strict] [--all]: every hint for the branch ([HNT-2]), ranked and
// capped ([HNT-1]); the final state is the working tree, the commits are
// main..HEAD. Among them, the append-only records ([REC-12]), per commit, each
// commit against its first parent: the owner's words and the decisions only
// grow at the end; a file in origin/ never changes or goes; nothing changes
// under a request archived on main; the move to archive/ is not an edit.
// check exits 0, and --strict exits 1 on a not ok that counts ([HNT-3]).
import { git, isShallow, mainCommit, resolveCommit } from './git.js';
import { openTree } from './tree.js';
import { line } from './commands.js';
import { hintText, hintsOf, ranked, readBranch } from './hints.js';
import { assertionsChanged, headNote, nearIds, resultLines, testLines } from './tests.js';

const NOTE = 'append-only is checked per commit over main..HEAD; this protects a PR only when check runs on it';
const APPEND_ONLY = ["Owner's words and dialog", 'Decisions'];

// The request a path under requests/ belongs to.
const requestOf = (path) => path.match(/^requests\/archive\/([^/]+)\//)?.[1] ?? path.match(/^requests\/(?!archive\/)([^/]+)\//)?.[1];

// Git's path lists, NUL-separated, so every name comes as it is (never quoted).
const paths = (out) => out.split('\0').filter(Boolean);

// The files of request `name` at `rev`, by their path inside the request folder
// (open or archived), each with its blob and full path.
function filesOf(top, rev, name) {
  const out = git(top, ['ls-tree', '-r', '-z', rev, '--', `requests/${name}/`, `requests/archive/${name}/`]);
  const files = new Map();
  for (const l of paths(out)) {
    const [, sha, path] = l.match(/^\S+ \S+ (\S+)\t([\s\S]*)$/);
    files.set(path.replace(/^requests\/(archive\/)?[^/]+\//, ''), { sha, path });
  }
  return files;
}

// The entries of a `## <title>` section: the text before the first item, then
// each top-level item with its continuation lines, trailing spaces dropped.
function entries(md, title) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const at = lines.findIndex((l) => new RegExp(`^##\\s+${title}\\s*$`).test(l));
  const out = [];
  for (const l of at < 0 ? [] : lines.slice(at + 1)) {
    if (/^#{1,2}\s/.test(l)) break;
    if (!out.length || /^(-|\d+\.)\s/.test(l)) out.push(l.trimEnd());
    else out[out.length - 1] += `\n${l.trimEnd()}`;
  }
  return out.map((e) => e.replace(/\n+$/, '')).filter((e) => e.trim());
}

function problems(top, parent, commit, name, frozen) {
  const before = filesOf(top, parent, name);
  const after = filesOf(top, commit, name);
  const out = [];
  const bad = (path, what) => out.push({ kind: 'not ok', rank: 3, owners: [name], text: `${commit.slice(0, 7)} ${path}: ${what} ([REC-12])`, command: `git show ${commit.slice(0, 7)} -- ${path}` });
  if (frozen.has(name)) {
    const paths = new Set([...before.values(), ...after.values()].map((f) => f.path).filter((p) => p.startsWith('requests/archive/')));
    const sha = (files, p) => [...files.values()].find((f) => f.path === p)?.sha;
    for (const p of paths) if (sha(before, p) !== sha(after, p)) bad(p, 'changes a request archived on main');
    return out;
  }
  for (const [rel, f] of before) {
    if (rel.startsWith('origin/') && after.get(rel)?.sha !== f.sha) {
      bad(after.get(rel)?.path ?? f.path, after.has(rel) ? 'edits a file in origin/' : 'deletes a file in origin/');
    }
  }
  const [was, now] = [before.get('request.md'), after.get('request.md')];
  if (was && was.sha !== now?.sha) {
    const [a, b] = [git(top, ['cat-file', 'blob', was.sha]), now ? git(top, ['cat-file', 'blob', now.sha]) : ''];
    for (const title of APPEND_ONLY) {
      const [old, grown] = [entries(a, title), entries(b, title)];
      if (!old.every((e, i) => e === grown[i])) bad(now?.path ?? was.path, `edits or removes an entry of "## ${title}"`);
    }
  }
  return out;
}

// The append-only hints of `commits` (main..HEAD), each owned by its request.
export function appendOnly(top, main, commits) {
  const frozen = new Set(paths(git(top, ['ls-tree', '-z', '--name-only', `${main}:requests/archive`], { allowFail: true }) ?? ''));
  const out = [];
  for (const commit of commits) {
    const parent = git(top, ['rev-parse', '--verify', '--quiet', `${commit}^1`], { allowFail: true });
    if (!parent) continue;
    const changed = paths(git(top, ['diff', '--name-only', '-z', '--no-renames', parent, commit, '--', 'requests/']));
    for (const name of new Set(changed.map(requestOf).filter(Boolean))) out.push(...problems(top, parent, commit, name, frozen));
  }
  return out;
}

// Under --at X, the final state is X's tree and the commits main..X ([VW-8]).
export function check({ top, opts }) {
  const main = mainCommit(top);
  const head = opts.at ? resolveCommit(top, opts.at) : 'HEAD';
  const to = opts.at ? head.slice(0, 7) : 'HEAD';
  const base = main ? git(top, ['merge-base', main, head], { allowFail: true }) : null;
  const commits = main ? git(top, ['rev-list', '--reverse', '--topo-order', `${main}..${head}`]).split('\n').filter(Boolean) : [];
  const b = readBranch(top, { base, commits, tree: openTree(top, opts.at), at: opts.at, range: `main..${to}` });
  const list = ranked(hintsOf(top, b, { main }), b);
  const notKnown = headNote(top, b);
  if (isShallow(top)) notKnown.push('history unavailable (shallow clone): commits before the shallow boundary');
  const body = [line('Serves', [...[...b.served].filter((n) => !b.archived.has(n)), ...[...b.archived].map((n) => `archives ${n}`)].join(' · ') || 'no request')];
  if (b.tier) {
    // [REC-11]: the claim with its evidence: the spec edits, the sections near the changed code, the tests whose assertions changed.
    body.push(line('Tier', b.tier), line('Evidence', [`edits ${b.changedIds.map((i) => `[${i}]`).join(', ') || 'no baseline section'}`,
      `near the changed code: ${nearIds(top, b).map((i) => `[${i}]`).join(', ') || 'none'}`,
      `tests whose assertions changed: ${assertionsChanged(top, b).join(', ') || 'none'}`].join(' · ')));
  }
  body.push(...testLines(top, b, false), ...resultLines(top, b));
  const cap = opts.all ? list.length : 5;
  body.push(...list.slice(0, cap).map(hintText));
  if (list.length > cap) body.push(`${list.length - cap} more hidden, --all`);
  if (!main) body.push('no main to compare with, so no commits were checked');
  body.push(NOTE);
  const counting = list.filter((h) => h.counts).length;
  return {
    tree: { label: `${opts.at ? `commit ${to}` : 'working tree'} and ${commits.length} commit(s) over main..${to}` },
    body,
    exit: opts.strict && counting ? 1 : 0,
    next: counting ? 'fix or explain each not ok that counts, then al check --strict' : 'run al check again after each push; it certifies only what it read',
    notKnown,
  };
}
