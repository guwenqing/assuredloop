// al context (T11; design.md 5, 8, 9 and 13, schema.md 5): where the project,
// a request or a paragraph stands; the review view of a diff; the whole trace
// with --audit; any of them as of a v4 commit with --at. Views never write.
import { Fail } from './base.js';
import { applicability, checks } from './checks.js';
import { judge, judgeRequest } from './dispositions.js';
import { git, mergeBase, mergeOf } from './git.js';
import { crossRepo } from './repos.js';
import { diffParagraphs } from './ids.js';
import { loadResults } from './results.js';
import { latestVersion, loadState, named, qualify, requestOf, resolve, signed } from './state.js';

export const line = (label, text) => `${label.length < 10 ? label.padEnd(10) : `${label} `}${text}`;
const list = (x) => (Array.isArray(x) ? x : []);
const short = (h) => (h ? String(h).slice(0, 12) : 'none');
const indent = (text) => text.split('\n').map((l) => `  ${l}`);

export const NOT_CHECKED = 'whether each kind is right; whether a requirement is fully covered; whether a test really checks the rule it names; '
  + 'whether a result\'s declared inputs are complete; whether a change is authorized in substance (the review judges these)';

// The sign-off state of one requirement or question: "signed in S1",
// "changed since S1" or "not signed".
export function signState(state, r, q) {
  if (signed(state, r.name, q.id)) {
    const s = list(r.data?.signoff).filter((x) => list(x?.covers).some((c) => c?.id === q.id && c.sha256 === q.sha256)).at(-1);
    return `signed in ${s.id}`;
  }
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

// "<N> paragraphs, <M> with a baseline effect: <a> incorporated, ... [, <k> not valid]".
export function dispositionLine(r, judged) {
  const counts = ['incorporated', 'pending', 'removed', 'abandoned', 'superseded']
    .map((s) => [s, judged.filter((j) => j.status === s).length]).filter(([, n]) => n);
  const invalid = judged.filter((j) => j.status !== 'pending' && !j.valid).length;
  return `${r.paras.size} paragraphs, ${judged.length} with a baseline effect: ${counts.map(([s, n]) => `${n} ${s}`).join(', ') || 'none'}${invalid ? `, ${invalid} not valid` : ''}`;
}

const judgedLine = (j) => `  ${j.p.id} ${j.p.kind} ${j.status}${j.d?.spec ? ` ${j.d.spec}` : ''}${j.d?.by ? ` by ${j.d.by}` : ''}`
  + `${j.status === 'pending' ? '' : j.valid ? ` · valid${j.reason ? ` (${j.reason})` : ''}` : ` · not valid: ${j.reason}`}`;

// The files that name each spec ID (cites, exact): every file outside the
// spec root, requests/ and .assuredloop/, in the working tree or at `rev`.
function citesOf(state) {
  const args = ['grep', '-I', '-o', '-w', ...(state.rev ? [] : ['--untracked']), '-E', '-e', '[A-Z][A-Z0-9]*-[0-9]+', ...(state.rev ? [state.rev] : [])];
  args.push('--', '.', `:!${state.root}`, ':!requests', ':!.assuredloop', ':!node_modules');
  const out = git(state.top, args, { allowFail: true }) ?? '';
  const cites = new Map();
  for (const l of out.split('\n').filter(Boolean)) {
    const parts = l.split(':');
    const id = parts.pop();
    const file = (state.rev ? parts.slice(1) : parts).join(':');
    if (!cites.has(id)) cites.set(id, new Set());
    cites.get(id).add(file);
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
  return {
    checks: [
      ...files.filter((f) => isTest(f) || named.has(f)).map((file) => ({ file, how: 'cites it' })),
      ...outside.filter((c) => isTest(c.file)).map((c) => ({ file: `${c.repo}/${c.file}`, how: `cites it (at ${c.repo}@${c.commit.slice(0, 7)})`, repo: c.repo, path: c.file })),
      ...(verifies.get(id) ?? []).map((file) => ({ file, how: 'verifies it (a claim)' })),
    ],
    other: [...files.filter((f) => !isTest(f) && !named.has(f)), ...outside.filter((c) => !isTest(c.file)).map((c) => `${c.repo}/${c.file}`)],
  };
}

// The files of output repos that cite `central:<id>` (T12, exact), from crossRepo.
const crossCites = (cross, id) => (cross?.links ?? []).filter((l) => l.link === 'cites' && l.target === `central:${id}` && l.commit)
  .map((l) => ({ repo: l.repo, file: l.file, commit: l.commit }));

// The cross-repo facts of the working tree, or null at --at (crossRepo reads the working tree's config).
const crossOf = (state) => (state.rev ? null : crossRepo(state.top));
const showChecks = ({ checks, other }) => `${checks.length ? checks.map((c) => `${c.file} ${c.how}`).join(' · ') : 'none'}`
  + `${other.length ? ` · also named in ${other.join(', ')} (not a test: no check)` : ''}`;

// The section of a spec paragraph from its display number: "1 Export links".
const sectionOf = (p) => {
  const m = /\((\d+(?:\.\d+)*):\d+, in (.*)\)$/.exec(p.displayNumber ?? '');
  return m ? `${m[1]} ${m[2]}` : '-';
};

// Coverage lines per section of the spec rules in `rules`, each rule with its checks.
function coverage(state, rules, perRule) {
  const cites = citesOf(state);
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
        out.push(`  ${p.id} rule: ${showChecks(checksOf(p.id, cites, verifies, named, cross))}`);
      }
    }
  }
  if (!out.length) out.push(line('Coverage', 'no rule'));
  return out;
}

// The PRs that name the request, from the commit messages of main (or of the
// selected commit): "#46 (abc1234)". Exact facts from git.
function prsFromGit(state, name) {
  const rev = state.rev ?? (git(state.top, ['rev-parse', '--verify', '--quiet', 'main'], { allowFail: true }) ? 'main' : 'HEAD');
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
  const rev = state.rev ?? (git(state.top, ['rev-parse', '--verify', '--quiet', 'main'], { allowFail: true }) ? 'main' : 'HEAD');
  const self = new Set(['central', ...(typeof state.config.repo === 'string' ? [state.config.repo] : [])]);
  const cross = crossOf(state);
  const repos = new Map((cross?.repos ?? []).map((x) => [x.name, x]));
  return (task, pr) => {
    const m = /^(?:([A-Za-z0-9][A-Za-z0-9._-]*))?#(\d+)$/.exec(pr);
    if (!m) return '(not a PR reference)';
    if (!m[1] || self.has(m[1])) {
      const merge = mergeOf(state.top, rev, m[2]);
      return merge ? `merged at ${merge.slice(0, 7)}` : `no merge found in ${rev === 'main' ? 'main' : rev.slice(0, 7)}`;
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
const findingLine = (f) => `${f.severity} ${f.code} ${f.where} ${f.id} ${f.message}`;

function hintsNow(state) {
  if (state.rev) return null;
  return checks(state.top, { base: mergeBase(state.top) }).findings;
}

// --- the views

function projectView(state) {
  const body = [];
  const open = [...state.requests.values()].filter((r) => r.open);
  for (const r of open) {
    const tier = r.tier ? `tier ${r.tier}` : 'no tier';
    const d = r.spike ? 'a spike: no dispositions' : dispositionLine(r, judgeRequest(state, r));
    body.push(line('Request', `${r.name} · ${tier} · ${signSummary(state, r)} · ${d}`));
  }
  if (!open.length) body.push(line('Request', 'no open request'));
  body.push(...coverage(state, [...state.spec.values()].filter((p) => p.kind === 'rule'), false));
  const findings = hintsNow(state);
  if (findings) {
    const n = (s) => findings.filter((f) => f.severity === s).length;
    body.push(line('Hints', `${n('hint')} hints, ${n('not ok')} not ok (al-v4 check lists them)`));
  }
  body.push(line('Not checked', NOT_CHECKED));
  return { body, next: open.length ? `al-v4 context <name>, for example al-v4 context ${open[0].name}` : 'al-v4 new <name> --from <file|->', findings };
}

function requestView(state, r, audit) {
  const body = [];
  body.push(line('Request', `${r.name} · ${r.tier ? `tier ${r.tier}` : 'no tier'} · ${r.open ? 'open' : 'archived'}${r.spike ? ' · a spike' : ''} · ${r.dir}`));
  for (const q of r.reqs) body.push(`  ${q.id} ${versionOf(r, q)} (${q.title}): ${signState(state, r, q)}`);
  if (!r.reqs.length) body.push('  no organized requirement yet');
  for (const d of list(r.data?.decisions)) body.push(line('Decision', `${d.id} (${d.source ?? 'no source'}): ${d.text ?? d.summary ?? ''}`));
  const prFacts = taskPrs(state, r);
  for (const t of list(r.data?.tasks)) {
    const prs = [].concat(t.prs ?? []).map((pr) => `${pr} ${prFacts(t.id, String(pr))}`);
    body.push(line('Task', `${t.id} ${t.ref ?? ''}${t.delivers ? ` · delivers ${[].concat(t.delivers).join(', ')}` : ''}${prs.length ? ` · PRs: ${prs.join(', ')}` : ''}`));
  }
  const prs = prsFromGit(state, r.name);
  body.push(`PRs from git: ${prs.length ? prs.join(' · ') : 'none found'}`);
  const judged = judgeRequest(state, r);
  if (r.spike) body.push(line('Dispositions', 'a spike: its change spec stays as history and needs no disposition'));
  else {
    body.push(line('Dispositions', dispositionLine(r, judged)));
    body.push(...judged.map(judgedLine));
  }
  const rules = [...state.spec.values()].filter((p) => p.kind === 'rule'
    && p.links.serves.some((s) => qualify(s, null).req === r.name));
  body.push(...coverage(state, rules, true));
  if (audit) body.push(...auditLines(state, r));
  const findings = hintsNow(state);
  if (findings) {
    const mine = hintsFor(findings, r.name);
    body.push(line('Hints', mine.length ? `${mine.length}` : 'none'));
    body.push(...mine.map((f) => `  ${findingLine(f)}`));
  }
  body.push(line('Not checked', NOT_CHECKED));
  const pending = judged.filter((j) => j.status === 'pending' || !j.valid);
  return {
    body,
    next: !r.open ? `al-v4 context ${r.name} --audit` : pending.length ? `give ${pending.map((j) => j.p.id).join(', ')} a valid disposition in ${`.assuredloop/records/requests/${r.name}.yaml`}, then al-v4 index`
      : `al-v4 conclude ${r.name}`,
  };
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
  for (const d of list(data.dispositions)) {
    const sid = qualify(String(d?.source ?? ''), r.name);
    const p = r.paras.get(sid.id);
    let st;
    if (d?.source === 'adoption') st = 'adoption';
    else if (!r.open) st = 'as recorded at the close; not checked again';
    else if (!p) st = 'source not found';
    else if (d.source_sha256 && d.source_sha256 !== p.sha256) st = 'history (an earlier version)';
    else { const v = judge(state, r, p, d); st = v.valid ? 'valid' : `not valid: ${v.reason}`; }
    out.push(line('Disp.', `${d?.source} ${short(d?.source_sha256)} ${d?.disposition}${d?.spec ? ` ${d.spec} ${short(d.spec_sha256)}` : ''}${d?.by ? ` by ${d.by}` : ''}${d?.decision ? ` decision ${d.decision}` : ''}: ${st}`));
  }
  if (!state.rev) for (const res of loadResults(state.top)) out.push(line('Result', `${res.file} ${res.check ?? ''} ${res.outcome ?? ''}: ${res.problems.length ? `not valid: ${res.problems.join('; ')}` : applicability(state.top, res)}`));
  return out;
}

// The Checks line of a paragraph and the Result lines of its checks: this
// repo's (a spec ID only, `local`) and the output repos'.
function checkLines(state, id, local) {
  const cross = crossOf(state);
  const found = checksOf(id, local ? citesOf(state) : new Map(), verifiesOf(state), local ? resultChecks(state) : new Set(), cross);
  const out = [line('Checks', showChecks(found))];
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

function idView(state, id) {
  const t = qualify(id, null);
  const r = t.req ? state.requests.get(t.req) : null;
  const p = t.req ? r?.paras.get(t.id) : state.spec.get(t.id);
  if (!p) return null;
  const who = named(t.req, p.id);
  const body = [line('Paragraph', `${p.displayNumber} · ${p.kind ?? 'no kind'} · ${p.file}:${p.line}`), ...indent(p.text)];
  for (const s of p.links.serves) {
    const q = qualify(s, t.req);
    const rq = q.req && state.requests.get(q.req);
    const req = rq?.reqs.find((x) => x.id === q.id);
    body.push(line('Serves', req ? `${q.key} ${versionOf(rq, req)}: ${signState(state, rq, req)} (declared)` : `${q.key}: not found`));
  }
  for (const [word, refs] of Object.entries(p.links)) {
    if (word === 'serves' || !refs.length) continue;
    body.push(line('Links', `${word} ${refs.join(', ')}`));
  }
  if (!t.req) {
    const govern = [...state.adrs.values()].filter((a) => (a.head?.links.decides ?? []).includes(p.id) || p.links.governedBy.includes(a.id));
    body.push(line('Governed', govern.length ? `by ${govern.map((a) => `${a.id} (${a.status ?? 'no status'}${a.status === 'superseded' ? ': history' : ''})`).join(' · ')}` : 'by no ADR'));
    const changes = [];
    for (const o of [...state.requests.values()].filter((x) => x.open)) {
      for (const q of o.paras.values()) {
        for (const [key, verb] of [['changes', 'changes it'], ['buildsOn', 'builds on it'], ['removes', 'removes it']]) {
          if (q.links[key].map((x) => x.replace(/^central:/, '')).includes(p.id)) changes.push(`${o.name}/${q.id} ${verb}`);
        }
      }
    }
    body.push(line('Open', changes.length ? changes.join(' · ') : 'no open change builds on or changes it'));
    body.push(...checkLines(state, p.id, true));
    for (const o of state.requests.values()) {
      for (const d of list(o.data?.dispositions)) {
        if (d?.spec !== p.id) continue;
        body.push(line('Disp.', `${d.source} ${d.disposition}${d.by ? ` by ${d.by}` : ''}${o.open ? '' : ' (archived)'}`));
      }
    }
  } else {
    body.push(...checkLines(state, who, false));
    const d = judgeRequest(state, r).find((j) => j.p.id === p.id);
    if (d) body.push(line('Disp.', judgedLine(d).trim()));
  }
  const findings = hintsNow(state);
  if (findings) for (const f of findings.filter((x) => x.id === who && x.severity !== 'info')) body.push(`  ${findingLine(f)}`);
  return { body, next: t.req ? `al-v4 context ${t.req}` : 'al-v4 check' };
}

// The review view of a diff (design.md 13): each changed paragraph's text
// beside its kind, its requirement and the baseline paragraphs it touches.
function diffView(top, range, review) {
  const m = /^(.*?)(\.\.\.?)(.*)$/.exec(range);
  if (!m) throw new Fail(`--diff ${range}: give a range such as main...HEAD or A..B`, 'al-v4 context --diff main...HEAD --for review');
  const head = m[3] || 'HEAD';
  const from = m[1] || 'HEAD';
  const base = m[2] === '...' ? git(top, ['merge-base', from, head], { allowFail: true }) : git(top, ['rev-parse', '--verify', '--quiet', `${from}^{commit}`], { allowFail: true });
  const headSha = git(top, ['rev-parse', '--verify', '--quiet', `${head}^{commit}`], { allowFail: true });
  if (!base || !headSha) throw new Fail(`--diff ${range}: not a range of commits in this clone`, 'al-v4 context --diff main...HEAD --for review');
  const now = loadState(top, headSha);
  const was = loadState(top, base);
  const findings = review ? checks(top, { base }).findings : [];
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
      body.push(`${who} ${p.kind ?? 'no kind'} ${change} · ${p.file}:${p.line}`);
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
          if ((a.head?.links.decides ?? []).includes(c.id) || p.links.governedBy.includes(a.id)) body.push(`  governed by ${a.id} (${a.status ?? 'no status'})`);
        }
      }
      for (const f of findings.filter((x) => x.id === who && x.severity !== 'info')) body.push(`  ${findingLine(f)}`);
    }
  }
  if (!body.length) body.push('no paragraph changed in the range');
  return {
    body,
    read: `${range} (base ${base.slice(0, 7)}, head ${headSha.slice(0, 7)})${review ? '; hints from the working tree' : ''}`,
    next: review ? 'review each paragraph against its requirement and the baseline it touches' : `al-v4 context --diff ${range} --for review`,
  };
}

export function context({ top, args, opts }) {
  const [what] = args;
  if (opts.for !== undefined && opts.for !== 'review') throw new Fail(`--for ${opts.for}: only --for review`, 'al-v4 context --diff main...HEAD --for review');
  if (opts.diff !== undefined) {
    const out = diffView(top, opts.diff, opts.for === 'review');
    return { ...out, notKnown: ['whether each kind is right (the review judges that)', NOT_CHECKED] };
  }
  let rev = null;
  if (opts.at !== undefined) {
    rev = git(top, ['rev-parse', '--verify', '--quiet', `${opts.at}^{commit}`], { allowFail: true });
    if (!rev) throw new Fail(`--at ${opts.at}: no such commit in this clone`, 'al-v4 context --at <commit>');
  }
  const state = loadState(top, rev);
  const read = rev ? `commit ${rev.slice(0, 7)} (--at ${opts.at})` : 'working tree';
  const notKnown = [
    ...(rev ? ['the hints and the results at that commit (al-v4 check reads the working tree)'] : []),
    'the PRs that never named the request in a commit message',
  ];
  let out;
  if (what === undefined) {
    if (opts.audit) throw new Fail('--audit needs a request: al-v4 context <name> --audit', 'al-v4 context <name> --audit');
    out = projectView(state);
  } else if (/^[A-Z][A-Z0-9]*-\d+$/.test(what) || what.includes('/')) {
    out = idView(state, what);
    if (!out) throw new Fail(`${what}: no such paragraph ID${rev ? ` at ${rev.slice(0, 7)}` : ''}`, 'al-v4 spec lists the IDs');
  } else {
    const r = state.requests.get(what);
    if (!r) throw new Fail(`${what}: no such request${rev ? ` at ${rev.slice(0, 7)}` : ''}`, 'al-v4 context lists the open requests');
    out = requestView(state, r, opts.audit);
  }
  return { body: out.body, read, next: out.next, notKnown };
}
