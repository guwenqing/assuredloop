// al context (T11; design.md 5, 8, 9 and 13, schema.md 5): where the project,
// a request or a paragraph stands; the review view of a diff; the whole trace
// with --audit; any of them as of a v4 commit with --at. Views never write.
import { LineCounter, parseDocument } from 'yaml';
import { Fail, recordPath } from './base.js';
import { applicability, checks } from './checks.js';
import { closeLine, closeLines } from './close.js';
import { git, mergeBase, mergesOf } from './git.js';
import { crossRepo, findCites, namedIds } from './repos.js';
import { diffParagraphs } from './ids.js';
import { loadResults } from './results.js';
import {
  adrPlace, decisionLine, latestVersion, loadState, named, placeOf, placeOfTarget, qualify, reqLine, requestOf, resolve, signedBy, unknownBy,
} from './state.js';
import { isCentral } from './indexer.js';
import { LINK_WORDS, groupOf } from './markers.js';

export const line = (label, text) => `${label.length < 10 ? label.padEnd(10) : `${label} `}${text}`;
const list = (x) => (Array.isArray(x) ? x : []);
const short = (h) => (h ? String(h).slice(0, 12) : 'none');
const indent = (text) => text.split('\n').map((l) => `  ${l}`);

export const NOT_CHECKED = 'whether each kind is right; whether a requirement is fully covered; whether a test really checks the rule it names; '
  + 'whether a result\'s declared inputs are complete; whether a change is authorized in substance (the review judges these)';

// The sign-off state of one requirement or question: "signed in S1",
// "changed since S1" or "not signed".
export function signState(state, r, q) {
  const s = signedBy(state, r.name, q.id);
  if (s) return `signed in ${s.id}`;
  const u = unknownBy(state, r.name, q.id);
  if (u) return `not known: ${u.id} covers it, but its original file is not checked`;
  const before = list(r.data?.signoff).filter((x) => list(x?.covers).some((c) => c?.id === q.id)).at(-1);
  return before ? `changed since ${before.id}` : 'not signed';
}

// The version of a requirement's current text, from the record ("new" when not indexed yet).
const versionOf = (r, q) => {
  const v = list(r.data?.requirements).filter((x) => x?.id === q.id && x.sha256 === q.sha256).at(-1);
  return v ? `version ${v.version}` : `version ${Number(latestVersion(r.data, q.id)?.version ?? 0) + 1} (not indexed)`;
};

// A request's sign-off state in one phrase.
function signSummary(state, r) {
  if (!r.reqs.length) return 'no requirement';
  const states = r.reqs.map((q) => [q.id, signState(state, r, q)]);
  const not = states.filter(([, s]) => !s.startsWith('signed'));
  if (!not.length) return 'signed';
  if (not.length === states.length) return not.every(([, s]) => s === 'not signed') ? 'not signed' : `not signed (${not.map(([id, s]) => `${id} ${s}`).join(', ')})`;
  return `partly signed (${not.map(([id, s]) => `${id} ${s}`).join(', ')})`;
}

// The files that name each spec ID (cites, exact): every file outside the
// spec root, requests/ and .assuredloop/, in the working tree or at `rev`,
// found by the one cite finder (findCites, D17).
// With `errors`, the files that git could not read (findCites).
function citesOf(state, errors = null) {
  const cites = new Map();
  for (const { file, ids } of findCites(state.top, state.rev ?? null, { qualified: false, exclude: [state.root, 'requests', '.assuredloop', 'node_modules'], errors })) {
    for (const written of ids) {
      const id = written.replace(/^central:/, '');
      if (!cites.has(id)) cites.set(id, new Set());
      cites.get(id).add(file);
    }
  }
  return cites;
}

// The declared `verifies` outputs of every request record, by target ID: claims.
function verifiesOf(state) {
  const out = new Map();
  for (const r of state.requests.values()) {
    for (const o of list(r.data?.outputs)) {
      for (const t of [].concat(o?.verifies ?? [])) {
        const id = String(t).replace(/^central:/, '');
        if (!out.has(id)) out.set(id, []);
        out.get(id).push(o.repo && o.repo !== state.config.repo ? `${o.repo}/${o.file}` : o.file);
      }
    }
  }
  return out;
}

// A test file, by its path: under a test/, tests/, spec/ or __tests__/
// folder, or named *.test.*, *.spec.* or *_test.*.
const isTest = (file) => /(^|\/)(test|tests|spec|__tests__)\//i.test(file) || /(\.(test|spec)\.[^/]+|_test\.[^/]+)$/i.test(file);

// The files that result files name as their check (the working tree only).
const resultChecks = (state) => new Set(state.rev ? [] : loadResults(state.top).map((r) => String(r.check ?? '')));

// A rule's checks (design.md 9): a test file or a result's check that names
// it (cites, exact), or a declared verifies output (a claim). Any other file
// that names it, such as code, is listed apart and is no check.
function checksOf(id, cites, verifies, named, cross = null) {
  const files = [...(cites.get(id) ?? [])].sort();
  const outside = crossCites(cross, id);
  // A file that an output repo's result names as its check is a check there too.
  const outNamed = new Set((cross?.results ?? []).map((res) => `${res.repo}/${res.check}`));
  const isCheck = (c) => isTest(c.file) || outNamed.has(`${c.repo}/${c.file}`);
  return {
    checks: [
      ...files.filter((f) => isTest(f) || named.has(f)).map((file) => ({ file, how: 'cites it' })),
      ...outside.filter(isCheck).map((c) => ({ file: `${c.repo}/${c.file}`, how: `cites it (at ${c.repo}@${c.commit.slice(0, 7)})`, repo: c.repo, path: c.file })),
      ...(verifies.get(id) ?? []).map((file) => ({ file, how: 'verifies it (a claim)' })),
    ],
    other: [...files.filter((f) => !isTest(f) && !named.has(f)), ...outside.filter((c) => !isCheck(c)).map((c) => `${c.repo}/${c.file}`)],
  };
}

// The files of output repos that cite `central:<id>` (T12, exact), from crossRepo.
const crossCites = (cross, id) => (cross?.links ?? []).filter((l) => l.link === 'cites' && l.target === `central:${id}` && l.commit)
  .map((l) => ({ repo: l.repo, file: l.file, commit: l.commit }));

// The cross-repo facts of the working tree, or null at --at (crossRepo reads the working tree's config).
// One crossRepo for each state, shared by every view of it.
const crossOfState = new WeakMap();
const crossOf = (state) => {
  if (state.rev) return null;
  if (!crossOfState.has(state)) crossOfState.set(state, crossRepo(state.top));
  return crossOfState.get(state);
};
// The merges of the first-parent history at `rev`, read once for each state (mergesOf).
const mergesOfState = new WeakMap();
const mergesAt = (state, rev) => {
  if (!mergesOfState.has(state)) mergesOfState.set(state, new Map());
  const byRev = mergesOfState.get(state);
  if (!byRev.has(rev)) byRev.set(rev, mergesOf(state.top, rev));
  return byRev.get(rev);
};
const showChecks = ({ checks, other }) => `${checks.length ? checks.map((c) => `${c.file} ${c.how}`).join(' · ') : 'none'}`
  + `${other.length ? ` · also named in ${other.join(', ')} (not a test: no check)` : ''}`;

// The section of a spec paragraph from its display number: "1 Export links".
const sectionOf = (p) => {
  const m = /\((\d+(?:\.\d+)*):\d+, in (.*)\)$/.exec(p.displayNumber ?? '');
  return m ? `${m[1]} ${m[2]}` : '-';
};

// Coverage lines per section of the spec rules in `rules`, each rule with its checks.
function coverage(state, rules, perRule) {
  const unread = [];
  const cites = citesOf(state, unread);
  const verifies = verifiesOf(state);
  const named = resultChecks(state);
  const cross = crossOf(state);
  const sections = new Map();
  for (const p of rules) {
    const key = `${p.file} ${sectionOf(p)}`;
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key).push(p);
  }
  const out = [];
  for (const [key, ps] of sections) {
    const checked = ps.filter((p) => checksOf(p.id, cites, verifies, named, cross).checks.length);
    out.push(line('Coverage', `${key}: ${ps.length} rules, ${checked.length} with a check, ${ps.length - checked.length} without (${Math.round((100 * checked.length) / ps.length)}% have a check)`));
    if (perRule) {
      for (const p of ps) {
        out.push(`  ${p.id} (${placeOf(p)}) rule: ${showChecks(checksOf(p.id, cites, verifies, named, cross))}`);
      }
    }
  }
  if (!out.length) out.push(line('Coverage', 'no rule'));
  if (unread.length) out.push(line('Coverage', `not known: ${unread.join('; ')}`));
  return out;
}

// The PRs that name the request, from the commit messages of main (or of the
// selected commit): "#46 (abc1234)". Exact facts from git.
// The main branch of this clone: main, else origin/main, else null.
const mainRef = (top) => ['main', 'origin/main'].find((m) => git(top, ['rev-parse', '--verify', '--quiet', `${m}^{commit}`], { allowFail: true })) ?? null;

function prsFromGit(state, name) {
  const rev = state.rev ?? mainRef(state.top) ?? 'HEAD';
  const out = git(state.top, ['log', '--format=%H%x09%B%x00', rev], { allowFail: true }) ?? '';
  const prs = new Map();
  const word = new RegExp(`(?<![\\w-])${name.replace(/[-]/g, '\\-')}(?![\\w-])`);
  for (const entry of out.split('\0')) {
    const [sha, ...rest] = entry.replace(/^\n+/, '').split('\t');
    const msg = rest.join('\t');
    if (!sha || !word.test(msg)) continue;
    for (const m of msg.matchAll(/(?<![\w-])((?:[a-z0-9-]+)?#\d+)\b/g)) if (!prs.has(m[1])) prs.set(m[1], sha.slice(0, 7));
  }
  return [...prs].map(([pr, sha]) => `${pr} (${sha})`);
}

// A git fact for each PR of a task (design.md 8; T12's mergeOf): this repo's
// `#n` in the first-parent history of main (or of the selected commit); an
// output repo's from crossRepo. Never "not merged": a merge not found is that.
function taskPrs(state, r) {
  const main = state.rev ? null : mainRef(state.top);
  const rev = state.rev ?? main ?? 'HEAD';
  // With no main branch, a merge read from HEAD may be the branch's own commit: say so.
  const limit = state.rev || main ? '' : ' (read from HEAD: no main branch, so a commit of this branch may show as merged)';
  const where = state.rev ? state.rev.slice(0, 7) : main ?? 'HEAD';
  const self = new Set(['central', ...(typeof state.config.repo === 'string' ? [state.config.repo] : [])]);
  const cross = crossOf(state);
  const repos = new Map((cross?.repos ?? []).map((x) => [x.name, x]));
  return (task, pr) => {
    const m = /^(?:([A-Za-z0-9][A-Za-z0-9._-]*))?#(\d+)$/.exec(pr);
    if (!m) return '(not a PR reference)';
    if (!m[1] || self.has(m[1])) {
      const merge = mergesAt(state, rev)(m[2]);
      return merge ? `merged at ${merge.slice(0, 7)}${limit}` : `no merge found in ${where}${limit}`;
    }
    if (state.rev) return 'unknown: output repos are read at the working tree only';
    const l = (cross?.links ?? []).find((x) => x.link === 'pr' && x.holder === `${r.name}/${task}` && x.target === pr);
    if (l?.merged) return l.merged;
    if (!repos.has(m[1]) || repos.get(m[1]).unknown) return `unknown: ${l?.unknown ?? repos.get(m[1])?.unknown ?? 'not an output repo in config'}`;
    return l?.unknown ?? 'no merge found';
  };
}

// The findings of al check that concern request `name`.
const hintsFor = (findings, name) => findings.filter((f) => f.severity !== 'info'
  && (f.id === name || f.id.startsWith(`${name}/`) || f.message.includes(`${name}/`)));
const findingLine = (f, places = '') => `${f.severity} ${f.code} ${f.where} ${f.id} ${f.message}${places}`;

// After a finding's message, the place of each other ID that it shows
// (LD-47): each ID in the message that al knows in `now`, or else at the
// base in `was`, and the finding's own ID when `where` is not its place.
// A word that names nothing al knows (SHA-256) is not listed, and neither is
// a bare R, Q, D, S or T number or another repo's ID. A bare ID that is no
// spec ID may be a paragraph of the finding's own open request (named by its
// ID or its place), and is shown with that request's name.
export function placesOf(now, was, base, f) {
  const parts = [];
  const request = /^([a-z0-9][a-z0-9-]*)\//.exec(f.id)?.[1] ?? /^requests\/(?!archive\/)([^/]+)\//.exec(f.where)?.[1] ?? null;
  for (const written of namedIds(`${f.id} ${f.message}`, { qualified: false })) {
    if (written.startsWith('central:') || /^[RQDST]\d+$/.test(written)) continue;
    let name = written;
    const find = (state) => (state ? placeOfTarget(state, qualify(name, null)) : null);
    let here = find(now);
    let there = here ? null : find(was);
    if (!here && !there && request && !written.includes('/')) {
      name = `${request}/${written}`;
      here = find(now);
      there = here ? null : find(was);
    }
    if (!here && !there) continue;
    if ((written === f.id || name === f.id) && f.where === (here ?? `${there} at the base ${base.slice(0, 7)}`)) continue;
    if (f.message.includes(`${written} (${here ?? there}`)) continue;
    parts.push(here ? `${name} ${here}` : `${name} at the base ${base.slice(0, 7)} ${there}`);
  }
  return parts.length ? ` · places: ${[...new Set(parts)].join(', ')}` : '';
}

// The findings of al check on the working tree, and each one's line with
// the places of its IDs; null at --at.
function hintsNow(state) {
  if (state.rev) return null;
  const base = mergeBase(state.top);
  const t = checks(state.top, { base });
  return { findings: t.findings, line: (f) => findingLine(f, placesOf(t.now, t.was, base, f)) };
}

// --- the views

// The facts of the project view that only al's records hold: the sign-off
// states, and the tiers that no request.md says (LD-47); a record that is not
// there or cannot be read is not known.
function projectRecords(open) {
  const tiers = open.some((r) => /^Tier:\s*(\S+)/m.exec(r.md)?.[1] !== r.tier || !r.tier);
  const unknown = open.filter((r) => r.recordError || !r.data).map((r) => `; not known: the record of ${r.name} (${r.recordError ?? 'it is not there'})`);
  return line('Records', `only al's records in .assuredloop/records/requests/ hold ${tiers ? 'the tiers and ' : ''}the sign-off states above${unknown.join('')}`);
}

function projectView(state) {
  const body = [];
  const open = [...state.requests.values()].filter((r) => r.open);
  for (const r of open) {
    const tier = r.tier ? `tier ${r.tier}` : 'no tier';
    body.push(line('Request', `${r.name} · ${tier} · ${signSummary(state, r)}${r.spike ? ' · a spike' : ''}`));
  }
  if (!open.length) body.push(line('Request', 'no open request'));
  else body.push(projectRecords(open));
  body.push(...coverage(state, [...state.spec.values()].filter((p) => p.kind === 'rule'), false));
  const hints = hintsNow(state);
  const findings = hints?.findings ?? null;
  if (findings) {
    const n = (s) => findings.filter((f) => f.severity === s).length;
    body.push(line('Hints', `${n('hint')} hints, ${n('not ok')} not ok (al check lists them)`));
  }
  body.push(line('Not checked', NOT_CHECKED));
  return { body, next: open.length ? `al context <name>, for example al context ${open[0].name}` : 'al new <name> --from <file|->', findings };
}

function requestView(state, r, audit) {
  const body = [];
  body.push(line('Request', `${r.name} · ${r.tier ? `tier ${r.tier}` : 'no tier'} · ${r.open ? 'open' : 'archived'}${r.spike ? ' · a spike' : ''} · ${r.dir}`));
  body.push(recordsLine(r));
  for (const q of r.reqs) body.push(`  ${q.id} ${versionOf(r, q)} (${q.title}) · ${r.dir}/request.md:${reqLine(r, q.id)}: ${signState(state, r, q)}`);
  if (!r.reqs.length) body.push('  no organized requirement yet');
  for (const d of list(r.data?.decisions)) {
    const n = decisionLine(r, d.id);
    body.push(line('Decision', `${d.id} · ${n ? `${r.dir}/request.md:${n}` : `no line in ${r.dir}/request.md`} (${d.source ?? 'no source'}): ${d.text ?? d.summary ?? ''}`));
  }
  const prFacts = taskPrs(state, r);
  // A task is an entry of the record; its ref names a work item, which only
  // al check --issues reads (LD-47).
  const taskAt = entryLines(state, r, 'tasks');
  for (const t of list(r.data?.tasks)) {
    const prs = [].concat(t.prs ?? []).map((pr) => `${pr} ${prFacts(t.id, String(pr))}`);
    const delivers = [].concat(t.delivers ?? []).map((x) => `${x} (${placeOfTarget(state, qualify(String(x), r.name)) ?? 'not found'})`);
    const at = taskAt.get(String(t.id));
    body.push(line('Task', `${t.id} (${at ? `${recordPath(r.name)}:${at}` : recordPath(r.name)})${t.ref ? ` ${t.ref} (a work item: al context does not read it)` : ''}`
      + `${delivers.length ? ` · delivers ${delivers.join(', ')}` : ''}${prs.length ? ` · PRs: ${prs.join(', ')}` : ''}`));
  }
  const prs = prsFromGit(state, r.name);
  body.push(`PRs from git: ${prs.length ? prs.join(' · ') : 'none found'}`);
  // The close lines (LD-62); al conclude shows what refuses.
  if (!r.spike) body.push(...closeLines(state, r).map((c) => closeLine(r, c, placeOfTarget(state, qualify(`${r.name}/${c.e.on}`, null)) ?? 'not found')));
  const rules = [...state.spec.values()].filter((p) => p.kind === 'rule'
    && p.links.serves.some((s) => qualify(s, null).req === r.name));
  body.push(...coverage(state, rules, true));
  if (audit) body.push(...auditLines(state, r));
  const hints = hintsNow(state);
  if (hints) {
    const mine = hintsFor(hints.findings, r.name);
    body.push(line('Hints', mine.length ? `${mine.length}` : 'none'));
    body.push(...mine.map((f) => `  ${hints.line(f)}`));
  }
  body.push(line('Not checked', NOT_CHECKED));
  return { body, next: !r.open ? `al context ${r.name} --audit` : `al conclude ${r.name}` };
}

// The line of each entry of list `key` in the record of request `r`, by
// its id: the line where the entry starts.
function entryLines(state, r, key) {
  const out = new Map();
  const text = state.get(recordPath(r.name));
  if (typeof text !== 'string') return out;
  const counter = new LineCounter();
  const doc = parseDocument(text, { lineCounter: counter });
  const seq = doc.get(key, true);
  for (const item of seq?.items ?? []) {
    const id = item?.get?.('id');
    if (id != null && item.range && !out.has(String(id))) out.set(String(id), counter.linePos(item.range[0]).line);
  }
  return out;
}

// The facts of request `r` that only its record holds (LD-47): the
// sign-offs, the requirement versions, the tasks and the close lines, and
// the tier when request.md has no Tier: line that says it.
function recordsLine(r) {
  const tier = /^Tier:\s*(\S+)/m.exec(r.md)?.[1];
  if (r.recordError || !r.data) return line('Records', `al's record ${recordPath(r.name)} cannot be read (${r.recordError ?? 'it is not there'}), so its sign-offs, versions, tasks and close lines are not known`);
  const has = (key) => list(r.data[key]).length > 0;
  const facts = [...(tier && tier === r.tier ? [] : ['the tier']), ...(has('signoff') ? ['the sign-offs'] : []), ...(has('requirements') ? ['the requirement versions'] : []),
    ...(has('tasks') ? ['the tasks'] : []), ...(has('closes') ? ['the close lines'] : [])];
  if (!facts.length) return line('Records', `al's record ${recordPath(r.name)} holds no sign-off, task or close line`);
  return line('Records', `only al's record ${recordPath(r.name)} holds ${facts.length > 1 ? `${facts.slice(0, -1).join(', ')} and ${facts.at(-1)}` : facts[0]} below`);
}

// --audit: the whole trace of request `r`.
function auditLines(state, r) {
  const out = [];
  const data = r.data ?? {};
  for (const s of list(data.sources)) out.push(line('Source', `${s.id ? `${s.id} ` : ''}${s.file} sha256 ${short(s.sha256)}${s.taken ? ` taken ${s.taken}` : ''}${s.url ? ` from ${s.url}` : ''}`));
  for (const v of list(data.requirements)) out.push(line('Version', `${v.id} version ${v.version} sha256 ${short(v.sha256)}${v.title ? ` ${v.title}` : ''}`));
  for (const s of list(data.signoff)) {
    out.push(line('Sign-off', `${s.id} ${s.file ?? ''} sha256 ${short(s.sha256)} covers ${list(s.covers).map((c) => `${c.id} version ${c.version} (${short(c.sha256)})`).join(', ')}`
      + `${s.presented ? ` · presented: ${s.presented}` : ''}${s.transcribed_by ? ` · transcribed by ${s.transcribed_by}` : ''}`));
  }
  for (const o of list(data.outputs)) {
    for (const link of ['implements', 'verifies', 'documents']) {
      const ts = [].concat(o?.[link] ?? []);
      if (ts.length) out.push(line('Output', `${o.repo ? `${o.repo}: ` : ''}${o.file} ${link} ${ts.join(', ')} (a claim, never shown as proven)`));
    }
  }
  for (const b of list(data.bindings)) {
    let st;
    const t = qualify(String(b?.target ?? ''), null);
    if (t.cross) st = 'cross-repo, not read here';
    else {
      const cur = resolve(state, t);
      st = !cur ? 'target not found' : !b.target_sha256 || cur.sha === b.target_sha256 ? 'bound' : 'stale';
    }
    out.push(line('Binding', `${b?.holder} ${b?.link} ${b?.target}${b?.target_version ? ` version ${b.target_version}` : ''} target ${short(b?.target_sha256)} holder ${short(b?.holder_sha256)}: ${st}`));
  }
  // Old records may hold dispositions: they stay readable, and al no longer checks them (LD-58).
  for (const d of list(data.dispositions)) {
    const st = d?.source === 'adoption' ? 'adoption' : 'recorded; not checked';
    out.push(line('Disp.', `${d?.source} ${short(d?.source_sha256)} ${d?.disposition}${d?.spec ? ` ${d.spec} ${short(d.spec_sha256)}` : ''}${d?.by ? ` by ${d.by}` : ''}${d?.decision ? ` decision ${d.decision}` : ''}: ${st}`));
  }
  for (const e of list(data.closes)) {
    out.push(line('Close', `${e?.id} on ${e?.on} ${short(e?.sha256)}${list(e?.names).map((n) => ` names ${n?.id} ${short(n?.sha256)}`).join('')} recorded ${e?.recorded ?? 'unknown'}: ${e?.reason}`));
  }
  if (!state.rev) for (const res of loadResults(state.top)) out.push(line('Result', `${res.file} ${res.check ?? ''} ${res.outcome ?? ''}: ${res.problems.length ? `not valid: ${res.problems.join('; ')}` : applicability(state.top, res)}`));
  return out;
}

// The Checks line of a paragraph and the Result lines of its checks: this
// repo's (a spec ID only, `local`) and the output repos'.
function checkLines(state, id, local) {
  const cross = crossOf(state);
  const unread = [];
  const found = checksOf(id, local ? citesOf(state, unread) : new Map(), verifiesOf(state), local ? resultChecks(state) : new Set(), cross);
  const out = [line('Checks', `${showChecks(found)}${unread.length ? ` · not known: ${unread.join('; ')}` : ''}`)];
  if (state.rev) return out;
  for (const res of loadResults(state.top)) {
    if (!found.checks.some((c) => !c.repo && c.file === res.check)) continue;
    out.push(line('Result', `${res.file} ${res.check} ${res.outcome}: ${res.problems.length ? `not valid: ${res.problems.join('; ')}` : applicability(state.top, res)}`));
  }
  for (const res of cross?.results ?? []) {
    if (!found.checks.some((c) => c.repo === res.repo && c.path === res.check)) continue;
    out.push(line('Result', `${res.repo}/${res.file} ${res.check} ${res.outcome} at ${res.repo}@${String(res.resolved ?? res.commit ?? 'unknown').slice(0, 7)}: ${res.applies}`));
  }
  return out;
}

// The place of link target `ref`, written in request `request`'s text (or
// in specs/ when null), for the parentheses after it (LD-47).
function placeOfRef(state, ref, request = null, own = new Set()) {
  const self = isCentral(state.config) && ref.startsWith('central:') ? ref.slice('central:'.length) : ref;
  const t = qualify(self, request, own);
  if (t.cross) return 'another repo: not read here';
  return placeOfTarget(state, t) ?? 'not found';
}

// The paragraphs of specs/ and of the open change specs that build on,
// explain or illustrate the paragraph named `who`, each with its place. In
// the central repo, `central:X` is its own X (design.md 12).
function linkedTo(state, who) {
  const self = (ref) => (isCentral(state.config) && ref.startsWith('central:') ? ref.slice('central:'.length) : ref);
  const holders = [
    ...[...state.spec.values()].map((p) => ({ p, r: null })),
    ...[...state.requests.values()].filter((r) => r.open).flatMap((r) => [...r.paras.values()].map((p) => ({ p, r }))),
  ];
  const out = [];
  for (const { p, r } of holders) {
    const own = r ? new Set(r.paras.keys()) : new Set();
    for (const [key, verb] of [['buildsOn', 'builds on it'], ['explains', 'explains it'], ['illustrates', 'illustrates it']]) {
      if (p.links[key].some((ref) => qualify(self(ref), r?.name ?? null, own).key === who)) out.push(`${named(r?.name ?? null, p.id)} (${placeOf(p)}) ${verb}`);
    }
  }
  return out.length ? out.join(' · ') : 'no paragraph builds on, explains or illustrates it';
}

// The paragraphs of the open change specs that change, build on or remove
// the paragraph named `who`, each with its place.
function openChanges(state, who) {
  const changes = [];
  for (const o of [...state.requests.values()].filter((x) => x.open)) {
    const own = new Set(o.paras.keys());
    for (const q of o.paras.values()) {
      for (const [key, verb] of [['changes', 'changes it'], ['buildsOn', 'builds on it'], ['removes', 'removes it']]) {
        if (q.links[key].some((x) => qualify(x.replace(/^central:/, ''), o.name, own).key === who)) changes.push(`${o.name}/${q.id} (${placeOf(q)}) ${verb}`);
      }
    }
  }
  return line('Open', changes.length ? changes.join(' · ') : 'no open change builds on or changes it');
}

// The status of a paragraph (LD-18): in force, not in force, or a draft of
// an open request's change spec (LD-24, LD-42).
function statusOf(state, p, request) {
  if (request) return `draft: in the change spec of open request ${request}; not in force`;
  if (p.kind && p.kind !== 'approach' && ['promise', 'design'].includes(groupOf(p.kind, state.kinds))) return 'in force';
  return p.kind ? `not in force: ${/^[aeiou]/.test(p.kind) ? 'an' : 'a'} ${p.kind} paragraph` : 'not in force: no kind';
}

function idView(state, id, full) {
  const t = qualify(id, null);
  const r = t.req ? state.requests.get(t.req) : null;
  const p = t.req ? r?.paras.get(t.id) : state.spec.get(t.id);
  if (!p) return null;
  const who = named(t.req, p.id);
  const own = r ? new Set(r.paras.keys()) : new Set();
  const body = [line('Paragraph', `${p.displayNumber} · ${p.kind ?? 'no kind'} · ${placeOf(p)}`), ...indent(p.text)];
  body.push(line('Status', statusOf(state, p, t.req)));
  const records = [];
  for (const s of p.links.serves) {
    const q = qualify(s, t.req);
    const rq = q.req && state.requests.get(q.req);
    const req = rq?.reqs.find((x) => x.id === q.id);
    body.push(line('Serves', req ? `${q.key} (${rq.dir}/request.md:${reqLine(rq, req.id)}) ${versionOf(rq, req)}: ${signState(state, rq, req)} (declared)` : `${q.key}: not found`));
    if (req && !records.includes(recordPath(rq.name))) records.push(recordPath(rq.name));
  }
  // The versions and sign-off states on the Serves lines are al's records' facts (LD-47).
  if (records.length === 1) body.push(line('Records', `only al's record ${records[0]} holds the version and the sign-off state on the Serves lines`));
  else if (records.length) body.push(line('Records', `only al's records ${records.join(', ')} hold the versions and the sign-off states on the Serves lines`));
  for (const [word, refs] of Object.entries(p.links)) {
    if (word === 'serves' || !refs.length) continue;
    body.push(line('Links', `${word} ${refs.map((ref) => `${ref} (${placeOfRef(state, ref, t.req, own)})`).join(', ')}`));
  }
  body.push(line('Linked', linkedTo(state, who)));
  if (!t.req) {
    const govern = [...state.adrs.values()].filter((a) => (a.head?.links.decides ?? []).includes(p.id) || p.links.governedBy.includes(a.id));
    body.push(line('Governed', govern.length ? `by ${govern.map((a) => `${a.id} (${adrPlace(a)}, ${a.status ?? 'no status'}${a.status === 'superseded' ? ': history' : ''})`).join(' · ')}` : 'by no ADR'));
  }
  body.push(openChanges(state, who));
  // Cited: its own marker line is no citation; a change spec's paragraph is
  // also cited by its bare ID inside its request's folder; `central:<ID>`
  // names this repo's item only in the central repo.
  const central = isCentral(state.config);
  body.push(...citedLines(state, t.req ? [who, p.id] : [p.id], {
    full,
    counts: (c) => !(c.file === p.file && c.line === p.line)
      && (c.ids.includes(who) || (central && c.ids.includes(`central:${who}`)) || (!!t.req && c.file.startsWith(`${r.dir}/`) && c.ids.includes(p.id))),
  }));
  body.push(...checkLines(state, t.req ? who : p.id, !t.req));
  const hints = hintsNow(state);
  if (hints) for (const f of hints.findings.filter((x) => x.id === who && x.severity !== 'info')) body.push(`  ${hints.line(f)}`);
  return { body, next: t.req ? `al context ${t.req}` : 'al check' };
}

// For an ID, its text in one line (LD-18, LD-47).
const oneLine = (text) => text.replace(/\s+/g, ' ').trim();

// The places that name `ids` as a whole word (the one cite finder), with
// `.assuredloop/` left out and only the lines that `counts` takes: one line
// for each file, with the count and every line number, so that no place is
// left out (light-resign/R1, LD-19); with `full`, each citing line's text.
// Historical: under requests/archive/, in an origin/ snapshot or in a
// superseded ADR; else current. Current files come first, each group by path.
function citedLines(state, ids, { counts = () => true, full = false } = {}) {
  const old = new Set(state.adrList.filter((a) => a.status === 'superseded').map((a) => a.file));
  const byFile = new Map();
  // A file that git cannot read may cite it: a limit, never "nowhere".
  const unread = [];
  for (const c of findCites(state.top, state.rev ?? null, { qualified: false, known: new Set(ids), exclude: ['.assuredloop', 'node_modules'], errors: unread })) {
    if (!counts(c)) continue;
    if (!byFile.has(c.file)) byFile.set(c.file, new Map());
    byFile.get(c.file).set(c.line, c.text);
  }
  const past = (file) => file.startsWith('requests/archive/') || /^requests\/[^/]+\/origin\//.test(file) || old.has(file);
  const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const files = [...byFile.keys()].sort(order);
  const out = [];
  for (const file of [...files.filter((f) => !past(f)), ...files.filter(past)]) {
    const at = [...byFile.get(file)].sort(([a], [b]) => a - b);
    out.push(line('Cited', `${past(file) ? 'historical' : 'current'} ${file}: ${at.length} line${at.length === 1 ? '' : 's'}: ${at.map(([n]) => n).join(', ')}`));
    if (full) out.push(...at.map(([n, text]) => `  ${file}:${n}: ${text}`));
  }
  if (!out.length) out.push(line('Cited', unread.length ? 'nowhere in the files that were read' : 'nowhere'));
  return [...out, ...unread.map((m) => line('Cited', `not known: ${m}`))];
}

// The paragraphs of the open requests whose links name `matches` (a key, as
// qualify gives it), each with its place.
function openNaming(state, matches) {
  const words = Object.fromEntries(Object.entries(LINK_WORDS).map(([w, k]) => [k, w]));
  const verbs = { changes: 'changes it', buildsOn: 'builds on it', removes: 'removes it' };
  const out = [];
  for (const r of [...state.requests.values()].filter((x) => x.open)) {
    const own = new Set(r.paras.keys());
    for (const p of r.paras.values()) {
      for (const [key, refs] of Object.entries(p.links)) {
        if (refs.some((ref) => matches(qualify(ref.replace(/^central:/, ''), r.name, own).key))) out.push(`${r.name}/${p.id} (${placeOf(p)}) ${verbs[key] ?? `${words[key]} it`}`);
      }
    }
  }
  return line('Open', out.length ? out.join(' · ') : 'no open change names it');
}

// al context ADR-<n> (LD-18): the ADR's status and heading, what replaced
// what, its decides links, what links to it, the open changes and the places
// that name it, each ID with its place.
function adrView(state, id, full) {
  const a = state.adrs.get(id);
  if (!a) return null;
  const head = `${adrPlace(a)}${a.head ? `: ${oneLine(a.paragraphs.map((p) => p.text).join('\n'))}` : ''}`;
  const supersedes = [...new Set((a.head?.links.supersedes ?? []).map((x) => /^(ADR-\d+)/.exec(x.replace(/^central:/, ''))?.[1]).filter(Boolean))];
  const by = [...new Set([...a.by, ...[...state.adrs.values()].filter((x) => (x.head?.links.supersedes ?? [])
    .some((s) => /^(ADR-\d+)/.exec(s.replace(/^central:/, ''))?.[1] === id)).map((x) => x.id)])];
  const decides = (a.head?.links.decides ?? []).map((x) => x.replace(/^central:/, ''));
  const placed = (x) => `${x} (${placeOfTarget(state, qualify(x, null)) ?? 'not found'})`;
  const body = [
    line('ADR', `${id} · ${a.line || 'no status'} · ${head}`),
    line('Replaced', `${supersedes.length ? `supersedes ${supersedes.map(placed).join(', ')}` : 'replaces no ADR'} · ${by.length ? `superseded by ${by.map(placed).join(', ')}` : 'not replaced'}`),
    line('Decides', decides.length ? decides.map(placed).join(', ') : 'nothing'),
    line('Linked', linkedTo(state, id)),
    openNaming(state, (k) => k === id || k.startsWith(`${id}-`)),
    // Its own file counts too, but for the marker lines of its own paragraphs.
    ...citedLines(state, [id, ...a.paragraphs.map((p) => p.id)], {
      full, counts: (c) => !state.adrList.some((x) => x.id === id && x.file === c.file && x.paragraphs.some((p) => p.line === c.line)),
    }),
  ];
  return { body, next: 'al check' };
}

// al context <name>/R<n> (LD-18): the requirement's text, version and
// sign-off state, the paragraphs that serve it, the open changes and the
// places that name it, each ID with its place.
function requirementView(state, t, full) {
  const r = state.requests.get(t.req);
  const q = r?.reqs.find((x) => x.id === t.id);
  if (!q) return null;
  const last = list(r.data?.signoff).map((s) => [s, list(s?.covers).find((c) => c?.id === q.id)]).filter(([, c]) => c).at(-1);
  const serves = (p, req) => p.links.serves.some((ref) => qualify(ref, req).key === t.key);
  const served = [
    ...[...state.spec.values()].filter((p) => serves(p, null)).map((p) => `${p.id} (${placeOf(p)})`),
    ...[...state.requests.values()].flatMap((x) => [...x.paras.values()].filter((p) => serves(p, x.name)).map((p) => `${x.name}/${p.id} (${placeOf(p)})`)),
  ];
  const body = [
    line('Requirement', `${t.key} ${versionOf(r, q)} · ${signState(state, r, q)} · ${r.dir}/request.md:${reqLine(r, q.id)}: ${q.title}: ${oneLine(q.text.split('\n').slice(1).join('\n'))}`),
    line('Signed', last ? `last signed: version ${last[1].version} in ${last[0].id} (only al's record ${recordPath(r.name)} holds this)` : 'never signed'),
    line('Served', served.length ? `by ${served.join(', ')} (declared serves links)` : 'by no paragraph'),
    openNaming(state, (k) => k === t.key),
    ...citedLines(state, [t.key], { full }),
  ];
  return { body, next: `al context ${t.req}` };
}

// The review view of a diff (design.md 13): each changed paragraph's text
// beside its kind, its requirement and the baseline paragraphs it touches.
function diffView(top, range, review) {
  const m = /^(.*?)(\.\.\.?)(.*)$/.exec(range);
  if (!m) throw new Fail(`--diff ${range}: give a range such as main...HEAD or A..B`, 'al context --diff main...HEAD --for review');
  const head = m[3] || 'HEAD';
  const from = m[1] || 'HEAD';
  const base = m[2] === '...' ? git(top, ['merge-base', from, head], { allowFail: true }) : git(top, ['rev-parse', '--verify', '--quiet', `${from}^{commit}`], { allowFail: true });
  const headSha = git(top, ['rev-parse', '--verify', '--quiet', `${head}^{commit}`], { allowFail: true });
  if (!base || !headSha) throw new Fail(`--diff ${range}: not a range of commits in this clone`, 'al context --diff main...HEAD --for review');
  const now = loadState(top, headSha);
  const was = loadState(top, base);
  const findings = review ? checks(top, { base }).findings : [];
  // The ADRs with no source link, which the view marks where it names them (schema.md 5).
  const unsourced = new Set([...now.adrs.values()].filter((a) => !a.head?.links.source.length).map((a) => a.id));
  const marks = (message) => [...new Set(message.match(/\bADR-\d+\b/g) ?? [])].filter((id) => unsourced.has(id)).map((id) => `; ${id} has no source:`).join('');
  const body = [];
  for (const scope of new Set([...now.scopes.keys(), ...was.scopes.keys()])) {
    const request = requestOf(scope);
    const h = new Map((now.scopes.get(scope) ?? []).map((p) => [p.id, p]));
    const b = new Map((was.scopes.get(scope) ?? []).map((p) => [p.id, p]));
    for (const c of diffParagraphs(was.scopes.get(scope) ?? [], now.scopes.get(scope) ?? [])) {
      const p = h.get(c.id) ?? b.get(c.id);
      const kindChange = h.get(c.id) && b.get(c.id) && h.get(c.id).kind !== b.get(c.id).kind;
      if (!c.changes.length && !kindChange) continue;
      const who = named(request, c.id);
      const change = [...c.changes, ...(kindChange ? [`kind ${b.get(c.id).kind} -> ${h.get(c.id).kind}`] : [])].join('+');
      body.push(`${who} ${p.kind ?? 'no kind'} ${change} · ${h.get(c.id) ? placeOf(p) : `${placeOf(p)} at the base ${base.slice(0, 7)}`}`);
      if (!review) continue;
      body.push(...indent(p.text).map((l) => `  ${l}`));
      for (const s of p.links.serves) {
        const q = qualify(s, request);
        const rq = q.req && now.requests.get(q.req);
        const req = rq?.reqs.find((x) => x.id === q.id);
        if (!req) { body.push(`  serves ${q.key}: not found`); continue; }
        body.push(`  serves ${q.key} ${versionOf(rq, req)}: ${signState(now, rq, req)}`);
        body.push(...indent(req.text.replace(/\n$/, '')).map((l) => `  ${l}`));
      }
      for (const [key, word] of [['buildsOn', 'builds on'], ['changes', 'changes'], ['removes', 'removes']]) {
        for (const ref of p.links[key]) {
          const id = ref.replace(/^central:/, '');
          const target = was.spec.get(id) ?? now.spec.get(id);
          body.push(`  ${word} ${id}${target ? ` (${target.kind ?? 'no kind'}):` : ': not found'}`);
          if (target) body.push(...indent(target.text).map((l) => `  ${l}`));
        }
      }
      if (!request) {
        for (const a of now.adrs.values()) {
          if ((a.head?.links.decides ?? []).includes(c.id) || p.links.governedBy.includes(a.id)) body.push(`  governed by ${a.id} (${a.status ?? 'no status'}${unsourced.has(a.id) ? '; no source:' : ''})`);
        }
      }
      for (const f of findings.filter((x) => x.id === who && x.severity !== 'info')) body.push(`  ${findingLine(f)}${marks(f.message)}`);
    }
  }
  if (!body.length) body.push('no paragraph changed in the range');
  return {
    body,
    read: `${range} (base ${base.slice(0, 7)}, head ${headSha.slice(0, 7)})${review ? '; hints from the working tree' : ''}`,
    next: review ? 'review each paragraph against its requirement and the baseline it touches' : `al context --diff ${range} --for review`,
  };
}

export function context({ top, args, opts }) {
  const [what] = args;
  if (opts.for !== undefined && opts.for !== 'review') throw new Fail(`--for ${opts.for}: only --for review`, 'al context --diff main...HEAD --for review');
  if (opts.diff !== undefined) {
    const out = diffView(top, opts.diff, opts.for === 'review');
    return { ...out, notKnown: ['whether each kind is right (the review judges that)', NOT_CHECKED] };
  }
  let rev = null;
  if (opts.at !== undefined) {
    rev = git(top, ['rev-parse', '--verify', '--quiet', `${opts.at}^{commit}`], { allowFail: true });
    if (!rev) throw new Fail(`--at ${opts.at}: no such commit in this clone`, 'al context --at <commit>');
  }
  const state = loadState(top, rev);
  const read = rev ? `commit ${rev.slice(0, 7)} (--at ${opts.at})` : 'working tree';
  const notKnown = [
    ...(rev ? ['the hints and the results at that commit (al check reads the working tree)'] : []),
    'the PRs that never named the request in a commit message',
  ];
  let out;
  if (what === undefined) {
    if (opts.audit) throw new Fail('--audit needs a request: al context <name> --audit', 'al context <name> --audit');
    out = projectView(state);
  } else if (/^ADR-\d+$/.test(what)) {
    out = adrView(state, what, opts.full);
    if (!out) throw new Fail(`${what}: no such ID${rev ? ` at ${rev.slice(0, 7)}` : ''}`, 'al spec lists the IDs');
  } else if (/^[a-z0-9][a-z0-9-]*\/[RQ]\d+$/.test(what)) {
    out = requirementView(state, qualify(what, null), opts.full);
    if (!out) throw new Fail(`${what}: no such ID${rev ? ` at ${rev.slice(0, 7)}` : ''}`, `al context ${what.split('/')[0]}`);
  } else if (/^[A-Z][A-Z0-9]*-\d+$/.test(what) || what.includes('/')) {
    out = idView(state, what, opts.full);
    if (!out) throw new Fail(`${what}: no such paragraph ID${rev ? ` at ${rev.slice(0, 7)}` : ''}`, 'al spec lists the IDs');
  } else {
    const r = state.requests.get(what);
    if (!r) throw new Fail(`${what}: no such request${rev ? ` at ${rev.slice(0, 7)}` : ''}`, 'al context lists the open requests');
    out = requestView(state, r, opts.audit);
  }
  return { body: out.body, read, next: out.next, notKnown };
}
