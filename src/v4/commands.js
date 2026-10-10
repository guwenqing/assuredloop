// al new and al record origin|signoff|decision, v4: they write the request's
// text and snapshots as before, and the request record beside them.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stringify } from 'yaml';
import { Fail, SCHEMA, STAMP, day, exists, freeName, guard, isName, now, read, recordPath, sha256, stamp, write } from './base.js';
import { formatSnapshot, slug } from './snapshot.js';
import { addDecision, decisionNumbers, requirements, setSignedOff, signedText } from './request-md.js';
import { YAML_OPTIONS, addVersions, append, highest, latest, openRecord, recordText } from './records.js';

const TIERS = ['1', '1d', '2', '3', 'S'];

function readInput(from, cwd) {
  if (from === undefined) throw new Fail('--from <file|-> is missing', 'pass the text with --from <file>, or --from - on standard input');
  try {
    return from === '-' ? readFileSync(0) : readFileSync(resolve(cwd, from));
  } catch (e) {
    throw new Fail(`cannot read ${from}: ${e.code || e.message}`);
  }
}

// al new <name> --from <file|-> [--title <t>] [--tier 1|1d|2|3|S]
export function newRequest({ top, cwd, args, opts }) {
  const [name] = args;
  oneLine(opts, ['title']);
  if (!isName(name)) throw new Fail(`bad request name ${JSON.stringify(name ?? '')}: use lowercase letters, digits and hyphens`, 'al new <name> --from <file|->');
  if (opts.tier === '0') throw new Fail('tier 0 has no record: a fix says so in its PR', 'al new <name> --tier 1 (or higher) when the work changes a promise');
  if (opts.tier !== undefined && !TIERS.includes(opts.tier)) throw new Fail(`bad tier ${opts.tier}: one of ${TIERS.join(', ')}`);
  const used = [`requests/${name}`, `requests/archive/${name}`, recordPath(name)].find((p) => exists(top, p));
  if (used) throw new Fail(`the name ${name} is already used (${used}); a request name is never reused`, 'al new <another name> --from <file|->');
  const words = readInput(opts.from, cwd);
  if (words.length === 0) throw new Fail('no owner\'s words given', 'pass the words with --from <file> or on standard input');

  const when = now();
  const file = `${day(when)}-owner-words.md`;
  const dir = `requests/${name}`;
  guard(top, [`${dir}/origin/${file}`, `${dir}/request.md`, recordPath(name)]);
  write(top, `${dir}/origin/${file}`, formatSnapshot({ source: opts.from === '-' ? 'standard input' : opts.from, fetched: stamp(when), text: words }));
  write(top, `${dir}/request.md`, [
    `# ${opts.title ?? name}`,
    opts.tier === undefined ? 'Status: open' : `Tier: ${opts.tier} · Status: open`,
    '',
    '## Owner\'s words and dialog',
    '',
    `- ${day(when)} the owner's words, snapshot origin/${file}`,
    '',
  ].join('\n'));
  const record = {
    schema: SCHEMA,
    request: name,
    ...(opts.tier === undefined ? {} : { tier: opts.tier }),
    status: 'open',
    sources: [{ file, kind: 'owner-words', sha256: sha256(words), taken: stamp(when) }],
    requirements: [], signoff: [], decisions: [], tasks: [], bindings: [], dispositions: [],
  };
  write(top, recordPath(name), stringify(record, YAML_OPTIONS));
  return {
    body: [`Wrote ${dir}/request.md, ${dir}/origin/${file} and ${recordPath(name)}`],
    next: `write the organized requirement in ${dir}/request.md, then al index`,
  };
}

// The folder and record of an open request that the tool may write.
function openRequest(top, name) {
  if (!isName(name)) throw new Fail(`${JSON.stringify(name ?? '')} is not a request name`);
  if (!exists(top, `requests/${name}/request.md`)) {
    if (exists(top, `requests/archive/${name}`)) throw new Fail(`${name} is archived, and an archived request is not edited`, 'start a new request: al new <name> --from <file|->');
    throw new Fail(`no request named ${name}`, 'al new <name> --from <file|->');
  }
  const rec = openRecord(top, name);
  if (!rec) throw new Fail(`${name} has no record ${recordPath(name)}`, 'a v4 request is made with al new');
  return { dir: `requests/${name}`, rec };
}

const oneLine = (opts, keys) => {
  const bad = keys.find((k) => /[\r\n]/.test(opts[k] ?? ''));
  if (bad) throw new Fail(`--${bad} holds a line break; it takes one line`);
};

// al record <name> origin|signoff|decision ...
export function record(ctx) {
  const [, kind] = ctx.args;
  if (kind === 'origin') return recordOrigin(ctx);
  if (kind === 'signoff') return recordSignoff(ctx);
  if (kind === 'decision') return recordDecision(ctx);
  throw new Fail(`record ${kind ?? ''}: al record <name> origin|signoff|decision`);
}

// al record <name> origin --url <source> --from <file|-> [--fetched <stamp>] [--yes]
function recordOrigin({ top, cwd, args, opts }) {
  const [name] = args;
  oneLine(opts, ['url']);
  if (!opts.url) throw new Fail('--url <source> is missing', `al record ${name} origin --url <source> --from -`);
  if (opts.fetched !== undefined && !STAMP.test(opts.fetched)) throw new Fail(`--fetched ${opts.fetched}: write it as YYYY-MM-DDTHH:MMZ`);
  const { dir, rec } = openRequest(top, name);
  const text = readInput(opts.from, cwd);
  if (text.length === 0) throw new Fail('the text is empty', 'pass the text with --from <file> or on standard input');
  const fetched = opts.fetched ?? stamp(now());
  const file = freeName(top, `${dir}/origin`, `${fetched.slice(0, 10)}-${slug(opts.url)}`);
  const snapshot = formatSnapshot({ source: opts.url, fetched, text });
  const shown = snapshot.toString('utf8').replace(/\n$/, '').split('\n');
  if (!opts.yes) return { body: [`Would write ${dir}/origin/${file}:`, ...shown], next: 'run the same command with --yes to write it' };
  guard(top, [`${dir}/origin/${file}`, rec.path]);
  append(rec, 'sources', { file, kind: 'owner-words', sha256: sha256(text), taken: fetched, url: opts.url });
  write(top, `${dir}/origin/${file}`, snapshot);
  write(top, rec.path, recordText(rec));
  return { body: [`Wrote ${dir}/origin/${file} and source ${file} in ${rec.path}`], next: `name it in a requirement's marker: <!-- R<n> from:${file} -->` };
}

// al record <name> signoff --source <where> [--words <quote>] [--presented <x>] [--transcribed-by <who>] [--yes]
function recordSignoff({ top, args, opts }) {
  const [name] = args;
  oneLine(opts, ['source', 'words', 'presented', 'transcribed-by']);
  if (!opts.source) throw new Fail('--source <where the owner signed> is missing', `al record ${name} signoff --source <where> --words <quote>`);
  const { dir, rec } = openRequest(top, name);
  const md = read(top, `${dir}/request.md`);
  const text = signedText(md);
  if (text === null) throw new Fail(`${dir}/request.md has no "## Organized requirement" (or question) to sign`, `write the organized requirement in ${dir}/request.md`);
  const reqs = requirements(md);
  const signoffs = rec.data.signoff ?? [];
  const last = signoffs.at(-1);
  // Each requirement's version now: its latest, when the text is that version's; else a new one to come.
  const version = (r) => { const v = latest(rec.data, r.id); return v?.sha256 === r.sha256 ? v.version : 'new'; };
  const covered = (last?.covers ?? []).map((c) => `${c.id} ${c.version} ${c.sha256}`).sort().join('\n');
  if (last && last.sha256 === sha256(text) && covered === reqs.map((r) => `${r.id} ${version(r)} ${r.sha256}`).sort().join('\n')) {
    return { body: [`nothing to sign: unchanged since ${last.id} (${last.file})`], next: `al index` };
  }
  const when = now();
  const file = freeName(top, `${dir}/origin`, `${day(when)}-signoff`);
  const body = [last ? `To be signed (last signed: ${last.id}):` : 'To be signed (first sign-off):', ...text.replace(/\n$/, '').split('\n')];
  if (!opts.yes) return { body: [...body, `Would write ${dir}/origin/${file}, ${rec.path} and the Signed off line`], next: 'show this to the owner; on their OK, run the same command with --yes' };

  guard(top, [`${dir}/origin/${file}`, rec.path, `${dir}/request.md`]);
  addVersions(rec, reqs);
  const data = rec.data;
  const id = `S${highest(rec, 'signoff', 'S') + 1}`;
  const entry = { id, file, sha256: sha256(text), signed: stamp(when), source: opts.source };
  if (opts.words !== undefined) entry.words = opts.words;
  if (opts.presented !== undefined) entry.presented = opts.presented;
  if (opts['transcribed-by'] !== undefined) entry.transcribed_by = opts['transcribed-by'];
  entry.covers = reqs.map((r) => ({ id: r.id, version: latest(data, r.id).version, sha256: r.sha256 }));
  const node = append(rec, 'signoff', entry);
  for (const c of node.get('covers').items) c.flow = true;
  write(top, `${dir}/origin/${file}`, formatSnapshot({ source: opts.source, words: opts.words, fetched: stamp(when), text, signed: true }));
  write(top, rec.path, recordText(rec));
  write(top, `${dir}/request.md`, setSignedOff(md, `Signed off: ${day(when)} owner, origin/${file}`));
  return { body: [...body, `Wrote ${dir}/origin/${file}, ${id} in ${rec.path} and the Signed off line in ${dir}/request.md`], next: 'al index' };
}

// al record <name> decision --source <who> --text <decision> [--clarifies R2,R3] [--yes]
function recordDecision({ top, args, opts }) {
  const [name] = args;
  if (opts.source === undefined || opts.text === undefined) throw new Fail('record decision needs --source and --text', `al record ${name} decision --source <who> --text <decision> --yes`);
  oneLine(opts, ['source', 'text', 'clarifies']);
  const { dir, rec } = openRequest(top, name);
  const md = read(top, `${dir}/request.md`);
  const n = Math.max(highest(rec, 'decisions', 'D'), ...decisionNumbers(md)) + 1;
  const date = day(now());
  const line = `- D${n}, ${date}. Source: ${opts.source}. ${opts.text}`;
  if (!opts.yes) return { body: [`Would add to ${dir}/request.md, ## Decisions, and to ${rec.path}:`, line], next: 'run the same command with --yes to write it' };
  guard(top, [`${dir}/request.md`, rec.path]);
  const entry = { id: `D${n}`, date, source: opts.source, text: opts.text, sha256: sha256(opts.text) };
  if (opts.clarifies) entry.clarifies = opts.clarifies.split(',').map((s) => s.trim()).filter(Boolean);
  append(rec, 'decisions', entry);
  write(top, `${dir}/request.md`, addDecision(md, line));
  write(top, rec.path, recordText(rec));
  return { body: [`Added D${n} to ${dir}/request.md and ${rec.path}:`, line], next: 'al index' };
}
