// The scale world of T15 (issue #188; design.md 11, Scale): what the generator
// and the run share. The words, the git writes, and the v4 files of a request
// as al writes them (al new, al record signoff and decision, al index, al
// conclude), in their exact format. It reads al's own modules for the parts
// that al derives (markers, requirement hashes, snapshots), and changes none.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Document, parse, parseDocument, stringify } from 'yaml';
import { parseMarkdown } from '../src/v4/markers.js';
import { requirements, signedText } from '../src/v4/request-md.js';
import { formatSnapshot } from '../src/v4/snapshot.js';
import { YAML_OPTIONS } from '../src/v4/records.js';
import { sha256 as bytesSha } from '../src/v4/base.js';

export const SCHEMA = 'assuredloop/1';
export const START = Date.UTC(2025, 0, 1);
export const HOUR = 3600 * 1000;
export const stamp = (ms) => new Date(ms).toISOString().slice(0, 16) + 'Z';
export const day = (ms) => new Date(ms).toISOString().slice(0, 10);
export const pad = (n, w) => String(n).padStart(w, '0');

// The kinds a change spec can carry into specs/, and the IDs that may be changed.
export const EFFECT = ['rule', 'definition', 'limit', 'scope', 'component', 'data'];

// --- Words -------------------------------------------------------------------

// A seeded generator (mulberry32), so the world is the same on every run.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ONSETS = ['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'w', 'z', 'br', 'cl', 'dr', 'gr', 'pl', 'st', 'tr', 'sh', 'ch'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'ai', 'ea', 'io', 'ou'];
const CODAS = ['', '', 'n', 'r', 's', 't', 'l', 'm', 'x', 'nd', 'st'];

// A vocabulary of made-up words, drawn with a skew, so a few words are common
// and most are rare, as in real text.
export class Words {
  constructor(seed, size = 4000) {
    this.r = rng(seed);
    const r = rng(seed ^ 0x9e3779b9);
    const pick = (xs) => xs[Math.floor(r() * xs.length)];
    const seen = new Set();
    this.vocab = [];
    while (this.vocab.length < size) {
      const n = 1 + Math.floor(r() * 3);
      let w = '';
      for (let i = 0; i < n; i++) w += pick(ONSETS) + pick(VOWELS);
      w += pick(CODAS);
      if (w.length >= 3 && !seen.has(w)) { seen.add(w); this.vocab.push(w); }
    }
  }
  int(lo, hi) { return lo + Math.floor(this.r() * (hi - lo + 1)); }
  chance(p) { return this.r() < p; }
  pick(xs) { return xs[Math.floor(this.r() * xs.length)]; }
  word() { return this.vocab[Math.floor(this.vocab.length * this.r() ** 2.5)]; }
  words(n) { return Array.from({ length: n }, () => this.word()); }
  sentence(n = this.int(8, 16)) {
    const ws = this.words(n);
    ws[0] = ws[0][0].toUpperCase() + ws[0].slice(1);
    return `${ws.join(' ')}.`;
  }
  // About 60 words: about 100 tokens (design.md 11).
  paragraph(kind) {
    const n = this.int(3, 5);
    const ss = Array.from({ length: n }, () => this.sentence());
    if (kind === 'rule') {
      const ws = this.words(this.int(6, 12));
      ss[0] = `The ${ws.slice(0, 2).join(' ')} MUST ${ws.slice(2).join(' ')}.`;
    }
    return ss.join(' ');
  }
  title() {
    const ws = this.words(this.int(2, 4));
    ws[0] = ws[0][0].toUpperCase() + ws[0].slice(1);
    return ws.join(' ');
  }
}

// --- Git ---------------------------------------------------------------------

export function gitEnv(ms = START) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  const date = `${Math.floor(ms / 1000)} +0000`;
  return {
    ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Scale Author', GIT_AUTHOR_EMAIL: 'author@example.invalid', GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: 'Scale Committer', GIT_COMMITTER_EMAIL: 'committer@example.invalid', GIT_COMMITTER_DATE: date,
  };
}

export function git(cwd, args, { ms, input, allowFail = false } = {}) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args],
    { cwd, env: gitEnv(ms), input, encoding: 'utf8', maxBuffer: 1 << 30 });
  if (r.status !== 0) {
    if (allowFail) return null;
    throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${r.stderr || r.error?.message}`);
  }
  return r.stdout.trim();
}

// A repo the world writes: files in its working tree, and pull requests merged
// into its branch (main) as a branch commit and a merge commit, with no checkout.
export class Repo {
  constructor(dir, branch = 'main') { this.dir = dir; this.branch = branch; this.touched = new Set(); }
  path(p) { return join(this.dir, p); }
  read(p) { try { return readFileSync(this.path(p), 'utf8'); } catch { return null; } }
  write(p, text) {
    mkdirSync(dirname(this.path(p)), { recursive: true });
    writeFileSync(this.path(p), text);
    this.touched.add(p);
  }
  remove(p) { rmSync(this.path(p), { recursive: true, force: true }); this.touched.add(p); }
  move(from, to) {
    mkdirSync(dirname(this.path(to)), { recursive: true });
    renameSync(this.path(from), this.path(to));
    this.touched.add(from);
    this.touched.add(to);
  }
  init(ms, message) {
    mkdirSync(this.dir, { recursive: true });
    git(this.dir, ['init', '-q', '-b', 'main']);
    return this.commit(ms, message, []);
  }
  stage() {
    if (this.touched.size) git(this.dir, ['add', '-A', '--', ...[...this.touched].sort()]);
    this.touched.clear();
    return git(this.dir, ['write-tree']);
  }
  head() { return git(this.dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${this.branch}`], { allowFail: true }); }
  // A plain commit on the branch (main unless set).
  commit(ms, message, parents = [this.head()].filter(Boolean)) {
    const tree = this.stage();
    const c = git(this.dir, ['commit-tree', tree, ...parents.flatMap((p) => ['-p', p]), '-m', message], { ms });
    git(this.dir, ['update-ref', `refs/heads/${this.branch}`, c]);
    if (!parents.length) git(this.dir, ['symbolic-ref', 'HEAD', `refs/heads/${this.branch}`]);
    return c;
  }
  // A pull request: the branch commit holds what is written so far; `more`,
  // given the branch commit, may write more for the merge commit (a result).
  pr(ms, { number, branch, message, more }) {
    const main = this.head();
    const tree = this.stage();
    const b = git(this.dir, ['commit-tree', tree, '-p', main, '-m', message], { ms });
    if (more) more(b);
    const tree2 = this.stage();
    const m = git(this.dir, ['commit-tree', tree2, '-p', main, '-p', b, '-m', `Merge pull request #${number} from ${branch}\n\n${message}`], { ms: ms + 60000 });
    git(this.dir, ['update-ref', `refs/heads/${this.branch}`, m]);
    return { branch: b, merge: m };
  }
}

// --- Spec docs ---------------------------------------------------------------

const LINK_ORDER = [['serves', 'serves'], ['buildsOn', 'builds-on'], ['changes', 'changes'], ['removes', 'removes'], ['explains', 'explains']];
const marker = (e) => `<!-- ${[e.id, e.kind, ...LINK_ORDER.filter(([k]) => e.links?.[k]?.length).map(([k, w]) => `${w}:${e.links[k].join(',')}`)].join(' ')} -->`;

// A doc's text from its entries: each a marker, a blank line, the text.
export const render = (entries) => `${entries.map((e) => `${marker(e)}\n\n${e.text}\n`).join('\n')}`;

// A doc's entries from its text, with al's own parser.
export const entriesOf = (text, file) => parseMarkdown(text, file).paragraphs.map((p) => ({ id: p.id, kind: p.kind, links: p.links, text: p.text, sha256: p.sha256 }));

// The per-doc record that al index writes on main for `file` (no change kinds
// on main: the base is HEAD).
export function docRecord(file, text) {
  const paragraphs = parseMarkdown(text, file).paragraphs.map((p) => ({ id: p.id, ...(p.kind ? { kind: p.kind } : {}), text_sha256: p.sha256, display: p.displayNumber }));
  return stringify({ schema: SCHEMA, file, paragraphs }, YAML_OPTIONS);
}
export const docRecordPath = (file) => `.assuredloop/records/${file}.yaml`;
export const recordPath = (name) => `.assuredloop/records/requests/${name}.yaml`;

// --- Records -------------------------------------------------------------------

// A record as text, with the lists al writes on one line (bindings, covers, dispositions).
export function recordText(data) {
  const doc = new Document(data);
  for (const key of ['bindings', 'dispositions']) for (const it of doc.get(key)?.items ?? []) it.flow = true;
  for (const s of doc.get('signoff')?.items ?? []) { const c = s.get('covers'); for (const it of c?.items ?? []) it.flow = true; }
  for (const o of doc.get('outputs')?.items ?? []) o.flow = true;
  return doc.toString(YAML_OPTIONS);
}

const binding = (holder, link, target, holderSha, targetSha, extra = {}) => ({ holder, link, target, holder_sha256: holderSha, target_sha256: targetSha, ...extra });

// --- A request -----------------------------------------------------------------

// Opens request `name`: request.md, the snapshots, the change spec and the
// record as al new, al record signoff and decision and al index leave them,
// on main. `plan` gives the change spec's body: [{ kind, effect: changes|new|removes, target }].
export function openRequest(repo, w, { name, ms, title, plan, reqCount, spec, task }) {
  const dir = `requests/${name}`;
  const d = day(ms);
  const wordsFile = `${d}-owner-words.md`;
  const signFile = `${d}-signoff.md`;
  const ownerWords = Buffer.from(`${Array.from({ length: w.int(3, 6) }, () => w.sentence()).join(' ')}\n`);
  repo.write(`${dir}/origin/${wordsFile}`, formatSnapshot({ source: 'scale generator', fetched: stamp(ms), text: ownerWords }));

  const reqLines = [];
  for (let i = 1; i <= reqCount; i++) {
    reqLines.push(`<!-- R${i} from:${wordsFile} -->`, '', `### R${i} ${w.title()}`, w.paragraph(i === 1 ? 'rule' : 'note'), '');
  }
  const head = [`# ${title}`, 'Tier: 3 · Status: open', '', "## Owner's words and dialog", '', `- ${d} the owner's words, snapshot origin/${wordsFile}`, '', '## Organized requirement', '', ...reqLines];
  while (head.at(-1) === '') head.pop();
  const unsigned = `${head.join('\n')}\n`;
  const signed = signedText(unsigned);
  const decisionText = w.sentence();
  const md = `${head.join('\n')}\nSigned off: ${d} owner, origin/${signFile}\n\n## Decisions\n\n- D1, ${d}. Source: owner. ${decisionText}\n`;
  repo.write(`${dir}/request.md`, md);
  repo.write(`${dir}/origin/${signFile}`, formatSnapshot({ source: 'chat', words: 'OK', fetched: stamp(ms), text: signed, signed: true }));
  const reqs = requirements(md);

  // The change spec: a title, then the planned paragraphs, a heading every ten.
  const entries = [];
  let n = 0;
  const id = () => `SP-${++n}`;
  if (plan.length > 1) entries.push({ id: id(), kind: 'note', text: `# Change ${name}: ${title}` });
  const R = () => `R${w.int(1, reqCount)}`;
  plan.forEach((p, i) => {
    if (i > 0 && i % 10 === 0) entries.push({ id: id(), kind: 'note', text: `## Part ${i / 10 + 1}: ${w.title()}` });
    const e = { id: id(), kind: p.kind, links: { serves: [R()] }, text: w.paragraph(p.kind) };
    if (p.effect === 'changes') e.links.changes = [p.target];
    if (p.effect === 'new') e.links.buildsOn = [p.target];
    if (p.effect === 'removes') { e.links.removes = [p.target]; e.text = `${p.target} is removed. ${w.sentence()}`; }
    if (p.kind === 'note' || p.kind === 'step') e.links = {};
    e.effect = p.effect;
    entries.push(e);
  });
  const specText = render(entries);
  repo.write(`${dir}/spec.md`, specText);
  repo.write(docRecordPath(`${dir}/spec.md`), docRecord(`${dir}/spec.md`, specText));

  // The record, as al writes it; the bindings as al index freezes them.
  const reqSha = new Map(reqs.map((r) => [r.id, r.sha256]));
  const sp = entriesOf(specText, `${dir}/spec.md`);
  const own = new Map(sp.map((p) => [p.id, p.sha256]));
  const bindings = [];
  for (const p of sp) {
    for (const [k, link] of [['serves', 'serves'], ['buildsOn', 'builds-on'], ['changes', 'changes'], ['removes', 'removes']]) {
      for (const t of p.links[k] ?? []) {
        if (/^R\d+$/.test(t)) bindings.push(binding(`${name}/${p.id}`, link, `${name}/${t}`, p.sha256, reqSha.get(t), { target_version: 1 }));
        else if (own.has(t)) bindings.push(binding(`${name}/${p.id}`, link, `${name}/${t}`, p.sha256, own.get(t)));
        else bindings.push(binding(`${name}/${p.id}`, link, t, p.sha256, spec(t)));
      }
    }
  }
  const sourceSha = bytesSha(ownerWords);
  for (const r of reqs) bindings.push(binding(`${name}/${r.id}`, 'from', `${name}/${wordsFile}`, r.sha256, sourceSha));
  const data = {
    schema: SCHEMA, request: name, tier: '3', status: 'open',
    sources: [{ file: wordsFile, kind: 'owner-words', sha256: sourceSha, taken: stamp(ms) }],
    requirements: reqs.map((r) => ({ id: r.id, version: 1, sha256: r.sha256, title: r.title })),
    signoff: [{ id: 'S1', file: signFile, sha256: bytesSha(signed), signed: stamp(ms), source: 'chat', words: 'OK', covers: reqs.map((r) => ({ id: r.id, version: 1, sha256: r.sha256 })) }],
    decisions: [{ id: 'D1', date: d, source: 'owner', text: decisionText, sha256: bytesSha(decisionText), clarifies: ['R1'] }],
    tasks: [{ id: 'T1', ref: `tasks.md T1`, delivers: reqs.map((r) => r.id), prs: task ? [task] : [] }],
    bindings,
    dispositions: [],
  };
  repo.write(recordPath(name), recordText(data));
}

// Closes open request `name` as its last pull request does: consolidates the
// change spec into the spec file `file` (al index binds the new links), records
// the dispositions and the declared outputs, and archives it (al conclude).
// `nextId(prefix)` gives a spec ID never used before. Returns the spec IDs
// removed, placed and built on.
export function closeRequest(repo, { name, file, ms, nextId, outputs = [] }) {
  const dir = `requests/${name}`;
  const sp = entriesOf(repo.read(`${dir}/spec.md`), `${dir}/spec.md`);
  const before = entriesOf(repo.read(file), file);
  const spec = before.map((e) => ({ ...e }));
  const at = (id) => spec.findIndex((e) => e.id === id);
  const data = parse(repo.read(recordPath(name)));
  const reqVersion = new Map(data.requirements.map((r) => [r.id, r]));
  const removed = [];
  const dispositions = [];
  const placed = [];
  const builtOn = [];
  for (const p of sp) {
    const serves = (p.links.serves ?? []).map((r) => `${name}/${r}`);
    const source = { source: `${name}/${p.id}`, source_sha256: p.sha256 };
    if (p.links.changes?.length) {
      const i = at(p.links.changes[0]);
      spec[i] = { ...spec[i], text: p.text, links: { ...spec[i].links, serves } };
      placed.push(spec[i].id);
      dispositions.push({ ...source, disposition: 'incorporated', spec: spec[i].id, spec_sha256: p.sha256 });
    } else if (p.links.buildsOn?.length) {
      const y = p.links.buildsOn[0];
      const e = { id: nextId(y.split('-')[0]), kind: p.kind, links: { serves, buildsOn: [y] }, text: p.text, fresh: true };
      spec.splice(at(y) + 1, 0, e);
      placed.push(e.id);
      builtOn.push(y);
      dispositions.push({ ...source, disposition: 'incorporated', spec: e.id, spec_sha256: p.sha256 });
    } else if (p.links.removes?.length) {
      const x = p.links.removes[0];
      spec.splice(at(x), 1);
      removed.push(x);
      dispositions.push({ ...source, disposition: 'removed', spec: x });
    }
  }
  const text = render(spec);
  repo.write(file, text);
  repo.write(docRecordPath(file), docRecord(file, text));

  // al index on the branch, the request still open: it binds the spec links
  // that are new against main (a link already at main stays unbound).
  const now = new Map(entriesOf(text, file).map((e) => [e.id, e]));
  const was = new Set(before.flatMap((e) => Object.entries(e.links).flatMap(([k, ts]) => ts.map((t) => `${e.id}\t${k}\t${t}`))));
  const bindings = [];
  for (const id of placed) {
    const e = now.get(id);
    for (const [k, link] of [['serves', 'serves'], ['buildsOn', 'builds-on']]) {
      for (const t of e.links[k] ?? []) {
        if (was.has(`${id}\t${k}\t${t}`)) continue;
        if (k === 'serves') { const r = reqVersion.get(t.split('/')[1]); bindings.push(binding(id, link, t, e.sha256, r.sha256, { target_version: r.version })); }
        else bindings.push(binding(id, link, t, e.sha256, now.get(t).sha256));
      }
    }
  }
  for (const o of outputs) {
    for (const link of ['implements', 'verifies']) {
      for (const t of o[link] ?? []) {
        const target = now.get(t.replace(/^central:/, ''));
        if (target) bindings.push(binding(`${o.repo}/${o.file}`, link, t, o.sha256, target.sha256, { commit: `${o.repo}@${o.commit}` }));
      }
    }
  }
  data.bindings.push(...bindings);
  data.dispositions.push(...dispositions);
  data.status = 'concluded';
  if (outputs.length) data.outputs = outputs.map(({ repo: r, file: f, implements: i, verifies: v }) => ({ repo: r, file: f, ...(i ? { implements: i } : {}), ...(v ? { verifies: v } : {}) }));
  repo.write(recordPath(name), recordText(data));

  // al conclude: Status: concluded, the Outcome, and the move to the archive.
  const md = repo.read(`${dir}/request.md`).replace(/\bStatus:\s*\S+/, 'Status: concluded');
  const outcome = ['## Outcome', '', `Concluded ${day(ms)} with al conclude, on the working tree.`, '',
    ...data.requirements.map((r) => `- ${r.id} ${r.title}, version ${r.version}, signed (S1).`),
    ...dispositions.map((x) => `  - ${x.source.split('/')[1]}: ${x.disposition} ${x.disposition === 'incorporated' ? 'as ' : ''}${x.spec}`),
    '- Not known: whether the code, tests and documents do what the paragraphs say.', ''];
  repo.write(`${dir}/request.md`, `${md.replace(/\n*$/, '\n')}\n${outcome.join('\n')}`);
  repo.move(dir, `requests/archive/${name}`);
  return { removed, placed, builtOn };
}

export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
export { parseDocument };
