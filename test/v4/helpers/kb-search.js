// Helpers for the tests of #99 (kb-search/R10): the `search` setting, the
// measured table of 42 rows, and a fake computer. Built from the issue and
// the public interface only; nothing here reads src/.
//
// The fake computer is made from outside al: a preload module for
// `node --import` that sets process.platform and process.arch and replaces
// os.freemem and fs.statfsSync (then syncBuiltinESMExports), and a fake
// `vm_stat` first on PATH. al reads available memory from vm_stat on macOS
// and from os.freemem elsewhere, free disk from fs.statfsSync (bavail x
// bsize), and an Apple GPU from macOS on arm64.
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// --- the measured table (issue #28), by row name: <model> <precision> <runtime>

const rows = (model, precisions, runtime) => precisions.map((p) => `${model} ${p} ${runtime}`);

// The 11 rows that this version runs.
export const RUNNABLE = [
  ...rows('bge-small-en-v1.5', ['fp32', 'q8', 'q4'], 'tjs-cpu'),
  ...rows('embeddinggemma-300m', ['fp32', 'q8', 'q4'], 'tjs-cpu'),
  ...rows('qwen3-embedding-0.6b', ['fp32', 'q4'], 'tjs-cpu'),
  ...rows('bge-small-en-v1.5', ['fp32', 'q8'], 'tjs-webgpu'),
  'bge-small-en-v1.5 fp32 tjs-coreml',
];
// The 26 rows that are measured, which this version cannot run yet (#100).
export const NOT_YET = [
  ...rows('bge-small-en-v1.5', ['f32', 'f16', 'q8_0', 'q4_k_m'], 'llama-metal'),
  'embeddinggemma-300m q8_0 llama-metal',
  ...rows('qwen3-embedding-0.6b', ['f16', 'q8_0', 'q4_k_m'], 'llama-metal'),
  'qwen3-embedding-0.6b q8_0 llama-cpu',
  ...rows('qwen3-embedding-4b', ['f16', 'q8_0', 'q4_k_m'], 'llama-metal'),
  ...rows('qwen3-embedding-8b', ['f16', 'q8_0', 'q4_k_m'], 'llama-metal'),
  ...rows('qwen3-reranker-0.6b', ['f16', 'q4_k_m', 'q8_0'], 'llama-metal'),
  ...rows('qwen3-reranker-0.6b', ['q8', 'q4'], 'tjs-cpu'),
  ...rows('qwen3-reranker-4b', ['f16', 'q8_0', 'q4_k_m'], 'llama-metal'),
  ...rows('ms-marco-minilm-l-6-v2', ['fp32', 'q8', 'q4'], 'tjs-cpu'),
];
// The 5 excluded rows, each with a word of its reason.
export const EXCLUDED = {
  'qwen3-embedding-0.6b q8 tjs-cpu': /drift/i,
  'qwen3-embedding-0.6b fp32 tjs-webgpu': /NaN/,
  'embeddinggemma-300m f32 llama-metal': /EmbeddingGemma/,
  'embeddinggemma-300m bf16 llama-metal': /EmbeddingGemma/,
  'embeddinggemma-300m q4_0 llama-metal': /EmbeddingGemma/,
};
export const ALL_ROWS = [...RUNNABLE, ...NOT_YET, ...Object.keys(EXCLUDED)];
export const MODELS = [...new Set(ALL_ROWS.map((r) => r.split(' ')[0]))];
// A row needs an Apple GPU when its runtime is one of these.
export const GPU_RUNTIMES = ['tjs-webgpu', 'tjs-coreml', 'llama-metal'];
export const needsGpu = (row) => GPU_RUNTIMES.includes(row.split(' ')[2]);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (w) => new RegExp(`(^|[^\\w.-])${esc(w)}(?![\\w.-])`);

// True when `text` names `row`: after some place where its model is named,
// and before the next place where any model is named, both its precision
// and its runtime appear as words. So a row is named in full
// ("bge-small-en-v1.5 q8 tjs-cpu") or in a group by model
// ("qwen3-embedding-4b f16, q8_0, q4_k_m llama-metal"). A reason in
// brackets after the names ("(its vectors drift from fp32)") names no row.
export function namedIn(text, row) {
  const [model, precision, runtime] = row.split(' ');
  const starts = [];
  for (const m of MODELS) {
    for (let at = text.indexOf(m); at >= 0; at = text.indexOf(m, at + 1)) {
      // A model name inside a longer one is not that model.
      if (MODELS.some((o) => o !== m && o.includes(m) && text.startsWith(o, at - o.indexOf(m)))) continue;
      starts.push({ m, at });
    }
  }
  starts.sort((a, b) => a.at - b.at);
  return starts.some((s, i) => {
    if (s.m !== model) return false;
    // The names end where the next model, or a reason in brackets, starts.
    const seg = text.slice(s.at + model.length, i + 1 < starts.length ? starts[i + 1].at : text.length).split('(')[0];
    return word(precision).test(seg) && word(runtime).test(seg);
  });
}

// --- the text output: label lines and their continuation lines

// The lines of a text output as { label, text, more }: the label is the first
// ten columns, trimmed ("Not fit", "Choice", ...); `more` holds the lines
// after it that start with ten spaces.
export function labelled(stdout) {
  const out = [];
  for (const l of stdout.replace(/\n+$/, '').split('\n')) {
    if (/^ {10}\S/.test(l) && out.length) out.at(-1).more.push(l.slice(10));
    else out.push({ label: l.slice(0, 10).trim(), text: l.slice(10), line: l, more: [] });
  }
  return out;
}

// The fit-list lines of "Choice    local with a model: ...": one per row that fits.
export const FIT_LINE = /^(\S+ \S+ \S+): download (\d+) MB · memory (\d+\.\d) GB · first index about (\d+) s · (\d+) ms a search · recall@10 (\d\.\d+) \[(\d\.\d+)-(\d\.\d+)\] · gain ([+-]\d\.\d+) \[([+-]\d\.\d+), ([+-]\d\.\d+)\]( · .+)?$/;
export const COMPUTER_LINE = /^Computer  available memory (\d+\.\d) GB · free disk (\d+\.\d) GB · Apple GPU (yes|no) · node:sqlite with FTS5 (yes|no)$/;

// The parts of the output with no setting that the tests read.
export function noChoice(stdout) {
  const ls = labelled(stdout);
  const choices = ls.filter((l) => l.label === 'Choice');
  // When no row fits, the test does not ask for this line.
  const withModel = choices.find((c) => c.text.startsWith('local with a model:')) ?? null;
  const fit = (withModel?.more ?? []).map((l) => {
    const m = l.match(FIT_LINE);
    assert.ok(m, `a fit row line in the documented form:\n${l}\n--- the output\n${stdout}`);
    return { row: m[1], download: Number(m[2]), memory: Number(m[3]), recall: m[6], interval: [m[7], m[8]], gain: m[9], gainInterval: [m[10], m[11]], line: l };
  });
  const one = (label) => ls.find((l) => l.label === label) ?? null;
  const computer = ls.find((l) => l.label === 'Computer');
  assert.ok(computer, `a Computer line:\n${stdout}`);
  const c = computer.line.match(COMPUTER_LINE);
  assert.ok(c, `the Computer line in the documented form:\n${computer.line}`);
  return {
    ls,
    labels: ls.map((l) => l.label),
    fit,
    withModel,
    notFit: one('Not fit'),
    notYet: one('Not yet'),
    excluded: one('Excluded'),
    computer: { memory: Number(c[1]), disk: Number(c[2]), gpu: c[3] === 'yes', fts5: c[4] === 'yes' },
  };
}

// --- the fake computer

// Writes the preload and the fake vm_stat into `folder`. Returns the
// nodeArgs and env for run() and search() of helpers/search.js.
// platform, arch: what process.platform and process.arch say.
// memory: the available memory in GB (10^9 bytes), from vm_stat on darwin
// and from os.freemem elsewhere; the other source says something else, so a
// test sees which one al read. disk: the free disk in GB.
export function fakeComputer(folder, { platform = 'darwin', arch = 'arm64', memory = 64, disk = 500 } = {}) {
  mkdirSync(join(folder, 'bin'), { recursive: true });
  const bytes = Math.round(memory * 1e9);
  const page = 16384;
  const pages = Math.floor(bytes / page);
  const darwinMemory = platform === 'darwin' ? pages : Math.floor(3e9 / page); // 3 GB when vm_stat is not al's source
  const free = Math.floor(darwinMemory / 2);
  const inactive = Math.floor(darwinMemory / 4);
  const speculative = Math.floor(darwinMemory / 8);
  const purgeable = darwinMemory - free - inactive - speculative;
  const vmStat = [
    `Mach Virtual Memory Statistics: (page size of ${page} bytes)`,
    `Pages free:                               ${free}.`,
    'Pages active:                             2000000.',
    `Pages inactive:                           ${inactive}.`,
    `Pages speculative:                        ${speculative}.`,
    'Pages throttled:                                0.',
    'Pages wired down:                         1000000.',
    `Pages purgeable:                          ${purgeable}.`,
    '"Translation faults":                   123456789.',
    'Pages copy-on-write:                      5000000.',
    'Pages zero filled:                      300000000.',
    'Pages reactivated:                        4000000.',
    'Pages purged:                              100000.',
    'File-backed pages:                        1500000.',
    'Anonymous pages:                          1800000.',
    'Pages stored in compressor:               3000000.',
    'Pages occupied by compressor:              700000.',
    'Decompressions:                           9000000.',
    'Compressions:                            12000000.',
    'Pageins:                                 40000000.',
    'Pageouts:                                  200000.',
    'Swapins:                                        0.',
    'Swapouts:                                       0.',
  ].join('\n');
  const vm = join(folder, 'bin', 'vm_stat');
  writeFileSync(vm, `#!/bin/sh\ncat <<'EOF'\n${vmStat}\nEOF\n`);
  chmodSync(vm, 0o755);
  const freemem = platform === 'darwin' ? 2e9 : bytes; // 2 GB when os.freemem is not al's source
  const bsize = 4096;
  const bavail = Math.round((disk * 1e9) / bsize);
  const preload = join(folder, 'computer.mjs');
  writeFileSync(preload, `// A test preload (#99): a fake computer for al.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
Object.defineProperty(process, 'platform', { value: ${JSON.stringify(platform)}, configurable: true, enumerable: true });
Object.defineProperty(process, 'arch', { value: ${JSON.stringify(arch)}, configurable: true, enumerable: true });
os.freemem = () => ${freemem};
const stats = (big) => {
  const v = { type: 26, bsize: ${bsize}, blocks: ${bavail * 2}, bfree: ${bavail}, bavail: ${bavail}, files: 1000000, ffree: 900000 };
  return big ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, BigInt(x)])) : v;
};
fs.statfsSync = (path, options) => stats(Boolean(options && options.bigint));
fs.statfs = (path, options, cb) => {
  const done = typeof options === 'function' ? options : cb;
  const big = typeof options === 'object' && options !== null && Boolean(options.bigint);
  process.nextTick(() => done(null, stats(big)));
};
fs.promises.statfs = async (path, options) => stats(Boolean(options && options.bigint));
fsp.statfs = fs.promises.statfs;
syncBuiltinESMExports();
`);
  return {
    nodeArgs: ['--import', pathToFileURL(preload).href],
    env: { PATH: `${join(folder, 'bin')}${delimiter}${process.env.PATH}` },
    memory,
    disk,
    gpu: platform === 'darwin' && arch === 'arm64',
  };
}

// Computers for the tests.
export const BIG_MAC = { platform: 'darwin', arch: 'arm64', memory: 64, disk: 500 };
export const HUGE_MAC = { platform: 'darwin', arch: 'arm64', memory: 128, disk: 2000 };
export const SMALL_MAC = { platform: 'darwin', arch: 'arm64', memory: 16, disk: 500 };
export const INTEL_MAC = { platform: 'darwin', arch: 'x64', memory: 64, disk: 500 };
export const LINUX = { platform: 'linux', arch: 'x64', memory: 64, disk: 500 };
export const FULL_DISK = { platform: 'darwin', arch: 'arm64', memory: 64, disk: 0.005 };
export const NO_MEMORY = { platform: 'linux', arch: 'x64', memory: 0.5, disk: 500 };
