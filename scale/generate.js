#!/usr/bin/env node
// T15 (issue #188; design.md 11, Scale): generates the scale world, a central
// repo with --requests requests and --outputs output repos, with their whole
// history: each request opened by one pull request, implemented by one in an
// output repo, and (but the last --open) consolidated and concluded by a later
// one. Everything is in the v4 formats, as al writes them. Deterministic: the
// same options give the same commits.
//
//   node scale/generate.js --out <dir> [--requests 1000] [--outputs 19] [--paragraphs 100] [--open 10]
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { writeSetup } from '../src/v4/config.js';
import { EFFECT, HOUR, Repo, START, Words, closeRequest, docRecord, docRecordPath, entriesOf, git, openRequest, pad, render } from './world.js';

const SECTIONS = 4;
const PER_SECTION = 8;
const BASE_KINDS = ['rule', 'rule', 'definition', 'limit', 'component', 'data', 'rule', 'scope'];
const CODE_FILES = 100;

function refuse(message) {
  process.stderr.write(`generate: ${message}\n`);
  process.exit(2);
}

function options(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, strict: true, allowPositionals: false, options: {
      out: { type: 'string' }, requests: { type: 'string' }, outputs: { type: 'string' }, paragraphs: { type: 'string' }, open: { type: 'string' },
    } });
  } catch (e) {
    refuse(e.message);
  }
  const v = parsed.values;
  if (!v.out) refuse('--out <dir> is missing');
  const num = (key, dflt, min) => {
    if (v[key] === undefined) return dflt;
    if (!/^\d+$/.test(v[key]) || Number(v[key]) < min) refuse(`--${key} ${v[key]}: a whole number from ${min}`);
    return Number(v[key]);
  };
  const o = { out: resolve(v.out), requests: num('requests', 1000, 1), outputs: num('outputs', 19, 0), paragraphs: num('paragraphs', 100, 1), open: num('open', 10, 0) };
  if (o.open > o.requests) refuse(`--open ${o.open} is more than --requests ${o.requests}`);
  if (existsSync(o.out) && readdirSync(o.out).length) refuse(`${o.out} exists and is not empty`);
  return o;
}

// A code or test file of an output repo that cites central IDs.
function codeFile(w, name, title, ids, test) {
  const cites = ids.map((id) => `central:${id}`).join(', ');
  const lines = [`// ${name}: ${title}. ${test ? 'Verifies' : 'Implements'} ${cites}.`];
  for (let i = 0; i < 6; i++) {
    const fn = w.words(2).join('_');
    lines.push('', `// ${w.sentence()}`, test ? `test('${w.words(4).join(' ')}', () => {` : `export function ${fn}(input) {`,
      `  const ${w.word()}_${i} = input?.${w.word()} ?? '${w.word()}';`, `  return ${test ? 'assert.ok(true)' : 'input'};`, test ? '});' : '}');
  }
  return `${lines.join('\n')}\n`;
}

export function generate(o) {
  const w = new Words(188);
  let t = 0;
  const ms = () => START + (t++) * HOUR;
  const width = Math.max(4, String(o.requests).length);
  const outWidth = Math.max(2, String(o.outputs).length);
  const names = Array.from({ length: o.requests }, (_, i) => `r${pad(i + 1, width)}`);
  const areas = Math.min(50, Math.max(2, Math.ceil(o.requests / 20)));

  // The output repos, each started with plain code that cites nothing.
  const outs = Array.from({ length: o.outputs }, (_, i) => {
    const name = `out-${pad(i + 1, outWidth)}`;
    const repo = new Repo(join(o.out, name));
    repo.name = name;
    repo.prs = 0;
    repo.write('.assuredloop/config.yaml', `repo: ${name}\ncentral: {path: ../central}\n`);
    repo.write('README.md', `# ${name}\n\nAn output repo of the scale world (T15). Its spec is in the central repo.\n`);
    for (let k = 1; k <= CODE_FILES; k++) {
      repo.write(`src/lib/mod-${pad(k, 3)}.js`, Array.from({ length: 40 }, () => `// ${w.sentence()}`).join('\n') + '\n');
    }
    return repo;
  });
  for (const r of outs) r.init(ms(), `Start ${r.name}`);

  // The central repo: the settings and the adopted spec.
  const central = new Repo(join(o.out, 'central'));
  central.init(START, 'Start the central repo');
  writeSetup(central.dir);
  central.touched.add('.assuredloop/schema.yaml');
  central.write('.assuredloop/config.yaml', [
    '# AssuredLoop settings (design.md 2, schema.md 7).', 'schema: assuredloop/1', 'root: specs', 'docs: []',
    ...(outs.length ? ['outputs:', ...outs.map((r) => `  - {name: ${r.name}, path: ../${r.name}}`)] : ['outputs: []']), ''].join('\n'));
  central.write('README.md', '# The central repo\n\nThe spec, the requests and the records of the scale world (T15).\n');
  const next = new Map();
  const files = [];
  const spec = new Map(); // id -> { file, kind, sha256 }
  for (let a = 1; a <= areas; a++) {
    const prefix = `A${pad(a, 2)}`;
    const file = `specs/area-${pad(a, 2)}.md`;
    let n = 0;
    const entries = [{ id: `${prefix}-${++n}`, kind: 'note', text: `# Area ${a}: ${w.title()}` }];
    for (let s = 1; s <= SECTIONS; s++) {
      entries.push({ id: `${prefix}-${++n}`, kind: 'note', text: `## ${w.title()}` });
      for (const kind of BASE_KINDS.slice(0, PER_SECTION)) entries.push({ id: `${prefix}-${++n}`, kind, text: w.paragraph(kind) });
    }
    next.set(prefix, n);
    files.push(file);
    const text = render(entries);
    central.write(file, text);
    central.write(docRecordPath(file), docRecord(file, text));
  }
  const refresh = (file) => {
    for (const [id, e] of spec) if (e.file === file) spec.delete(id);
    for (const e of entriesOf(central.read(file), file)) spec.set(e.id, { file, kind: e.kind, sha256: e.sha256 });
  };
  files.forEach(refresh);
  central.commit(ms(), 'Adopt the spec: al spec --add-ids on every spec file');

  const nextId = (prefix) => { next.set(prefix, next.get(prefix) + 1); return `${prefix}-${next.get(prefix)}`; };
  const reserved = new Set(); // IDs an open request changes, builds on or removes
  const builtOn = new Set(); // IDs that a spec paragraph builds on: never removed
  const removed = [];
  const open = new Map(); // name -> { file, targets, outputs }
  let prs = 0;

  const openOne = (k) => {
    const name = names[k];
    const file = files[Math.floor(w.r() * files.length)];
    const size = Math.max(1, Math.round(o.paragraphs * (0.5 + w.r())));
    const body = size > 1 ? size - 1 - Math.floor((size - 2) / 10) : 1;
    const pool = [...spec].filter(([, e]) => e.file === file && EFFECT.includes(e.kind)).map(([id]) => id);
    const free = () => pool.filter((id) => !reserved.has(id));
    const plan = [];
    const targets = [];
    for (let i = 0; i < body; i++) {
      const roll = i === 0 ? 0 : w.r();
      const ids = roll < 0.3 ? free() : [];
      if (ids.length > 4) {
        const target = w.pick(ids);
        reserved.add(target);
        targets.push(target);
        const sub = w.r();
        const effect = sub < 0.05 && !builtOn.has(target) && ids.length > 12 ? 'removes' : sub < 0.3 ? 'new' : 'changes';
        plan.push({ effect, target, kind: effect === 'new' ? w.pick(EFFECT) : spec.get(target).kind });
      } else {
        plan.push({ kind: w.pick(['approach', 'approach', 'approach', 'plan', 'plan', 'step', 'note']) });
      }
    }
    const title = w.title();
    const out = outs.length ? outs[k % outs.length] : null;
    const task = out ? `${out.name}#${out.prs + 1}` : null;
    openRequest(central, w, { name, ms: ms(), title, plan, reqCount: Math.min(6, 1 + Math.floor(size / 25)), spec: (id) => spec.get(id).sha256, task });
    prs += 1;
    central.pr(ms(), { number: prs, branch: `scale/${name}-open`, message: `${name}: open the request` });
    const cited = plan.filter((p) => p.effect && p.effect !== 'removes').map((p) => p.target);
    const ids = cited.length ? cited : targets;

    // Its pull request in an output repo: code and a test that cite central
    // IDs, the area's index file, and the test's result at the branch commit.
    const outputs = [];
    if (out) {
      out.prs += 1;
      const area = file.replace(/^specs\/|\.md$/g, '');
      const src = `src/${area}/${name}.js`;
      const test = `test/${area}/${name}.test.js`;
      const srcText = codeFile(w, name, title, ids, false);
      const testText = codeFile(w, name, title, ids, true);
      out.write(src, srcText);
      out.write(test, testText);
      const index = `src/${area}/index.js`;
      out.write(index, `${out.read(index) ?? `// ${area}: the index of its modules.\n`}export * from './${name}.js'; // central:${ids[0]}\n`);
      const sha = (s) => createHash('sha256').update(s).digest('hex');
      const { merge } = out.pr(ms(), {
        number: out.prs, branch: `scale/${name}`, message: `central:${name}/T1 ${title}`,
        more: (b) => out.write(`.assuredloop/results/${name}.yaml`, `check: ${test}\noutcome: pass\ncommit: ${b}\ninputs:\n  - {file: ${src}, sha256: ${sha(srcText)}}\n  - {file: ${test}, sha256: ${sha(testText)}}\n`),
      });
      outputs.push({ repo: out.name, file: src, implements: ids.map((id) => `central:${id}`), sha256: sha(srcText), commit: merge },
        { repo: out.name, file: test, verifies: ids.map((id) => `central:${id}`), sha256: sha(testText), commit: merge });
    }
    open.set(name, { file, targets, outputs });
  };

  const closeOne = (name) => {
    const { file, targets, outputs } = open.get(name);
    const done = closeRequest(central, { name, file, ms: ms(), nextId, outputs });
    for (const id of targets) reserved.delete(id);
    for (const id of done.removed) removed.push(id);
    for (const id of done.builtOn) builtOn.add(id);
    refresh(file);
    prs += 1;
    central.pr(ms(), { number: prs, branch: `scale/${name}-close`, message: `${name}: consolidate and conclude` });
    open.delete(name);
  };

  // Opens run --open ahead of closes, so --open requests are open at once.
  for (let k = 0; k < names.length; k++) {
    openOne(k);
    if (k >= o.open) closeOne(names[k - o.open]);
  }

  const world = {
    requests: o.requests, outputs: o.outputs, paragraphs: o.paragraphs, open: o.open,
    central: { path: 'central', head: central.head() },
    repos: outs.map((r) => ({ name: r.name, path: r.name, head: r.head() })),
    openRequests: [...open.keys()],
    concluded: names.filter((n) => !open.has(n)),
    removed,
  };
  // The working trees match main, and the objects are packed, as in a clone.
  for (const r of [central, ...outs]) {
    r.stage();
    git(r.dir, ['-c', 'pack.threads=4', 'repack', '-a', '-d', '-q']);
    git(r.dir, ['prune']);
  }
  writeFileSync(join(o.out, 'world.json'), `${JSON.stringify(world, null, 2)}\n`);
  return world;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const o = options(process.argv.slice(2));
  const world = generate(o);
  process.stdout.write(`central ${world.central.head} ${world.requests} requests (${world.openRequests.length} open, ${world.concluded.length} concluded), ${world.removed.length} spec IDs removed\n`);
  for (const r of world.repos) process.stdout.write(`${r.name} ${r.head}\n`);
}
