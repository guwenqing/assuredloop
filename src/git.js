// Every call to git goes through here. Output is a Buffer unless asked as text.
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join } from 'node:path';

// The tool's own failure or misuse: exit 2 ([HNT-3]), with a Next line.
export class Fail extends Error {
  constructor(message, next) {
    super(message);
    this.next = next;
  }
}

export function git(cwd, args, { text = true, allowFail = false } = {}) {
  const r = spawnSync('git', args, { cwd, maxBuffer: 1 << 30 });
  if (r.error) throw new Fail(`git could not run: ${r.error.message}`, 'install git and try again');
  if (r.status !== 0) {
    if (allowFail) return null;
    throw new Fail(`git ${args.join(' ')} failed: ${r.stderr.toString().trim()}`);
  }
  return text ? r.stdout.toString().replace(/\n$/, '') : r.stdout;
}

export function topLevel(cwd) {
  const top = git(cwd, ['rev-parse', '--show-toplevel'], { allowFail: true });
  if (top === null) throw new Fail('not inside a git repository', 'cd into the project and run it again');
  return top;
}

// The full commit id for `rev`, or a Fail when it names no commit.
export function resolveCommit(top, rev) {
  const sha = git(top, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${rev}^{commit}`], { allowFail: true });
  if (!sha) throw new Fail(`--at ${rev}: no such commit here`, 'al context <name> --at <a commit in this clone>');
  return sha;
}

export function isShallow(top) {
  return git(top, ['rev-parse', '--is-shallow-repository'], { allowFail: true }) === 'true';
}

// The ref the tool reads as main, and when it was last fetched ([VW-9]).
// The fetch time is the recorded time of origin/main's last reflog entry, else
// the time FETCH_HEAD was written; never the clock.
export function mainRef(top) {
  if (git(top, ['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main'], { allowFail: true }) === null) {
    return 'local main';
  }
  let when = null;
  const reflog = git(top, ['reflog', 'show', '-1', '--format=%gd', '--date=unix', 'refs/remotes/origin/main'], { allowFail: true });
  const m = reflog && reflog.match(/@\{(\d+)\}/);
  if (m) when = new Date(Number(m[1]) * 1000);
  else {
    const gitDir = git(top, ['rev-parse', '--absolute-git-dir']);
    try { when = statSync(join(gitDir, 'FETCH_HEAD')).mtime; } catch { /* never fetched */ }
  }
  return when ? `origin/main fetched ${stamp(when)}` : 'origin/main (last fetch time unknown)';
}

// A timestamp as the tool writes it: UTC to the minute, `2026-09-23T10:14Z`.
export function stamp(date) {
  return date.toISOString().slice(0, 16) + 'Z';
}

// The clock, read only to stamp what the tool writes ([TL-2]).
// SOURCE_DATE_EPOCH (seconds) stands in for it when set.
export function now() {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  return epoch ? new Date(Number(epoch) * 1000) : new Date();
}
