// The `search` setting of .assuredloop/config.yaml (kb-search/R10, design.md
// 11): own, local, local with one row of the measured table (models.js), or
// none. With no setting, `al search` searches nothing: it gives the choices,
// what each costs on this computer, the measured figures with their limits,
// and a recommendation, all from code with no model.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { isAbsolute, join } from 'node:path';
import { Fail } from './base.js';
import { git } from './git.js';
import { embedText, selectedRepos, treeOf } from './export.js';
import { loadConfig } from './config.js';
import { ROWS, WORDS, runs } from './models.js';

const FILE = '.assuredloop/config.yaml';
const FORMS = 'give none, local, {local: <row>} or {own: <name>}';
const GPU_RUNTIMES = ['tjs-webgpu', 'tjs-coreml', 'llama-metal'];
const NOT_YET = '#100: the llama.cpp runtime and reranking';

// Sizes in MB and GB of 10^6 and 10^9 bytes.
const mb = (bytes) => Math.round(bytes / 1e6);
const gb = (bytes) => (bytes / 1e9).toFixed(1);
const signed = (x) => `${x < 0 ? '-' : '+'}${Math.abs(x).toFixed(3)}`;
const recallText = ([r, lo, hi]) => `${r.toFixed(3)} [${lo.toFixed(2)}-${hi.toFixed(2)}]`;
const gainText = ([g, lo, hi]) => `${signed(g)} [${signed(lo)}, ${signed(hi)}]`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const download = (row) => row.files.reduce((s, [, bytes]) => s + bytes, 0);
const peak = (row) => row.peak * 2 ** 20;
const runtimeOf = (row) => row.name.split(' ')[2];

// The setting as the working tree's config gives it: null (no setting),
// { use: 'none' }, { use: 'local', row: null | <row> } or { use: 'own', name }.
// A wrong form, or a row that this version does not run, is refused.
export function readSetting(top) {
  const value = loadConfig(top).search;
  if (value === undefined || value === null) return null;
  if (value === 'none' || value === 'local') return { use: value, row: null };
  const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (keys.length !== 1 || !['local', 'own'].includes(keys[0]) || typeof value[keys[0]] !== 'string' || !value[keys[0]].trim()) {
    throw new Fail(`${FILE}: search: ${text} is not a choice; ${FORMS}`, 'al search with no search setting lists the choices');
  }
  if (keys[0] === 'own') return { use: 'own', name: value.own.trim() };
  const name = value.local;
  const row = ROWS.find((r) => r.name === name);
  const runnable = ROWS.filter(runs).map((r) => r.name).join(', ');
  if (!row) throw new Fail(`${FILE}: search: {local: ${name}} names no measured row; the rows this version runs: ${runnable}`, 'name one of them, or remove the line and run al search for the choices');
  if (row.excluded) throw new Fail(`${FILE}: search: {local: ${name}}: ${name} is excluded: ${row.excluded}`, `name one of the rows this version runs: ${runnable}`);
  if (!runs(row)) throw new Fail(`${FILE}: search: {local: ${name}}: this version cannot run ${name} yet (${NOT_YET})`, `name one of the rows this version runs: ${runnable}`);
  return { use: 'local', row };
}

// The available memory: on macOS, the free, inactive, speculative and
// purgeable pages of vm_stat (os.freemem counts free pages only); elsewhere
// os.freemem (on Linux, MemAvailable).
function availableMemory() {
  if (process.platform === 'darwin') {
    try {
      const out = execFileSync('vm_stat', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const page = Number(/page size of (\d+) bytes/.exec(out)?.[1]);
      const pages = (name) => Number(new RegExp(`^Pages ${name}:\\s+(\\d+)\\.`, 'm').exec(out)?.[1] ?? 0);
      if (page) return page * ['free', 'inactive', 'speculative', 'purgeable'].reduce((s, n) => s + pages(n), 0);
    } catch { /* no vm_stat: os.freemem below */ }
  }
  return os.freemem();
}

// This computer: available memory, free disk on the git folder, an Apple GPU
// (macOS on arm64), and whether node:sqlite has FTS5 (`fts5`, given).
export function computer(top, fts5) {
  const p = git(top, ['rev-parse', '--git-dir']);
  const s = fs.statfsSync(isAbsolute(p) ? p : join(top, p));
  return { memory: availableMemory(), disk: Number(s.bavail) * Number(s.bsize), gpu: process.platform === 'darwin' && process.arch === 'arm64', fts5 };
}

// What does not fit of a row on `pc`, for `paragraphs` to embed: [] when it fits.
function misfit(row, pc, paragraphs) {
  const out = [];
  const disk = download(row) + 4 * (row.dim ?? 0) * paragraphs;
  if (pc.memory < peak(row) + 1e9) out.push(`memory ${gb(peak(row))} GB + 1 GB`);
  if (pc.disk < disk) out.push(`disk ${mb(disk)} MB`);
  if (GPU_RUNTIMES.includes(runtimeOf(row)) && !pc.gpu) out.push('needs an Apple GPU');
  return out;
}

// The Not known item of a set row that does not fit this computer, or null.
export function rowFit(top, row, commit) {
  const pc = computer(top, null);
  const { paragraphs } = embedText(top, commit);
  if (!misfit(row, pc, paragraphs).length) return null;
  const disk = download(row) + 4 * (row.dim ?? 0) * paragraphs;
  return `${row.name} needs ${gb(peak(row))} GB of memory (+1 GB) and ${mb(disk)} MB of disk; this computer has ${gb(pc.memory)} GB available and ${gb(pc.disk)} GB free`;
}

// The project: what level 2 embeds, and the files of each selected repo.
function projectOf(top, commit) {
  const { paragraphs, bytes } = embedText(top, commit);
  const repos = selectedRepos(top, commit).filter((r) => r.commit);
  const files = repos.reduce((n, r) => n + treeOf(r.dir, r.commit).size, 0);
  return { paragraphs, bytes, tokens: Math.round(bytes / 4), files, repos: repos.length };
}

// One row's figures in a line.
function figures(row, project) {
  const index = row.rerank ? 'no index' : `first index about ${Math.round(project.tokens / row.tokensPerSecond)} s`;
  return [`download ${mb(download(row))} MB`, `memory ${gb(peak(row))} GB`, index, `${row.ms} ms a search`,
    `recall@10 ${recallText(row.recall)}${row.rerank ? ' (word search, then the reranker)' : ''}`, `gain ${gainText(row.gain)}`,
    `published: ${row.published}`].join(' · ');
}

// Names grouped by model, then by runtime: "m p1, p2 rt1, p3 rt2".
function grouped(rows) {
  const byModel = new Map();
  for (const r of rows) {
    const [m, p, rt] = r.name.split(' ');
    if (!byModel.has(m)) byModel.set(m, new Map());
    const byRt = byModel.get(m);
    if (!byRt.has(rt)) byRt.set(rt, []);
    byRt.get(rt).push(p);
  }
  return [...byModel].map(([m, byRt]) => `${m} ${[...byRt].map(([rt, ps]) => `${ps.join(', ')} ${rt}`).join(', ')}`).join('; ');
}

// Rows of the same reason, grouped: "names (reason); ...".
function withReasons(rows, reasonOf) {
  const byReason = new Map();
  for (const r of rows) {
    const k = reasonOf(r);
    if (!byReason.has(k)) byReason.set(k, []);
    byReason.get(k).push(r);
  }
  return [...byReason].map(([k, rs]) => `${grouped(rs)} (${k})`).join('; ');
}

// The recommendation (the rule of design.md 11): of the rows that this al
// runs and that fit, those whose gain has its interval above zero; of those
// within 0.05 of the best recall, the smallest download; else word search.
function recommend(states, pc) {
  const good = states.filter((s) => s.state === 'fits' && s.row.gain[1] > 0);
  const later = states.filter((s) => s.state === 'not-yet' && s.row.gain[1] > 0).length;
  const noFts = pc.fts5 ? '' : '; this computer has no node:sqlite with FTS5, so word search scans the export (level 0)';
  if (!good.length) {
    const more = later ? `; ${later} rows that this version cannot run yet have one (al search --full)` : '';
    return { choice: 'local', row: null, reason: `of the rows that this al can run and that fit this computer, none has a gain whose interval is above zero${more}${noFts}` };
  }
  const best = Math.max(...good.map((s) => s.row.recall[0]));
  const pick = good.filter((s) => s.row.recall[0] >= best - 0.05).sort((a, b) => download(a.row) - download(b.row))[0].row;
  return { choice: 'local', row: pick.name, reason: `gain ${gainText(pick.gain)} over word search; the smallest download within 0.05 of the best recall among the rows that fit${noFts}` };
}

// `al search` with no setting: the choices and the recommendation; no search.
export function noChoice({ top, commit, opts, fts5 }) {
  const pc = computer(top, fts5);
  const project = projectOf(top, commit);
  const states = ROWS.map((row) => {
    if (row.excluded) return { row, state: 'excluded', reason: row.excluded };
    if (!runs(row)) return { row, state: 'not-yet', reason: `this version cannot run it yet (${NOT_YET})` };
    const miss = misfit(row, pc, project.paragraphs);
    return miss.length ? { row, state: 'not-fit', reason: miss.join(', ') } : { row, state: 'fits', reason: null };
  });
  const rec = recommend(states, pc);
  const words = `first index about ${Math.round(project.tokens / WORDS.tokensPerSecond)} s`;
  const limits = [
    'measured for issue #28 on one Mac (Apple M5 Pro, 64 GB, macOS), 2026-10-21 to 2026-10-23',
    '50 questions from one repo', 'recall@10 with its 95% interval', 'a difference under about 0.05 is no difference',
    'Linux, Windows and NVIDIA GPUs not measured', 'the thresholds of fit are inferred (peak memory plus 1 GB)',
    'available memory changes from moment to moment', 'sizes in MB and GB of 10^6 and 10^9 bytes',
    'a download counts the model files; the tokenizer and config files add up to 22 MB',
    'the index times here are estimates from the measured speeds',
  ];
  const notKnown = ['whether the team has a knowledge base (the skill asks)', 'the recall on this project', 'how this computer compares with the measured Mac'];
  if (opts.json) {
    const rows = states.map(({ row, state, reason }) => ({
      name: row.name, state, reason, repo: row.repo, commit: row.commit, files: row.files.map(([path, bytes]) => ({ path, bytes })),
      download: download(row), peak_memory: peak(row), dim: row.dim ?? null, tokens_per_second: row.tokensPerSecond ?? null,
      rerank: Boolean(row.rerank), ms_a_search: row.ms, recall: row.recall, gain: row.gain, published: row.published,
    }));
    return { raw: `${JSON.stringify({
      setting: null, computer: { available_memory: pc.memory, free_disk: pc.disk, apple_gpu: pc.gpu, fts5: pc.fts5 }, project,
      words: { recall: WORDS.recall, tokens_per_second: WORDS.tokensPerSecond }, rows, limits, recommend: rec, hits: [], not_known: notKnown,
    })}\n` };
  }
  const of = (state) => states.filter((s) => s.state === state);
  const fits = of('fits');
  const rest = (state, head, reasonOf) => {
    const list = of(state);
    if (!list.length) return [];
    if (opts.full) return [`${head}:`, ...list.map((s) => `          ${s.row.name}: ${figures(s.row, project)} · ${s.reason}`)];
    return [`${head}: ${reasonOf ? withReasons(list.map((s) => s.row), (r) => list.find((s) => s.row === r).reason) : grouped(list.map((s) => s.row))}`];
  };
  const body = [
    'Search    no choice is set: al search searches nothing until .assuredloop/config.yaml sets search (LD-64)',
    `Computer  available memory ${gb(pc.memory)} GB · free disk ${gb(pc.disk)} GB · Apple GPU ${pc.gpu ? 'yes' : 'no'} · node:sqlite with FTS5 ${pc.fts5 ? 'yes' : 'no'}`,
    `Project   ${project.paragraphs} paragraphs to embed, about ${project.tokens} tokens (estimate: bytes / 4) · ${project.files} files in ${project.repos} repo(s)`,
    "Choice    own: the team's knowledge base, an MCP server or a skill; al export gives it al's rows; al does not search",
    `Choice    local: word search (SQLite FTS5); no download; ${words} (estimate from the measured word-index speed); recall@10 ${recallText(WORDS.recall)}`,
    `Choice    local with a model: word search and one row of the measured table; the ${plural(fits.length, 'row that fits', 'rows that fit')} this computer:`,
    ...fits.map((s) => `          ${s.row.name}: ${figures(s.row, project)}`),
    ...rest('not-fit', `Not fit   ${plural(of('not-fit').length, 'row needs', 'rows need')} more than this computer has`, true),
    ...rest('not-yet', `Not yet   ${of('not-yet').length} rows this version cannot run yet (${NOT_YET})`, false),
    ...rest('excluded', `Excluded  ${of('excluded').length} rows`, true),
    'Choice    none: no search; the agent reads the files (grep)',
    `Limits    ${limits.join('; ')}`,
    `Recommend ${rec.row ? `local with ${rec.row}` : 'local'}: ${rec.reason}`,
    'Set it    write one line in .assuredloop/config.yaml and commit it: search: local · search: {local: <row>} · search: {own: <name>} · search: none',
  ];
  return { body, read: "working tree · al's measured table · this computer", next: 'write the search line in .assuredloop/config.yaml, commit it, then al search <words>', notKnown };
}

// `al search` with own or none: no search, and what to do instead.
export function noSearch(setting, opts) {
  const id = opts.id === undefined ? null : opts.id;
  const body = setting.use === 'own'
    ? [`Search    own: ${setting.name}; al does not search here; ask ${setting.name}`]
    : ['Search    none: this project uses no search; read the files (grep)'];
  const next = setting.use === 'own'
    ? `ask ${setting.name}; al export gives it al's rows${id ? `; for ${id}, al context ${id}` : ''}`
    : `grep the files; for one ID, al context ${id ?? '<ID>'}`;
  if (opts.json) return { raw: `${JSON.stringify({ setting: setting.use === 'own' ? { own: setting.name } : 'none', hits: [], next })}\n` };
  return { body, next };
}
