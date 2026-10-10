// STUB until issue #174 merges: its real src/v4/git.js replaces this file.
import { execFileSync } from 'node:child_process';

export function git(top, args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: top, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).replace(/\n$/, '');
  } catch (e) {
    if (allowFail) return null;
    throw e;
  }
}

export function mergeBase(top) {
  for (const ref of ['refs/remotes/origin/main', 'refs/heads/main']) {
    if (git(top, ['rev-parse', '--verify', '--quiet', ref], { allowFail: true }) !== null) {
      return git(top, ['merge-base', ref, 'HEAD'], { allowFail: true });
    }
  }
  return null;
}

export const fileAt = (top, commit, path) => git(top, ['show', `${commit}:${path}`], { allowFail: true });
