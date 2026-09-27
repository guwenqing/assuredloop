// Every call to git goes through here. Output is a Buffer unless asked as text.
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
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

// The full commit id for `rev`, or a Fail when it names no commit. A clone that
// lacks history cannot tell a missing commit from a wrong one ([VW-9]).
export function resolveCommit(top, rev) {
  const sha = git(top, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${rev}^{commit}`], { allowFail: true });
  if (sha) return sha;
  if (isShallow(top)) {
    throw new Fail(`history unavailable: this clone is shallow, and ${rev} is not in it`, 'git fetch --unshallow, then run it again');
  }
  if (isSingleBranch(top)) {
    throw new Fail(`history unavailable: this clone is single-branch, and ${rev} is not in it`,
      "git fetch origin '+refs/heads/*:refs/remotes/origin/*', then run it again");
  }
  throw new Fail(`--at ${rev}: unknown commit`, 'al context <name> --at <a commit in this repo>');
}

export function isShallow(top) {
  return git(top, ['rev-parse', '--is-shallow-repository'], { allowFail: true }) === 'true';
}

// Cloned with --single-branch: origin fetches named branches, not refs/heads/*.
function isSingleBranch(top) {
  const specs = git(top, ['config', '--get-all', 'remote.origin.fetch'], { allowFail: true });
  return Boolean(specs) && !specs.includes('*');
}

// Main as the tool reads it: origin/main when there is one, else local main.
export function mainCommit(top) {
  for (const ref of ['refs/remotes/origin/main', 'refs/heads/main']) {
    if (git(top, ['rev-parse', '--verify', '--quiet', ref], { allowFail: true }) !== null) return ref;
  }
  return null;
}

// The ref the tool reads as main, and when it was last fetched ([VW-9]), from
// what git recorded, never the clock: the time FETCH_HEAD was written when it
// lists origin's main, else origin/main's last reflog entry, else the clone
// (a clone is a fetch).
export function mainRef(top) {
  if (mainCommit(top) !== 'refs/remotes/origin/main') return 'local main';
  const fetchHead = join(git(top, ['rev-parse', '--absolute-git-dir']), 'FETCH_HEAD');
  const url = git(top, ['remote', 'get-url', 'origin'], { allowFail: true });
  try {
    if (url && readFileSync(fetchHead, 'utf8').split('\n').some((l) => l.endsWith(`branch 'main' of ${url}`))) {
      return `origin/main fetched ${stamp(statSync(fetchHead).mtime)}`;
    }
  } catch { /* never fetched */ }
  const [last] = reflogTimes(top, 'refs/remotes/origin/main');
  if (last) return `origin/main fetched ${stamp(last.when)}`;
  const clone = reflogTimes(top, 'refs/remotes/origin/HEAD').find((e) => e.subject.startsWith('clone:'));
  if (clone) return `origin/main (fetched at clone, ${stamp(clone.when)})`;
  return 'origin/main (last fetch time unknown)';
}

// A ref's reflog entries, newest first, with their recorded times.
function reflogTimes(top, ref) {
  const out = git(top, ['reflog', 'show', '--format=%gd %gs', '--date=unix', ref], { allowFail: true });
  if (!out) return [];
  return out.split('\n').map((l) => l.match(/@\{(\d+)\} (.*)$/)).filter(Boolean)
    .map((m) => ({ when: new Date(Number(m[1]) * 1000), subject: m[2] }));
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
