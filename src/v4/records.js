// The request record, .assuredloop/records/requests/<name>.yaml: read as a
// YAML document, so what an agent wrote by hand (comments, order, tasks,
// outputs) stays as it is, and the tool only appends or fills.
import { parseDocument, isMap, isSeq } from 'yaml';
import { Fail, read, recordPath } from './base.js';

export const YAML_OPTIONS = { lineWidth: 0 };

// The record of request `name`: { doc, path, data } or null when absent.
// A record that is not valid YAML is a refusal: the tool does not guess.
export function openRecord(top, name) {
  const path = recordPath(name);
  const text = read(top, path);
  if (text === null) return null;
  const doc = parseDocument(text);
  if (doc.errors.length || !isMap(doc.contents)) {
    throw Object.assign(new Fail(`${path} is not a valid record: ${doc.errors[0]?.message.split('\n')[0] ?? 'not a map'}`, `fix ${path} by hand`), { invalid: true });
  }
  return { doc, path, text, get data() { return doc.toJS() ?? {}; } };
}

export const recordText = (rec) => rec.doc.toString(YAML_OPTIONS);

// The list `key` of the record, made when missing.
export function seq(rec, key) {
  let s = rec.doc.get(key);
  if (!isSeq(s)) {
    s = rec.doc.createNode([]);
    rec.doc.set(key, s);
  }
  return s;
}

// Appends `value` to the list `key`; `flow` writes it on one line.
export function append(rec, key, value, flow = false) {
  const node = rec.doc.createNode(value);
  if (flow) node.flow = true;
  const s = seq(rec, key);
  s.flow = false;
  s.items.push(node);
  return node;
}

// The highest number `n` of the `<prefix><n>` IDs in list `key`, or 0.
export const highest = (rec, key, prefix) => Math.max(0, ...(rec.data[key] ?? [])
  .map((e) => String(e?.id ?? '').match(new RegExp(`^${prefix}(\\d+)$`))?.[1]).filter(Boolean).map(Number));

// Appends a version for each requirement whose text hash is not its latest
// version's. Returns the versions appended.
export function addVersions(rec, reqs) {
  const added = [];
  const all = rec.data.requirements ?? [];
  for (const r of reqs) {
    const mine = all.filter((v) => v?.id === r.id);
    const last = mine.reduce((a, v) => (Number(v.version) > Number(a?.version ?? 0) ? v : a), null);
    if (last && last.sha256 === r.sha256) continue;
    const v = { id: r.id, version: Number(last?.version ?? 0) + 1, sha256: r.sha256, title: r.title };
    append(rec, 'requirements', v);
    added.push(v);
  }
  return added;
}

// The latest version of requirement `id` in the record's data, or null.
export const latest = (data, id) => (data.requirements ?? []).filter((v) => v?.id === id)
  .reduce((a, v) => (Number(v.version) > Number(a?.version ?? 0) ? v : a), null);
