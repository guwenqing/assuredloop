// Every call to git goes through here. Output is a Buffer unless asked as text.
import { spawnSync } from 'node:child_process';

// The tool's own failure or misuse: exit 2 ([HNT-3]), with a Next line.
export class Fail extends Error {
  constructor(message, next) {
    super(message);
    this.next = next;
  }
}

// Once remember() is called (bin/al.js, at the start of a run), the same call in
// the same folder is asked of git once and its answer kept until the process
// ends; nothing outlives the run ([TL-2]). A `worktree` call reads the working
// tree or the index, and is asked every time.
let asked = null;
export const remember = () => { asked = new Map(); };

export function git(cwd, args, { text = true, allowFail = false, worktree = false } = {}) {
  const key = asked && !worktree ? JSON.stringify([cwd, ...args]) : null;
  const r = asked?.get(key) ?? spawnSync('git', args, { cwd, maxBuffer: 1 << 30 });
  if (key) asked.set(key, r);
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
  const gap = historyGap(top);
  if (gap) throw new Fail(`history unavailable: this clone is ${gap.kind}, and ${rev} is not in it`, gap.next);
  throw new Fail(`${rev}: unknown commit`, 'name a commit in this repo');
}

// How this clone lacks history, and the fetch that fills it; null for a full clone.
export function historyGap(top) {
  if (isShallow(top)) return { kind: 'shallow', next: 'git fetch --unshallow, then run it again' };
  if (isSingleBranch(top)) {
    return { kind: 'single-branch', next: "git fetch origin '+refs/heads/*:refs/remotes/origin/*', then run it again" };
  }
  return null;
}

export function isShallow(top) {
  return git(top, ['rev-parse', '--is-shallow-repository'], { allowFail: true }) === 'true';
}

// Cloned with --single-branch: origin fetches named branches, not refs/heads/*.
function isSingleBranch(top) {
  const specs = git(top, ['config', '--get-all', 'remote.origin.fetch'], { allowFail: true });
  return Boolean(specs) && !specs.includes('*');
}

// The branch's commits over base..head, oldest first, in one order for every
// reader. A merge among them counts by its own edits only (ownFiles in
// links.js): a merge of main brings main's work, which is not the branch's
// own ([HNT-3]).
export const ownCommits = (top, base, head) => git(top, ['rev-list', '--reverse', '--topo-order', `${base}..${head}`]).split('\n').filter(Boolean);

// Whether HEAD names a commit: a repo with none yet has no history to read.
export const hasCommits = (top) => git(top, ['rev-parse', '--verify', '--quiet', 'HEAD'], { allowFail: true }) !== null;

// Main as the tool reads it: origin/main when there is one, else local main.
export function mainCommit(top) {
  for (const ref of ['refs/remotes/origin/main', 'refs/heads/main']) {
    if (git(top, ['rev-parse', '--verify', '--quiet', ref], { allowFail: true }) !== null) return ref;
  }
  return null;
}

// The main the tool reads, by the name a command takes: `origin/main` or `main`.
export const mainName = (top) => mainCommit(top)?.replace(/^refs\/(remotes|heads)\//, '') ?? 'main';

// The ref the tool reads as main, and the time git last recorded for it
// ([VW-9]): origin/main's latest reflog entry (it moved then, by a fetch, a
// push or the clone), else origin/HEAD's clone entry; never the clock.
// FETCH_HEAD is not used: it keeps lines from earlier fetches under a new
// time, so it cannot say which fetch touched main. `unknown` goes on the Not
// known line.
export function mainRef(top) {
  const main = mainCommit(top);
  if (!main) {
    const gap = historyGap(top);
    return { label: 'no main (no origin/main, no main branch)', unknown: gap && `history unavailable (${gap.kind} clone without main)` };
  }
  if (main !== 'refs/remotes/origin/main') return { label: 'local main' };
  const [last] = reflogTimes(top, 'refs/remotes/origin/main');
  const clone = last ? null : reflogTimes(top, 'refs/remotes/origin/HEAD').find((e) => e.subject.startsWith('clone:'));
  const when = (last ?? clone)?.when;
  if (!when) return { label: 'origin/main (time unknown)' };
  return {
    label: `origin/main as of ${stamp(when)}${clone ? ' (clone)' : ''}`,
    unknown: `whether origin/main moved after ${stamp(when)}; a fetch that finds nothing new leaves no record`,
  };
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
