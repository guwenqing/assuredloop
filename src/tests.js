// Tests and their results ([LNK-3]), observed and never judged: test files
// by common path patterns or the `tests:` paths of .assuredloop; assertion
// counts for JS/TS; the result files `results:` names, each classed by the
// revision it names; the tests linked to the changed code, each with its
// reason; and [HNT-2]'s four test notes.
import { basename } from 'node:path';
import { git, isShallow } from './git.js';
import { openTree } from './tree.js';
import { configured } from './spec.js';
import { line } from './commands.js';
import { fileLinks } from './views.js';
import { adrFolders } from './adrs.js';
import { changedWith, idsOn, paths } from './links.js';

const DIR = /(^|\/)(test|tests|__tests__|spec)\//;
const NAME = /^test_|\.(test|spec)\.|_test\.|Tests?\.[^.]+$/;
const MARK = /^test_|\.(test|spec)(?=\.)|_test(?=\.)|Tests?(?=\.[^.]+$)/g;
const JS = /\.[cm]?[jt]sx?$/;
const ASSERT = /(?<![\w$.])(?:t\.)?assert(?:\.\w+)*\s*\(|(?<![\w$.])expect\s*\(/g;
const REVISION = /\brevision:[ \t]*([0-9a-f]{7,40})\b/i;
const stem = (p) => basename(p).replace(MARK, '').replace(/\..*$/, '');

// Whether a path is a test file; never one under the baseline root or requests/.
export const testMatcher = (root, named) => (p) => !p.startsWith(`${root}/`) && !p.startsWith('requests/') &&
  (DIR.test(p) || NAME.test(basename(p)) || named.some((n) => p === n || p.startsWith(`${n}/`)));

// A test file's assertions from `before` to `after` (null when absent): the
// counts, and the assertion lines added and removed; other syntax is skipped.
function observe(path, before, after) {
  if (!JS.test(path)) return { path, skipped: 'not JS/TS, the syntax al counts' };
  const lines = (t) => (t ?? '').split('\n').map((l) => l.trim()).filter((l) => l.match(ASSERT));
  const minus = (x, y) => { const left = [...y]; return x.filter((l) => { const i = left.indexOf(l); return i < 0 || !left.splice(i, 1); }); };
  const count = (t) => (t ?? '').match(ASSERT)?.length ?? 0;
  const [a, b] = [lines(before), lines(after)];
  return { path, was: count(before), now: count(after), added: minus(b, a).length, removed: minus(a, b).length };
}
const moved = (o) => !o.skipped && (o.added || o.removed);
const observation = (o) => (o.skipped ? `${o.path}  skipped (${o.skipped})` : `${o.path}  ${o.was} → ${o.now} assertions (+${o.added} -${o.removed} lines)`);

// A result file's counts and failing test names: JUnit XML's testcases, or
// TAP's points (a SKIP or TODO is neither); null when it is neither.
function parse(text) {
  const r = { passed: 0, failed: 0, failing: new Set() };
  const note = (name, failed) => (failed ? (r.failed++, r.failing.add(name)) : r.passed++);
  if (/<testcase\b/.test(text)) {
    for (const [, attrs, inner = ''] of text.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
      if (!/<skipped\b/.test(inner)) note(attrs.match(/\bname="([^"]*)"/)?.[1] ?? '', /<(failure|error)\b/.test(inner));
    }
    return r;
  }
  const points = [...text.matchAll(/^[ \t]*(not )?ok\b[ \t]*\d*[ \t]*(?:-[ \t]*)?(.*)$/gm)];
  for (const [, not, rest] of points) if (!/(^|\s)#\s*(skip|todo)\b/i.test(rest)) note(rest.trim(), Boolean(not));
  return points.length ? r : null;
}

// The files `results:` names, read from the working tree, each classed by its
// revision line against `head` and `base`: head, base, older or unknown.
function results(top, head, base) {
  const tree = openTree(top);
  const out = [];
  for (const p of configured(top, tree, undefined, 'results')) {
    const files = tree.read(p) !== null ? [p] : tree.walk(p);
    if (!files.length) out.push({ path: p, missing: true });
    for (const path of files) {
      const text = tree.read(path).toString('utf8');
      const sha = text.match(REVISION)?.[1].toLowerCase();
      const rev = sha && git(top, ['rev-parse', '--verify', '--quiet', `${sha}^{commit}`], { allowFail: true });
      const cls = !rev ? 'unknown' : rev === head ? 'head' : rev === base ? 'base'
        : git(top, ['merge-base', '--is-ancestor', rev, head], { allowFail: true }) !== null ? 'older' : 'unknown';
      out.push({ path, rev: rev || sha, cls, tests: parse(text) });
    }
  }
  return out;
}

// What part 8 reads of branch `b` (readBranch's), once: the changed tests and
// their assertions, the tests linked to each changed code file, the sections
// near the changed code, and the named results.
export function testFacts(top, b) {
  if (b.testFacts) return b.testFacts;
  const head = git(top, ['rev-parse', b.at ?? 'HEAD']);
  const isTest = testMatcher(b.root, configured(top, b.tree, b.at, 'tests'));
  const found = results(top, head, b.base);
  const adr = adrFolders(top, b.tree, b.at);
  const text = (p) => b.tree.read(p)?.toString('utf8') ?? null;
  const tracked = new Set(paths(b.at ? git(top, ['ls-tree', '-r', '-z', '--name-only', head]) : git(top, ['ls-files', '-z'])));
  const tests = [...new Set([...tracked, ...b.changed])].filter((p) => isTest(p) && text(p) !== null);
  const names = new Map(tests.map((t) => [t, new Set(idsOn(text(t)))]));
  const observed = b.changed.filter(isTest).map((p) => observe(p, b.base && git(top, ['show', `${b.base}:${p}`], { allowFail: true }), text(p)));
  const code = b.changed.filter((p) => !isTest(p) && !p.startsWith('requests/') && !p.startsWith(`${b.root}/`)
    && !adr.some((d) => p.startsWith(`${d}/`)) && !found.some((r) => r.path === p));
  const ctx = { root: b.root, requests: b.requests, seen: b.seen, shallow: isShallow(top), headings: new Map() };
  const links = new Map();
  const near = new Map();
  for (const c of b.base ? code : []) {
    // An untracked file has no history to link it by, only its stem.
    const reached = tracked.has(c) ? [...fileLinks(top, b.base, head, c, ctx).ids.keys()] : [];
    near.set(c, reached);
    const together = tracked.has(c) ? changedWith(top, head, c).commits : [];
    links.set(c, tests.flatMap((t) => {
      const id = reached.find((i) => names.get(t).has(i));
      const commit = together.find((x) => x.files.includes(t));
      const reason = id ? `names [${id}], near ${c}` : commit ? `changed together with ${c} (${commit.sha.slice(0, 7)})` : stem(t) === stem(c) ? `the same stem as ${c}` : null;
      return reason ? [{ test: t, reason }] : [];
    }));
  }
  b.testFacts = { head, tests, names, observed, links, near, results: found };
  return b.testFacts;
}

// [HNT-2]'s test notes for branch `b`.
export function testHints(top, b) {
  const f = testFacts(top, b);
  const out = [];
  const add = (rank, text, command) => out.push({ kind: 'note', rank, owners: [], text, command });
  const diff = `al context --diff ${b.range}`;
  for (const [c, ls] of f.links) {
    if (ls.length && !ls.some((l) => b.changed.includes(l.test))) add(15, `${c} changed, but its linked tests did not: ${ls.map((l) => l.test).join(', ')}`, diff);
  }
  const nearIds = new Set([...f.near.values()].flat());
  for (const o of f.observed.filter(moved)) {
    const code = [...f.links].filter(([, ls]) => ls.some((l) => l.test === o.path)).map(([c]) => c);
    const named = [...(f.names.get(o.path) ?? [])];
    if (!code.length && !named.some((id) => b.changedIds.includes(id))) add(16, `${o.path} changed its assertions (${o.was} → ${o.now}) with no linked code or spec change`, diff);
    const ids = [...new Set([...named.filter((id) => nearIds.has(id)), ...code.flatMap((c) => f.near.get(c))])];
    if (/^0\b/.test(b.tier ?? '') && ids.length) add(21, `the claim is tier 0, but ${o.path}, a test of ${ids.map((i) => `[${i}]`).join(', ')} near the changed code, changed its assertions`, `${diff} --for review`);
  }
  const head = f.results.some((r) => r.cls === 'head');
  for (const r of f.results.filter((x) => !x.missing && (['older', 'unknown'].includes(x.cls) || (x.cls === 'base' && !head)))) {
    add(20, `${r.path} is at ${r.rev ? `${r.cls} revision ${r.rev.slice(0, 7)}` : 'an unknown revision'}: not evidence for this change`,
      `run the tests at ${f.head.slice(0, 7)} with a "revision: <sha>" line in ${r.path}, then al check`);
  }
  return out;
}

// The Tests lines: each changed test's assertions; with `linked`, each test
// linked to the changed code or naming a changed section, with its reason.
export function testLines(top, b, linked) {
  const f = testFacts(top, b);
  const out = f.observed.map(observation);
  if (linked) {
    for (const [c, ls] of f.links) out.push(...ls.map((l) => `${l.test}  linked to ${c}: ${l.reason}`));
    for (const t of f.tests) out.push(...[...f.names.get(t)].filter((id) => b.changedIds.includes(id)).map((id) => `${t}  names [${id}], changed on this branch`));
  }
  return (out.length ? out : ['no test file changed']).map((t, i) => line(i ? '' : 'Tests', t));
}

// The Results lines: each named file with its revision, class and counts;
// then, with both a head and a base result, the failures compared by name.
export function resultLines(top, b) {
  const rs = testFacts(top, b).results;
  const out = rs.map((r) => (r.missing ? `${r.path}  not found` : !r.tests ? `${r.path}  not a format al reads (TAP, JUnit XML): skipped`
    : `${r.path}  at ${r.rev ? r.rev.slice(0, 7) : 'no revision'} (${r.cls}${['older', 'unknown'].includes(r.cls) ? ', not evidence for this change' : ''}): ${r.tests.passed} passed, ${r.tests.failed} failed`));
  const failing = (cls) => (rs.some((r) => r.cls === cls && r.tests) ? new Set(rs.filter((r) => r.cls === cls && r.tests).flatMap((r) => [...r.tests.failing])) : null);
  const [h, was] = [failing('head'), failing('base')];
  const list = (xs) => xs.join(', ') || 'none';
  if (h && was) out.push(`new failures: ${list([...h].filter((n) => !was.has(n)))} · already failing at base: ${list([...h].filter((n) => was.has(n)))} · fixed: ${list([...was].filter((n) => !h.has(n)))}`);
  return (out.length ? out : ['no result files named (add results: <path> to .assuredloop)']).map((t, i) => line(i ? '' : 'Results', t));
}

// Not known, when a head result is shown.
export const headNote = (top, b) => (testFacts(top, b).results.some((r) => r.cls === 'head') ? ['whether the head results covered uncommitted changes'] : []);
export const assertionsChanged = (top, b) => testFacts(top, b).observed.filter(moved).map((o) => o.path);
export const nearIds = (top, b) => [...new Set([...testFacts(top, b).near.values()].flat())];
