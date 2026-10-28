// al conclude <name> [--yes] (T11; design.md 5 The close rule, 6, 8): the
// only command that refuses. It reads the working tree, the closing PR's
// state, and refuses while a promise change has no signed requirement, a
// spike's current question is not signed, or, on paths 2 and 3, a signed
// requirement has no declared link or a named spec paragraph is not changed
// or removed (close.js, LD-57), unless a current close line clears it
// (LD-62). A promise change of the branch, against its base (baseOf), counts
// as al check counts it (branchOf, #217). With --yes it writes the Outcome,
// sets the status and archives the request.
import { mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Fail, day, exists, guard, isName, now, write } from './base.js';
import { branchOf } from './checks.js';
import { closeLine, closeLines, closeRefusals, unsignedRemovals } from './close.js';
import { baseOf, git } from './git.js';
import { keepThroughConclude } from './evidence.js';
import { openRecord, recordText } from './records.js';
import { requestOriginals } from './originals.js';
import { isPromise, loadState, qualify, servesSigned } from './state.js';
import { signState } from './views.js';
import { mapSection } from './map.js';

const NOT_KNOWN = ['whether the code, tests and documents do what the paragraphs say',
  'whether the work has ended: the tool does not take a merged task or a reconciled spec as evidence of that'];

// The reasons the close rule refuses, each naming its IDs; [] when it holds.
// `branch` holds the branch's promise changes that no signed requirement
// covers; `was` is the base state, or null; `lines` the close lines.
function reasons(state, was, r, branch, lines) {
  const out = [];
  // Each original file of the request is checked again: a request closes only
  // with every one verified (origin-elsewhere/R1).
  const files = requestOriginals(state, r).filter((f) => f.status !== 'verified');
  if (files.length) out.push(`an original file of ${r.name} is not checked or does not match its record: ${files.map((f) => `${f.file} (${f.status}: ${f.problem})`).join(', ')}`);
  if (r.spike) {
    if (branch.length) out.push(`a promise change with no signed requirement that covers it: ${branch.map((c) => c.name).join(', ')}`);
    if (!r.reqs.length) out.push(`the spike has no organized question to sign in ${r.dir}/request.md`);
    const unsigned = r.reqs.filter((q) => !signState(state, r, q).startsWith('signed'));
    if (unsigned.length) out.push(`the spike's current question is not signed: ${unsigned.map((q) => `${r.name}/${q.id} (${signState(state, r, q)})`).join(', ')}`);
    return out;
  }
  // 1. No recorded reason replaces a sign-off (light-resign/R5).
  const removals = unsignedRemovals(state, was, r);
  const unsigned = [
    ...[...r.paras.values()].filter((p) => isPromise(state, p.kind) && !servesSigned(state, p, r.name)).map((p) => `${r.name}/${p.id}`),
    ...[...state.spec.values()].filter((p) => isPromise(state, p.kind) && p.links.serves.some((s) => qualify(s, null).req === r.name)
      && !servesSigned(state, p, null)).map((p) => p.id),
    ...removals.map((x) => x.line),
    ...branch.filter((c) => !removals.some((x) => x.id === c.name)).map((c) => c.name),
  ];
  if (unsigned.length) out.push(`a promise change with no signed requirement that covers it: ${[...new Set(unsigned)].join(', ')}`);
  // 2 and 3, on paths 2 and 3.
  out.push(...closeRefusals(state, was, r, lines));
  return out;
}

// The Outcome block: what became of each requirement, with the evidence and
// what is unknown.
function outcome(state, r, lines, top) {
  const head = git(top, ['rev-parse', '--short=7', 'HEAD'], { allowFail: true });
  const out = ['## Outcome', '', `Concluded ${day(now())} with al conclude, on the working tree${head ? ` at ${head}` : ''}.`, ''];
  const closed = (c) => `  - close line ${c.e.id}, ${c.current ? 'current' : 'stale'}: ${c.e.reason}`;
  const byOn = new Map(lines.map((c) => [String(c.e.on), c]));
  for (const q of r.reqs) {
    const version = (Array.isArray(r.data?.requirements) ? r.data.requirements : []).filter((v) => v?.id === q.id && v.sha256 === q.sha256).at(-1)?.version;
    const v = version ? `version ${version}` : 'version not indexed';
    if (r.spike) {
      out.push(`- ${q.id} ${q.title}, ${v}, ${signState(state, r, q)}: the answer answers ${q.id} ${v}.`);
      continue;
    }
    out.push(`- ${q.id} ${q.title}, ${v}, ${signState(state, r, q)}:`);
    const key = `${r.name}/${q.id}`;
    const mine = [...r.paras.values()].filter((p) => p.links.serves.some((s) => qualify(s, r.name).key === key));
    for (const p of mine) out.push(`  - ${p.id} ${p.kind ?? '-'}: in the change spec, serves it`);
    // A path-1 promise is served by the spec paragraph itself (design.md 5).
    const inSpec = [...state.spec.values()].filter((p) => p.links.serves.some((s) => qualify(s, null).key === key));
    for (const p of inSpec) out.push(`  - ${p.id} ${p.kind ?? '-'}: in ${p.file}, serves it`);
    // An ADR whose `decides:` names the requirement is evidence too (#41).
    const decided = [...state.adrs.values()].filter((a) => (a.head?.links.decides ?? []).some((s) => qualify(s, null).key === key));
    for (const a of decided) out.push(`  - ${a.id}: decides it (${a.status ?? 'no status'})`);
    if (byOn.has(q.id)) out.push(closed(byOn.get(q.id)));
    if (!inSpec.length && !decided.length) out.push('  - no declared paragraph link: no paragraph of specs/ serves it, and no ADR decides it');
  }
  const notDelivered = lines.filter((c) => r.paras.has(String(c.e.on)));
  if (notDelivered.length) out.push('- Change paragraphs named as not delivered:', ...notDelivered.map((c) => `  - ${c.e.on}: ${closed(c).trim().slice(2)}`));
  out.push(`- Not known: ${NOT_KNOWN.join('; ')}.`, '');
  return out;
}

const withStatus = (md) => (/\bStatus:\s*\S+/.test(md) ? md.replace(/\bStatus:\s*\S+/, 'Status: concluded')
  : md.replace(/^(.*\n)/, '$1Status: concluded\n'));

function withOutcome(md, block) {
  const lines = md.replace(/\r\n?/g, '\n').replace(/\n*$/, '\n').split('\n');
  const at = lines.findIndex((l) => /^##\s+Outcome\s*$/.test(l));
  if (at < 0) return `${lines.join('\n').replace(/\n*$/, '\n')}\n${block.join('\n')}`;
  let end = lines.findIndex((l, i) => i > at && /^#{1,2}\s/.test(l));
  if (end < 0) end = lines.length;
  return [...lines.slice(0, at), ...block, ...lines.slice(end)].join('\n').replace(/\n*$/, '\n');
}

export function conclude({ top, args, opts }) {
  const [name] = args;
  if (!isName(name)) throw new Fail(`${JSON.stringify(name ?? '')} is not a request name`, 'al conclude <name> [--yes]');
  const state = loadState(top);
  const r = state.requests.get(name);
  if (!r) throw new Fail(`no request named ${name}`, 'al context lists the open requests');
  if (!r.open) throw new Fail(`${name} is already archived (requests/archive/${name}); an archived request is not concluded again`, `al context ${name}`);
  // A record that cannot be read refuses first: the reasons below need it (DES-37).
  const rec = openRecord(top, name);
  if (!rec) throw new Fail(`${name} has no record .assuredloop/records/requests/${name}.yaml`, 'a v4 request is made with al new');
  const found = baseOf(top);
  const base = found?.commit ?? null;
  // A promise change whose sign-off cannot be checked here is not counted as signed.
  const was = base ? loadState(top, base) : null;
  const promises = base ? branchOf(top, state, was, base) : null;
  const branch = promises ? [...promises.uncovered, ...promises.unknown] : [];
  // The two hints of the map, shown again before it closes; they never refuse (LD-60).
  const hints = base ? mapSection(top, { now: state, was, base, own: [r], changes: promises.changes, config: state.config }).findings
    .map((f) => `${f.severity} ${f.code} ${f.where} ${f.id} ${f.message}`) : [];
  const read = base ? `working tree · base ${base.slice(0, 7)} (merge-base with ${found.ref})` : 'working tree · no base';
  const notKnown = base ? NOT_KNOWN : ['the promise changes of the branch: no base (no main branch, or no commit)', ...NOT_KNOWN];
  const lines = r.spike ? [] : closeLines(state, r);
  const shown = lines.map((c) => closeLine(r, c));
  const out = reasons(state, was, r, branch, lines);
  if (out.length) {
    return {
      body: [...hints, ...shown, ...out.map((x) => `refused: ${x}`)],
      read,
      next: `al context ${name}; sign, link, consolidate, or record a close line (al record ${name} close), then al index`,
      notKnown,
      exit: 1,
    };
  }
  const block = outcome(state, r, lines, top);
  const target = `requests/archive/${name}`;
  if (exists(top, target)) throw new Fail(`${target} already exists; a request name is never reused`, `al context ${name}`);
  // The preview refuses for each reason that --yes refuses (#241).
  guard(top, [`${r.dir}/request.md`, `${target}/request.md`, rec.path]);
  if (statSync(join(top, dirname(target)), { throwIfNoEntry: false })?.isDirectory() === false) {
    throw new Fail(`${dirname(target)} is not a folder; nothing was written`, `make ${dirname(target)} a folder, then al conclude ${name} again`);
  }
  const what = `Status: concluded, the Outcome in ${target}/request.md, status: concluded in the record, and ${r.dir}/ moved to ${target}/`;
  if (!opts.yes) {
    return { body: [...hints, ...shown, `Would conclude ${name}: ${what}`, ...block.slice(2).map((l) => `  ${l}`)], read, next: 'run the same command with --yes to do it', notKnown };
  }
  const md = withOutcome(withStatus(r.md), block);
  rec.doc.set('status', 'concluded');
  // A review judgement that is current before the move stays current (DES-154).
  const keep = keepThroughConclude(top, base, state.config);
  mkdirSync(dirname(join(top, target)), { recursive: true });
  renameSync(join(top, r.dir), join(top, target));
  write(top, `${target}/request.md`, md);
  keep(rec);
  write(top, rec.path, recordText(rec));
  return { body: [...hints, ...shown, `Concluded ${name}: ${what}`], read, next: 'commit the archive move with the closing PR', notKnown };
}
