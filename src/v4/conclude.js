// al conclude <name> [--yes] (T11; design.md 5 The close rule, 6, 8): the
// only command that refuses. It reads the working tree, the closing PR's
// state, and refuses while a promise change has no signed requirement, a
// spike's current question is not signed, or a change paragraph with a
// baseline effect has no valid disposition for its current version. With
// --yes it writes the Outcome, sets the status and archives the request.
import { mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Fail, day, exists, guard, isName, now, write } from './base.js';
import { judgeRequest } from './dispositions.js';
import { git } from './git.js';
import { openRecord, recordText } from './records.js';
import { isPromise, loadState, qualify, servesSigned } from './state.js';
import { signState } from './views.js';

const NOT_KNOWN = ['whether the code, tests and documents do what the paragraphs say',
  'whether the work has ended: the tool does not take a merged task or a reconciled spec as evidence of that'];

// The reasons the close rule refuses, each naming its IDs; [] when it holds.
function reasons(state, r) {
  const out = [];
  if (r.spike) {
    if (!r.reqs.length) out.push(`the spike has no organized question to sign in ${r.dir}/request.md`);
    const unsigned = r.reqs.filter((q) => !signState(state, r, q).startsWith('signed'));
    if (unsigned.length) out.push(`the spike's current question is not signed: ${unsigned.map((q) => `${r.name}/${q.id} (${signState(state, r, q)})`).join(', ')}`);
    return { out, judged: [] };
  }
  const unsigned = [
    ...[...r.paras.values()].filter((p) => isPromise(state, p.kind) && !servesSigned(state, p, r.name)).map((p) => `${r.name}/${p.id}`),
    ...[...state.spec.values()].filter((p) => isPromise(state, p.kind) && p.links.serves.some((s) => qualify(s, null).req === r.name)
      && !servesSigned(state, p, null)).map((p) => p.id),
  ];
  if (unsigned.length) out.push(`a promise change with no signed requirement that covers it: ${unsigned.join(', ')}`);
  const judged = judgeRequest(state, r);
  const open = judged.filter((j) => j.status === 'pending' || !j.valid);
  if (open.length) {
    out.push(`no valid disposition for the current version of ${open.map((j) => `${j.id} (${j.status === 'pending' ? 'none' : `${j.status}, not valid: ${j.reason}`})`).join(', ')}`);
  }
  return { out, judged };
}

// The Outcome block: what became of each requirement, with the evidence and
// what is unknown.
function outcome(state, r, judged, top) {
  const head = git(top, ['rev-parse', '--short=7', 'HEAD'], { allowFail: true });
  const lines = ['## Outcome', '', `Concluded ${day(now())} with al conclude, on the working tree${head ? ` at ${head}` : ''}.`, ''];
  const shown = (j) => `  - ${j.p.id} ${j.p.kind}: ${j.status}${j.d?.spec ? `${j.status === 'incorporated' ? ' as' : ''} ${j.d.spec}` : ''}${j.d?.by ? ` by ${j.d.by}` : ''}${j.reason ? ` (${j.reason})` : ''}`;
  const placed = new Set();
  for (const q of r.reqs) {
    const version = (Array.isArray(r.data?.requirements) ? r.data.requirements : []).filter((v) => v?.id === q.id && v.sha256 === q.sha256).at(-1)?.version;
    const v = version ? `version ${version}` : 'version not indexed';
    if (r.spike) {
      lines.push(`- ${q.id} ${q.title}, ${v}, ${signState(state, r, q)}: the answer answers ${q.id} ${v}.`);
      continue;
    }
    lines.push(`- ${q.id} ${q.title}, ${v}, ${signState(state, r, q)}:`);
    const mine = judged.filter((j) => j.p.links.serves.some((s) => qualify(s, r.name).key === `${r.name}/${q.id}`));
    for (const j of mine) { lines.push(shown(j)); placed.add(j.id); }
    if (!mine.length) lines.push('  - no change paragraph serves it');
  }
  const rest = judged.filter((j) => !placed.has(j.id));
  if (rest.length) lines.push('- Other paragraphs with a baseline effect:', ...rest.map(shown));
  lines.push(`- Not known: ${NOT_KNOWN.join('; ')}.`, '');
  return lines;
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
  if (!isName(name)) throw new Fail(`${JSON.stringify(name ?? '')} is not a request name`, 'al-v4 conclude <name> [--yes]');
  const state = loadState(top);
  const r = state.requests.get(name);
  if (!r) throw new Fail(`no request named ${name}`, 'al-v4 context lists the open requests');
  if (!r.open) throw new Fail(`${name} is already archived (requests/archive/${name}); an archived request is not concluded again`, `al-v4 context ${name}`);
  const { out, judged } = reasons(state, r);
  if (out.length) {
    return {
      body: out.map((x) => `refused: ${x}`),
      read: 'working tree',
      next: `al-v4 context ${name}; sign, record the dispositions, or align what is named, then al-v4 index`,
      notKnown: NOT_KNOWN,
      exit: 1,
    };
  }
  const block = outcome(state, r, judged, top);
  const target = `requests/archive/${name}`;
  if (exists(top, target)) throw new Fail(`${target} already exists; a request name is never reused`, `al-v4 context ${name}`);
  const what = `Status: concluded, the Outcome in ${target}/request.md, status: concluded in the record, and ${r.dir}/ moved to ${target}/`;
  if (!opts.yes) {
    return { body: [`Would conclude ${name}: ${what}`, ...block.slice(2).map((l) => `  ${l}`)], read: 'working tree', next: 'run the same command with --yes to do it', notKnown: NOT_KNOWN };
  }
  const rec = openRecord(top, name);
  if (!rec) throw new Fail(`${name} has no record .assuredloop/records/requests/${name}.yaml`, 'a v4 request is made with al-v4 new');
  guard(top, [`${r.dir}/request.md`, `${target}/request.md`, rec.path]);
  const md = withOutcome(withStatus(r.md), block);
  rec.doc.set('status', 'concluded');
  mkdirSync(dirname(join(top, target)), { recursive: true });
  renameSync(join(top, r.dir), join(top, target));
  write(top, `${target}/request.md`, md);
  write(top, rec.path, recordText(rec));
  return { body: [`Concluded ${name}: ${what}`], read: 'working tree', next: 'commit the archive move with the closing PR', notKnown: NOT_KNOWN };
}
