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

// The full hash of commit `rev` in the repo at `dir`, or null when git cannot
// resolve it there. So a short and a full hash of one commit give one hash;
// an ambiguous or absent one gives null.
export function commitOf(dir, rev) {
  if (typeof rev !== 'string' || !rev) return null;
  return git(dir, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${rev}^{commit}`], { allowFail: true }) || null;
}

// The bytes of `path` at `commit`, or null when it is not there.
export function blobAt(dir, commit, path) {
  try {
    return execFileSync('git', ['-C', dir, 'cat-file', 'blob', `${commit}:${path}`], { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 30 });
  } catch {
    return null;
  }
}

// The commit that merged PR `n`, in the first-parent history at `commit`: the
// newest whose subject is "Merge pull request #n ..." or ends in "(#n)". Null
// means no merge was found there, not that the PR is not merged.
export function mergeOf(dir, commit, n) {
  const out = git(dir, ['log', '--first-parent', '--format=%H %s', commit], { allowFail: true }) ?? '';
  const merge = new RegExp(`^Merge pull request #${Number(n)}(\\s|$)`);
  const squash = new RegExp(`\\(#${Number(n)}\\)\\s*$`);
  for (const line of out.split('\n')) {
    const sp = line.indexOf(' ');
    const subject = line.slice(sp + 1);
    if (sp > 0 && (merge.test(subject) || squash.test(subject))) return line.slice(0, sp);
  }
  return null;
}
