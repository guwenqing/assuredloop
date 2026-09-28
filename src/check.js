// al check: for now only the append-only records ([REC-12]), per commit over
// main..HEAD, each commit against its first parent. The owner's words and the
// decisions only grow at the end; a file in origin/ never changes or goes;
// nothing changes under a request archived on main. The move to archive/ is
// not an edit. check exits 0 ([HNT-3]).
import { git, isShallow, mainCommit } from './git.js';

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
  const bad = (path, what) => out.push(`not ok: ${commit.slice(0, 7)} ${path}: ${what} ([REC-12])`);
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

export function check({ top }) {
  const main = mainCommit(top);
  const notKnown = ['uncommitted changes in the working tree (check reads commits only)'];
  if (isShallow(top)) notKnown.push('history unavailable (shallow clone): commits before the shallow boundary');
  if (!main) return { body: ['no main to compare with, so no commits were checked', NOTE], next: 'git fetch origin, or create main, then al check', notKnown };
  const commits = git(top, ['rev-list', '--reverse', '--topo-order', `${main}..HEAD`]).split('\n').filter(Boolean);
  const frozen = new Set(paths(git(top, ['ls-tree', '-z', '--name-only', `${main}:requests/archive`], { allowFail: true }) ?? ''));
  const body = [];
  for (const commit of commits) {
    const parent = git(top, ['rev-parse', '--verify', '--quiet', `${commit}^1`], { allowFail: true });
    if (!parent) continue;
    const changed = paths(git(top, ['diff', '--name-only', '-z', '--no-renames', parent, commit, '--', 'requests/']));
    for (const name of new Set(changed.map(requestOf).filter(Boolean))) body.push(...problems(top, parent, commit, name, frozen));
  }
  const bad = body.length > 0;
  if (!bad) body.push(`append-only holds in the ${commits.length} commit(s) over main..HEAD`);
  body.push(NOTE);
  return {
    tree: { label: `${commits.length} commit(s) over main..HEAD` },
    body,
    next: bad ? 'restore each record named as it was (a correction is a new entry), then al check'
      : 'run al check again after each push; it certifies only the commits it read',
    notKnown,
  };
}
