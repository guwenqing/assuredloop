// The YAML of the records, parsed once in a process (#101, DES-66): al check
// reads each request record in al index, at the working tree and at the base,
// and again in its checks. parseOnce gives what yaml's parse gives, and
// parses each text once. A text whose parse gives a warning is parsed each
// time, so that each warning is given as before.
import { readdirSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { parse, parseDocument } from 'yaml';

// text -> { value }, { error } or { warns }: the value of a text with no
// error, the first error, which parse throws, or that its parse warns.
const once = new Map();

// The entry of `text`, parsed the first time; no warning is given here.
export function entryOf(text) {
  if (once.has(text)) return once.get(text);
  const doc = parseDocument(text);
  let entry;
  if (doc.warnings.length) entry = { warns: true };
  else if (doc.errors.length) entry = { error: doc.errors[0] };
  else {
    // Making the data can throw too (too many aliases, for example): parse
    // throws the same, but only for a reader that asks for this text.
    try { entry = { value: doc.toJS() }; } catch (e) { entry = { error: e }; }
  }
  once.set(text, entry);
  return entry;
}

export function parseOnce(text) {
  const e = entryOf(text);
  if (e.warns) return parse(text);
  if (e.error) throw e.error;
  return e.value;
}

// The size of the request records, in characters, above which worker
// threads parse them first. Below it, starting the workers costs more than
// they save: measured, they pay from about 0.5 million characters with 4
// workers, and from about 0.6 million with 1.
export const WORKER_CHARS = 1_000_000;
const MAX_WORKERS = 4;
const RECORDS = '.assuredloop/records/requests';

// The request records of the working tree, parsed before al check reads them:
// in worker threads, with the main thread taking one share, when they are
// larger than WORKER_CHARS and the machine has a core to spare. A worker
// that fails leaves its texts to parseOnce, in the main thread. It reads
// and writes nothing that al check shows; it only fills the parse of once.
export async function parseRecords(top) {
  const workers = Math.min(MAX_WORKERS, availableParallelism() - 1);
  if (workers < 1) return;
  let texts;
  try {
    texts = readdirSync(join(top, RECORDS), { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.yaml'))
      .map((e) => readFileSync(join(top, RECORDS, e.name), 'utf8'));
  } catch {
    return;
  }
  if (texts.reduce((n, t) => n + t.length, 0) <= WORKER_CHARS) return;
  // Each share is every (workers + 1)th text; the last share is the main thread's.
  const shares = Array.from({ length: workers + 1 }, (_, i) => texts.filter((_, k) => k % (workers + 1) === i));
  const mine = shares.pop();
  const runs = shares.map((share) => new Promise((done) => {
    let worker;
    try {
      worker = new Worker(new URL('./yaml-worker.js', import.meta.url), { workerData: share });
    } catch {
      done();
      return;
    }
    worker.once('message', (values) => {
      values.forEach((v, i) => { if (v !== undefined && !once.has(share[i])) once.set(share[i], { value: v }); });
      done();
    });
    worker.once('error', () => done());
    worker.once('exit', () => done());
  }));
  // A text that no reader asks for must not stop al check: what fails here
  // fails again for the reader that asks, as before.
  for (const t of mine) {
    try { entryOf(t); } catch { /* left to its reader */ }
  }
  await Promise.all(runs);
}
