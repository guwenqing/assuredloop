// al check (design.md 3, What the script checks): the lints of every marker in
// scope, and per scope the ID lints of the branch against its base (lost, used
// again, one ID in two files), then each paragraph's change (T8); then the
// checks that read records (T10, checks.js). The base is baseOf (git.js), the
// merge-base of HEAD with main or origin/main; the head is the working tree.
// It exits 0; with --strict, 1 when it prints a `not ok`. A finding has the
// same severity in both modes: the marker and ID lints are hints for the
// review, and only the exact rules of checks.js are `not ok` (#238). With --issues <folder> it also checks the
// work items that the caller saved there (issue-hints R1).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { loadConfig, loadSchema } from './config.js';
import { baseOf, git } from './git.js';
import { diffParagraphs, idLints } from './ids.js';
import { docsInScope, idsEverUsed, isShallow, notRead, parseScopes, rootNotOk, rootProblem, SPEC } from './scope.js';
import { Fail } from './spec.js';
import { fromClone } from './base.js';
import { centralLookup } from './repos.js';
import { checks } from './checks.js';
import { loadPhrases } from './phrases.js';
import { loadItems, outOfReach } from './issues.js';
import { changeInForce } from './inforce.js';
import { reviewSection } from './evidence.js';
import { mapSection } from './map.js';
import { index, isCentral } from './indexer.js';
import { named, placeOf, requestOf } from './state.js';
import { placesOf } from './views.js';

// A file or folder that al check cannot read, and that no check reports as
// not ok, stops it with a refusal: never an internal error, never a pass (#238).
const UNREADABLE = new Set(['EACCES', 'EPERM', 'EISDIR', 'ENOTDIR', 'ELOOP']);
export function check(args) {
  try {
    if (args.opts.at !== undefined) return atCommit(args);
    // A refusal writes nothing: the settings are read before al index runs.
    settings(args);
    const indexed = runIndex(args);
    const out = checkAll(args);
    const records = recordLines(indexed.written, out.own);
    return { ...out, body: [...records, ...indexed.body, ...out.body], notKnown: [...indexed.notKnown, ...out.notKnown] };
  } catch (e) {
    if (e instanceof Fail || !UNREADABLE.has(e.code) || !e.path) throw e;
    throw new Fail(`${relative(args.top, e.path)} cannot be read`, 'make it readable, then run al check again');
  }
}

// al check runs al index first (LD-63, LD-16): it writes what al index
// writes, and says in one line which record files it wrote, so that the
// author commits them with the change. Each other line of al index shows
// as one line for each kind, naming every entry (light-resign/R1). A
// refusal of al index is shown, and the check reads the records as they are.
function runIndex({ top, cwd, opts }) {
  let out;
  try {
    out = index({ top, cwd, opts: { issues: opts.issues } });
  } catch (e) {
    // A path that cannot be read stops al index; the checks then report it.
    const why = e instanceof Fail ? e.message : UNREADABLE.has(e.code) && e.path ? `${relative(top, e.path)} cannot be read (${e.code})` : null;
    if (!why) throw e;
    return { written: [], body: [`index not run: ${why}`], notKnown: ['what al index would write: it did not run'] };
  }
  const kinds = new Map();
  const add = (kind, entry) => kinds.set(kind, [...(kinds.get(kind) ?? []), entry]);
  for (const name of out.bound) add('bound', name);
  for (const l of out.lines) {
    const m = /^([a-z][a-z ]*?): (.*)$/.exec(l);
    if (m) add(m[1], m[2]);
    else add('note', l);
  }
  return { written: out.written, body: [...kinds].map(([kind, entries]) => `index ${kind}: ${entries.join('; ')}`), notKnown: [] };
}

// The records line, in two groups (LD-63): the files to commit with the
// change, and the records of requests that are not the change's own, which
// al check wrote because they were not up to date. `own`: the names of the
// own requests, or null when they are not known (no base).
const REQUEST_RECORD = /^\.assuredloop\/records\/requests\/(?:archive\/)?([^/]+?)(?:\.yaml$|\/)/;
function recordLines(written, own) {
  const other = own ? written.filter((f) => { const m = REQUEST_RECORD.exec(f); return m && !own.includes(m[1]); }) : [];
  const mine = written.filter((f) => !other.includes(f));
  return [
    ...(mine.length ? [`records: al check wrote ${mine.join(', ')}; commit them with this change`] : []),
    ...(other.length ? [`records: al check also wrote ${other.join(', ')} of requests that are not this change's own: their records were not up to date`] : []),
  ];
}

// al check --at <commit>: the answer as of that commit, read from git. Its
// files are checked out in a temporary git worktree outside the project, so
// the base is the merge-base of that commit with main, and nothing in the
// project is written; the worktree is removed after.
function atCommit({ top, cwd, opts }) {
  const rev = git(top, ['rev-parse', '--verify', '--quiet', `${opts.at}^{commit}`], { allowFail: true });
  if (!rev) throw new Fail(`--at ${opts.at}: no such commit in this clone`, 'al check --at <commit>');
  const dir = mkdtempSync(join(tmpdir(), 'al-check-at-'));
  const tree = join(dir, 'tree');
  try {
    git(top, ['-c', 'core.hooksPath=/dev/null', 'worktree', 'add', '--detach', '--quiet', tree, rev]);
    const out = fromClone(tree, top, () => checkAll({ top: tree, cwd, opts }));
    return { ...out, read: `commit ${rev.slice(0, 7)} (--at ${opts.at}) · ${out.read.replace(/^working tree · /, '')}` };
  } finally {
    git(top, ['worktree', 'remove', '--force', tree], { allowFail: true });
    rmSync(dir, { recursive: true, force: true });
    git(top, ['worktree', 'prune'], { allowFail: true });
  }
}

// The settings of al check, each refused when it is wrong.
function settings({ top, cwd, opts }) {
  const config = loadConfig(top);
  const root = rootProblem(config);
  if (root) throw new Fail(root, 'fix root: in .assuredloop/config.yaml');
  const { kinds } = loadSchema(top);
  // A bad phrases: list is a refusal before anything is read (issue-hints D6).
  const phrases = loadPhrases(config);
  // So is a bad items-out-of-reach: list, with or without --issues (DES-117).
  outOfReach(config);
  // The work items that the caller saved; a folder that is not there is a refusal.
  const issues = opts.issues === undefined ? null : loadItems(cwd ?? top, opts.issues);
  return { config, kinds, phrases, issues };
}

function checkAll(args) {
  const { top, opts } = args;
  const { config, kinds, phrases, issues } = settings(args);
  const found = baseOf(top);
  const base = found?.commit ?? null;
  const now = parseScopes(docsInScope(top, config), kinds);
  const was = base ? parseScopes(docsInScope(top, config, base), kinds) : null;
  const used = base ? idsEverUsed(top, config, base) : null;
  // A change spec's removes: names spec paragraphs; in the central repo,
  // `central:X` is its own X (DES-69).
  const self = (ref) => (isCentral(config) && ref.startsWith('central:') ? ref.slice('central:'.length) : ref);
  const removes = [...now.scopes].filter(([s]) => s !== SPEC).flatMap(([, ps]) => ps.flatMap((p) => p.links.removes.map(self)));

  // Each marker and ID lint is a hint for the review, in every mode (#238).
  const lints = [...now.lints];
  const changes = [];
  for (const scope of new Set([...now.scopes.keys(), ...(was?.scopes.keys() ?? [])])) {
    const head = now.scopes.get(scope) ?? [];
    const before = was?.scopes.get(scope) ?? [];
    if (!base) {
      lints.push(...idLints(head, head));
      continue;
    }
    lints.push(...idLints(before, head, { everUsed: used.get(scope) ?? [], removes: scope === SPEC ? removes : [] }).map(deleted));
    // Each changed paragraph, for the map (LD-63): its place, at the base
    // for a removed one (LD-47), its kind, and its change, a change of its
    // kind alone included.
    changes.push(...changedParagraphs(before, head, base, requestOf(scope)));
  }

  const t10 = checks(top, { base, phrases, issues });
  // The ADRs' paragraphs that the branch changed, for the map too.
  if (base) changes.push(...changedParagraphs(t10.was?.adrList ?? [], t10.now.adrList, base));
  // What is in force for the change, and its design-doc hints (light-design R1).
  const list = changeInForce(top, { now: t10.now, was: t10.was, base, issues, full: opts.full, all: opts.all });
  t10.findings.push(...list.findings);
  // The map of the change and its two hints (light-design LD-56, LD-60).
  const map = mapSection(top, {
    now: t10.now, was: t10.was, base, own: list.own ?? [], changes: t10.changes, config, issues, none: list.none ?? null,
    paragraphs: changes, full: opts.full,
  });
  t10.findings.push(...map.findings);
  // An adopted paragraph needs no link while its text is the captured text (D16).
  const shown = lints.filter((l) => !(l.code === 'no-link' && t10.adopted.has(l.id) && !l.file.startsWith('requests/'))).map((l) => ({ ...l, severity: 'hint' }));
  lints.length = 0;
  lints.push(...shown);
  const body = notRead(top, config);
  // A root that config sets but that is not read is a not ok, as in al index (#218).
  const rootLine = rootNotOk(top, config);
  if (rootLine) body.push(rootLine);
  // After each message, the place of each other ID that it shows (LD-47).
  // A lint about a marker names the marker line, the place of the problem.
  const places = (f) => placesOf(t10.now, t10.was, base, f);
  body.push(...lints.map((l) => {
    const f = { id: l.id ?? '-', where: `${l.file}:${l.line}`, message: l.message };
    return `${l.severity} ${l.code} ${f.where} ${f.id} ${l.message}${places(f)}`;
  }));
  // The ok line goes here, where the marker lints end (LD-41).
  const okAt = body.length;
  body.push(...t10.findings.map((f) => `${f.severity} ${f.code} ${f.where} ${f.id} ${f.message}${places(f)}`));
  const notOk = Boolean(rootLine) || lints.some((l) => l.severity === 'not ok') || t10.findings.some((f) => f.severity === 'not ok');
  // In an output repo: the central IDs that the branch's changed files cite (T12).
  const central = centralLookup(top);
  body.push(...central.body);
  body.push(...list.body);
  // The evidence of the review's judgements: hints only (light-design R2).
  body.push(...reviewSection(top, { now: t10.now, was: t10.was, base, own: list.own ?? [], config, issues }));
  body.push(...map.body);
  // One line that names each check that ran and found nothing (LD-41).
  const gave = new Set(body.map((l) => /^(?:hint|not ok) (\S+) /.exec(l)?.[1]).filter(Boolean));
  // Only the checks that ran in full: a check that a Not known line or a
  // finding says was not run, or not run on all that it covers, is left out:
  // with no base, the checks of the change against it; with a shallow
  // history, used-again; the checks that skipped a part; and the map's hints
  // with no map.
  const skipped = new Set([...(base ? [] : BASE_CODES), ...(base && isShallow(top) ? ['used-again'] : []), ...t10.skipped,
    ...(list.skipped ?? []), ...(central.skipped ?? []),
    ...(map.ran === false ? ['map-unnamed', 'map-consolidation'] : [])]);
  const ran = [...CODES, ...(issues ? ISSUE_CODES : []), ...(central.body.length ? ['unresolved-central'] : [])].filter((c) => !skipped.has(c));
  const quiet = ran.filter((c) => !gave.has(c));
  if (quiet.length) body.splice(okAt, 0, `ok: nothing found by ${quiet.join(', ')}`);
  // Each fact once (LD-18): the questions that the review judges.
  const notKnown = ['IDs used on branches that were never fetched here', ...t10.notKnown, ...central.notKnown,
    'whether each kind is right, whether a requirement is fully covered, whether a test really checks the rule it names, '
    + 'whether a result\'s declared inputs are complete, and whether a change is authorized in substance (the review judges these)'];
  if (!base) notKnown.unshift('no base (no main branch, or no commit): lost and used-again IDs are not checked');
  else if (isShallow(top)) notKnown.unshift('IDs used before the shallow history begins');
  return {
    body,
    own: base ? (list.own ?? []).map((r) => r.name) : null,
    read: base ? `working tree · base ${base.slice(0, 7)} (merge-base with ${found.ref})` : 'working tree · no base',
    next: nextStep([...(rootLine ? ['not ok'] : []), ...lints.map((l) => l.severity), ...t10.findings.map((f) => f.severity),
      ...central.body.map((l) => (/^not ok /.test(l) ? 'not ok' : /^hint /.test(l) ? 'hint' : 'info'))], lints.some((l) => l.code === 'no-id'),
      t10.findings.some((f) => f.code === 'unsigned-requirement')),
    notKnown,
    exit: opts.strict && notOk ? 1 : 0,
  };
}

// Each paragraph that changed from `before` to `head`, for the map (LD-63):
// its place, at the base for a removed one (LD-47), its kind, and its
// change, a change of its kind alone included. `adrs` are ADR files, whose
// paragraphs are compared together.
function changedParagraphs(before, head, base, request = null) {
  const flat = (xs) => xs.flatMap((x) => x.paragraphs ?? [x]).filter((p) => p.id);
  const [was, now] = [flat(before), flat(head)];
  const h = new Map(now.map((p) => [p.id, p]));
  const b = new Map(was.map((p) => [p.id, p]));
  const out = [];
  for (const c of diffParagraphs(was, now)) {
    const p = h.get(c.id) ?? b.get(c.id);
    const kind = h.get(c.id) && b.get(c.id) && h.get(c.id).kind !== b.get(c.id).kind ? [`kind ${b.get(c.id).kind ?? 'no kind'} -> ${h.get(c.id).kind ?? 'no kind'}`] : [];
    if (!c.changes.length && !kind.length) continue;
    out.push({
      id: named(request, c.id), request, p, kind: p.kind ?? 'no kind', change: [...c.changes, ...kind].join('+'),
      at: h.has(c.id) ? placeOf(p) : `${placeOf(p)} at the base ${base.slice(0, 7)}`,
    });
  }
  return out;
}

// The codes of the checks of al check, by the order of their lines: the
// marker and ID lints, then the checks that read records, the list and the
// map. The codes of the work items' checks run only with --issues (C7).
const CODES = [
  'spec-root', 'no-id', 'no-kind', 'unknown-kind', 'no-link', 'unknown-link', 'no-blank-before', 'no-blank-after', 'duplicate-id',
  'duplicate-heading', 'lost-id', 'used-again',
  'record-unreadable', 'record-evidence', 'unsigned-requirement', 'signoff-coverage', 'superseded-cited', 'superseded-status',
  'path-claim', 'no-claim', 'promise-kind', 'typo-mark', 'near-match', 'adoption', 'design-link', 'unresolved-link', 'unknown-task',
  'target-removed', 'holder-changed', 'stale-base', 'stale-ai-hint', 'overlap', 'result', 'phrase',
  'adr-changed', 'adr-supersede', 'adr-marker', 'adr-status', 'adr-number', 'adr-none', 'adr-links', 'adr-governs',
  'design-doc', 'scope-no-file', 'map-unnamed', 'map-consolidation',
];
// The checks that compare the change with its base.
const BASE_CODES = ['lost-id', 'used-again', 'signoff-coverage', 'path-claim', 'no-claim', 'promise-kind', 'typo-mark', 'near-match', 'adoption', 'adr-changed'];
const ISSUE_CODES = ['issue-changed', 'issue-missing', 'issue-unread', 'issue-not-sub', 'issue-bare-ref', 'issue-superseded'];

// A lost ID of an open request's change spec (its file at the base is
// requests/<name>/spec.md): deleting a paragraph there is ordinary editing,
// so it is a hint that names the deletion (#230, D1-D4).
const OPEN_SPEC = /^requests\/(?!archive\/)([^/]+)\/spec\.md$/;
function deleted(l) {
  const name = l.code === 'lost-id' && OPEN_SPEC.exec(l.file)?.[1];
  if (!name) return l;
  return { ...l, message: `${name}/${l.id} is deleted. If that is on purpose, nothing more is needed: the ID is retired and never used again.` };
}

// The Next line names what to do for what printed: a not ok, a hint, both, or
// neither (#198); and for an unsigned requirement, how to get it signed (#238).
function nextStep(severities, noId, unsigned) {
  const notOk = severities.includes('not ok');
  const hint = severities.includes('hint');
  const addIds = (noId ? '; al spec --add-ids <file> marks the paragraphs with no ID' : '')
    + (unsigned ? '; for an unsigned requirement, run al index, then ask the owner to sign it (al record <name> signoff)' : '');
  if (notOk && hint) return `fix each not ok, and deal with each hint or say in the PR why it stays${addIds}`;
  if (notOk) return `fix each not ok${addIds}`;
  if (hint) return 'deal with each hint, or say in the PR why it stays';
  // No step follows from an answer with no finding (LD-18).
  return null;
}
