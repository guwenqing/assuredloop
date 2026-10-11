#!/usr/bin/env node
// T15 (issue #188; design.md 11, Scale): times al on a world that
// scale/generate.js made, against the criteria of T15, and writes the report.
// It changes the world's repos while it runs, and puts every main back at the
// end. Each al command is its own process, with a time limit.
//
//   node scale/run.js --world <dir> [--al <al-v4.js>] [--repeat 3] [--queries 5]
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, platform, release, totalmem, type, arch } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { performance } from 'node:perf_hooks';
import { Repo, Words, closeRequest, docRecord, docRecordPath, entriesOf, git, render } from './world.js';

const CRITERIA = {
  check: { seconds: 10, text: 'al check on a PR within 10 s at 1,000 requests', limit: 600 },
  'full-index': { seconds: 900, text: 'a full level 1 rebuild within 15 minutes', limit: 3600 },
  'incremental-index': { seconds: 120, text: 'an incremental index after a merge within 2 minutes', limit: 1200 },
  removal: { seconds: 120, text: 'an incremental index after a merge that removes rows, within 2 minutes (the incremental criterion)', limit: 1200 },
  search: { seconds: 2, text: 'al search answers within 2 s across the repos', limit: 300 },
};
const REMOVE = 10;
const BRANCH = 'scale-run-pr';

function refuse(message) {
  process.stderr.write(`run: ${message}\n`);
  process.exit(2);
}

function options(argv) {
  let v;
  try {
    v = parseArgs({ args: argv, strict: true, allowPositionals: false, options: {
      world: { type: 'string' }, al: { type: 'string' }, repeat: { type: 'string' }, queries: { type: 'string' },
    } }).values;
  } catch (e) {
    refuse(e.message);
  }
  if (!v.world) refuse('--world <dir> is missing');
  const world = resolve(v.world);
  if (!existsSync(join(world, 'world.json'))) refuse(`${world} has no world.json: make one with node scale/generate.js --out <dir>`);
  const al = resolve(v.al ?? fileURLToPath(new URL('../bin/al.js', import.meta.url)));
  if (!existsSync(al) || !statSync(al).isFile()) refuse(`--al ${al} is not a file`);
  const num = (key, dflt) => {
    if (v[key] === undefined) return dflt;
    if (!/^\d+$/.test(v[key]) || Number(v[key]) < 1) refuse(`--${key} ${v[key]}: a whole number from 1`);
    return Number(v[key]);
  };
  return { world, al, repeat: num('repeat', 3), queries: num('queries', 5) };
}

function machine() {
  let model = null;
  if (platform() === 'darwin') model = spawnSync('sysctl', ['-n', 'hw.model'], { encoding: 'utf8' }).stdout?.trim();
  else { try { model = readFileSync('/sys/devices/virtual/dmi/id/product_name', 'utf8').trim(); } catch { model = null; } }
  const c = cpus();
  return {
    model: model || 'unknown', cpu: c[0]?.model?.trim() || 'unknown', cores: c.length, memoryBytes: totalmem(),
    os: `${type()} ${release()} ${arch()}`, node: process.version,
  };
}

const round = (x) => Math.round(x * 100) / 100;
const load = () => loadavg().map(round);

// The spec IDs of every *.md under specs/ at the working tree.
const specFiles = (repo) => git(repo.dir, ['ls-files', 'specs']).split('\n').filter((f) => /^specs\/[^/]+\.md$/.test(f));

export function run(o) {
  const world = JSON.parse(readFileSync(join(o.world, 'world.json'), 'utf8'));
  const central = new Repo(join(o.world, world.central.path));
  const outs = world.repos.map((r) => Object.assign(new Repo(join(o.world, r.path)), { name: r.name }));
  const alDir = dirname(o.al);
  const alInfo = {
    path: o.al,
    commit: git(alDir, ['rev-parse', 'HEAD'], { allowFail: true }) ?? 'unknown',
    dirty: (git(alDir, ['status', '--porcelain'], { allowFail: true }) ?? '') !== '',
  };
  const report = { al: alInfo, machine: machine(), world, measures: [], removal: { ids: [], goneFromCurrent: false, keptInHistory: false, problems: [] }, ok: true };
  const measure = (name) => {
    const m = { name, criterion: { seconds: CRITERIA[name].seconds, text: CRITERIA[name].text }, runs: [], notes: [] };
    report.measures.push(m);
    return m;
  };

  // One al command, timed in its own process.
  const al = (m, args, repo = central) => {
    const before = load();
    const t0 = performance.now();
    const r = spawnSync(process.execPath, [o.al, ...args], { cwd: repo.dir, encoding: 'utf8', maxBuffer: 1 << 30, timeout: CRITERIA[m.name].limit * 1000, killSignal: 'SIGKILL' });
    const seconds = round((performance.now() - t0) / 1000);
    const killed = r.error?.code === 'ETIMEDOUT' || (r.status === null && r.signal !== null);
    const run = { seconds, commit: git(repo.dir, ['rev-parse', 'HEAD']), loadBefore: before, loadAfter: load(), exit: r.status ?? -1, command: `al-v4 ${args.join(' ')}` };
    if (killed) { run.killed = true; m.notes.push(`killed after ${CRITERIA[m.name].limit} s: ${run.command}`); }
    else if (r.status !== 0) m.notes.push(`exit ${r.status}: ${run.command}: ${(r.stderr || r.stdout || '').trim().split('\n')[0]}`);
    // A search counts only when level 1 answered: al falls back by itself (design.md 11).
    if (args[0] === 'search') {
      let j = null;
      try { j = JSON.parse(r.stdout); } catch { j = null; }
      run.level = j && typeof j === 'object' ? j.level ?? null : null;
      if (j && j.level !== 1) run.fallback = j.fallback ?? null;
      if (!killed && r.status === 0) {
        if (!j) run.problem = 'its output is not JSON';
        else if (j.level !== 1) run.problem = `level ${j.level} answered, not level 1: ${j.fallback ?? 'no fallback given'}`;
        if (run.problem) m.notes.push(`does not count: ${run.problem}: ${run.command}`);
      }
      if (j?.index) m.notes.push(`index: ${j.index}`);
      if (Array.isArray(j?.hits)) run.hits = j.hits.length;
    }
    m.runs.push(run);
    return r;
  };

  const w = new Words(1500);
  const oldHeads = new Map([central, ...outs].map((r) => [r, r.head()]));
  let ms = Date.UTC(2030, 0, 1);
  const tick = () => (ms += 3600 * 1000);
  // Words of a baseline paragraph at the head: a query that has hits.
  const query = () => {
    const files = specFiles(central);
    const ps = entriesOf(central.read(w.pick(files)), '').filter((p) => p.kind !== 'note');
    const ws = (w.pick(ps).text.toLowerCase().match(/[a-z]{4,}/g) ?? ['paragraph']).filter((x) => x !== 'must');
    return [...new Set([w.pick(ws), w.pick(ws), w.pick(ws)])];
  };

  try {
    // 1. check: a pull request that closes the oldest open request.
    const m1 = measure('check');
    git(central.dir, ['checkout', '-q', '-b', BRANCH]);
    central.branch = BRANCH;
    const name = world.openRequests[0];
    if (name) {
      const sp = entriesOf(central.read(`requests/${name}/spec.md`), '');
      const target = sp.flatMap((p) => [...(p.links.changes ?? []), ...(p.links.buildsOn ?? []), ...(p.links.removes ?? [])])[0];
      const file = target ? `specs/area-${target.split('-')[0].slice(1)}.md` : specFiles(central)[0];
      const used = new Map();
      const nextId = (prefix) => {
        if (!used.has(prefix)) {
          const nums = [...entriesOf(central.read(file), file).map((e) => e.id), ...world.removed].filter((id) => id.startsWith(`${prefix}-`)).map((id) => Number(id.split('-')[1]));
          used.set(prefix, Math.max(0, ...nums));
        }
        used.set(prefix, used.get(prefix) + 1);
        return `${prefix}-${used.get(prefix)}`;
      };
      closeRequest(central, { name, file, ms: tick(), nextId });
      m1.notes.push(`the pull request consolidates and concludes ${name} into ${file}`);
    } else {
      const file = specFiles(central)[0];
      central.write(file, `${central.read(file)}\n<!-- ZZ-1 note -->\n\nA note added by the scale run.\n`);
      m1.notes.push(`no open request: the pull request adds a note to ${file}`);
    }
    central.commit(tick(), `${name ?? 'scale'}: consolidate and conclude`);
    for (let i = 0; i < o.repeat; i++) al(m1, ['check']);

    // 2. full-index: on main as it was, the index rebuilt from nothing.
    git(central.dir, ['checkout', '-q', 'main']);
    central.branch = 'main';
    const words = query();
    al(measure('full-index'), ['search', '--level', '1', '--rebuild', '--json', ...words]);

    // 3. incremental-index: the branch merged, and a pull request in an output repo.
    const m3 = measure('incremental-index');
    git(central.dir, ['merge', '--no-ff', '-q', '-m', `Merge pull request #${100000} from ${BRANCH}`, BRANCH], { ms: tick() });
    git(central.dir, ['branch', '-q', '-D', BRANCH]);
    if (outs.length) {
      const out = outs[0];
      const id = entriesOf(central.read(specFiles(central)[0]), '').find((e) => e.kind !== 'note')?.id;
      out.write('src/scale-run.js', `// A change of the scale run. Implements central:${id}.\nexport const scaleRun = true;\n`);
      out.pr(tick(), { number: 100000, branch: 'scale/run', message: `central:${name ?? 'scale'}/T1 the scale run` });
      m3.notes.push(`with a pull request merged in ${out.name}`);
    }
    al(m3, ['search', '--level', '1', '--json', ...words]);

    // 4. removal: a pull request that removes paragraphs from the largest spec file.
    const m4 = measure('removal');
    const reserved = new Set();
    for (const n of world.openRequests) {
      const text = central.read(`requests/${n}/spec.md`);
      if (text) for (const p of entriesOf(text, '')) for (const ts of Object.values(p.links)) ts.forEach((t) => reserved.add(t));
    }
    const sizes = specFiles(central).map((f) => [f, entriesOf(central.read(f), f)]).sort((a, b) => b[1].length - a[1].length);
    const [file, entries] = sizes[0];
    const builtOn = new Set(entries.flatMap((e) => e.links.buildsOn ?? []));
    const gone = entries.filter((e) => e.kind !== 'note' && !reserved.has(e.id) && !builtOn.has(e.id)).slice(0, REMOVE).map((e) => e.id);
    const text = render(entries.filter((e) => !gone.includes(e.id)));
    central.write(file, text);
    central.write(docRecordPath(file), docRecord(file, text));
    central.pr(tick(), { number: 100001, branch: 'scale/run-removal', message: `Remove ${gone.length} paragraphs from ${file}` });
    m4.notes.push(`the pull request removes ${gone.join(', ')} from ${file}`);
    al(m4, ['search', '--level', '1', '--json', ...words]);
    report.removal.ids = gone;
    // The checks of the removal are not timed, but a failed one makes the run not ok.
    const hits = (args) => {
      const r = spawnSync(process.execPath, [o.al, ...args], { cwd: central.dir, encoding: 'utf8', maxBuffer: 1 << 30, timeout: 600000 });
      const command = `al-v4 ${args.join(' ')}`;
      if (r.status !== 0) {
        report.removal.problems.push(`${command}: ${r.status === null ? 'killed' : `exit ${r.status}`}: ${(r.stderr || r.stdout || '').trim().split('\n')[0]}`);
        return null;
      }
      try { return JSON.parse(r.stdout).hits; } catch {
        report.removal.problems.push(`${command}: its output is not JSON`);
        return null;
      }
    };
    report.removal.goneFromCurrent = gone.length > 0 && gone.every((id) => { const h = hits(['search', '--level', '1', '--json', '--id', id]); return h !== null && !h.some((x) => x.role !== 'history'); });
    report.removal.keptInHistory = gone.length > 0 && gone.every((id) => { const h = hits(['search', '--level', '1', '--json', '--history', '--id', id]); return h !== null && h.some((x) => x.id === id && x.role === 'history'); });

    // 5. search: different queries on the up-to-date index.
    const m5 = measure('search');
    const seen = new Set();
    for (let i = 0; i < o.queries; i++) {
      let q = query();
      for (let k = 0; seen.has(q.join(' ')) && k < 20; k++) q = query();
      if (seen.has(q.join(' '))) q = [...q, `w${i}`];
      seen.add(q.join(' '));
      al(m5, ['search', '--level', '1', '--json', ...q]);
    }
  } finally {
    // Every repo back on main at its old commit, clean, with no branch of the run.
    for (const [r, head] of oldHeads) {
      git(r.dir, ['checkout', '-q', '-f', 'main'], { allowFail: true });
      git(r.dir, ['reset', '-q', '--hard', head]);
      git(r.dir, ['clean', '-q', '-fd'], { allowFail: true });
      if (git(r.dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${BRANCH}`], { allowFail: true })) git(r.dir, ['branch', '-q', '-D', BRANCH]);
    }
  }

  // A timing miss is not met; a failed or fallen-back command is not ok as well.
  for (const m of report.measures) {
    const counted = m.runs.every((x) => x.exit === 0 && !x.problem);
    m.seconds = Math.max(...m.runs.map((x) => x.seconds));
    m.met = counted && m.seconds <= m.criterion.seconds;
    if (!counted) report.ok = false;
  }
  if (report.removal.problems.length) report.ok = false;
  return report;
}

const short = (c) => String(c).slice(0, 7);
const gb = (b) => `${round(b / 1024 ** 3)} GB`;

export function markdown(rep) {
  const m = rep.machine;
  const w = rep.world;
  const lines = [
    '# T15 scale run',
    '',
    `- al: ${rep.al.path} at ${short(rep.al.commit)}${rep.al.dirty ? ' (with uncommitted changes)' : ''}`,
    `- Machine: ${m.model}; ${m.cpu}; ${m.cores} cores; ${gb(m.memoryBytes)} memory; ${m.os}; Node ${m.node}`,
    `- World: ${w.requests} requests (${w.openRequests.length} open, ${w.concluded.length} concluded), ${w.outputs} output repos, change specs of ${w.paragraphs} paragraphs on average; central main at ${short(w.central.head)}`,
    `- Result: ${rep.ok ? 'every command exited 0, and every search answered at level 1' : 'not ok: a command failed or was killed, a search did not answer at level 1, or a removal check failed (see the notes)'}`,
    '',
    '| Measure | Criterion | Seconds (largest run) | Met |',
    '|---|---|---|---|',
    ...rep.measures.map((x) => `| ${x.name} | ${x.criterion.text} (${x.criterion.seconds} s) | ${x.seconds} | ${x.met ? 'met' : 'missed'} |`),
    '',
    '## Each run',
    '',
    '| Measure | Seconds | Exit | Level | Central commit | Load before (1, 5, 15 min) | Load after | Command |',
    '|---|---|---|---|---|---|---|---|',
    ...rep.measures.flatMap((x) => x.runs.map((r) => `| ${x.name} | ${r.seconds} | ${r.killed ? 'killed' : r.exit} | ${r.level === undefined ? '-' : r.level ?? 'not JSON'} | ${short(r.commit)} | ${r.loadBefore.join(' ')} | ${r.loadAfter.join(' ')} | \`${r.command.replace(/\|/g, '\\|')}\` |`)),
    '',
    '## Removal',
    '',
    `- Removed: ${rep.removal.ids.join(', ') || 'none'}`,
    `- Gone from the current index: ${rep.removal.goneFromCurrent ? 'yes' : 'no'}`,
    `- Kept in the history index: ${rep.removal.keptInHistory ? 'yes' : 'no'}`,
    ...rep.removal.problems.map((p) => `- A check failed: ${p}`),
    '',
    '## Notes',
    '',
    ...rep.measures.flatMap((x) => x.notes.map((n) => `- ${x.name}: ${n}`)),
    '',
  ];
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = options(process.argv.slice(2));
  const rep = run(o);
  const md = markdown(rep);
  writeFileSync(join(o.world, 'report.json'), `${JSON.stringify(rep, null, 2)}\n`);
  writeFileSync(join(o.world, 'report.md'), md);
  process.stdout.write(md);
  process.exit(rep.ok ? 0 : 1);
}
