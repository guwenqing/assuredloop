// The git reads of v4: the base of a branch and files at a commit.
import { execFileSync } from 'node:child_process';

// Trimmed stdout of `git -C top <args>`; with allowFail, null when git fails.
export function git(top, args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', ['-C', top, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 30 }).replace(/\s+$/, '');
  } catch (e) {
    if (allowFail) return null;
    throw e;
  }
}

// The merge-base of HEAD with main (or origin/main), or null.
export function mergeBase(top) {
  for (const main of ['main', 'origin/main']) {
    if (git(top, ['rev-parse', '--verify', '--quiet', `${main}^{commit}`], { allowFail: true }) === null) continue;
    return git(top, ['merge-base', 'HEAD', main], { allowFail: true }) || null;
  }
  return null;
}

// The text of `path` at `commit`, or null when it is not there.
export function fileAt(top, commit, path) {
  try {
    return execFileSync('git', ['-C', top, 'show', `${commit}:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 30 });
  } catch {
    return null;
  }
}
