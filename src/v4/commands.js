// al new and al record origin|signoff|decision|judgement|close, v4: they write the request's
// text and snapshots as before, and the request record beside them.
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { stringify } from 'yaml';
import { Fail, SCHEMA, STAMP, day, exists, guard, isName, now, read, recordPath, sha256, stamp, write } from './base.js';
import { formatSnapshot, slug } from './snapshot.js';
import { addDecision, decisionNumbers, requirements, setSignedOff, signedText } from './request-md.js';
import { YAML_OPTIONS, addVersions, append, highest, latest, openRecord, recordText } from './records.js';
import { loadConfig } from './config.js';
import { itemFinder, loadItems } from './issues.js';
import { CHANGED, reliance, textSha } from './kept-items.js';
import { logical, placeOf, sourceOf } from './originals.js';
import { onSha, ownTarget, reasonNames } from './close.js';
import { loadState } from './state.js';

const TIERS = ['1', '1d', '2', '3', 'S'];

function readInput(from, cwd) {
  if (from === undefined) throw new Fail('--from <file|-> is missing', 'pass the text with --from <file>, or --from - on standard input');
  try {
    return from === '-' ? readFileSync(0) : readFileSync(resolve(cwd, from));
  } catch (e) {
    throw new Fail(`cannot read ${from}: ${e.code || e.message}`);
  }
}

// Where the new original files of request `name` go (origin-elsewhere/R1):
// the repo's origin/, as before, or the place of a project that keeps them
// outside. A places file that is broken refuses here; no place set refuses
// in name(), before anything is written.
function originalsStore(top, name, rec) {
  const dir = `requests/${name}/origin`;
  const place = placeOf(loadConfig(top));
  const list = (x) => (Array.isArray(x) ? x : []);
  const named = new Set([...list(rec?.data.sources), ...list(rec?.data.signoff)].map((e) => String(e?.file ?? '').replace(/^origin\//, '')));
  // Whether `file` is in the place's folder of the request; a folder that
  // cannot be read is a refusal that names the file by its logical name only.
  const there = (file) => {
    try {
      return Boolean(lstatSync(join(place.folder, name, file)));
    } catch (e) {
      if (e.code === 'ENOENT') return false;
      throw new Fail(`cannot read ${logical(name, file)} (${e.code ?? e.message}); nothing was written`, `make the folder of "${place.name}" readable, then run it again`);
    }
  };
  // Outside, a name is free in neither place and when the record does not name it.
  const taken = (f) => exists(top, `${dir}/${f}`) || (place && (named.has(f) || there(f)));
  const free = (base, tried = new Set()) => {
    let f = `${base}.md`;
    for (let n = 2; taken(f) || tried.has(f); n++) f = `${base}-${n}.md`;
    return f;
  };
  return {
    place,
    // The first free name for `base`; with no place set, a refusal.
    name(base) {
      if (place && !place.folder) throw new Fail(`no place is set for the original files of "${place.name}": add a line to ${place.file}`, `add the line ${place.name}: /path/to/folder to ${place.file}, then run it again`);
      return free(base);
    },
    shown: (f) => (place ? logical(name, f) : `${dir}/${f}`),
    // Writes `bytes` under the first free name for `base`, and gives that name.
    // Outside, the file is created only if it is not there yet; when another
    // clone made it first, the next free name is taken.
    create(base, bytes) {
      const first = this.name(base);
      if (!place) {
        write(top, `${dir}/${first}`, bytes);
        return first;
      }
      const tried = new Set();
      for (let f = first; ; f = free(base, tried)) {
        try {
          if (lstatSync(join(place.folder, name), { throwIfNoEntry: false })?.isSymbolicLink()) {
            throw new Fail(`originals:${name}/ is a symlink in the folder of "${place.name}", and al does not write through a symlink; nothing was written`, 'make it a real folder, then run it again');
          }
          mkdirSync(join(place.folder, name), { recursive: true });
          writeFileSync(join(place.folder, name, f), bytes, { flag: 'wx' });
          return f;
        } catch (e) {
          if (e instanceof Fail) throw e;
          if (e.code !== 'EEXIST') throw new Fail(`cannot write ${logical(name, f)} (${e.code ?? e.message}); nothing was written`, `make the folder of "${place.name}" writable, then run it again`);
          tried.add(f);
        }
      }
    },
  };
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
  const dir = `requests/${name}`;
  const store = originalsStore(top, name, null);
  guard(top, [`${dir}/origin/${store.name(`${day(when)}-owner-words`)}`, `${dir}/request.md`, recordPath(name)]);
  const file = store.create(`${day(when)}-owner-words`, formatSnapshot({ source: opts.from === '-' ? 'standard input' : opts.from, fetched: stamp(when), text: words }));
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
    requirements: [], signoff: [], decisions: [], tasks: [], bindings: [],
  };
  write(top, recordPath(name), stringify(record, YAML_OPTIONS));
  return {
    body: [`Wrote ${dir}/request.md, ${store.shown(file)} and ${recordPath(name)}`],
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

// al record <name> origin|signoff|decision|judgement|close ...
export function record(ctx) {
  const [, kind] = ctx.args;
  if (kind === 'origin') return recordOrigin(ctx);
  if (kind === 'signoff') return recordSignoff(ctx);
  if (kind === 'decision') return recordDecision(ctx);
  if (kind === 'judgement') return recordJudgement(ctx);
  if (kind === 'close') return recordClose(ctx);
  throw new Fail(`record ${kind ?? ''}: al record <name> origin|signoff|decision|judgement|close`);
}

// al record <name> origin --url <source> --from <file|-> [--fetched <stamp>] [--yes]
function recordOrigin({ top, cwd, args, opts }) {
  const [name] = args;
  oneLine(opts, ['url']);
  if (!opts.url) throw new Fail('--url <source> is missing', `al record ${name} origin --url <source> --from -`);
  if (opts.fetched !== undefined && !STAMP.test(opts.fetched)) throw new Fail(`--fetched ${opts.fetched}: write it as YYYY-MM-DDTHH:MMZ`);
  const { dir, rec } = openRequest(top, name);
  const store = originalsStore(top, name, rec);
  const text = readInput(opts.from, cwd);
  if (text.length === 0) throw new Fail('the text is empty', 'pass the text with --from <file> or on standard input');
  const fetched = opts.fetched ?? stamp(now());
  // A source inside the place is recorded by its logical name (originals:<path>).
  const url = sourceOf(opts.url, store.place, cwd);
  const base = `${fetched.slice(0, 10)}-${slug(url)}`;
  const snapshot = formatSnapshot({ source: opts.url, fetched, text });
  const shown = snapshot.toString('utf8').replace(/\n$/, '').split('\n');
  if (!opts.yes) return { body: [`Would write ${store.shown(store.name(base))}:`, ...shown], next: 'run the same command with --yes to write it' };
  guard(top, [`${dir}/origin/${store.name(base)}`, rec.path]);
  const file = store.create(base, snapshot);
  append(rec, 'sources', { file, kind: 'owner-words', sha256: sha256(text), taken: fetched, url });
  write(top, rec.path, recordText(rec));
  return { body: [`Wrote ${store.shown(file)} and source ${file} in ${rec.path}`], next: `name it in a requirement's marker: <!-- R<n> from:${file} -->` };
}

// al record <name> signoff --source <where> --words <quote> [--presented <x>] [--transcribed-by <who>] [--yes]
function recordSignoff({ top, cwd, args, opts }) {
  const [name] = args;
  oneLine(opts, ['source', 'words', 'presented', 'transcribed-by']);
  if (!opts.source) throw new Fail('--source <where the owner signed> is missing', `al record ${name} signoff --source <where> --words <quote>`);
  // A sign-off with no words is not valid in al check (DES-89, D10).
  if (typeof opts.words !== 'string' || !opts.words) throw new Fail('--words <the owner\'s words> is missing', `pass the owner's words: al record ${name} signoff --source <where> --words <quote>`);
  const { dir, rec } = openRequest(top, name);
  const store = originalsStore(top, name, rec);
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
  const base = `${day(when)}-signoff`;
  const body = [last ? `To be signed (last signed: ${last.id}):` : 'To be signed (first sign-off):', ...text.replace(/\n$/, '').split('\n')];
  if (!opts.yes) return { body: [...body, `Would write ${store.shown(store.name(base))}, ${rec.path} and the Signed off line`], next: 'show this to the owner; on their OK, run the same command with --yes' };

  guard(top, [`${dir}/origin/${store.name(base)}`, rec.path, `${dir}/request.md`]);
  const file = store.create(base, formatSnapshot({ source: opts.source, words: opts.words, fetched: stamp(when), text, signed: true }));
  addVersions(rec, reqs);
  const data = rec.data;
  const id = `S${highest(rec, 'signoff', 'S') + 1}`;
  // A source inside the place is recorded by its logical name (originals:<path>).
  const entry = { id, file, sha256: sha256(text), signed: stamp(when), source: sourceOf(opts.source, store.place, cwd) };
  if (opts.words !== undefined) entry.words = opts.words;
  if (opts.presented !== undefined) entry.presented = sourceOf(opts.presented, store.place, cwd);
  if (opts['transcribed-by'] !== undefined) entry.transcribed_by = opts['transcribed-by'];
  entry.covers = reqs.map((r) => ({ id: r.id, version: latest(data, r.id).version, sha256: r.sha256 }));
  const node = append(rec, 'signoff', entry);
  for (const c of node.get('covers').items) c.flow = true;
  write(top, rec.path, recordText(rec));
  write(top, `${dir}/request.md`, setSignedOff(md, `Signed off: ${day(when)} owner, origin/${file}`));
  return { body: [...body, `Wrote ${store.shown(file)}, ${id} in ${rec.path} and the Signed off line in ${dir}/request.md`], next: 'al index' };
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

// al record <name> judgement --hint issue-changed --on <item> --reason <why> --issues <folder> [--yes]:
// the change of a work item was read (LD-12). It records the item's text
// now and the moment of reliance that it covers, so the hint comes back
// when the text changes again or a later sign-off becomes that moment. Only
// issue-changed takes a judgement for now.
function recordJudgement({ top, cwd, args, opts }) {
  const [name] = args;
  const usage = `al record ${name} judgement --hint ${CHANGED} --on <item> --reason <why> --issues <folder>`;
  oneLine(opts, ['hint', 'on', 'reason']);
  if (opts.hint !== CHANGED) throw new Fail(opts.hint === undefined ? '--hint <code> is missing' : `--hint ${opts.hint}: only ${CHANGED} takes a judgement for now`, usage);
  if (!opts.on) throw new Fail('--on <item> is missing', usage);
  if (!opts.reason) throw new Fail('--reason <why> is missing: a judgement says in one line why the change was read and what it means', usage);
  if (opts.issues === undefined) throw new Fail('--issues <folder> is missing: the judgement records the item\'s text now', usage);
  const { rec } = openRequest(top, name);
  const { items } = loadItems(cwd ?? top, opts.issues);
  const finder = itemFinder(top, loadConfig(top), items);
  const tasked = new Set((Array.isArray(rec.data.tasks) ? rec.data.tasks : []).filter((t) => t && t.ref != null).flatMap((t) => finder.find(t.ref).found));
  const its = finder.find(opts.on).found.filter((it) => tasked.has(it));
  if (!its.length) throw new Fail(`--on ${opts.on}: no task of ${name} names an item in ${opts.issues} that ${opts.on} names`, usage);
  const n = highest(rec, 'judgements', 'J');
  const recorded = stamp(now());
  const entries = its.map((it, i) => ({ id: `J${n + i + 1}`, hint: CHANGED, on: it.key, at: reliance(rec.data, it.key).at, reason: opts.reason, sha256: textSha(it), recorded }));
  const lines = entries.map((e) => `${e.id} ${e.hint} ${e.on}: ${e.reason}`);
  if (!opts.yes) return { body: [`Would add to ${rec.path}:`, ...lines], next: 'run the same command with --yes to write it' };
  guard(top, [rec.path]);
  for (const e of entries) append(rec, 'judgements', e, true);
  write(top, rec.path, recordText(rec));
  return { body: [`Added to ${rec.path}:`, ...lines], next: `al check --issues ${opts.issues}` };
}

// al record <name> close --on <ID> --reason <one sentence> [--yes]: a close
// line (LD-62). --on names a paragraph of the change spec that is not
// delivered, or a requirement of the current version that is met where no
// lasting paragraph links to it. al keeps the version of what --on names and
// of each spec paragraph that the reason names; a word of the ID form that
// names no paragraph of specs/ is shown, and not kept.
function recordClose({ top, args, opts }) {
  const [name] = args;
  const usage = `al record ${name} close --on <ID> --reason <one sentence>`;
  oneLine(opts, ['on', 'reason']);
  if (!opts.on) throw new Fail('--on <ID> is missing: a paragraph of the change spec, or a requirement R<n> of the request', usage);
  if (!opts.reason) throw new Fail('--reason <one sentence> is missing: say why the paragraph is not delivered, or where the requirement is met', usage);
  const { rec } = openRequest(top, name);
  const state = loadState(top);
  const r = state.requests.get(name);
  const on = r && ownTarget(r, opts.on);
  if (!on) throw new Fail(`--on ${opts.on}: not a paragraph of ${name}'s change spec, and not a requirement of its current version`, usage);
  const names = reasonNames(state, opts.reason, on);
  const id = `C${highest(rec, 'closes', 'C') + 1}`;
  const lines = [`${id} ${name}/${on}: ${opts.reason}`,
    ...names.map((x) => (x.p ? `  keeps ${x.id} (${x.p.file})` : `  ${x.id}: not a paragraph of specs/, not kept`))];
  if (!opts.yes) return { body: [`Would add to ${rec.path}:`, ...lines], next: 'run the same command with --yes to write it' };
  guard(top, [rec.path]);
  const node = append(rec, 'closes', {
    id, on, reason: opts.reason, sha256: onSha(r, on),
    names: names.filter((x) => x.p).map((x) => ({ id: x.id, sha256: x.p.sha256 })), recorded: stamp(now()),
  });
  for (const x of node.get('names').items) x.flow = true;
  write(top, rec.path, recordText(rec));
  return { body: [`Added to ${rec.path}:`, ...lines], next: `al conclude ${name}` };
}
