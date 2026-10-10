// The git reads of v4: the base of a branch, and files at a commit, read in
// one batch git process.
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

// Git objects by name (a blob hash, or `<commit>:<path>`), read with one
// `git cat-file --batch` process: Map name -> bytes for each name that is a
// blob. A missing, ambiguous or other object is not in the Map. Every reader
// of files at a commit uses it. It needs nothing newer than git 2.31 (no
// `-z`): a name that holds a newline, or ends in a carriage return, cannot go
// on a line of the batch, so it is read with its own process.
export function readObjects(top, names) {
  const out = new Map();
  const list = [...new Set(names.map(String))];
  const alone = (n) => n.includes('\n') || n.endsWith('\r');
  const lines = list.filter((n) => !alone(n));
  let buf = null;
  if (lines.length) {
    try {
      buf = execFileSync('git', ['-C', top, 'cat-file', '--batch'], { input: lines.map((n) => `${n}\n`).join(''), stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: 1 << 30 });
    } catch {
      buf = null;
    }
  }
  // Each answer, in the order asked: "<oid> <type> <size>" LF, the bytes, LF;
  // or "<name> missing" (or ambiguous) LF.
  let at = 0;
  for (const name of buf ? lines : []) {
    const end = buf.indexOf(10, at);
    if (end < 0) break;
    const header = /^[0-9a-f]+ ([a-z]+) (\d+)$/.exec(buf.subarray(at, end).toString('utf8'));
    at = end + 1;
    if (!header) continue;
    const size = Number(header[2]);
    if (header[1] === 'blob') out.set(name, buf.subarray(at, at + size));
    at += size + 1;
  }
  for (const name of list.filter(alone)) {
    try {
      out.set(name, execFileSync('git', ['-C', top, 'cat-file', 'blob', name], { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 30 }));
    } catch {
      // not a blob there
    }
  }
  return out;
}

// Each of `paths` at `commit`, with one git process (and one for each path
// that holds a newline): Map path -> its text in
// `encoding` (its bytes when encoding is null), or null when it is not a file
// there (missing, a folder, or a commit that does not resolve).
export function filesAt(top, commit, paths, encoding = 'utf8') {
  const read = readObjects(top, paths.map((p) => `${commit}:${p}`));
  return new Map(paths.map((p) => {
    const bytes = read.get(`${commit}:${p}`);
    return [p, bytes === undefined ? null : encoding === null ? bytes : bytes.toString(encoding)];
  }));
}

// The text of `path` at `commit`, or null when it is not a file there.
export const fileAt = (top, commit, path) => filesAt(top, commit, [path]).get(path);

// The full hash of commit `rev` in the repo at `dir`, or null when git cannot
// resolve it there. So a short and a full hash of one commit give one hash;
// an ambiguous or absent one gives null.
export function commitOf(dir, rev) {
  if (typeof rev !== 'string' || !rev) return null;
  return git(dir, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${rev}^{commit}`], { allowFail: true }) || null;
}

// Each of `revs` as a full commit hash in the repo at `dir`, or null when git
// cannot resolve it to a commit there, as commitOf gives it, read with one
// `git cat-file --batch-check` process. A rev that holds a newline or a NUL, or
// ends in a carriage return, cannot go on a line of the batch: it gets commitOf.
export function commitsOf(dir, revs) {
  const out = new Map();
  const asked = [...new Set(revs)];
  const alone = (r) => r.includes('\n') || r.endsWith('\r') || r.includes('\0');
  const lines = asked.filter((r) => typeof r === 'string' && r && !alone(r));
  for (const r of asked) out.set(r, null);
  if (lines.length) {
    let text = '';
    try {
      text = execFileSync('git', ['-C', dir, 'cat-file', '--batch-check'], { input: lines.map((r) => `${r}^{commit}\n`).join(''), encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: 1 << 30 });
    } catch {
      text = '';
    }
    // One answer per line, in the order asked: "<sha> commit <size>", or "<name> missing" (or ambiguous).
    const answers = text.split('\n');
    lines.forEach((r, i) => {
      const m = /^([0-9a-f]{40,64}) commit \d+$/.exec(answers[i] ?? '');
      if (m) out.set(r, m[1]);
    });
  }
  for (const r of asked) if (typeof r === 'string' && r && alone(r)) out.set(r, commitOf(dir, r));
  return out;
}

// The bytes of `path` at `commit`, or null when it is not there.
export const blobAt = (dir, commit, path) => filesAt(dir, commit, [path], null).get(path);

// mergeOf for many PRs: the first-parent history at `commit` read with one git
// process, and a function from `n` to the commit that merged PR `n`, or null,
// as mergeOf gives it.
export function mergesOf(dir, commit) {
  const out = git(dir, ['log', '--first-parent', '--format=%H %s', commit], { allowFail: true }) ?? '';
  const merges = new Map();
  for (const line of out.split('\n')) {
    const sp = line.indexOf(' ');
    if (sp <= 0) continue;
    const subject = line.slice(sp + 1);
    const sha = line.slice(0, sp);
    // The newest commit wins: the log is newest first.
    for (const m of [/^Merge pull request #(\d+)(\s|$)/.exec(subject), /\(#(\d+)\)\s*$/.exec(subject)]) {
      if (m && !merges.has(m[1])) merges.set(m[1], sha);
    }
  }
  return (n) => merges.get(String(Number(n))) ?? null;
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
