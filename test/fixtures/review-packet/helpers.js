export const repository = 'example/framework';
export const consumer = 'example/consumer';
export const revision = '0123456789abcdef0123456789abcdef01234567';
export const alternateRevision = 'fedcba9876543210fedcba9876543210fedcba98';

export function repoRef(path, overrides = {}) {
  return { repository, revision, path, ...overrides };
}

export function commentRef(comment_id, owner = consumer) {
  return { repository: owner, comment_id };
}

export function workRef(number, owner = consumer) {
  return `${owner}#${number}`;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonical(nested)]));
  }
  return value;
}

export function refKey(ref) {
  return typeof ref === 'string' ? `work:${ref}` : JSON.stringify(canonical(ref));
}

export function graph(entries) {
  return new Map(entries.map(([ref, value]) => [refKey(ref), structuredClone(value)]));
}

export function graphLoader(records, calls = []) {
  return async function load(ref) {
    calls.push(structuredClone(ref));
    const value = records.get(refKey(ref));
    if (!value) throw new Error(`unexpected fixture reference: ${refKey(ref)}`);
    return structuredClone(value);
  };
}

export function contentRecord(content, references = []) {
  return { content, references };
}

export function unavailableRecord(reason = 'record-not-available') {
  return { disposition: 'unavailable', reason };
}

export function outOfScopeRecord(reason = 'reference-binding-required') {
  return { disposition: 'out-of-scope', reason };
}
