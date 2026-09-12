import { createHash } from 'node:crypto';
import { fail } from './files.js';
import { validateRecord } from './records.js';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
const key = (ref) => JSON.stringify(canonical(ref));
const hash = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const bytes = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8') + 1;

function reference(ref) {
  if (!(typeof ref === 'string' ? validateRecord('work', ref).valid : validateRecord('evidenceRef', ref).valid)) {
    fail('reference-invalid', 'Packet references must use the shared structured vocabulary, never arbitrary commands or URLs.');
  }
  return structuredClone(ref);
}

export async function buildReviewPacket({ roots, load, maxInlineBytes = 65536, cursor = null, expand = [], envelope } = {}) {
  if (!Array.isArray(roots) || !Array.isArray(expand) || typeof load !== 'function' || !Number.isSafeInteger(maxInlineBytes) || maxInlineBytes < 1) {
    fail('binding-invalid', 'Packet roots, loader and finite positive byte budget are required.');
  }
  const selected = roots.map(reference);
  const responseBytes = (page) => bytes(envelope ? { ...envelope, packet: page } : page);
  const expansions = new Set(expand.map((ref) => key(reference(ref))));
  const query = hash({ roots: selected, expand: [...expansions].sort(), maxInlineBytes });
  let continuation;
  if (cursor !== null) {
    try {
      if (typeof cursor !== 'string' || cursor.length > 2048) throw Error('Invalid cursor');
      continuation = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (continuation.query !== query || !/^[a-f0-9]{64}$/.test(continuation.snapshot) || !Number.isSafeInteger(continuation.offset) || continuation.offset < 1) throw Error('Stale cursor');
    } catch { fail('packet-stale', 'Packet cursor does not match this request; restart from the explicit roots.'); }
  }
  const limits = { inline_depth: 1, max_inline_bytes: maxInlineBytes };
  const minimal = { entries: [], counts: { total: selected.length, pending_references: 0, pending_pages: 0 }, next_cursor: null, limits };
  if (responseBytes(minimal) > maxInlineBytes) fail('packet-limit', 'The response metadata cannot fit the requested byte budget.');
  for (const ref of selected) {
    if (responseBytes({ ...minimal, entries: [{ ref, depth: 0, disposition: 'over-budget', reason: 'over-budget' }] }) > maxInlineBytes) {
      fail('packet-limit', 'A root reference cannot fit as complete packet metadata.');
    }
  }

  const inventory = new Map();
  const queue = [];
  function enqueue(ref, depth) {
    const id = key(ref);
    if (!inventory.has(id)) {
      const item = { ref, depth, disposition: 'outside-depth' };
      inventory.set(id, item); queue.push(item);
    }
  }
  for (const ref of selected) enqueue(ref, 0);
  const links = [];
  for (let index = 0; index < queue.length; index++) {
    const item = queue[index];
    if (item.depth > 1 && !expansions.has(key(item.ref))) continue;
    let loaded;
    try { loaded = await load(structuredClone(item.ref)); }
    catch (error) {
      if (!['record-unavailable', 'reference-out-of-scope', 'tool-unavailable', 'path-unsafe'].includes(error.code)) throw error;
      loaded = { disposition: error.code === 'reference-out-of-scope' ? 'out-of-scope' : 'unavailable', reason: error.code };
    }
    if (['out-of-scope', 'unavailable'].includes(loaded?.disposition)) {
      item.disposition = loaded.disposition;
      item.reason = typeof loaded.reason === 'string' ? loaded.reason : loaded.disposition;
      continue;
    }
    if (typeof loaded?.content !== 'string' || (loaded.references !== undefined && !Array.isArray(loaded.references))) {
      item.disposition = 'unavailable'; item.reason = 'unsupported-content-representation';
      continue;
    }
    item.disposition = 'inlined'; item.content = loaded.content;
    if (loaded.context_kind === 'informal') item.context_kind = 'informal';
    item.retrieved_at = new Date().toISOString();
    const references = (loaded.references || []).map(reference).sort((left, right) => key(left).localeCompare(key(right)));
    links.push({ ref: item.ref, references });
    for (const ref of references) enqueue(ref, item.depth + 1);
  }
  for (const expanded of expansions) if (!inventory.has(expanded)) fail('reference-invalid', 'Expansion must identify a discovered reference.');
  const snapshot = hash({ entries: queue.map(({ retrieved_at, ...entry }) => entry), links });
  if (continuation && continuation.snapshot !== snapshot) fail('packet-stale', 'The fetched packet snapshot changed; do not combine these pages.');
  const makeCursor = (offset) => Buffer.from(JSON.stringify({ query, snapshot, offset })).toString('base64url');
  const reserve = { entries: [], counts: { total: queue.length, pending_references: queue.length, pending_pages: queue.length },
    next_cursor: makeCursor(queue.length), limits };
  const pages = [];
  let entries = [];
  for (const original of queue) {
    let entry = { ...original };
    if (responseBytes({ ...reserve, entries: [entry] }) > maxInlineBytes && entry.disposition === 'inlined') {
      delete entry.content;
      entry.disposition = 'over-budget'; entry.reason = 'over-budget';
    }
    if (responseBytes({ ...reserve, entries: [entry] }) > maxInlineBytes) fail('packet-limit', 'A complete reference descriptor cannot fit the response budget.');
    if (entries.length && responseBytes({ ...reserve, entries: [...entries, entry] }) > maxInlineBytes) {
      pages.push(entries); entries = [];
    }
    entries.push(entry);
  }
  if (entries.length || !pages.length) pages.push(entries);
  let offset = 0;
  const requested = continuation?.offset || 0;
  for (let index = 0; index < pages.length; index++) {
    const entries = pages[index];
    if (offset === requested) {
      const next = offset + entries.length;
      const page = { entries, counts: { total: queue.length, pending_references: queue.length - next, pending_pages: pages.length - index - 1 },
        next_cursor: index + 1 < pages.length ? makeCursor(next) : null, limits };
      if (responseBytes(page) > maxInlineBytes) fail('packet-limit', 'Response metadata exceeds the byte budget.');
      return page;
    }
    offset += entries.length;
  }
  fail('packet-stale', 'Cursor does not identify a current page boundary.');
}
