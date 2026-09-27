// Every read goes through a tree: the working tree, or a commit's tree read
// through git ([VW-8]). Paths are relative to the repo's top level.
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { git, resolveCommit } from './git.js';

export function openTree(top, at) {
  if (!at) {
    return {
      label: 'working tree',
      read(path) {
        try { return readFileSync(join(top, path)); } catch { return null; }
      },
      list(dir) {
        try { return readdirSync(join(top, dir)).sort(); } catch { return null; }
      },
      // Every file under `dir`, as repo-relative paths in path order.
      walk(dir) {
        try {
          return readdirSync(join(top, dir), { recursive: true, withFileTypes: true }).filter((d) => d.isFile())
            .map((d) => relative(top, join(d.parentPath, d.name))).sort();
        } catch { return []; }
      },
    };
  }
  const sha = resolveCommit(top, at);
  return {
    label: `commit ${sha.slice(0, 7)}`,
    read(path) {
      return git(top, ['cat-file', 'blob', `${sha}:${path}`], { text: false, allowFail: true });
    },
    list(dir) {
      const out = git(top, ['ls-tree', '--name-only', sha, `${dir}/`], { allowFail: true });
      if (!out) return null;
      return out.split('\n').map((p) => p.slice(dir.length + 1)).sort();
    },
    walk(dir) {
      const out = git(top, ['ls-tree', '-r', '--name-only', sha, '--', `${dir}/`], { allowFail: true });
      return out ? out.split('\n').sort() : [];
    },
  };
}

// Where a request lives in this tree: requests/<name> or requests/archive/<name>.
export function findRequest(tree, name) {
  for (const dir of [`requests/${name}`, `requests/archive/${name}`]) {
    if (tree.read(`${dir}/request.md`) !== null) return dir;
  }
  return null;
}

// Whether the tool may write `path` (repo-relative): it stays inside the repo
// (no `..`), and no part of it below the repo top, from the first
// folder down to the file, is a symlink, wherever the link points. Parts that
// do not exist yet are created as real folders.
export function noSymlinkOn(top, path) {
  if (path.split('/').includes('..')) return false;
  let at = top;
  for (const part of path.split('/')) {
    at = join(at, part);
    try {
      if (lstatSync(at).isSymbolicLink()) return false;
    } catch { return true; }
  }
  return true;
}
